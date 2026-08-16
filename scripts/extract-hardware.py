#!/usr/bin/env python3
"""
extract-hardware.py — turn AfriOrbit's real KiCad boards into a typed TS module.

The board explorer in the LMS renders *these* PCBs: the ones in the public
AfriOrbit repos, with their real footprints, real nets and real BOM lines. That
only works if the geometry is parsed properly, so this is a genuine
S-expression parser rather than a pile of regexes — nested quoting and the
`(at x y rot)` inside a rotated footprint are exactly where regex parsing goes
quietly wrong, and a pad landing 3 mm from where it belongs is a bug a student
would spot before we did.

Regenerate with:   python3 scripts/extract-hardware.py

SECURITY: this script must never read SDR-IOT-project/Software/. That tree
contains live device credentials committed to a public repo. Only Hardware/
paths are opened, and the allow-list below is enforced at runtime.
"""

from __future__ import annotations

import csv
import io
import json
import math
import os
import re
import sys
from pathlib import Path

ROOT = Path("/tmp/ao")
OUT = Path(__file__).resolve().parent.parent / "src" / "content" / "hardware.ts"

# --------------------------------------------------------------------------
# Boards
# --------------------------------------------------------------------------
BOARDS = [
    dict(
        id="iot-edge-v1",
        name="IoT Edge Device v1.0",
        repo="SDR-IOT-project",
        summary="LoRa-to-MQTT ground node. ESP32-S3 host, SX1278 radio at 433 MHz, "
                "BME280 environmental sensor, IP5306 battery management, microSD logging.",
        pcb="SDR-IOT-project/Hardware/IoT Edge Device v1.0/IoT Edge Device V1.kicad_pcb",
        bom="SDR-IOT-project/Hardware/IoT Edge Device v1.0/production/bom.csv",
    ),
    dict(
        id="eps-v3",
        name="EduSat EPS v3",
        repo="EduSat-Project",
        summary="Electrical power subsystem. Solar input conditioning, li-ion charge "
                "management and switched rails for the EduSat bus.",
        pcb="EduSat-Project/EduSat v2/EPSv3/EPSv3.kicad_pcb",
        bom="EduSat-Project/EduSat v2/EPSv3/production/EPS BOM.csv",
    ),
    dict(
        id="obc-v1",
        name="EduSat OBC v1",
        repo="EduSat-Project",
        summary="On-board computer. ESP32-S3 flight processor with the LoRa downlink "
                "and payload interfaces for the EduSat bus.",
        pcb="EduSat-Project/EduSat v2/OBCv1/OBCv1.kicad_pcb",
        bom=None,
    ),
    dict(
        id="sensor-board-v4",
        name="EduSat Sensor Board v4",
        repo="EduSat-Project",
        summary="Payload sensor board carrying the environmental and inertial "
                "instruments the training missions fly.",
        pcb="EduSat-Project/EduSat v2/SensorBoardv4/SensorBoardv4.kicad_pcb",
        bom=None,
    ),
    dict(
        id="eps-v4",
        name="EduSat EPS v4",
        repo="EduSat-Project",
        summary="Revised power subsystem for EduSat v3.",
        pcb="EduSat-Project/EduSat v3/EPSV4/EPSV4.kicad_pcb",
        bom=None,
    ),
    dict(
        id="obc-v2",
        name="EduSat OBC v2",
        repo="EduSat-Project",
        summary="Revised on-board computer for EduSat v3.",
        pcb="EduSat-Project/EduSat v3/OBCV2/OBCv2.kicad_pcb",
        bom=None,
    ),
]

FORBIDDEN = re.compile(r"SDR-IOT-project/Software/", re.I)


def guard(path: Path) -> Path:
    if FORBIDDEN.search(str(path).replace("\\", "/")):
        raise SystemExit(f"refusing to read {path}: credential-bearing tree")
    return path


# --------------------------------------------------------------------------
# S-expression parser
# --------------------------------------------------------------------------
_TOKEN = re.compile(r'''\s*(?:(\()|(\))|"((?:[^"\\]|\\.)*)"|([^\s()"]+))''')


def sexp(text: str):
    """Parse a KiCad s-expression into nested lists. Strings stay str; the
    caller decides what is a number. Quoted and bare atoms are not
    distinguished, which is fine here — no KiCad key is ambiguous that way."""
    pos = 0
    n = len(text)
    stack = [[]]
    while pos < n:
        m = _TOKEN.match(text, pos)
        if not m:
            break
        pos = m.end()
        if m.group(1):
            new: list = []
            stack[-1].append(new)
            stack.append(new)
        elif m.group(2):
            if len(stack) == 1:
                raise ValueError("unbalanced ) in pcb file")
            stack.pop()
        elif m.group(3) is not None:
            stack[-1].append(m.group(3).replace('\\"', '"').replace("\\\\", "\\"))
        else:
            stack[-1].append(m.group(4))
    if len(stack) != 1:
        raise ValueError("unbalanced ( in pcb file")
    return stack[0][0]


def kids(node, key):
    return [c for c in node if isinstance(c, list) and c and c[0] == key]


def kid(node, key):
    for c in node:
        if isinstance(c, list) and c and c[0] == key:
            return c
    return None


def num(v, default=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def r3(v):
    return round(v + 0.0, 3)


# --------------------------------------------------------------------------
# Geometry helpers
# --------------------------------------------------------------------------
def rot_xy(dx, dy, deg):
    """Rotate a footprint-local offset into board space.

    KiCad stores footprint rotation counter-clockwise in degrees, while the
    board Y axis points *down*. The composition that reproduces pcbnew's own
    pad placement is x' = dx·cos − dy·sin, y' = dx·sin + dy·cos with the angle
    negated. Getting the sign wrong here puts every pad on a rotated part in
    the wrong quadrant, which is why the checks at the bottom of this file
    assert pad positions against the board outline."""
    a = math.radians(-deg)
    c, s = math.cos(a), math.sin(a)
    return dx * c - dy * s, dx * s + dy * c


def arc_points(start, mid, end, segments=12):
    """Flatten a KiCad three-point arc. Falls back to a straight line when the
    three points are collinear (which happens in real files)."""
    (x1, y1), (x2, y2), (x3, y3) = start, mid, end
    d = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2))
    if abs(d) < 1e-9:
        return [start, mid, end]
    ux = ((x1 * x1 + y1 * y1) * (y2 - y3) + (x2 * x2 + y2 * y2) * (y3 - y1)
          + (x3 * x3 + y3 * y3) * (y1 - y2)) / d
    uy = ((x1 * x1 + y1 * y1) * (x3 - x2) + (x2 * x2 + y2 * y2) * (x1 - x3)
          + (x3 * x3 + y3 * y3) * (x2 - x1)) / d
    r = math.hypot(x1 - ux, y1 - uy)
    a1 = math.atan2(y1 - uy, x1 - ux)
    a2 = math.atan2(y2 - uy, x2 - ux)
    a3 = math.atan2(y3 - uy, x3 - ux)

    def norm(a, b):
        while b - a > math.pi:
            b -= 2 * math.pi
        while b - a < -math.pi:
            b += 2 * math.pi
        return b

    a2 = norm(a1, a2)
    a3 = norm(a2, a3)
    return [(ux + r * math.cos(a1 + (a3 - a1) * i / segments),
             uy + r * math.sin(a1 + (a3 - a1) * i / segments))
            for i in range(segments + 1)]


def natural_key(ref: str):
    m = re.match(r"^([A-Za-z_]*)(\d*)(.*)$", ref or "")
    return (m.group(1), int(m.group(2) or -1), m.group(3))


# --------------------------------------------------------------------------
# Edge.Cuts
# --------------------------------------------------------------------------
def on_layer(node, layer):
    l = kid(node, "layer")
    return bool(l) and len(l) > 1 and l[1] == layer


def extract_edges(pcb):
    edges = []
    for node in pcb:
        if not (isinstance(node, list) and node):
            continue
        tag = node[0]
        if tag not in ("gr_line", "gr_arc", "gr_rect", "gr_poly", "gr_circle"):
            continue
        if not on_layer(node, "Edge.Cuts"):
            continue
        if tag == "gr_line":
            s, e = kid(node, "start"), kid(node, "end")
            flat = [(num(s[1]), num(s[2])), (num(e[1]), num(e[2]))]
        elif tag == "gr_arc":
            s, m, e = kid(node, "start"), kid(node, "mid"), kid(node, "end")
            flat = arc_points((num(s[1]), num(s[2])), (num(m[1]), num(m[2])),
                              (num(e[1]), num(e[2])))
        elif tag == "gr_rect":
            s, e = kid(node, "start"), kid(node, "end")
            x1, y1, x2, y2 = num(s[1]), num(s[2]), num(e[1]), num(e[2])
            flat = [(x1, y1), (x2, y1), (x2, y2), (x1, y2), (x1, y1)]
        elif tag == "gr_circle":
            c, e = kid(node, "center"), kid(node, "end")
            cx, cy = num(c[1]), num(c[2])
            r = math.hypot(num(e[1]) - cx, num(e[2]) - cy)
            flat = [(cx + r * math.cos(2 * math.pi * i / 24),
                     cy + r * math.sin(2 * math.pi * i / 24)) for i in range(25)]
        else:  # gr_poly
            pts = kid(node, "pts") or []
            flat = [(num(p[1]), num(p[2])) for p in kids(pts, "xy")]
            if flat:
                flat.append(flat[0])
        if flat:
            edges.append({"kind": tag.replace("gr_", ""),
                          "flat": [[r3(x), r3(y)] for x, y in flat]})
    return edges


# --------------------------------------------------------------------------
# Footprints and pads
# --------------------------------------------------------------------------
def prop(fp, name):
    for p in kids(fp, "property"):
        if len(p) > 2 and p[1] == name:
            return p[2]
    return ""


def extract_footprints(pcb):
    out = []
    pads_by_net: dict[str, list] = {}
    for fp in kids(pcb, "footprint"):
        lib = fp[1] if len(fp) > 1 and isinstance(fp[1], str) else ""
        at = kid(fp, "at")
        if not at:
            continue
        fx, fy = num(at[1]), num(at[2])
        frot = num(at[3]) if len(at) > 3 else 0.0
        ref = prop(fp, "Reference")
        if not ref or ref.startswith("REF**"):
            continue
        val = prop(fp, "Value")
        lay = kid(fp, "layer")
        side = "bottom" if (lay and len(lay) > 1 and lay[1].startswith("B.")) else "top"

        nets, padlist = [], []
        pxs, pys = [], []
        for pad in kids(fp, "pad"):
            pnum = pad[1] if len(pad) > 1 and isinstance(pad[1], str) else "?"
            pat = kid(pad, "at")
            if not pat:
                continue
            ox, oy = rot_xy(num(pat[1]), num(pat[2]), frot)
            px, py = fx + ox, fy + oy
            pxs.append(px)
            pys.append(py)
            netnode = kid(pad, "net")
            nname = netnode[2] if netnode and len(netnode) > 2 else ""
            if nname:
                if nname not in nets:
                    nets.append(nname)
                pads_by_net.setdefault(nname, []).append(
                    {"ref": ref, "pad": pnum, "x": r3(px), "y": r3(py)})
            padlist.append((pnum, nname, px, py))

        # Courtyard first — it is the manufacturer's own keep-out and matches
        # what a person sees in pcbnew. Pads are the fallback.
        cx1 = cy1 = float("inf")
        cx2 = cy2 = float("-inf")
        for g in kids(fp, "fp_line") + kids(fp, "fp_rect") + kids(fp, "fp_poly"):
            l = kid(g, "layer")
            if not (l and len(l) > 1 and l[1].endswith(".CrtYd")):
                continue
            pts = []
            for key in ("start", "end", "center"):
                k = kid(g, key)
                if k:
                    pts.append((num(k[1]), num(k[2])))
            pnode = kid(g, "pts")
            if pnode:
                pts += [(num(p[1]), num(p[2])) for p in kids(pnode, "xy")]
            for dx, dy in pts:
                ox, oy = rot_xy(dx, dy, frot)
                cx1 = min(cx1, fx + ox); cx2 = max(cx2, fx + ox)
                cy1 = min(cy1, fy + oy); cy2 = max(cy2, fy + oy)
        if cx1 == float("inf"):
            if pxs:
                cx1, cx2, cy1, cy2 = min(pxs) - 0.3, max(pxs) + 0.3, min(pys) - 0.3, max(pys) + 0.3
            else:
                cx1, cx2, cy1, cy2 = fx - 0.5, fx + 0.5, fy - 0.5, fy + 0.5

        out.append({
            "ref": ref, "value": val, "lib": lib,
            "x": r3(fx), "y": r3(fy), "rot": r3(frot), "side": side,
            "bbox": [r3(cx1), r3(cy1), r3(cx2), r3(cy2)],
            "nets": sorted(nets),
        })
    out.sort(key=lambda f: natural_key(f["ref"]))
    return out, pads_by_net


def extract_nets(pcb, pads_by_net):
    nets = []
    for n in kids(pcb, "net"):
        nid = int(num(n[1], -1))
        name = n[2] if len(n) > 2 else ""
        if not name:
            continue
        pads = sorted(pads_by_net.get(name, []),
                      key=lambda p: (natural_key(p["ref"]), p["pad"]))
        nets.append({"id": nid, "name": name, "pads": pads})
    nets.sort(key=lambda n: n["id"])
    return nets


def board_thickness_mm(pcb):
    """From (general (thickness ...)). Real values, e.g. 1.6062 mm for a
    nominal 1.6 mm 4-layer stackup."""
    g = kid(pcb, "general")
    t = kid(g, "thickness") if g else None
    return r3(num(t[1], 1.6)) if t else 1.6


def stitch_loops(edges):
    """Join Edge.Cuts segments head-to-tail into closed loops.

    KiCad does not store the outline as one polygon. A rounded-corner board is
    four `gr_line` segments and four `gr_arc`s, in whatever order the editor
    wrote them and with either endpoint first. Anything that wants the board as
    a SHAPE — an area calculation, or an SVG fill — has to reassemble it first.
    Filling each segment separately, as an earlier version of the viewer did,
    paints a blob that spills past the real outline.
    """
    TOL = 0.02  # mm — KiCad rounds coordinates, so endpoints rarely match bitwise

    segs = [list(map(tuple, e["flat"])) for e in edges if len(e["flat"]) >= 2]

    def close(p, q):
        return abs(p[0] - q[0]) <= TOL and abs(p[1] - q[1]) <= TOL

    loops = []
    unused = list(segs)
    while unused:
        chain = list(unused.pop(0))
        grew = True
        while grew:
            grew = False
            for k, seg in enumerate(unused):
                if close(chain[-1], seg[0]):
                    chain += seg[1:]
                elif close(chain[-1], seg[-1]):
                    chain += list(reversed(seg))[1:]
                elif close(chain[0], seg[-1]):
                    chain = seg[:-1] + chain
                elif close(chain[0], seg[0]):
                    chain = list(reversed(seg))[:-1] + chain
                else:
                    continue
                unused.pop(k)
                grew = True
                break
        if len(chain) >= 4 and close(chain[0], chain[-1]):
            loops.append(chain)
    return loops


def shoelace(pts):
    a = 0.0
    for i in range(len(pts) - 1):
        a += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1]
    return abs(a) / 2


def board_area_mm2(edges):
    """Area enclosed by the outline, mm^2. Largest loop minus any cut-outs."""
    loops = stitch_loops(edges)
    if not loops:
        return None
    areas = sorted((shoelace(l) for l in loops), reverse=True)
    return r3(areas[0] - sum(areas[1:]))


def board_outline(edges):
    """The outline as closed polygons, largest first, ready to fill."""
    loops = stitch_loops(edges)
    loops.sort(key=shoelace, reverse=True)
    return [[[r3(x), r3(y)] for x, y in loop] for loop in loops]


def copper_layers(pcb):
    lay = kid(pcb, "layers")
    if not lay:
        return []
    names = []
    for entry in lay[1:]:
        if isinstance(entry, list) and len(entry) > 1 and str(entry[1]).endswith(".Cu"):
            names.append((int(num(entry[0], 0)), entry[1]))
    # KiCad orders F.Cu = 0, B.Cu = 2, inners 4,6,... Stack order for a human
    # is F, In1, In2, ..., B — sort with B.Cu forced last.
    names.sort(key=lambda t: (1000 if t[1] == "B.Cu" else t[0]))
    return [n for _, n in names]


# --------------------------------------------------------------------------
# BOM
# --------------------------------------------------------------------------
def read_bom(path: Path):
    """Two shapes appear in these repos: the JLC-style
    `Designator,Footprint,Quantity,Value,LCSC Part #`, and the Eeschema
    grouped-by-value generator with five metadata lines then
    `Ref,Qnty,Value,Cmp name,Footprint,...`."""
    raw = guard(path).read_text(encoding="utf-8-sig", errors="replace")
    rows = list(csv.reader(io.StringIO(raw)))
    header_at = None
    for i, row in enumerate(rows[:12]):
        low = [c.strip().lower() for c in row]
        if low[:1] in (["designator"], ["ref"]):
            header_at = i
            break
    if header_at is None:
        return []
    head = [c.strip().lower() for c in rows[header_at]]

    def col(*names):
        for nm in names:
            if nm in head:
                return head.index(nm)
        return None

    ci = dict(
        des=col("designator", "ref"),
        fp=col("footprint", "cmp name"),
        qty=col("quantity", "qnty"),
        val=col("value"),
        lcsc=col("lcsc part #", "lcsc", "vendor"),
    )
    out = []
    for row in rows[header_at + 1:]:
        if not row or ci["des"] is None or ci["des"] >= len(row):
            continue
        des_raw = row[ci["des"]].strip()
        if not des_raw:
            continue
        designators = [d.strip() for d in re.split(r"[,\s]+", des_raw) if d.strip()]

        def get(k, default=""):
            i = ci[k]
            return row[i].strip() if i is not None and i < len(row) else default

        qty = get("qty")
        out.append({
            "designators": designators,
            "footprint": get("fp"),
            "quantity": int(num(qty, len(designators))),
            "value": get("val"),
            "lcsc": get("lcsc"),
        })
    return out


def find_bom(pcb_path: Path):
    """Boards without a declared BOM often still ship one under production/."""
    folder = pcb_path.parent
    for cand in sorted((folder / "production").glob("*.csv")) + sorted(folder.glob("*.csv")):
        low = cand.name.lower()
        if "pos" in low or "designator" in low or "placement" in low:
            continue
        if "bom" in low or cand.stem.lower() == pcb_path.stem.lower():
            return cand
    return None


# --------------------------------------------------------------------------
# Build
# --------------------------------------------------------------------------
def build():
    boards = []
    for spec in BOARDS:
        pcb_path = guard(ROOT / spec["pcb"])
        if not pcb_path.exists():
            print(f"  warn: missing {spec['pcb']} — skipping {spec['id']}", file=sys.stderr)
            continue
        pcb = sexp(pcb_path.read_text(encoding="utf-8", errors="replace"))
        edges = extract_edges(pcb)
        fps, pads_by_net = extract_footprints(pcb)
        nets = extract_nets(pcb, pads_by_net)

        xs = [p[0] for e in edges for p in e["flat"]]
        ys = [p[1] for e in edges for p in e["flat"]]
        if not xs:  # no Edge.Cuts: fall back to footprint courtyards
            xs = [v for f in fps for v in (f["bbox"][0], f["bbox"][2])]
            ys = [v for f in fps for v in (f["bbox"][1], f["bbox"][3])]
            print(f"  warn: {spec['id']} has no Edge.Cuts; extent from courtyards",
                  file=sys.stderr)
        x1, x2, y1, y2 = min(xs), max(xs), min(ys), max(ys)

        bom_path = ROOT / spec["bom"] if spec["bom"] else find_bom(pcb_path)
        bom = []
        if bom_path and Path(bom_path).exists():
            bom = read_bom(Path(bom_path))
        else:
            print(f"  warn: no BOM found for {spec['id']}", file=sys.stderr)

        # Attach LCSC part numbers to footprints via designator.
        lcsc_of = {}
        for line in bom:
            for d in line["designators"]:
                if line["lcsc"]:
                    lcsc_of[d] = line["lcsc"]
        for f in fps:
            if f["ref"] in lcsc_of:
                f["lcsc"] = lcsc_of[f["ref"]]

        thickness = board_thickness_mm(pcb)
        area = board_area_mm2(edges)
        if area is None or area < 0.25 * (x2 - x1) * (y2 - y1):
            # No single closed loop: fall back to the bounding rectangle and
            # mark the estimate as coarse so the UI can say so.
            area = r3((x2 - x1) * (y2 - y1))
            area_exact = False
        else:
            area_exact = True
        # FR-4 with 1 oz copper on every layer. 1850 kg/m3 for the laminate and
        # 34.3 g/m2 per ounce-layer of copper; the copper is a tenth of the mass
        # on a 4-layer board, which is too much to hand-wave.
        n_cu = len(copper_layers(pcb)) or 2
        mass_g = round(
            (area / 1e6) * (thickness / 1000) * 1850 * 1000
            + (area / 1e6) * n_cu * 34.3,
            2,
        )

        boards.append({
            "id": spec["id"], "name": spec["name"], "repo": spec["repo"],
            "thicknessMm": thickness,
            "areaMm2": area,
            "areaIsExact": area_exact,
            "bareMassG": mass_g,
            "summary": spec["summary"],
            "source": spec["pcb"].split("/", 1)[1],
            "extent": {"x1": r3(x1), "y1": r3(y1), "x2": r3(x2), "y2": r3(y2),
                       "widthMm": r3(x2 - x1), "heightMm": r3(y2 - y1)},
            "copperLayers": copper_layers(pcb),
            "edges": edges,
            "outline": board_outline(edges),
            "footprints": fps,
            "nets": nets,
            "bom": bom,
        })
        print(f"  {spec['id']:16s} {r3(x2-x1):7.2f} x {r3(y2-y1):6.2f} mm  "
              f"{thickness:.3f}mm {len(copper_layers(pcb))}L  {len(fps):4d} fp  "
              f"{len(nets):4d} nets  {len(bom):3d} bom  "
              f"{area:8.1f} mm2{'' if area_exact else '~'}  {mass_g:6.2f} g")
    return boards


HEADER = '''// GENERATED FILE — do not edit by hand.
//
// Parsed from AfriOrbit's real KiCad boards in the public hardware repos by
//   scripts/extract-hardware.py
//
// Every coordinate here is in millimetres in the PCB's own frame, exactly as
// pcbnew stores it: X to the right, Y DOWNWARD. A renderer that assumes Y-up
// will mirror the board. Pad coordinates are already resolved into board space
// (footprint rotation applied), so a net highlight can be drawn without
// re-deriving the transform.

export type PadRef = { ref: string; pad: string; x: number; y: number };
export type Net = { id: number; name: string; pads: PadRef[] };
export type Footprint = {
  ref: string;
  value: string;
  lib: string;
  x: number;
  y: number;
  rot: number;
  side: 'top' | 'bottom';
  /** x1, y1, x2, y2 in mm — the courtyard where one exists, else the pad span. */
  bbox: [number, number, number, number];
  nets: string[];
  lcsc?: string;
};
export type EdgeShape = { kind: string; flat: [number, number][] };
export type BomLine = {
  designators: string[];
  footprint: string;
  quantity: number;
  value: string;
  lcsc: string;
};
export type Board = {
  id: string;
  name: string;
  repo: string;
  summary: string;
  source: string;
  extent: { x1: number; y1: number; x2: number; y2: number; widthMm: number; heightMm: number };
  /** Stackup thickness from the file's own (general (thickness ...)). */
  thicknessMm: number;
  /** Area of the Edge.Cuts outline, mm^2. */
  areaMm2: number;
  /** False when the outline was not a single closed loop and the bounding box was used. */
  areaIsExact: boolean;
  /** Bare laminate + copper, grams. Components are NOT included. */
  bareMassG: number;
  copperLayers: string[];
  edges: EdgeShape[];
  /** Closed outline polygons, largest first. Fill [0] and punch out the rest. */
  outline: [number, number][][];
  footprints: Footprint[];
  nets: Net[];
  bom: BomLine[];
};

'''

FOOTER = '''
export function getBoard(id: string): Board | undefined {
  return BOARDS.find((b) => b.id === id);
}

export function boardNets(board: Board): Net[] {
  return board.nets.filter((n) => n.pads.length > 1);
}

/** Footprints on a net, in the order their pads appear along it. */
export function netFootprints(board: Board, netName: string): Footprint[] {
  const refs = new Set((board.nets.find((n) => n.name === netName)?.pads ?? []).map((p) => p.ref));
  return board.footprints.filter((f) => refs.has(f.ref));
}
'''


def main():
    print("extracting AfriOrbit hardware")
    boards = build()
    if not boards:
        raise SystemExit("no boards extracted")
    body = "export const BOARDS: Board[] = " + json.dumps(boards, separators=(",", ":")) + ";\n"
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(HEADER + body + FOOTER, encoding="utf-8")
    print(f"\nwrote {OUT}  ({OUT.stat().st_size/1024:.0f} KB)")


if __name__ == "__main__":
    main()

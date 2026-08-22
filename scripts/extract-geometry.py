#!/usr/bin/env python3
"""
extract-geometry.py — AfriOrbit's real CubeSat CAD -> a web-sized mesh.

Input is the tessellated STL export of `Edusat AfriORBIT.step`, ~360k
triangles across 14 files. That is far too much to ship in a Next.js bundle, so
this decimates by vertex clustering and re-derives normals with a hard-edge
split, which is what keeps the result reading as machined aluminium rather than
a soap bar.

Regenerate with:
    python3 -c "import zipfile;zipfile.ZipFile('/tmp/ao/EduSat-Project/EduSat v2/CAD/Cubesat cads.zip').extractall('/tmp/cads')"
    python3 scripts/extract-geometry.py
"""

from __future__ import annotations

import base64
import json
import math
import struct
from pathlib import Path

import numpy as np

SRC = Path("/tmp/cads/Cubesat cads")
OUT = Path(__file__).resolve().parent.parent / "src" / "content" / "geometry.ts"

CELL_MM = 2.0          # vertex-clustering grid
HARD_EDGE_DEG = 50.0   # do not average normals across a crease sharper than this
MAX_BYTES = 900 * 1024

# Positions ship as int16 in hundredths of a millimetre. The whole spacecraft
# spans about 140 mm, i.e. +/-14000 counts, comfortably inside int16, and 0.01 mm
# is an order of magnitude finer than the 2 mm decimation grid — so the
# quantisation is free. Writing them as JSON numbers instead would triple the
# file for no gain.
POS_SCALE = 100_000.0  # metres -> 0.01 mm counts

# --------------------------------------------------------------------------
# Body frame
# --------------------------------------------------------------------------
# The CAD model is built with the long axis along +Y and an origin that sits on
# a modelling datum, not on the spacecraft. Everything downstream — the ADCS
# animation, the solar-incidence calculation, the axis gizmo — assumes the
# conventional body frame:
#
#     +Z  along the long (rail) axis
#     +X, +Y  the 100 mm cross-section
#     origin  at the geometric centre of the 1U bus
#
# The bus is bounded by the structural panels s1/s2/s4:
#     CAD x in [-50.18, 49.82]   -> body X
#     CAD y in [-41.88, 52.54]   -> body Z   (the rail axis)
#     CAD z in [-99.78,  0.22]   -> body Y
#
# so the map is  (X, Y, Z)_body = (x_cad - cx, z_cad - cz, y_cad - cy) / 1000,
# with c the bus centre. That is a rotation of -90 degrees about X plus a
# translation; it preserves handedness, so the triangle winding stays valid.
BUS_X = (-50.18, 49.82)
BUS_Y = (-41.88, 52.54)   # CAD Y -> body Z
BUS_Z = (-99.78, 0.22)    # CAD Z -> body Y

CX = 0.5 * (BUS_X[0] + BUS_X[1])
CY = 0.5 * (BUS_Y[0] + BUS_Y[1])
CZ = 0.5 * (BUS_Z[0] + BUS_Z[1])

# --------------------------------------------------------------------------
# Grouping
# --------------------------------------------------------------------------
# Labels describe what the geometry IS, not what it might be for. The CAD
# archive ships bare STL solids with no part names, so anything beyond position
# and shape would be a guess — and a viewer that confidently mislabels a
# bracket as a solar array teaches the wrong thing. Where a part's function is
# evident from the assembly (the +/-Z end panels, the frame) the label says so;
# where it is not, the label states the location and leaves it there.
#
# S9 == S10 and S6 == S7 are byte-identical files: the export wrote each solid
# twice at the same pose. Only one copy of each is loaded — including both
# doubles the triangles and puts coincident faces in the depth buffer, which
# z-fights.
GROUPS = [
    ("structure",     "Primary structure",   ["s1.stl", "s2.stl", "s4.stl"]),
    ("panel-pz",      "+Z end panel",        ["S5.stl"]),
    ("panel-nz",      "-Z end panel",        ["S8.stl"]),
    ("panel-px",      "+X face plate",       ["S9.stl"]),
    ("element-px",    "+X mounted element",  ["S6.stl"]),
    ("stack-nz",      "-Z stack",            ["S11.stl", "S12.stl", "S13.stl", "S14.stl"]),
    ("bracket",       "Internal bracket",    ["A15.stl"]),
]

# Parts that form the 1U bus proper. Everything else hangs off it.
BUS_PARTS = {"structure", "panel-pz", "panel-nz"}


# --------------------------------------------------------------------------
def read_stl(path: Path) -> np.ndarray:
    """Return an (n, 3, 3) float64 array of triangle vertices, in mm."""
    b = path.read_bytes()
    if b[:5] == b"solid" and len(b) < 84:
        raise ValueError(f"{path.name}: ASCII STL not supported")
    n = struct.unpack("<I", b[80:84])[0]
    if len(b) != 84 + 50 * n:
        raise ValueError(f"{path.name}: size {len(b)} inconsistent with {n} triangles")
    rec = np.dtype([("n", "<3f4"), ("v", "<3,3f4"), ("a", "<u2")])
    a = np.frombuffer(b[84:84 + 50 * n], dtype=rec)
    return a["v"].astype(np.float64)


def to_body(tris: np.ndarray) -> np.ndarray:
    """CAD mm -> body-frame metres. See the comment block above."""
    x = tris[..., 0] - CX
    y = tris[..., 1] - CY
    z = tris[..., 2] - CZ
    return np.stack([x, z, y], axis=-1) / 1000.0


def face_normals(v: np.ndarray, f: np.ndarray):
    a, b, c = v[f[:, 0]], v[f[:, 1]], v[f[:, 2]]
    n = np.cross(b - a, c - a)
    area = np.linalg.norm(n, axis=1)
    unit = np.zeros_like(n)
    nz = area > 1e-16
    unit[nz] = n[nz] / area[nz, None]
    return unit, 0.5 * area


def cluster(tris: np.ndarray, cell_m: float):
    """Vertex-cluster decimation. Snap to a grid, weld, drop degenerates."""
    v = tris.reshape(-1, 3)
    keys = np.floor(v / cell_m).astype(np.int64)
    uniq, inv = np.unique(keys, axis=0, return_inverse=True)

    # Representative = centroid of the cell's members, not the cell centre:
    # centroids keep flat faces flat, which grid snapping alone does not.
    reps = np.zeros((len(uniq), 3))
    counts = np.zeros(len(uniq))
    np.add.at(reps, inv, v)
    np.add.at(counts, inv, 1.0)
    reps /= counts[:, None]

    f = inv.reshape(-1, 3)
    keep = (f[:, 0] != f[:, 1]) & (f[:, 1] != f[:, 2]) & (f[:, 0] != f[:, 2])
    f = f[keep]
    _, area = face_normals(reps, f)
    f = f[area > 1e-12]

    used, f2 = np.unique(f, return_inverse=True)
    return reps[used], f2.reshape(-1, 3)


def split_hard_edges(v: np.ndarray, f: np.ndarray, thresh_deg: float):
    """Area-weighted vertex normals, but never averaged across a crease.

    Implemented by grouping each vertex's incident faces into clusters of
    similar orientation and emitting one vertex copy per cluster. A single pass
    of greedy grouping against cluster leaders is enough here: these are
    machined parts, so incident faces are either near-coplanar or clearly
    distinct.
    """
    fn, fa = face_normals(v, f)
    cos_t = math.cos(math.radians(thresh_deg))

    incident: list[list[int]] = [[] for _ in range(len(v))]
    for fi, tri in enumerate(f):
        for vi in tri:
            incident[vi].append(fi)

    out_pos: list[np.ndarray] = []
    out_nrm: list[np.ndarray] = []
    # remap[(vertex, face)] -> new index
    remap: dict[tuple[int, int], int] = {}

    for vi, faces in enumerate(incident):
        if not faces:
            continue
        leaders: list[np.ndarray] = []
        members: list[list[int]] = []
        for fi in faces:
            n = fn[fi]
            placed = False
            for gi, lead in enumerate(leaders):
                if float(np.dot(lead, n)) >= cos_t:
                    members[gi].append(fi)
                    placed = True
                    break
            if not placed:
                leaders.append(n)
                members.append([fi])
        for grp in members:
            acc = np.zeros(3)
            for fi in grp:
                acc += fn[fi] * fa[fi]
            ln = np.linalg.norm(acc)
            acc = acc / ln if ln > 1e-16 else fn[grp[0]]
            idx = len(out_pos)
            out_pos.append(v[vi])
            out_nrm.append(acc)
            for fi in grp:
                remap[(vi, fi)] = idx

    newf = np.array([[remap[(vi, fi)] for vi in tri] for fi, tri in enumerate(f)],
                    dtype=np.int64)
    return np.array(out_pos), np.array(out_nrm), newf


def signed_volume(v: np.ndarray, f: np.ndarray) -> float:
    a, b, c = v[f[:, 0]], v[f[:, 1]], v[f[:, 2]]
    return float(np.sum(np.einsum("ij,ij->i", a, np.cross(b, c))) / 6.0)


def describe(tris: np.ndarray) -> str:
    """Shape summary used to sanity-check the group labels."""
    v = tris.reshape(-1, 3)
    ext = v.max(0) - v.min(0)
    order = np.argsort(ext)
    thin = ext[order[0]]
    return f"extent {ext[0]*1000:.1f} x {ext[1]*1000:.1f} x {ext[2]*1000:.1f} mm (thinnest {thin*1000:.1f} mm)"


def b64(arr: np.ndarray) -> str:
    return base64.b64encode(arr.tobytes()).decode("ascii")


def encode_positions(v: np.ndarray) -> tuple[str, float]:
    counts = np.round(v * POS_SCALE)
    lim = np.abs(counts).max()
    if lim > 32767:
        raise ValueError(f"position {lim} counts overflows int16 — lower POS_SCALE")
    return b64(counts.astype("<i2")), POS_SCALE


def encode_normals(n: np.ndarray) -> str:
    """int8, 127 counts per unit. Worst-case angular error is about 0.5 degrees,
    which is invisible under any lighting model this viewer will use. The
    decoder renormalises, so the round-off does not shorten the vectors."""
    return b64(np.clip(np.round(n * 127.0), -127, 127).astype("<i1"))


def encode_indices(f: np.ndarray, vertex_count: int) -> tuple[str, int]:
    if vertex_count <= 65535:
        return b64(f.astype("<u2")), 16
    return b64(f.astype("<u4")), 32


def main() -> None:
    parts = []
    notes: list[str] = []
    cell_m = CELL_MM / 1000.0

    for pid, label, files in GROUPS:
        raw = np.concatenate([to_body(read_stl(SRC / fn)) for fn in files])
        before = len(raw)
        v, f = cluster(raw, cell_m)
        v, n, f = split_hard_edges(v, f, HARD_EDGE_DEG)

        # Every solid in this CAD export is wound inward — the signed volume of
        # the raw triangle soup is negative for all seven parts, not just one.
        # An earlier version of this script only corrected `structure`, which
        # left the other six rendering as back faces the moment the viewer
        # enabled culling: the bus would look hollow and the panels would
        # vanish. Flip anything negative, and report the volume either way so a
        # silently-open mesh (volume near zero) is visible rather than assumed
        # closed.
        vol = signed_volume(v, f)
        if vol < 0:
            f = f[:, [0, 2, 1]]
            n = -n
            vol = -vol
            notes.append(f"flipped winding on `{pid}`")

        # Take the bounding box from the QUANTISED vertices, not the float ones.
        # A viewer uses this to frame the camera and to place the axis gizmo; if
        # it describes a mesh half a rounding step away from the one actually
        # shipped, those land marginally off and nothing ever tells you why.
        v = np.round(v * POS_SCALE) / POS_SCALE
        lo, hi = v.min(0), v.max(0)
        pos_b64, scale = encode_positions(v)
        idx_b64, idx_bits = encode_indices(f.ravel(), len(v))
        parts.append({
            "id": pid, "label": label,
            "sources": files,
            "p": pos_b64, "n": encode_normals(n), "i": idx_b64,
            "posScale": scale, "indexBits": idx_bits,
            "vertices": int(len(v)), "triangles": int(len(f)),
            "volumeCm3": round(vol * 1e6, 2),
            "bbox": {"min": [round(x, 6) for x in lo], "max": [round(x, 6) for x in hi]},
        })
        print(f"  {pid:18s} {before:6d} -> {len(f):6d} tris  {vol*1e6:7.1f} cm3  "
              f"{describe(v[f].reshape(-1, 3, 3))}")

    allmin = np.min([p["bbox"]["min"] for p in parts], axis=0)
    allmax = np.max([p["bbox"]["max"] for p in parts], axis=0)

    # The 1U check. CDS rev 14 puts a 1U at 100.0 x 100.0 x 113.5 mm. If the
    # body-frame transform above were wrong — wrong axis, wrong centre — this
    # would not come out. It is the single most informative assertion in the
    # file, so it runs at generation time and fails loudly.
    busmin = np.min([p["bbox"]["min"] for p in parts if p["id"] in BUS_PARTS], axis=0)
    busmax = np.max([p["bbox"]["max"] for p in parts if p["id"] in BUS_PARTS], axis=0)
    bus_mm = (busmax - busmin) * 1000.0
    print(f"\n  1U bus envelope: {bus_mm[0]:.2f} x {bus_mm[1]:.2f} x {bus_mm[2]:.2f} mm "
          f"(CDS rev 14: 100.0 x 100.0 x 113.5)")
    for axis, got, want in zip("XYZ", bus_mm, (100.0, 100.0, 113.5)):
        if abs(got - want) > 1.5:
            raise SystemExit(
                f"body-frame transform is wrong: bus {axis} is {got:.2f} mm, expected {want}")

    header = f'''// GENERATED FILE — do not edit by hand.
//
// AfriOrbit's real 1U CubeSat, decimated for the browser by
//   scripts/extract-geometry.py
// from EduSat-Project / EduSat v2 / CAD / Cubesat cads.zip (the tessellated
// export of `Edusat AfriORBIT.step`).
//
// FRAME. The CAD model has its long axis on +Y. These meshes are in the
// spacecraft body frame used everywhere else in this codebase:
//
//     +Z  the long (rail) axis
//     +X / +Y  the 100 mm cross-section
//     origin   the geometric centre of the 1U bus
//     units    METRES
//
// Transform: (X, Y, Z)_body = (x_cad - {CX:.3f}, z_cad - {CZ:.3f}, y_cad - {CY:.3f}) / 1000
// which is a rotation of -90 degrees about X, so winding order is preserved.
//
// Decimation: vertex clustering on a {CELL_MM} mm grid, cell representative =
// member centroid (keeps flat faces flat), then per-vertex normals split at
// creases sharper than {HARD_EDGE_DEG:.0f} degrees.

// ENCODING. Buffers are base64 rather than JSON number arrays: same mesh, a
// third of the bytes, and the decode is one pass over a typed array. Call
// `decodePart` once and hand the result straight to a GPU buffer.

export type MeshPart = {{
  id: string;
  label: string;
  /** STL files from the CAD archive that were merged into this part. */
  sources: string[];
  /** base64 int16, xyz triples, in 1/posScale metres. */
  p: string;
  /** base64 int8, xyz triples, 127 counts per unit. */
  n: string;
  /** base64 uint16 or uint32 triangle indices, per indexBits. */
  i: string;
  posScale: number;
  indexBits: 16 | 32;
  vertices: number;
  triangles: number;
  /** Enclosed volume, cm^3, from the shipped mesh. Multiply by an alloy
   *  density for a mass estimate. Decimation can seal sub-millimetre cut-outs,
   *  so read this as an upper bound. */
  volumeCm3: number;
  bbox: {{ min: [number, number, number]; max: [number, number, number] }};
}};

export type DecodedPart = {{
  id: string;
  label: string;
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint16Array | Uint32Array;
  triangles: number;
}};

function fromBase64(s: string): Uint8Array {{
  if (typeof atob === 'function') {{
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k += 1) out[k] = bin.charCodeAt(k);
    return out;
  }}
  // Node, for the check scripts and any server-side use.
  return new Uint8Array(Buffer.from(s, 'base64'));
}}

/** Decode one part into GPU-ready typed arrays. Metres, body frame. */
export function decodePart(part: MeshPart): DecodedPart {{
  const pb = fromBase64(part.p);
  const raw = new Int16Array(pb.buffer, pb.byteOffset, pb.byteLength / 2);
  const positions = new Float32Array(raw.length);
  for (let k = 0; k < raw.length; k += 1) positions[k] = raw[k] / part.posScale;

  const nb = fromBase64(part.n);
  const rawN = new Int8Array(nb.buffer, nb.byteOffset, nb.byteLength);
  const normals = new Float32Array(rawN.length);
  // Renormalise: int8 rounding leaves vectors up to ~0.7% short, and a
  // non-unit normal shows up as a subtle brightness gradient across a face.
  for (let k = 0; k < rawN.length; k += 3) {{
    const x = rawN[k] / 127;
    const y = rawN[k + 1] / 127;
    const z = rawN[k + 2] / 127;
    const len = Math.hypot(x, y, z) || 1;
    normals[k] = x / len;
    normals[k + 1] = y / len;
    normals[k + 2] = z / len;
  }}

  const ib = fromBase64(part.i);
  const indices =
    part.indexBits === 16
      ? new Uint16Array(ib.buffer, ib.byteOffset, ib.byteLength / 2)
      : new Uint32Array(ib.buffer, ib.byteOffset, ib.byteLength / 4);

  return {{ id: part.id, label: part.label, positions, normals, indices, triangles: part.triangles }};
}}

'''
    body = ("export const SPACECRAFT_PARTS: MeshPart[] = "
            + json.dumps(parts, separators=(",", ":")) + ";\n")
    footer = f'''
export const SPACECRAFT_BBOX = {{
  min: [{allmin[0]:.4f}, {allmin[1]:.4f}, {allmin[2]:.4f}] as [number, number, number],
  max: [{allmax[0]:.4f}, {allmax[1]:.4f}, {allmax[2]:.4f}] as [number, number, number],
}};

export const SPACECRAFT_SOURCE = 'EduSat-Project / EduSat v2 / CAD / Cubesat cads.zip';

export const SPACECRAFT_TRIANGLES = SPACECRAFT_PARTS.reduce((s, p) => s + p.triangles, 0);
'''
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(header + body + footer, encoding="utf-8")

    total = sum(p["triangles"] for p in parts)
    size = OUT.stat().st_size
    print(f"\n  total {total} triangles, {size/1024:.0f} KB")
    print(f"  bbox  min {np.round(allmin,4).tolist()}  max {np.round(allmax,4).tolist()}")
    for nte in notes:
        print(f"  note: {nte}")
    if size > MAX_BYTES:
        print(f"  WARNING: {size} bytes exceeds the {MAX_BYTES} byte budget — raise CELL_MM")


if __name__ == "__main__":
    main()

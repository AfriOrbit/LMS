'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { SPACECRAFT_BBOX, SPACECRAFT_PARTS, SPACECRAFT_SOURCE, decodePart } from '@/content/geometry';
import { Alert, Card, Field, Input, Select } from '@/components/ui/primitives';
import { circularOrbit, propagate, sunEci, v3 } from '@/lib/edusat/orbit';

import { ShareBar } from './share-bar';
import { useUrlState } from './use-url-state';

/* -------------------------------------------------------------------------- */
/* Minimal 4x4 matrix maths                                                    */
/* -------------------------------------------------------------------------- */
/* Column-major, matching what WebGL's uniformMatrix4fv expects with
 * transpose=false. Writing these out rather than importing gl-matrix keeps the
 * viewer dependency-free; there are only five operations needed. */

type M4 = Float32Array;

function m4perspective(fovy: number, aspect: number, near: number, far: number): M4 {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}

function m4lookAt(eye: number[], centre: number[], up: number[]): M4 {
  const z = normalize([eye[0] - centre[0], eye[1] - centre[1], eye[2] - centre[2]]);
  const x = normalize(cross(up, z));
  const y = cross(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
  ]);
}

function m4multiply(a: M4, b: M4): M4 {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

/** Rotation from a unit quaternion (x, y, z, w). */
function m4fromQuat(q: number[]): M4 {
  const [x, y, z, w] = q;
  return new Float32Array([
    1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
    2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
    2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
    0, 0, 0, 1,
  ]);
}

function cross(a: number[], b: number[]) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a: number[], b: number[]) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function normalize(a: number[]) {
  const n = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
}

/**
 * Shortest-arc quaternion taking body +Z onto `target`.
 *
 * The degenerate case matters: when the target is exactly anti-parallel to +Z
 * the rotation axis is undefined and the naive formula divides by zero, leaving
 * the spacecraft frozen or NaN. Picking any perpendicular axis and rotating by
 * pi is the correct resolution.
 */
function quatZTo(target: number[]): number[] {
  const t = normalize(target);
  const z = [0, 0, 1];
  const d = dot(z, t);
  if (d > 0.999999) return [0, 0, 0, 1];
  if (d < -0.999999) return [1, 0, 0, 0];
  const axis = cross(z, t);
  const w = 1 + d;
  const n = Math.hypot(axis[0], axis[1], axis[2], w) || 1;
  return [axis[0] / n, axis[1] / n, axis[2] / n, w / n];
}

/* -------------------------------------------------------------------------- */
/* Shaders                                                                     */
/* -------------------------------------------------------------------------- */

const VERT = `#version 300 es
in vec3 aPos;
in vec3 aNormal;
uniform mat4 uModel;
uniform mat4 uViewProj;
out vec3 vNormal;
out vec3 vWorld;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vWorld = world.xyz;
  // The model matrix here is rotation + uniform scale only, so the inverse
  // transpose reduces to the rotation itself and the normal can be rotated
  // directly. Worth stating: the moment a non-uniform scale appears this
  // becomes wrong and the lighting goes subtly bad.
  vNormal = mat3(uModel) * aNormal;
  gl_Position = uViewProj * world;
}`;

const FRAG = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vWorld;
uniform vec3 uSunDir;
uniform vec3 uColour;
uniform vec3 uEye;
out vec4 outColour;
void main() {
  vec3 n = normalize(vNormal);
  vec3 l = normalize(uSunDir);
  vec3 v = normalize(uEye - vWorld);
  // Two-sided: a decimated mesh has the odd inverted facet, and a black hole
  // in the middle of the spacecraft reads as a modelling error rather than a
  // lighting one.
  if (dot(n, v) < 0.0) n = -n;
  float diff = max(dot(n, l), 0.0);
  vec3 h = normalize(l + v);
  float spec = pow(max(dot(n, h), 0.0), 48.0) * 0.35;
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0) * 0.28;
  vec3 ambient = uColour * 0.16;
  // A dim fill from the anti-sun side stands in for Earth albedo, which is a
  // real and substantial term in orbit — the nadir face of a LEO spacecraft is
  // never as dark as a vacuum render suggests.
  float albedo = max(dot(n, -l), 0.0) * 0.10;
  outColour = vec4(ambient + uColour * (diff * 0.85 + albedo) + vec3(spec) + vec3(0.35, 0.55, 0.8) * rim, 1.0);
}`;

const PART_COLOURS: Record<string, [number, number, number]> = {
  structure: [0.72, 0.74, 0.78],
  'panel-pz': [0.55, 0.58, 0.63],
  'panel-nz': [0.55, 0.58, 0.63],
  'panel-px': [0.11, 0.24, 0.5],
  'element-px': [0.85, 0.42, 0.1],
  'stack-nz': [0.42, 0.45, 0.5],
  bracket: [0.8, 0.72, 0.3],
};

/* -------------------------------------------------------------------------- */

type ViewerState = {
  attitude: string; // 'nadir' | 'sun' | 'spin' | 'manual'
  altitudeKm: number;
  inclinationDeg: number;
  hidden: string[];
  yawDeg: number;
  pitchDeg: number;
  spinRpm: number;
  showAxes: boolean;
};

const DEFAULTS: ViewerState = {
  attitude: 'nadir',
  altitudeKm: 500,
  inclinationDeg: 97.4,
  hidden: [],
  yawDeg: 0,
  pitchDeg: 0,
  spinRpm: 2,
  showAxes: true,
};

const EPOCH = new Date(Date.UTC(2026, 2, 20, 0, 0, 0));

export function SpacecraftViewerSandbox() {
  const { state, patch, reset, warning, link } = useUrlState<ViewerState>(DEFAULTS, 'v');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Camera, held in a ref so pointer handling does not re-render every frame.
  const cam = useRef({ theta: 0.9, phi: 1.05, dist: 0.42 });
  // The render loop reads the latest configuration through a ref rather than
  // through a dependency, so that changing a slider does not tear down and
  // rebuild the GPU buffers. Written in an effect, never during render:
  // mutating a ref while rendering is exactly the kind of thing that works
  // until concurrent rendering re-runs the component and it silently does not.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const parts = useMemo(() => SPACECRAFT_PARTS.map(decodePart), []);
  const extent = useMemo(() => {
    const e = SPACECRAFT_BBOX.max.map((v, i) => v - SPACECRAFT_BBOX.min[i]);
    return Math.max(...e);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!gl) {
      setError('This browser does not support WebGL 2, so the 3D view cannot be drawn.');
      return;
    }

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(sh) ?? 'shader compile failed');
      }
      return sh;
    };

    let program: WebGLProgram;
    try {
      program = gl.createProgram()!;
      gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) ?? 'link failed');
      }
    } catch (e) {
      setError(`The 3D view could not start: ${(e as Error).message}`);
      return;
    }

    const loc = {
      pos: gl.getAttribLocation(program, 'aPos'),
      nrm: gl.getAttribLocation(program, 'aNormal'),
      model: gl.getUniformLocation(program, 'uModel'),
      viewProj: gl.getUniformLocation(program, 'uViewProj'),
      sun: gl.getUniformLocation(program, 'uSunDir'),
      colour: gl.getUniformLocation(program, 'uColour'),
      eye: gl.getUniformLocation(program, 'uEye'),
    };

    const buffers = parts.map((p) => {
      const vao = gl.createVertexArray()!;
      gl.bindVertexArray(vao);
      const pb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, pb);
      gl.bufferData(gl.ARRAY_BUFFER, p.positions, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc.pos);
      gl.vertexAttribPointer(loc.pos, 3, gl.FLOAT, false, 0, 0);
      const nb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, nb);
      gl.bufferData(gl.ARRAY_BUFFER, p.normals, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc.nrm);
      gl.vertexAttribPointer(loc.nrm, 3, gl.FLOAT, false, 0, 0);
      const ib = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, p.indices, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      return {
        vao,
        count: p.indices.length,
        type: p.indices instanceof Uint16Array ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT,
        id: p.id,
      };
    });

    gl.enable(gl.DEPTH_TEST);
    setReady(true);

    let raf = 0;
    const t0 = performance.now();

    const render = () => {
      const s = stateRef.current;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.clearColor(0.035, 0.055, 0.09, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      const elapsed = (performance.now() - t0) / 1000;

      // Where the spacecraft is, and where the Sun is from there. The attitude
      // laws below are the same ones the mission simulator uses, so the picture
      // and the power number agree.
      const orbit = circularOrbit({ altitudeKm: s.altitudeKm, inclinationDeg: s.inclinationDeg, epoch: EPOCH });
      const jd = orbit.epochJd + (elapsed / 60) * (1 / 1440) * 30; // 30x real time
      const st = propagate(orbit, jd);
      const sunVec = v3.unit(v3.sub(sunEci(jd), st.r));
      const nadir = v3.unit(v3.scale(st.r, -1));

      let q: number[];
      if (s.attitude === 'sun') q = quatZTo([sunVec[0], sunVec[1], sunVec[2]]);
      else if (s.attitude === 'nadir') q = quatZTo([nadir[0], nadir[1], nadir[2]]);
      else if (s.attitude === 'spin') {
        const a = (elapsed * s.spinRpm * 2 * Math.PI) / 60;
        const base = quatZTo([nadir[0], nadir[1], nadir[2]]);
        const spin = [0, 0, Math.sin(a / 2), Math.cos(a / 2)];
        q = [
          base[3] * spin[0] + base[0] * spin[3] + base[1] * spin[2] - base[2] * spin[1],
          base[3] * spin[1] - base[0] * spin[2] + base[1] * spin[3] + base[2] * spin[0],
          base[3] * spin[2] + base[0] * spin[1] - base[1] * spin[0] + base[2] * spin[3],
          base[3] * spin[3] - base[0] * spin[0] - base[1] * spin[1] - base[2] * spin[2],
        ];
      } else {
        const cy = Math.cos((s.yawDeg * Math.PI) / 360);
        const sy = Math.sin((s.yawDeg * Math.PI) / 360);
        const cp = Math.cos((s.pitchDeg * Math.PI) / 360);
        const sp = Math.sin((s.pitchDeg * Math.PI) / 360);
        q = [sp * cy, cp * sy, -sp * sy, cp * cy];
      }

      const model = m4fromQuat(q);
      const { theta, phi, dist } = cam.current;
      const eye = [
        dist * Math.sin(phi) * Math.cos(theta),
        dist * Math.sin(phi) * Math.sin(theta),
        dist * Math.cos(phi),
      ];
      const view = m4lookAt(eye, [0, 0, 0], [0, 0, 1]);
      const proj = m4perspective(Math.PI / 4, w / h, 0.01, 20);
      const viewProj = m4multiply(proj, view);

      gl.useProgram(program);
      gl.uniformMatrix4fv(loc.viewProj, false, viewProj);
      gl.uniformMatrix4fv(loc.model, false, model);
      gl.uniform3f(loc.sun, sunVec[0], sunVec[1], sunVec[2]);
      gl.uniform3f(loc.eye, eye[0], eye[1], eye[2]);

      for (const b of buffers) {
        if (s.hidden.includes(b.id)) continue;
        const c = PART_COLOURS[b.id] ?? [0.7, 0.7, 0.7];
        gl.uniform3f(loc.colour, c[0], c[1], c[2]);
        gl.bindVertexArray(b.vao);
        gl.drawElements(gl.TRIANGLES, b.count, b.type, 0);
      }
      gl.bindVertexArray(null);

      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    const onLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(raf);
      setError('The graphics context was lost. Reload the page to bring the 3D view back.');
    };
    canvas.addEventListener('webglcontextlost', onLost);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('webglcontextlost', onLost);
      for (const b of buffers) gl.deleteVertexArray(b.vao);
      gl.deleteProgram(program);
    };
  }, [parts]);

  /* -- pointer control ---------------------------------------------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dragging = false;
    let lx = 0;
    let ly = 0;

    const down = (e: PointerEvent) => {
      dragging = true;
      lx = e.clientX;
      ly = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      cam.current.theta -= (e.clientX - lx) * 0.008;
      // Clamp off the poles: at phi exactly 0 or pi the up vector and the view
      // direction are parallel and lookAt produces a degenerate matrix, which
      // shows up as the model flickering out of existence.
      cam.current.phi = Math.min(Math.PI - 0.05, Math.max(0.05, cam.current.phi - (e.clientY - ly) * 0.008));
      lx = e.clientX;
      ly = e.clientY;
    };
    const up = (e: PointerEvent) => {
      dragging = false;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      cam.current.dist = Math.min(2, Math.max(0.16, cam.current.dist * (1 + Math.sign(e.deltaY) * 0.1)));
    };

    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', wheel, { passive: false });
    return () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('wheel', wheel);
    };
  }, []);

  const toggle = (id: string) =>
    patch({ hidden: state.hidden.includes(id) ? state.hidden.filter((h) => h !== id) : [...state.hidden, id] });

  const totalTris = SPACECRAFT_PARTS.reduce((s, p) => s + p.triangles, 0);

  return (
    <div className="space-y-6">
      <ShareBar link={link} warning={warning} onReset={reset} what="view" />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,280px)]">
        <Card>
          {error ? (
            <Alert tone="warning" title="3D view unavailable">
              {error}
            </Alert>
          ) : (
            <div className="relative">
              <canvas
                ref={canvasRef}
                className="h-[420px] w-full cursor-grab touch-none rounded-lg active:cursor-grabbing"
                aria-label="Three-dimensional view of the EduSat CubeSat"
              />
              {!ready ? (
                <p className="absolute inset-0 grid place-items-center text-sm text-[var(--text-muted)]">
                  Starting the 3D view…
                </p>
              ) : null}
              <p className="absolute bottom-2 left-3 text-xs text-white/50">drag to orbit · scroll to zoom</p>
            </div>
          )}
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            {SPACECRAFT_SOURCE} — {totalTris.toLocaleString('en-GB')} triangles after decimation, in the spacecraft body
            frame with +Z along the rails. The 1U envelope measures {(extent * 1000).toFixed(0)} mm on its longest axis.
          </p>
        </Card>

        <div className="space-y-4">
          <Card>
            <h3 className="mb-3 text-sm font-semibold">Attitude</h3>
            <Field label="Law" htmlFor="att">
              <Select id="att" value={state.attitude} onChange={(e) => patch({ attitude: e.target.value })}>
                <option value="nadir">Nadir-pointing</option>
                <option value="sun">Sun-pointing</option>
                <option value="spin">Spin about nadir</option>
                <option value="manual">Manual</option>
              </Select>
            </Field>
            {state.attitude === 'spin' ? (
              <Field label="Spin rate (rpm)" htmlFor="rpm">
                <Input
                  id="rpm"
                  type="number"
                  min={0}
                  max={60}
                  step={0.5}
                  value={state.spinRpm}
                  onChange={(e) => patch({ spinRpm: Number(e.target.value) || 0 })}
                />
              </Field>
            ) : null}
            {state.attitude === 'manual' ? (
              <div className="grid grid-cols-2 gap-2">
                <Field label="Yaw" htmlFor="yaw">
                  <Input id="yaw" type="range" min={-180} max={180} value={state.yawDeg} onChange={(e) => patch({ yawDeg: Number(e.target.value) })} />
                </Field>
                <Field label="Pitch" htmlFor="pit">
                  <Input id="pit" type="range" min={-180} max={180} value={state.pitchDeg} onChange={(e) => patch({ pitchDeg: Number(e.target.value) })} />
                </Field>
              </div>
            ) : null}
          </Card>

          <Card>
            <h3 className="mb-3 text-sm font-semibold">Orbit for the lighting</h3>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Altitude (km)" htmlFor="valt">
                <Input id="valt" type="number" min={180} max={2000} step={50} value={state.altitudeKm} onChange={(e) => patch({ altitudeKm: Math.max(180, Number(e.target.value) || 500) })} />
              </Field>
              <Field label="Inclination" htmlFor="vinc">
                <Input id="vinc" type="number" min={0} max={180} step={1} value={state.inclinationDeg} onChange={(e) => patch({ inclinationDeg: Number(e.target.value) || 0 })} />
              </Field>
            </div>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              The Sun direction is computed from the real orbit at 30&times; real time, so the lighting sweeps the way it
              would in flight.
            </p>
          </Card>

          <Card>
            <h3 className="mb-2 text-sm font-semibold">Parts</h3>
            <div className="space-y-1">
              {SPACECRAFT_PARTS.map((p) => {
                const c = PART_COLOURS[p.id] ?? [0.7, 0.7, 0.7];
                return (
                  <label key={p.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="checkbox" checked={!state.hidden.includes(p.id)} onChange={() => toggle(p.id)} />
                    <span
                      className="inline-block h-3 w-3 shrink-0 rounded-sm"
                      style={{ background: `rgb(${c.map((v) => Math.round(v * 255)).join(',')})` }}
                    />
                    <span className="min-w-0 flex-1 truncate">{p.label}</span>
                    <span className="shrink-0 font-mono text-xs text-[var(--text-muted)]">{(p.triangles / 1000).toFixed(1)}k</span>
                  </label>
                );
              })}
            </div>
          </Card>

          <Alert tone="info" title="About these part names">
            The CAD archive ships unnamed solids, so parts are labelled by where they sit and what shape they are. Where
            the function is not obvious from the geometry, the label does not guess.
          </Alert>
        </div>
      </div>
    </div>
  );
}

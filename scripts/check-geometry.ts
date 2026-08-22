import { SPACECRAFT_PARTS, SPACECRAFT_BBOX, SPACECRAFT_TRIANGLES, decodePart } from '../src/content/geometry';
let fail = 0;
const ok = (l: string, c: boolean, d = '') => { console.log(`${c?'PASS':'FAIL'}  ${l}${d?': '+d:''}`); if(!c) fail++; };

let tri = 0;
for (const part of SPACECRAFT_PARTS) {
  const p = decodePart(part);
  tri += p.triangles;
  ok(`${part.id}: positions divisible by 3`, p.positions.length % 3 === 0, `${p.positions.length}`);
  ok(`${part.id}: normals match positions`, p.normals.length === p.positions.length);
  ok(`${part.id}: vertex count agrees`, p.positions.length / 3 === part.vertices, `${p.positions.length/3} vs ${part.vertices}`);

  let maxIdx = -1;
  for (let k = 0; k < p.indices.length; k++) if (p.indices[k] > maxIdx) maxIdx = p.indices[k];
  ok(`${part.id}: indices in range`, maxIdx < part.vertices, `max ${maxIdx} < ${part.vertices}`);
  ok(`${part.id}: index count is 3x triangles`, p.indices.length === part.triangles * 3);

  let worstN = 0;
  for (let k = 0; k < p.normals.length; k += 3) {
    const m = Math.hypot(p.normals[k], p.normals[k+1], p.normals[k+2]);
    worstN = Math.max(worstN, Math.abs(m - 1));
  }
  ok(`${part.id}: normals are unit`, worstN < 1e-3, `worst deviation ${worstN.toExponential(2)}`);

  // Quantisation must not have moved a vertex more than half a count (0.005 mm).
  const lo = [Infinity,Infinity,Infinity], hi = [-Infinity,-Infinity,-Infinity];
  for (let k = 0; k < p.positions.length; k += 3)
    for (let a = 0; a < 3; a++) { const v = p.positions[k+a]; if (v<lo[a]) lo[a]=v; if (v>hi[a]) hi[a]=v; }
  const bboxErr = Math.max(...lo.map((v,a)=>Math.abs(v-part.bbox.min[a])), ...hi.map((v,a)=>Math.abs(v-part.bbox.max[a])));
  ok(`${part.id}: decoded bbox matches declared`, bboxErr < 1e-5, `err ${bboxErr.toExponential(2)} m`);
}
ok('triangle total agrees', tri === SPACECRAFT_TRIANGLES, `${tri}`);

// Outward winding on the closed structure part.
const st = decodePart(SPACECRAFT_PARTS.find(p=>p.id==='structure')!);
let vol = 0;
for (let k = 0; k < st.indices.length; k += 3) {
  const [i,j,l] = [st.indices[k]*3, st.indices[k+1]*3, st.indices[k+2]*3];
  const a=[st.positions[i],st.positions[i+1],st.positions[i+2]];
  const b=[st.positions[j],st.positions[j+1],st.positions[j+2]];
  const c=[st.positions[l],st.positions[l+1],st.positions[l+2]];
  vol += (a[0]*(b[1]*c[2]-b[2]*c[1]) + a[1]*(b[2]*c[0]-b[0]*c[2]) + a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
}
ok('structure winding is outward', vol > 0, `signed volume ${(vol*1e6).toFixed(1)} cm3`);

const ext = SPACECRAFT_BBOX.max.map((v,i)=>(v-SPACECRAFT_BBOX.min[i])*1000);
console.log(`\nwhole assembly ${ext.map(v=>v.toFixed(1)).join(' x ')} mm, ${SPACECRAFT_TRIANGLES} triangles`);
process.exit(fail?1:0);

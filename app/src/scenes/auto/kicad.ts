// Real component models from the KiCad 3D library (public/models/kicad/*.wrl, "kicad StepUp" VRML; CC-BY-SA 4.0 with
// the KiCad libraries exception). three's VRMLLoader drops the material names, and those names (PIN-01 = tinned
// pin, PIN-02 = gold, IC-BODY-EPOXY = moulded plastic, LED-WHITE = clear lens...) are what lets studio.ts give each
// surface real metal, plastic or glass, so this reads the files' simple layout itself: per Shape, a triangle list,
// its points and a named material. KiCad units are 1 = 2.54 mm with Z up; parts come out in cm with Y up.
import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface KicadSurface {
  /** the KiCad material name, or C<hex> for an unnamed inline colour */
  mat: string;
  color: THREE.Color;
  geo: THREE.BufferGeometry;
}
export interface KicadModel {
  name: string;
  surfaces: KicadSurface[];
  box: THREE.Box3;
}

const UNIT = 0.254; // cm per KiCad VRML unit

function color(block: string) {
  const m = block.match(/diffuseColor\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)/);
  // the files store display (sRGB) values; lighting works in linear
  return m ? new THREE.Color(+m[1], +m[2], +m[3]).convertSRGBToLinear() : new THREE.Color(0.5, 0.5, 0.5);
}

export function parseKicad(name: string, text: string): KicadModel {
  const defs = new Map<string, THREE.Color>();
  for (const m of text.matchAll(/DEF\s+(\S+)\s+Material\s*\{([^}]*)\}/g)) defs.set(m[1], color(m[2]));
  const groups = new Map<string, { color: THREE.Color; geos: THREE.BufferGeometry[] }>();
  for (const b of text.split(/\bShape\s*\{/).slice(1)) {
    const ci = b.match(/coordIndex\s*\[([^\]]*)\]/);
    const pt = b.match(/point\s*\[([^\]]*)\]/);
    if (!ci || !pt) continue;
    let mat = b.match(/material\s+USE\s+([^\s}]+)/)?.[1] ?? b.match(/material\s+DEF\s+(\S+)/)?.[1];
    let col = mat ? defs.get(mat) : undefined;
    if (!mat || !col) {
      col = color(b.match(/Material\s*\{([^}]*)\}/)?.[1] ?? '');
      mat = mat ?? `C${col.getHexString()}`;
    }
    const p = pt[1].trim().split(/[\s,]+/).map(Number);
    const tri: number[] = [];
    let poly: number[] = [];
    const flush = () => {
      for (let k = 1; k + 1 < poly.length; k++) tri.push(poly[0], poly[k], poly[k + 1]);
      poly = [];
    };
    for (const s of ci[1].split(/[\s,]+/)) {
      if (!s) continue;
      const i = +s;
      if (i < 0) flush();
      else poly.push(i);
    }
    flush();
    if (!tri.length) continue;
    const pos = new Float32Array(tri.length * 3);
    tri.forEach((v, j) => {
      pos[j * 3] = p[v * 3] * UNIT;
      pos[j * 3 + 1] = p[v * 3 + 2] * UNIT; // Z up -> Y up
      pos[j * 3 + 2] = -p[v * 3 + 1] * UNIT;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const e = groups.get(mat) ?? { color: col, geos: [] };
    e.geos.push(g);
    groups.set(mat, e);
  }
  const surfaces: KicadSurface[] = [];
  const box = new THREE.Box3();
  for (const [mat, e] of groups) {
    const merged = mergeGeometries(e.geos)!;
    const geo = toCreasedNormals(merged, 0.5);
    geo.computeBoundingBox();
    box.union(geo.boundingBox!);
    surfaces.push({ mat, color: e.color, geo });
  }
  return { name, surfaces, box };
}

const cache = new Map<string, Promise<KicadModel>>();
const loaded = new Map<string, KicadModel>();

export function loadKicad(name: string): Promise<KicadModel> {
  let p = cache.get(name);
  if (!p) {
    p = fetch(`/models/kicad/${name}.wrl`)
      .then((r) => {
        if (!r.ok) throw new Error(`${name}.wrl: ${r.status}`);
        return r.text();
      })
      .then((t) => {
        const m = parseKicad(name, t);
        loaded.set(name, m);
        return m;
      });
    cache.set(name, p);
  }
  return p;
}

/** A model already loaded by loadKicad, or undefined (callers fall back to their own primitive). */
export const kicad = (name: string) => loaded.get(name);

// Dev tool: prints each KiCad model's bounding box (cm, Y up) and material names, for placing parts in studio.ts.
import { readFileSync, readdirSync } from 'node:fs';
import { parseKicad } from '../src/scenes/auto/kicad.ts';
const dir = 'D:/MoneyPrinterTurbo-main/motion grafix/app/public/models/kicad';
for (const f of readdirSync(dir).filter((f) => f.endsWith('.wrl'))) {
  const m = parseKicad(f, readFileSync(`${dir}/${f}`, 'utf8'));
  const b = m.box;
  const r = (v: number) => v.toFixed(2);
  console.log(f.padEnd(48), 'x', r(b.min.x), r(b.max.x), ' y', r(b.min.y), r(b.max.y), ' z', r(b.min.z), r(b.max.z), ' mats', m.surfaces.map((s) => s.mat).join(','));
}

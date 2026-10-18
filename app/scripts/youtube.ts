// Writes out/<video>_youtube.txt: a title, description and chapter timestamps taken from the
// real timeline (so they stay right when the voice re-times the video).
//
//   bun scripts/youtube.ts [--video rutherford]
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openApp, outRoot } from './app';

const argv = process.argv.slice(2);
const i = argv.indexOf('--video');
const { page, info, close } = await openApp({ video: i >= 0 ? argv[i + 1] : undefined });
await close();
void page;

const CHAPTERS: Record<string, string> = {
  intro: 'Intro',
  electron: 'Discovery of the electron (1897)',
  plum: "Thomson's plum pudding model",
  alpha: 'What are alpha particles?',
  setup: 'The Geiger–Marsden experiment setup',
  fire: 'Observations',
  quote: "Rutherford's reaction",
  graph: 'Scattering vs angle: N ∝ 1/sin⁴(θ/2)',
  inside: 'Inside the atom & impact parameter',
  closest: 'Distance of closest approach',
  scale: 'Size of the nucleus',
  model: "Rutherford's nuclear model",
  limits: 'Limitations of the model',
  outro: 'Summary',
};

const stamp = (s: number) => {
  const t = Math.floor(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
const chapters = info.plates.map((p) => `${stamp(p.start)} ${CHAPTERS[p.id] ?? p.id}`);

const text = `TITLE
Rutherford's Gold Foil Experiment Explained | Alpha Scattering, Nuclear Model & Limitations | Class 11 & 12

DESCRIPTION
How did firing alpha particles at a sheet of gold reveal the nucleus? This animated explainer covers Rutherford's alpha-particle scattering experiment step by step, at Class 11 and 12 level (NCERT Chemistry: Structure of Atom; Physics: Atoms).

What you'll learn:
• Thomson's discovery of the electron and the plum pudding model
• What alpha particles are (He²⁺) and why they make good probes
• The Geiger–Marsden apparatus: lead block, gold foil, ZnS screen, microscope, vacuum
• Observations: most pass straight through, ~1 in 700 deflected > 1°, ~1 in 8000 beyond 90°
• The scattering graph and Rutherford's formula N ∝ 1/sin⁴(θ/2)
• Impact parameter b and why small b means large deflection
• Distance of closest approach: d = 2Ze² / 4πε₀K (worked example: 7.7 MeV on gold ≈ 3 × 10⁻¹⁴ m)
• Size of the nucleus (~10⁻¹⁵ m vs atom ~10⁻¹⁰ m)
• Rutherford's nuclear model and its limitations (stability, line spectra)

Chapters
${chapters.join('\n')}

Notes: the scattering-graph points are illustrative; diagrams are not to scale.
Narration: Kokoro TTS. Animation, music and sound effects made in code.

#Rutherford #GoldFoilExperiment #AtomicStructure #Physics #Chemistry #Class11 #Class12 #NCERT #JEE #NEET

TAGS
rutherford gold foil experiment, alpha particle scattering, rutherford model of atom, rutherford atomic model, structure of atom class 11, atoms class 12 physics, distance of closest approach, impact parameter, plum pudding model, thomson model, geiger marsden experiment, nucleus discovery, limitations of rutherford model, NCERT, JEE, NEET
`;

const file = join(outRoot, `${info.video}_youtube.txt`);
writeFileSync(file, text);
console.log(chapters.join('\n'));
console.log(`\nwrote ${file}`);

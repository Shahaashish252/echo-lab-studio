// Every time in the film comes from the voice: line starts (spec.lines[i].t, d) set the act boundaries,
// the label windows and the moments each drawing begins. Line ids: a1–a6 (teardown), b1–b6 (blueprint), c1–c5 (isometric).
export const W = 1080, H = 1920;

export function makeTimeline(spec) {
  const L = Object.fromEntries(spec.lines.map((l) => [l.id, l]));
  const t = (id) => L[id].t, end = (id) => L[id].t + L[id].d;
  const T = {
    open: t('a2') - .05,
    dive: t('a3') - .35,
    stop1: t('a3'),
    stop2: t('a5') - .1,
    under: t('a6') - .2,
    close: t('b1') - 1.15,
    bpIn: t('b1') - .3,
    isoIn: t('c1') - .55,
    card: t('c5') + 1.4,
  };
  T.bpOnly = T.bpIn + .5; T.isoOnly = T.isoIn + .6;
  const DUR = +Math.max(end('c5') + 2.3, T.card + 3.2).toFixed(2);
  const LBL = {
    note: [0.2, Math.max(t('a2') + .6, 3.6)],
    labels: [T.open + 1.1, T.dive + 1.0],
    stop1: [t('a3') + .5, T.stop2 - .2],
    stop1b: [t('a4'), T.stop2 - .1],
    stop2: [t('a5') + .5, t('a6') + .3],
    back: [t('a6') + .1, T.close + .7],
  };
  return { T, LBL, DUR, L, t, end, lines: spec.lines };
}

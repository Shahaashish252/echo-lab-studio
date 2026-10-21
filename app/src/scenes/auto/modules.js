// Realistic drawings of the real hobby-electronics modules our videos explain, in the detailed style of the Arduino
// Uno drawing (arduino.ts): real PCB colours, parts, pins and labels. Used by story-lib.js "module" scenes.
// Every module is drawn centred at (0,0) in px, about 800 px wide, and animates from time t (seek-safe).
import { drawUno, BOARD_W, BOARD_H } from './arduino';

const PCB_BLUE = '#1f4fa8', PCB_BLUE_D = '#163b80', PCB_GREEN = '#1d6b3a', PCB_GREEN_D = '#154e2b', PCB_BLACK = '#1b1d22';
const SILK = '#e8eef5', GOLD = '#d8b25a', METAL = '#b9c0c8', METAL_D = '#7f868e', HOT = '#ff6a2b', COOL = '#3fd0c0';

function rr(ctx, x, y, w, h, r, fill, stroke) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 3; ctx.stroke(); } }
function circ(ctx, x, y, r, fill, stroke, lw = 3) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); } }
function label(ctx, s, x, y, size = 22, color = SILK, align = 'center') { ctx.font = `700 ${size}px "IBM Plex Mono", Consolas, monospace`; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(s, x, y); ctx.textAlign = 'left'; }
function pcb(ctx, w, h, fill, dark, holes = true) {
  rr(ctx, -w / 2 + 8, -h / 2 + 10, w, h, 14, 'rgba(0,0,0,0.45)');
  rr(ctx, -w / 2, -h / 2, w, h, 14, fill, dark);
  if (holes) for (const [x, y] of [[-w / 2 + 22, -h / 2 + 22], [w / 2 - 22, -h / 2 + 22], [-w / 2 + 22, h / 2 - 22], [w / 2 - 22, h / 2 - 22]]) { circ(ctx, x, y, 11, GOLD); circ(ctx, x, y, 6, '#0b0b0b'); }
}
function pins(ctx, names, x0, y, pitch = 46, down = true) {
  names.forEach((n, i) => {
    const x = x0 + i * pitch;
    rr(ctx, x - 16, y - 16, 32, 32, 4, '#151515');
    ctx.fillStyle = GOLD; ctx.fillRect(x - 4, down ? y : y - 60, 8, 60);
    label(ctx, n, x, down ? y - 26 : y + 40, 19);
  });
}
function pot(ctx, x, y, r = 34, t = 0) { rr(ctx, x - r, y - r, r * 2, r * 2, 6, '#2f6fd6', '#1c4a96'); circ(ctx, x, y, r * 0.6, '#f2f2f2'); ctx.save(); ctx.translate(x, y); ctx.rotate(0.6); ctx.fillStyle = '#555'; ctx.fillRect(-r * 0.45, -4, r * 0.9, 8); ctx.fillRect(-4, -r * 0.45, 8, r * 0.9); ctx.restore(); }
function smdLed(ctx, x, y, on, color = '#ff3b3b') { if (on) { ctx.shadowColor = color; ctx.shadowBlur = 30; } rr(ctx, x - 14, y - 8, 28, 16, 3, on ? color : '#5a2020'); ctx.shadowBlur = 0; }
function chip(ctx, x, y, w, h, name, legs = 4) { rr(ctx, x - w / 2, y - h / 2, w, h, 4, '#121316'); for (let i = 0; i < legs; i++) { const lx = x - w / 2 + 12 + (i * (w - 24)) / Math.max(1, legs - 1); ctx.fillStyle = METAL; ctx.fillRect(lx - 4, y - h / 2 - 12, 8, 12); ctx.fillRect(lx - 4, y + h / 2, 8, 12); } label(ctx, name, x, y + 7, 16, '#c9c9c9'); }
function glowRing(ctx, x, y, r, t) { const a = 0.5 + 0.5 * Math.sin(t * 5); ctx.save(); ctx.shadowColor = HOT; ctx.shadowBlur = 40; ctx.strokeStyle = `rgba(255,106,43,${0.55 + 0.45 * a})`; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(x, y, r + a * 8, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }

// ---------- the modules ----------
export const MODULES = {
  // HC-SR04 ultrasonic distance sensor: blue PCB, two silver transducers, crystal, VCC TRIG ECHO GND
  hcsr04(ctx, t, s) {
    pcb(ctx, 820, 380, PCB_BLUE, PCB_BLUE_D);
    for (const [x, name] of [[-220, 'T'], [220, 'R']]) {
      circ(ctx, x, -10, 150, '#d9dde2', METAL_D, 6); circ(ctx, x, -10, 122, '#2c2f34');
      ctx.save(); ctx.beginPath(); ctx.arc(x, -10, 118, 0, Math.PI * 2); ctx.clip(); ctx.strokeStyle = '#4a4f57'; ctx.lineWidth = 2;
      for (let k = -130; k <= 130; k += 12) { ctx.beginPath(); ctx.moveTo(x + k, -140); ctx.lineTo(x + k + 120, 130); ctx.moveTo(x + k, 130); ctx.lineTo(x + k + 120, -140); ctx.stroke(); }
      ctx.restore(); label(ctx, name, x, -175, 30);
    }
    rr(ctx, -45, -150, 90, 36, 18, METAL, METAL_D); label(ctx, 'HC-SR04', 0, 60, 26);
    pins(ctx, ['VCC', 'TRIG', 'ECHO', 'GND'], -69, 190);
    if (s.action !== 'off') { // the ping: rings leave T
      for (let i = 0; i < 4; i++) { const u = (t * 0.8 + i / 4) % 1; ctx.strokeStyle = `rgba(63,208,192,${1 - u})`; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(-220, -10, 160 + u * 260, -Math.PI * 0.85, -Math.PI * 0.15); ctx.stroke(); }
    }
  },
  // HC-SR501 PIR motion sensor: green PCB, white faceted Fresnel dome, two orange pots, 3 pins
  pir(ctx, t, s) {
    pcb(ctx, 560, 560, PCB_GREEN, PCB_GREEN_D);
    const g = ctx.createRadialGradient(-60, -80, 20, 0, -20, 250); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#cfd3d6');
    circ(ctx, 0, -20, 230, g, '#aab0b5', 4);
    ctx.strokeStyle = 'rgba(120,128,135,0.55)'; ctx.lineWidth = 3;
    for (let r = 50; r < 230; r += 45) { ctx.beginPath(); ctx.arc(0, -20, r, 0, Math.PI * 2); ctx.stroke(); }
    for (let a = 0; a < 12; a++) { ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(Math.cos(a * Math.PI / 6) * 230, -20 + Math.sin(a * Math.PI / 6) * 230); ctx.stroke(); }
    if (s.action === 'detect' || s.action === 'on') { ctx.save(); ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t * 6); circ(ctx, 0, -20, 230, HOT); ctx.restore(); }
    rr(ctx, -230, 220, 70, 70, 8, '#f08a24', '#a85a12'); rr(ctx, 160, 220, 70, 70, 8, '#f08a24', '#a85a12');
    label(ctx, 'TIME', -195, 320, 18); label(ctx, 'SENS', 195, 320, 18);
    pins(ctx, ['VCC', 'OUT', 'GND'], -46, 300);
  },
  // IR obstacle sensor (FC-51 style): small blue PCB, clear IR LED + dark photodiode, trimmer, LM393, 2 LEDs
  ir(ctx, t, s) {
    pcb(ctx, 380, 760, PCB_BLUE, PCB_BLUE_D, false);
    rr(ctx, -110, -470, 70, 140, 30, 'rgba(230,240,255,0.85)', '#9fb3c8'); rr(ctx, 40, -470, 70, 140, 30, '#141414', '#444');
    label(ctx, 'IR LED', -75, -300, 18); label(ctx, 'RECEIVER', 75, -300, 18);
    pot(ctx, 0, -150, 44); chip(ctx, 0, 30, 150, 90, 'LM393', 4);
    smdLed(ctx, -90, 170, true, '#ff3b3b'); smdLed(ctx, 90, 170, s.action === 'detect' || Math.sin(t * 3) > 0, '#3bff6a');
    label(ctx, 'PWR', -90, 210, 16); label(ctx, 'OBS', 90, 210, 16);
    pins(ctx, ['VCC', 'GND', 'OUT'], -46, 330);
    if (s.action !== 'off') { const u = (t * 0.7) % 1; ctx.save(); ctx.shadowColor = HOT; ctx.shadowBlur = 25; ctx.fillStyle = `rgba(255,106,43,${0.6 * (1 - u)})`; ctx.beginPath(); ctx.moveTo(-95, -470); ctx.lineTo(-55, -470); ctx.lineTo(-40 + u * 40, -470 - 260 * u); ctx.lineTo(-110 - u * 40, -470 - 260 * u); ctx.fill(); ctx.restore(); }
  },
  // LDR light sensor module: photoresistor (red zigzag), pot, LM393, 4 pins
  ldr(ctx, t, s) {
    pcb(ctx, 420, 640, PCB_BLUE, PCB_BLUE_D, false);
    circ(ctx, 0, -230, 70, '#e9d7b0', '#a88d55', 4);
    ctx.strokeStyle = '#b5352b'; ctx.lineWidth = 7; ctx.beginPath(); for (let i = 0; i < 7; i++) { const y = -270 + i * 13; ctx.moveTo(-45, y); ctx.lineTo(45, y); } ctx.stroke();
    ctx.fillStyle = METAL; ctx.fillRect(-30, -160, 6, 50); ctx.fillRect(24, -160, 6, 50);
    label(ctx, 'LDR', 0, -320, 22);
    pot(ctx, -90, -40, 40); chip(ctx, 70, -30, 120, 80, 'LM393', 4);
    smdLed(ctx, -90, 110, true); smdLed(ctx, 90, 110, s.action === 'dark' || Math.sin(t * 2) > 0, '#3bff6a');
    pins(ctx, ['VCC', 'GND', 'DO', 'AO'], -69, 270);
    if (s.action === 'light') { ctx.save(); ctx.globalAlpha = 0.25 + 0.15 * Math.sin(t * 4); circ(ctx, 0, -230, 140, '#ffd34d'); ctx.restore(); }
  },
  // DHT11 temperature & humidity: blue grilled case on a small board, 3 pins
  dht11(ctx, t, s) {
    pcb(ctx, 380, 300, PCB_BLUE, PCB_BLUE_D, false);
    rr(ctx, -150, -470, 300, 360, 18, '#2f6fd6', '#1c4a96');
    ctx.fillStyle = '#16325f'; for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) rr(ctx, -110 + c * 58, -430 + r * 52, 40, 30, 4, '#16325f');
    label(ctx, 'DHT11', 0, -60, 26); pins(ctx, ['VCC', 'DATA', 'GND'], -46, 150);
    if (s.action !== 'off') for (let i = 0; i < 3; i++) { const u = (t * 0.5 + i / 3) % 1; ctx.fillStyle = `rgba(63,208,192,${1 - u})`; circ(ctx, -60 + i * 60, -480 - u * 150, 12, `rgba(63,208,192,${1 - u})`); }
  },
  // SG90 micro servo: blue body, white horn that turns to the commanded angle
  servo(ctx, t, s) {
    rr(ctx, -260, -150, 520, 300, 20, '#2c63c8', '#1c4a96'); rr(ctx, -330, -40, 660, 60, 10, '#2c63c8', '#1c4a96');
    circ(ctx, -330 + 30, -10, 12, '#0b0b0b'); circ(ctx, 330 - 30, -10, 12, '#0b0b0b');
    label(ctx, 'SG90', 60, 70, 34, '#e8eef5'); circ(ctx, -130, -150, 70, '#2c63c8', '#1c4a96');
    const ang = (s.angle ?? Math.sin(t * 1.5) * 70) * Math.PI / 180;
    ctx.save(); ctx.translate(-130, -150); ctx.rotate(ang); rr(ctx, -30, -230, 60, 260, 30, '#f2f2f2', '#bbb'); for (let i = 0; i < 5; i++) circ(ctx, 0, -200 + i * 40, 7, '#999'); ctx.restore();
    circ(ctx, -130, -150, 22, '#d9d9d9', '#999');
    ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 10; for (const [dx, c] of [[-20, '#5a3a1a'], [0, '#d33'], [20, '#f0a020']]) { ctx.strokeStyle = c; ctx.beginPath(); ctx.moveTo(260, 60 + dx * 0.2); ctx.bezierCurveTo(360, 80 + dx, 380, 200 + dx, 300, 260 + dx); ctx.stroke(); }
  },
  // 1-channel relay module: blue SRD-05VDC cube, green screw terminals, LED, 3 pins
  relay(ctx, t, s) {
    pcb(ctx, 700, 420, PCB_BLUE, PCB_BLUE_D);
    rr(ctx, -160, -150, 320, 260, 12, '#2f6fd6', '#1c4a96'); label(ctx, 'SRD-05VDC', 0, -40, 24); label(ctx, '10A 250VAC', 0, 0, 20);
    for (let i = 0; i < 3; i++) { rr(ctx, 210, -140 + i * 95, 110, 85, 6, '#1f8a3e', '#135c29'); circ(ctx, 265, -98 + i * 95, 24, METAL, METAL_D); }
    const on = s.action === 'on' || (s.action !== 'off' && Math.sin(t * 2) > 0);
    smdLed(ctx, -240, -120, on); label(ctx, on ? 'CLICK!' : '', -240, -160, 22, HOT);
    pins(ctx, ['VCC', 'GND', 'IN'], -300, 150, 50);
  },
  // capacitive soil moisture probe
  soil(ctx, t, s) {
    rr(ctx, -110, -480, 220, 900, 30, PCB_BLACK, '#333');
    ctx.fillStyle = '#c9a54a'; ctx.fillRect(-60, -300, 120, 600);
    label(ctx, 'SOIL', 0, -380, 24); label(ctx, 'MOISTURE', 0, -350, 20);
    chip(ctx, 0, -430, 90, 50, '555', 4);
    if (s.action !== 'off') { const w = 0.5 + 0.5 * Math.sin(t * 1.5); ctx.fillStyle = `rgba(63,140,255,${0.25 + 0.3 * w})`; ctx.fillRect(-160, 100, 320, 330); }
  },
  // MQ-2 gas sensor: metal mesh can on a blue board
  mq(ctx, t, s) {
    pcb(ctx, 480, 380, PCB_BLUE, PCB_BLUE_D, false);
    circ(ctx, 0, -250, 170, METAL, METAL_D, 6); circ(ctx, 0, -250, 140, '#9aa1a9');
    ctx.strokeStyle = '#6b7178'; ctx.lineWidth = 2; for (let k = -140; k <= 140; k += 14) { ctx.beginPath(); ctx.moveTo(k, -390); ctx.lineTo(k, -110); ctx.moveTo(-140, -250 + k); ctx.lineTo(140, -250 + k); ctx.stroke(); }
    label(ctx, 'MQ-2', 0, 20, 30); pins(ctx, ['VCC', 'GND', 'DO', 'AO'], -69, 170);
    if (s.action !== 'off') for (let i = 0; i < 6; i++) { const u = (t * 0.4 + i / 6) % 1; circ(ctx, -120 + i * 48, -430 - u * 200, 16 + u * 10, `rgba(160,160,170,${0.5 * (1 - u)})`); }
  },
  // the Arduino Uno, from arduino.ts (mm units)
  uno(ctx, t, s) {
    const k = 820 / BOARD_W;
    ctx.save(); ctx.scale(k, k); ctx.translate(-BOARD_W / 2, -BOARD_H / 2);
    drawUno(ctx, { l: Math.sin(t * 4) > 0 ? 1 : 0.1, tx: Math.sin(t * 9) > 0.6 ? 1 : 0, rx: Math.sin(t * 7) > 0.6 ? 1 : 0, on: 1, cable: s.action === 'usb' ? 1 : 0, build: 1 });
    ctx.restore();
  },
  // a phone's lithium-ion pouch cell with its protection board
  cell(ctx, t, s) {
    const g = ctx.createLinearGradient(-300, -420, 300, 420); g.addColorStop(0, '#d6dbe0'); g.addColorStop(0.5, '#aab1b8'); g.addColorStop(1, '#d6dbe0');
    rr(ctx, -260, -400, 520, 780, 26, g, '#868d94');
    rr(ctx, -230, -470, 460, 90, 10, PCB_GREEN, PCB_GREEN_D); chip(ctx, -80, -425, 110, 50, 'PROT', 3); circ(ctx, 120, -425, 22, GOLD); circ(ctx, 180, -425, 22, GOLD);
    label(ctx, 'Li-ion  3.85V', 0, -100, 36, '#3a3f45'); label(ctx, '4500 mAh', 0, -50, 30, '#3a3f45');
    const lvl = Math.max(0, Math.min(1, (s.level ?? 80) / 100));
    rr(ctx, -200, 40, 400, 60, 12, '#2a2f35'); rr(ctx, -194, 46, 388 * lvl, 48, 9, lvl > 0.5 ? '#5be38d' : lvl > 0.2 ? '#ffc23d' : '#ff5a5f');
  },
};

export function drawModule(ctx, name, t, s = {}) {
  (MODULES[name] || MODULES.hcsr04)(ctx, t, s);
  if (s.highlight) glowRing(ctx, s.highlight[0] || 0, s.highlight[1] || 0, s.highlight[2] || 90, t);
}
export const MODULE_NAMES = Object.keys(MODULES);

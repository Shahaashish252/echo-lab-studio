// An Arduino Uno R3, drawn from its real layout (units: mm, board 68.6 x 53.3, origin top left,
// USB-B and barrel jack on the left edge). Used by "board" scenes to point at parts as they're named,
// plug in a USB cable, and blink the pin 13 LED.
import { clamp } from '../../engine/ease';
import type { Ctx } from '../../kit';

export const BOARD_W = 68.6;
export const BOARD_H = 53.3;

const TEAL = '#005d66';
const TEAL_DARK = '#003f46';
const SILK = '#bcd6d4';
const HEADER = '#1c1c1c';
const METAL = '#7f858d';
const GOLD = '#d8b25a';

export interface Part {
  label: string;
  /** what it does, one short line */
  note: string;
  /** bounding box, mm */
  x: number;
  y: number;
  w: number;
  h: number;
}

const PITCH = 2.54;
const D_LEFT = 17.9; // first pin of the 10-pin digital header (SCL)
const D_RIGHT = 44.5; // pin 7
const P_LEFT = 27.9; // power header (NC .. Vin)
const A_LEFT = 50.8; // A0

export const PARTS: Record<string, Part> = {
  usb: { label: 'USB PORT', note: 'uploads code + 5V power', x: -6.3, y: 9.4, w: 16.3, h: 12.0 },
  power: { label: 'POWER JACK', note: '7-12V from a battery or adapter', x: -1.9, y: 40.4, w: 14.0, h: 9.0 },
  chip: { label: 'ATMEGA328P', note: 'the brain: runs your code', x: 30.0, y: 33.6, w: 35.6, h: 7.6 },
  digital: { label: 'DIGITAL PINS 0-13', note: 'on / off: LEDs, buttons, motors', x: D_LEFT - 1.3, y: 0.6, w: 48.4, h: 2.9 },
  analog: { label: 'ANALOG PINS A0-A5', note: 'read sensors: 0 to 1023', x: A_LEFT - 1.3, y: 49.9, w: 15.2, h: 2.9 },
  powerpins: { label: 'POWER PINS', note: '5V, 3.3V and GND for parts', x: P_LEFT - 1.3, y: 49.9, w: 20.3, h: 2.9 },
  reset: { label: 'RESET BUTTON', note: 'restarts your program', x: 1.4, y: 1.3, w: 6.0, h: 6.0 },
  led: { label: 'BUILT-IN LED "L"', note: 'wired to pin 13', x: 23.3, y: 7.9, w: 3.4, h: 2.0 },
  txrx: { label: 'TX / RX LEDS', note: 'flash while data moves over USB', x: 23.3, y: 12.0, w: 3.4, h: 4.6 },
  crystal: { label: '16 MHZ CRYSTAL', note: 'the clock: 16 million ticks a second', x: 18.5, y: 25.2, w: 8.8, h: 3.4 },
  regulator: { label: 'VOLTAGE REGULATOR', note: 'turns the jack input into steady 5V', x: 7.4, y: 31.5, w: 6.6, h: 5.4 },
  usbchip: { label: 'ATMEGA16U2', note: 'talks USB to your computer', x: 13.4, y: 11.0, w: 5.6, h: 5.6 },
  icsp: { label: 'ICSP HEADER', note: 'program the chip directly', x: 62.0, y: 23.4, w: 5.3, h: 7.8 },
};

export const PART_IDS = Object.keys(PARTS);

export const center = (id: string): [number, number] => {
  const p = PARTS[id];
  return [p.x + p.w / 2, p.y + p.h / 2];
};

export interface UnoState {
  /** pin 13 LED brightness 0..1 */
  l: number;
  tx: number;
  rx: number;
  on: number;
  /** 0..1 how far the USB cable is plugged in (0 = not drawn) */
  cable: number;
  /** 0..1 how much of the board has assembled (parts pop in) */
  build: number;
}

const r = (ctx: Ctx, x: number, y: number, w: number, h: number, rad: number, fill: string) => {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, rad);
  ctx.fill();
};

const text = (ctx: Ctx, s: string, x: number, y: number, size: number, align: CanvasTextAlign = 'center', weight = 700) => {
  ctx.font = `${weight} ${size}px Archivo, "Segoe UI", sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = SILK;
  ctx.fillText(s, x, y);
};

function led(ctx: Ctx, x: number, y: number, color: string, glow: number) {
  r(ctx, x, y, 1.6, 0.9, 0.15, '#a8a397');
  if (glow <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = clamp(glow);
  const g = ctx.createRadialGradient(x + 0.8, y + 0.45, 0, x + 0.8, y + 0.45, 5);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - 5, y - 5, 11, 11);
  r(ctx, x, y, 1.6, 0.9, 0.15, color);
  ctx.restore();
}

/** A row of female header pins starting at x (first pin centre), labels above or below. */
function header(ctx: Ctx, x0: number, y: number, labels: string[], above: boolean) {
  const n = labels.length;
  r(ctx, x0 - 1.27, y - 1.27, n * PITCH, 2.54, 0.2, HEADER);
  for (let i = 0; i < n; i++) {
    const x = x0 + i * PITCH;
    r(ctx, x - 0.45, y - 0.45, 0.9, 0.9, 0.05, '#050505');
    text(ctx, labels[i], x, above ? y + 2.6 : y - 2.6, labels[i].length > 3 ? 0.75 : 0.95);
  }
}

/** Draws the board in mm units (caller scales and positions it). */
export function drawUno(ctx: Ctx, s: UnoState) {
  const pop = (k: number) => clamp((s.build - k * 0.06) / 0.25);
  // USB cable, behind the board
  if (s.cable > 0) {
    const plug = -6.3 - (1 - s.cable) * 40;
    ctx.fillStyle = '#2b2b2b';
    ctx.fillRect(plug - 60, 12.6, 50, 5.6);
    r(ctx, plug - 12, 10.4, 12.5, 10, 1.2, '#3a3a3a');
    r(ctx, plug - 2, 10.9, 4, 9, 0.6, '#555');
  }

  // board: teal PCB with the Uno's clipped right edge, shadow first
  const outline = (dx: number, dy: number) => {
    ctx.beginPath();
    ctx.moveTo(1.5 + dx, dy);
    ctx.lineTo(66.0 + dx, dy);
    ctx.lineTo(68.6 + dx, 2.6 + dy);
    ctx.lineTo(68.6 + dx, 37.9 + dy);
    ctx.lineTo(66.0 + dx, 40.5 + dy);
    ctx.lineTo(66.0 + dx, BOARD_H + dy);
    ctx.lineTo(1.5 + dx, BOARD_H + dy);
    ctx.arcTo(dx, BOARD_H + dy, dx, BOARD_H - 1.5 + dy, 1.5);
    ctx.lineTo(dx, 1.5 + dy);
    ctx.arcTo(dx, dy, 1.5 + dx, dy, 1.5);
    ctx.closePath();
  };
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  outline(1.2, 1.6);
  ctx.fill();
  const g = ctx.createLinearGradient(0, 0, BOARD_W, BOARD_H);
  g.addColorStop(0, '#00707a');
  g.addColorStop(1, TEAL);
  ctx.fillStyle = g;
  outline(0, 0);
  ctx.fill();
  ctx.strokeStyle = TEAL_DARK;
  ctx.lineWidth = 0.35;
  ctx.stroke();

  // faint traces
  ctx.save();
  ctx.strokeStyle = 'rgba(0,70,78,0.55)';
  ctx.lineWidth = 0.25;
  for (const [ax, ay, bx, by] of [
    [20, 4, 20, 22], [28, 4, 34, 30], [36, 4, 40, 33], [48, 4, 52, 33], [56, 4, 58, 33], [62, 4, 64, 22],
    [33, 41.5, 33, 48], [40, 41.5, 40, 48], [53, 41.5, 53, 48], [58, 41.5, 60, 48], [12, 25, 28, 25], [12, 38, 26, 47],
  ])
    ctx.beginPath(), ctx.moveTo(ax, ay), ctx.lineTo(ax, (ay + by) / 2), ctx.lineTo(bx, by), ctx.stroke();
  ctx.restore();

  // mounting holes
  for (const [x, y] of [[14.0, 2.5], [15.3, 50.7], [66.0, 7.6], [66.0, 35.5]]) {
    ctx.fillStyle = METAL;
    ctx.beginPath();
    ctx.arc(x, y, 1.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#14110e';
    ctx.beginPath();
    ctx.arc(x, y, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  const at = (k: number, draw: () => void) => {
    const a = pop(k);
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha *= a;
    draw();
    ctx.restore();
  };

  // USB-B socket
  at(0, () => {
    r(ctx, -6.3, 9.4, 16.3, 12.0, 0.4, METAL);
    r(ctx, -6.3, 10.6, 3.2, 9.6, 0.3, '#646a72');
    r(ctx, -5.8, 12.3, 2.4, 6.2, 0.3, '#2a2a2a');
  });
  // barrel jack
  at(1, () => {
    r(ctx, -1.9, 40.4, 14.0, 9.0, 0.6, '#151515');
    ctx.fillStyle = '#050505';
    ctx.beginPath();
    ctx.arc(0.2, 44.9, 2.6, 0, Math.PI * 2);
    ctx.fill();
  });
  // reset button
  at(2, () => {
    r(ctx, 1.4, 1.3, 6.0, 6.0, 0.5, METAL);
    ctx.fillStyle = '#7d1d1d';
    ctx.beginPath();
    ctx.arc(4.4, 4.3, 1.8, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, 'RESET', 4.4, 8.6, 0.9);
  });
  // ATmega16U2 (USB chip), rotated square
  at(3, () => {
    ctx.save();
    ctx.translate(16.2, 13.8);
    ctx.rotate(Math.PI / 4);
    r(ctx, -2.4, -2.4, 4.8, 4.8, 0.3, '#202020');
    ctx.restore();
  });
  // 16 MHz crystal and regulator
  at(4, () => {
    r(ctx, 18.5, 25.2, 8.8, 3.4, 1.7, METAL);
    text(ctx, '16.000', 22.9, 26.9, 1.1, 'center', 800);
    r(ctx, 7.4, 31.5, 6.6, 5.4, 0.3, '#1e1e1e');
    r(ctx, 8.2, 30.2, 5.0, 1.6, 0.2, METAL);
  });
  // electrolytic capacitors
  at(5, () => {
    for (const [x, y] of [[17.4, 41.2], [23.0, 41.2]]) {
      ctx.fillStyle = '#80868d';
      ctx.beginPath();
      ctx.arc(x, y, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#555b62';
      ctx.lineWidth = 0.3;
      ctx.beginPath();
      ctx.moveTo(x - 1.6, y);
      ctx.lineTo(x + 1.6, y);
      ctx.moveTo(x, y - 1.6);
      ctx.lineTo(x, y + 1.6);
      ctx.stroke();
    }
  });
  // headers
  at(6, () => {
    header(ctx, D_LEFT, 2.05, ['SCL', 'SDA', 'AREF', 'GND', '13', '12', '~11', '~10', '~9', '8'], true);
    header(ctx, D_RIGHT, 2.05, ['7', '~6', '~5', '4', '~3', '2', 'TX1', 'RX0'], true);
    text(ctx, 'DIGITAL (PWM~)', 44, 7.7, 1.25, 'center', 800);
  });
  at(7, () => {
    header(ctx, P_LEFT, 51.25, ['', 'IOREF', 'RESET', '3.3V', '5V', 'GND', 'GND', 'Vin'], false);
    header(ctx, A_LEFT, 51.25, ['A0', 'A1', 'A2', 'A3', 'A4', 'A5'], false);
    text(ctx, 'POWER', 37.5, 45.6, 1.2, 'center', 800);
    text(ctx, 'ANALOG IN', 57.2, 45.6, 1.2, 'center', 800);
  });
  // ICSP
  at(8, () => {
    r(ctx, 62.0, 23.4, 5.3, 7.8, 0.3, HEADER);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) r(ctx, 63.0 + i * 2.54 - 0.45, 24.6 + j * 2.54 - 0.45, 0.9, 0.9, 0.1, GOLD);
    text(ctx, 'ICSP', 64.6, 32.5, 1.0);
  });
  // ATmega328P DIP-28
  at(9, () => {
    r(ctx, 30.0, 33.6, 35.6, 7.6, 0.4, '#1a1a1a');
    for (let i = 0; i < 14; i++) {
      r(ctx, 31.4 + i * PITCH - 0.4, 32.7, 0.8, 1.0, 0.1, METAL);
      r(ctx, 31.4 + i * PITCH - 0.4, 41.1, 0.8, 1.0, 0.1, METAL);
    }
    ctx.fillStyle = '#0d0d0d';
    ctx.beginPath();
    ctx.arc(30.0, 37.4, 1.0, -Math.PI / 2, Math.PI / 2);
    ctx.fill();
    ctx.font = '700 1.5px "IBM Plex Mono", Consolas, monospace';
    ctx.fillStyle = '#9a9a9a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ATMEGA328P-PU', 47.8, 36.4);
    ctx.font = '500 1.1px "IBM Plex Mono", Consolas, monospace';
    ctx.fillText('ATMEL  1842', 47.8, 38.6);
  });
  // LEDs and branding
  at(10, () => {
    led(ctx, 23.3, 7.9 + 0.55, '#ffb347', s.l);
    text(ctx, 'L', 28.0, 9.0, 1.2, 'left');
    led(ctx, 23.3, 12.0 + 0.3, '#ffb347', s.tx);
    text(ctx, 'TX', 28.0, 12.75, 1.1, 'left');
    led(ctx, 23.3, 14.9 + 0.3, '#ffb347', s.rx);
    text(ctx, 'RX', 28.0, 15.65, 1.1, 'left');
    led(ctx, 58.5, 12.4, '#7dff6a', s.on);
    text(ctx, 'ON', 61.0, 12.85, 1.1, 'left');
    text(ctx, 'UNO', 44.5, 21.5, 6.2, 'center', 900);
    ctx.save();
    ctx.strokeStyle = SILK;
    ctx.lineWidth = 0.55;
    // the infinity logo with its minus and plus
    for (const x of [34.5, 39.3]) {
      ctx.beginPath();
      ctx.arc(x, 16.0, 2.2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(33.6, 16.0);
    ctx.lineTo(35.4, 16.0);
    ctx.moveTo(38.4, 16.0);
    ctx.lineTo(40.2, 16.0);
    ctx.moveTo(39.3, 15.1);
    ctx.lineTo(39.3, 16.9);
    ctx.stroke();
    ctx.restore();
    text(ctx, 'ARDUINO', 52.0, 16.0, 2.4, 'center', 900);
  });
}

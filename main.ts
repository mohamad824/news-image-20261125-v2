// news-image-20261125 v2 — full-day edition.
// Node 22+ standard library only. Reads atlas.png + metrics.json beside
// itself, writes one 1024x1024 PNG to /output/entry.png. No network, no
// clock, no randomness, no eval. All text is measured and wrapped before
// drawing; nothing may overflow or overlap.
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as zlib from "node:zlib";

const HERE: string = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH: string = "/output/entry.png";
const W: number = 1024;
const H: number = 1024;

// ---------------------------------------------------------------- PNG codec
const CRC_TABLE: number[] = ((): number[] => {
  const t: number[] = new Array<number>(256);
  for (let n = 0; n < 256; n++) {
    let c: number = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c: number = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const len: Buffer = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td: Buffer = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc: Buffer = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function encodePng(rgb: Uint8Array, w: number, h: number): Buffer {
  const ihdr: Buffer = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = RGB
  const raw: Buffer = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0;
    raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (1 + w * 3) + 1);
  }
  const idat: Buffer = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
interface DecodedPng { w: number; h: number; rgba: Uint8Array }
function decodePng(buf: Buffer): DecodedPng {
  let off: number = 8;
  let w: number = 0;
  let h: number = 0;
  let bitDepth: number = 0;
  let colourType: number = 0;
  const idats: Buffer[] = [];
  while (off < buf.length) {
    const len: number = buf.readUInt32BE(off);
    const type: string = buf.toString("ascii", off + 4, off + 8);
    const data: Buffer = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      bitDepth = data[8];
      colourType = data[9];
    } else if (type === "IDAT") {
      idats.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
    off += 12 + len;
  }
  if (bitDepth !== 8) throw new Error("unsupported atlas bit depth " + bitDepth);
  const channels: number = colourType === 6 ? 4 : colourType === 2 ? 3 : colourType === 0 ? 1 : 0;
  if (channels === 0) throw new Error("unsupported atlas colour type " + colourType);
  const raw: Buffer = zlib.inflateSync(Buffer.concat(idats));
  const stride: number = w * channels;
  const rgba: Uint8Array = new Uint8Array(w * h * 4);
  let prev: Buffer = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f: number = raw[y * (stride + 1)];
    const line: Buffer = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur: Buffer = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a: number = i >= channels ? cur[i - channels] : 0;
      const b: number = prev[i];
      const c: number = i >= channels ? prev[i - channels] : 0;
      let v: number = line[i];
      if (f === 1) v = (v + a) & 0xff;
      else if (f === 2) v = (v + b) & 0xff;
      else if (f === 3) v = (v + ((a + b) >> 1)) & 0xff;
      else if (f === 4) {
        const p: number = a + b - c;
        const pa: number = Math.abs(p - a);
        const pb: number = Math.abs(p - b);
        const pc: number = Math.abs(p - c);
        const pr: number = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        v = (v + pr) & 0xff;
      }
      cur[i] = v;
    }
    for (let x = 0; x < w; x++) {
      const si: number = x * channels;
      const di: number = (y * w + x) * 4;
      if (channels === 4) {
        rgba[di] = cur[si]; rgba[di + 1] = cur[si + 1]; rgba[di + 2] = cur[si + 2]; rgba[di + 3] = cur[si + 3];
      } else if (channels === 3) {
        rgba[di] = cur[si]; rgba[di + 1] = cur[si + 1]; rgba[di + 2] = cur[si + 2]; rgba[di + 3] = 255;
      } else {
        rgba[di] = cur[si]; rgba[di + 1] = cur[si]; rgba[di + 2] = cur[si]; rgba[di + 3] = 255;
      }
    }
    prev = cur;
  }
  return { w, h, rgba };
}

// ------------------------------------------------------------------ colours
type RGB = [number, number, number];
const CREAM: RGB = [247, 241, 222];
const INK: RGB = [20, 20, 20];
const RED: RGB = [179, 38, 30];
const DARKRED: RGB = [163, 31, 24];
const NAVY: RGB = [28, 47, 87];
const NAVYBG: RGB = [23, 35, 61];
const GOLD: RGB = [217, 164, 65];
const WHITE: RGB = [255, 255, 255];
const GREY: RGB = [120, 110, 95];

// ------------------------------------------------------------------- canvas
class Canvas {
  w: number;
  h: number;
  px: Uint8Array;
  constructor(w: number, h: number, bg: RGB) {
    this.w = w;
    this.h = h;
    this.px = new Uint8Array(w * h * 3);
    for (let i = 0; i < w * h; i++) {
      this.px[i * 3] = bg[0]; this.px[i * 3 + 1] = bg[1]; this.px[i * 3 + 2] = bg[2];
    }
  }
  set(x: number, y: number, c: RGB): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i: number = (y * this.w + x) * 3;
    this.px[i] = c[0]; this.px[i + 1] = c[1]; this.px[i + 2] = c[2];
  }
  blend(x: number, y: number, c: RGB, a: number): void {
    if (a <= 0) return;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i: number = (y * this.w + x) * 3;
    const inv: number = 255 - a;
    this.px[i] = (c[0] * a + this.px[i] * inv) / 255 | 0;
    this.px[i + 1] = (c[1] * a + this.px[i + 1] * inv) / 255 | 0;
    this.px[i + 2] = (c[2] * a + this.px[i + 2] * inv) / 255 | 0;
  }
  rect(x: number, y: number, w: number, h: number, c: RGB): void {
    const x0: number = Math.max(0, Math.round(x));
    const y0: number = Math.max(0, Math.round(y));
    const x1: number = Math.min(this.w, Math.round(x + w));
    const y1: number = Math.min(this.h, Math.round(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) this.set(xx, yy, c);
    }
  }
  hline(x: number, y: number, w: number, c: RGB, t: number = 1): void {
    this.rect(x, y, w, t, c);
  }
  vline(x: number, y: number, h: number, c: RGB, t: number = 1): void {
    this.rect(x, y, t, h, c);
  }
  // Bresenham line, thickness 1 (or t for a square brush)
  line(x0: number, y0: number, x1: number, y1: number, c: RGB, t: number = 1): void {
    const dx: number = Math.abs(x1 - x0);
    const dy: number = Math.abs(y1 - y0);
    const sx: number = x0 < x1 ? 1 : -1;
    const sy: number = y0 < y1 ? 1 : -1;
    let err: number = dx - dy;
    let x: number = x0;
    let y: number = y0;
    for (;;) {
      this.rect(x - ((t - 1) >> 1), y - ((t - 1) >> 1), t, t, c);
      if (x === x1 && y === y1) break;
      const e2: number = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  }
  circle(cx: number, cy: number, r: number, c: RGB): void {
    const rr: number = Math.round(r);
    for (let y = -rr; y <= rr; y++) {
      const dx: number = Math.floor(Math.sqrt(rr * rr - y * y));
      for (let x = -dx; x <= dx; x++) this.set(cx + x, cy + y, c);
    }
  }
  ring(cx: number, cy: number, r: number, c: RGB, t: number = 2): void {
    const rr: number = Math.round(r);
    for (let a = 0; a < 360; a++) {
      const rad: number = (a * Math.PI) / 180;
      for (let k = 0; k < t; k++) {
        this.set(Math.round(cx + (rr - k) * Math.cos(rad)), Math.round(cy + (rr - k) * Math.sin(rad)), c);
      }
    }
  }
  // Scanline polygon fill.
  poly(points: Array<[number, number]>, c: RGB): void {
    let minY: number = 1e9;
    let maxY: number = -1e9;
    for (const p of points) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
      const xs: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const a: [number, number] = points[i];
        const b: [number, number] = points[(i + 1) % points.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
          xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.ceil(xs[k]); x <= Math.floor(xs[k + 1]); x++) this.set(x, y, c);
      }
    }
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
    for (let y = -Math.round(ry); y <= Math.round(ry); y++) {
      const dx: number = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
      for (let x = -dx; x <= dx; x++) this.set(cx + x, cy + y, c);
    }
  }
}

// ---------------------------------------------------------------- text engine
interface Glyph { x: number; y: number; w: number; h: number; ox: number; oy: number; ax: number }
interface Style { size: number; chars: Record<string, Glyph> }
interface Metrics { styles: Record<string, Style> }

const metrics: Metrics = JSON.parse(fs.readFileSync(path.join(HERE, "metrics.json"), "utf8"));
const atlas: DecodedPng = decodePng(fs.readFileSync(path.join(HERE, "atlas.png")));

function measure(style: string, text: string): number {
  const st: Style = metrics.styles[style];
  let w: number = 0;
  for (const ch of text) {
    const g: Glyph | undefined = st.chars[ch];
    if (g) w += g.ax;
  }
  return w;
}
function drawText(cv: Canvas, style: string, x: number, baselineY: number, text: string, color: RGB): void {
  const st: Style = metrics.styles[style];
  let pen: number = x;
  const by: number = Math.round(baselineY);
  for (const ch of text) {
    const g: Glyph | undefined = st.chars[ch];
    if (!g) { pen += 4; continue; }
    if (g.w > 0 && g.h > 0) {
      const gx: number = Math.round(pen + g.ox);
      const gy: number = Math.round(by + g.oy);
      for (let yy = 0; yy < g.h; yy++) {
        for (let xx = 0; xx < g.w; xx++) {
          const a: number = atlas.rgba[((g.y + yy) * atlas.w + (g.x + xx)) * 4 + 3];
          if (a > 0) cv.blend(gx + xx, gy + yy, color, a);
        }
      }
    }
    pen += g.ax;
  }
}
// Greedy word wrap; returns lines that each fit maxW. Words longer than
// maxW are hard-split by characters.
function wrap(style: string, text: string, maxW: number): string[] {
  const words: string[] = text.split(" ");
  const lines: string[] = [];
  let cur: string = "";
  const push = (s: string): void => { if (s.length > 0) lines.push(s); };
  for (const word of words) {
    const trial: string = cur.length === 0 ? word : cur + " " + word;
    if (measure(style, trial) <= maxW) {
      cur = trial;
    } else {
      if (cur.length > 0) push(cur);
      if (measure(style, word) <= maxW) {
        cur = word;
      } else {
        // hard-split one long word
        let part: string = "";
        for (const ch of word) {
          if (measure(style, part + ch) > maxW && part.length > 0) { push(part); part = ch; }
          else part += ch;
        }
        cur = part;
      }
    }
  }
  push(cur);
  return lines.length === 0 ? [""] : lines;
}
function drawWrapped(cv: Canvas, style: string, x: number, firstBaseline: number, leading: number, text: string, maxW: number, color: RGB): number {
  const lines: string[] = wrap(style, text, maxW);
  for (let i = 0; i < lines.length; i++) drawText(cv, style, x, firstBaseline + i * leading, lines[i], color);
  return lines.length;
}
// Centre a string on cx; shrink by trying smaller styles from the list.
function drawCentred(cv: Canvas, styles: string[], cx: number, baselineY: number, text: string, maxW: number, color: RGB): string {
  for (const s of styles) {
    if (measure(s, text) <= maxW) {
      drawText(cv, s, cx - measure(s, text) / 2, baselineY, text, color);
      return s;
    }
  }
  const s: string = styles[styles.length - 1];
  drawText(cv, s, cx - measure(s, text) / 2, baselineY, text, color);
  return s;
}

// -------------------------------------------------------------------- content
const TOP_LEFT: string = "THE WORLD IN ONE DAY — FULL-DAY EDITION";
const TOP_RIGHT: string = "36 STORIES · 7 REGIONS · WEDNESDAY 25 NOVEMBER 2026";
const MASTHEAD: string = "Wednesday 25 November 2026";
const SUBDECK: string = "Tariffs proposed for 14 economies — US economy roars — Shenzhou-24 docks with first foreign astronaut";

const STATS: Array<[string, string]> = [
  ["−6.16%", "KOSPI, WEDNESDAY CLOSE"],
  ["4.3%", "US Q3 GDP, ANNUALISED"],
  ["3.3%", "CORE PCE INFLATION, OCTOBER"],
  ["$132.3bn", "DELL AI SERVER BACKLOG"],
  ["50+", "HOSTAGES FREED, CARTAGENA"],
  ["570,000", "AIDS DEATHS IN 2025"],
];

interface TlItem { label: string; text: string }
const TIMELINE: TlItem[] = [
  { label: "OVERNIGHT", text: "Russia hits Ukraine's energy grid; power cut in five regions" },
  { label: "00:18 UTC", text: "Shenzhou-24 launches from Jiuquan" },
  { label: "03:56 UTC", text: "Shenzhou-24 docks with Tiangong" },
  { label: "EARLY WED", text: "Cartagena hostages freed after ~17-hour siege" },
  { label: "MORNING", text: "Asia stocks tumble; Kospi closes −6.16%" },
  { label: "13:30 UTC", text: "US GDP 4.3%, core PCE 3.3% — hot inflation" },
  { label: "21:00 UTC", text: "Wall Street closes; Nasdaq −0.62%, Dow +0.33%" },
];

interface Lead { n: number; kicker: string; headline: string; body: string; source: string; chip: string }
const LEADS: Lead[] = [
  {
    n: 1, kicker: "WASHINGTON — TRADE", chip: "CONFIRMED",
    headline: "Tariffs proposed for 14 economies as markets rout",
    body: "The US formally proposes Section 301 duties on 14 economies after an eight-month probe into excess capacity. China faces 20% atop ~25% first-term duties; the EU, Japan, South Korea and Taiwan are capped at 15%. Mexico and Norway are spared.",
    source: "Reuters · Invezz",
  },
  {
    n: 2, kicker: "WASHINGTON — ECONOMY", chip: "CONFIRMED",
    headline: "US economy roars as inflation runs hot",
    body: "Q3 GDP is revised up to 4.3% annualised, the fastest growth in three years. October PCE rises 0.3% on the month, 3.8% on the year; core PCE hits 3.3%, the hottest since November 2023. Markets now expect Fed rate rises in December and early 2027.",
    source: "Reuters · BEA",
  },
  {
    n: 3, kicker: "CHINA — SPACE", chip: "CONFIRMED",
    headline: "Shenzhou-24 docks with first foreign astronaut",
    body: "Launched at 00:18 UTC, Shenzhou-24 docks with Tiangong at 03:56 UTC and its crew enters the station. Pakistani pilot Muhammad Zeeshan Ali, 40, is the first Pakistani in orbit and the first foreign astronaut aboard Tiangong; he stays about a week.",
    source: "Xinhua · CMSA",
  },
];

interface Card { n: number; kicker: string; headline: string; body: string }
const CARDS: Card[] = [
  { n: 4, kicker: "SEOUL / TOKYO — MARKETS", headline: "Asia markets rout", body: "Kospi −6.16% to 4,697.51; Taiex −4.80%, Nikkei −2.78%. Samsung −9.1%." },
  { n: 5, kicker: "NEW YORK — MARKETS", headline: "Wall Street pares a plunge", body: "Nasdaq plunges 4.6% intraday, recovers to −0.62% at 23,585.80; Dow +0.33%." },
  { n: 6, kicker: "KYIV / ODESA — WAR", headline: "Russia hits Ukraine's energy grid", body: "Overnight attack cuts power in five regions; a plant halts, a gas site burns." },
  { n: 7, kicker: "CARTAGENA — CRIME", headline: "Cartagena hostages freed", body: "Forces storm the supermarket and free all hostages after a ~17-hour siege." },
  { n: 8, kicker: "ROUND ROCK — TECH", headline: "Dell beats, shares fall", body: "Revenue $54.9bn, up 103%; AI backlog a record $132.3bn. Shares still fall ~7%." },
  { n: 9, kicker: "GAZA CITY — WAR", headline: "Hamas security chief killed", body: "Strike kills Hamas security chief Mohammad Abuelouf, his wife and two children." },
  { n: 10, kicker: "BLUE NILE — WAR", headline: "Sudan drone strikes kill 19", body: "RSF drone strikes kill 19 and wound 20 in two Blue Nile cities on Tuesday." },
  { n: 11, kicker: "KOSHI — DISASTER", headline: "Nepal quake 5.6", body: "Magnitude 5.6 quake hits Koshi province near the Tibet border, 07:17 local." },
  { n: 12, kicker: "HORMUZ — SECURITY", headline: "Two tankers hit mines in Hormuz", body: "Two oil tankers hit naval mines and catch fire in the Strait of Hormuz." },
  { n: 13, kicker: "REDMOND — TECH", headline: "Microsoft 'Code Red'", body: "Microsoft declares 'Code Red' after a historic outage; Outlook was down ~24 hours." },
];

const WIRES_LEFT: string[] = [
  "14. Chicago: O'Hare radar outage delays flights (FAA).",
  "15. Canberra: Australian inflation jumps to 4.9%, raising odds of a rate rise.",
  "16. Moscow: Russia calls Ukrainian ship strikes “terrorism”; Zelenskiy confirmed the Sparta II hit.",
  "17. Texas: Fort Hood shooter Hasan seeks stay of execution; survivors denied attendance.",
  "18. Gaza: death toll reaches 74,746 (WAFA).",
  "19. Rome: 266 million face acute food insecurity (WFP).",
  "20. Dhaka: garment workers win 36% wage rise.",
  "21. Kuala Lumpur: Malaysia to return 6,500+ Rohingya to Myanmar in December.",
  "22. Kinshasa: DRC Ebola team evacuated from Akwe hospital after 3 days sheltering.",
  "23. Geneva: AIDS deaths fell to 570,000 in 2025, lowest in 20+ years (UNAIDS).",
  "24. Ras Al Khaimah: bus–truck collision toll rises to 13.",
  "25. Jerusalem: Eisenkot clinches first coalition agreement to form government.",
];
const WIRES_RIGHT: string[] = [
  "26. Hormuz: Pugh swims 15 km through the Strait in three days.",
  "27. Geneva: Gukesh holds Sindarov in world chess championship.",
  "28. Mumbai: Sooryavanshi, 15, hits fastest List A 200 (204 off 53).",
  "29. Pyongyang: North Korea threatens to close Swiss office.",
  "30. Kyiv: Ukraine needs €115bn ($125bn) in 2027 — Zelenskiy.",
  "31. Dhaka: ousted PM Hasina plans return on 16 December.",
  "32. Minsk: Lukashenko offers to fly with Zelenskiy to Moscow.",
  "33. Paris: Sarkozy corruption case to trial; hearing 1 April 2027.",
  "34. Washington: Trump awards Medal of Freedom to Rudy Giuliani.",
  "35. Gulf of Mexico: plane crash; search for 6 incl. 2 children.",
  "36. Sanaa: strike on buses and trucks kills 26 in Yemen.",
];

const DATE_CHECK_BODY: string = "Cut-off ~21:30 UTC, Wednesday 25 November 2026. NOW INCLUDED: the USTR tariff proposals and the Asia selloff, the Wall Street close, Q3 GDP 4.3% and October PCE, the Shenzhou-24 launch and docking, the Nepal quake, the Cartagena rescue, Russia's energy-grid attack, Dell's $132.3bn AI backlog, the Hamas security chief killed in Gaza, the Sudan drone strikes, the Yemen strike, Microsoft's 'Code Red', the Hormuz tankers hit by mines. LEFT OUT (earlier news): the COP31 collapse (Sun 22 Nov), the ICJ Myanmar ruling (19 Nov), the Anthropic IPO debut (19 Nov), Huang's reinstatement (Mon 23 Nov), the Dymer strike (22 Nov), the Java factory fire (23 Nov), the Benghazi warship sinking (22–23 Nov), the NATO space vow (24 Nov), Russian jets near Ulleung (Tue 24 Nov), the turkey pardon ceremony (Tue 24 Nov), the US-weighs-strikes-on-Iranian-leaders report (Tue 24 Nov). Still to come after press time: the EU summit (26–27 Nov), Thanksgiving Day (Thu 26 Nov), US markets closed Thursday.";
const SOURCES_LINE: string = "Sources: Reuters, WSJ, AP, Bloomberg, The Hindu, BBC, UN News, AFP, BEA, Xinhua. Cut-off ~21:30 UTC, Wednesday 25 November 2026.";

// ------------------------------------------------------------- illustrations
// All scenes draw in relative coordinates so the same code serves the big
// lead panels and the small grid cards.
type Scene = (cv: Canvas, x: number, y: number, w: number, h: number) => void;
function rx(x: number, w: number, f: number): number { return Math.round(x + w * f); }
function ry(y: number, h: number, f: number): number { return Math.round(y + h * f); }

const SKY: RGB = [188, 211, 230];
const SEA: RGB = [42, 74, 107];
const DARKBG: RGB = [26, 35, 51];
const SAND: RGB = [224, 192, 138];

const SCENES: Record<number, Scene> = {
  1: (cv, x, y, w, h): void => { // container ship / tariffs
    cv.rect(x, y, w, Math.round(h * 0.62), SKY);
    cv.rect(x, ry(y, h, 0.62), w, h - Math.round(h * 0.62), SEA);
    cv.circle(rx(x, w, 0.85), ry(y, h, 0.18), Math.round(h * 0.10), [240, 200, 90]);
    const deckY: number = ry(y, h, 0.60);
    const cols: RGB[] = [[179, 38, 30], [46, 125, 70], [217, 164, 65], [28, 47, 87]];
    for (let i = 0; i < 4; i++) {
      cv.rect(rx(x, w, 0.08 + i * 0.20), deckY - Math.round(h * 0.26), Math.round(w * 0.17), Math.round(h * 0.26), cols[i]);
    }
    cv.poly([[rx(x, w, 0.03), deckY], [rx(x, w, 0.97), deckY], [rx(x, w, 0.90), ry(y, h, 0.86)], [rx(x, w, 0.10), ry(y, h, 0.86)]], [20, 20, 20]);
    cv.rect(rx(x, w, 0.55), deckY - Math.round(h * 0.40), Math.round(w * 0.05), Math.round(h * 0.40), [120, 120, 120]);
  },
  2: (cv, x, y, w, h): void => { // GDP bars rising
    cv.rect(x, y, w, h, [220, 232, 242]);
    const bars: number[] = [0.22, 0.34, 0.30, 0.48, 0.66];
    for (let i = 0; i < 5; i++) {
      const bh: number = Math.round(h * bars[i]);
      cv.rect(rx(x, w, 0.10 + i * 0.17), ry(y, h, 0.88) - bh, Math.round(w * 0.11), bh, NAVY);
    }
    cv.line(rx(x, w, 0.08), ry(y, h, 0.80), rx(x, w, 0.30), ry(y, h, 0.62), GOLD, 3);
    cv.line(rx(x, w, 0.30), ry(y, h, 0.62), rx(x, w, 0.55), ry(y, h, 0.66), GOLD, 3);
    cv.line(rx(x, w, 0.55), ry(y, h, 0.66), rx(x, w, 0.92), ry(y, h, 0.30), GOLD, 3);
    cv.poly([[rx(x, w, 0.92), ry(y, h, 0.30)], [rx(x, w, 0.84), ry(y, h, 0.30)], [rx(x, w, 0.88), ry(y, h, 0.40)]], GOLD);
    cv.rect(x, ry(y, h, 0.88), w, 2, [120, 120, 120]);
  },
  3: (cv, x, y, w, h): void => { // Shenzhou rocket
    cv.rect(x, y, w, h, NAVYBG);
    const stars: Array<[number, number]> = [[0.12, 0.15], [0.25, 0.08], [0.38, 0.20], [0.72, 0.10], [0.85, 0.22], [0.92, 0.08], [0.60, 0.18], [0.08, 0.35]];
    for (const s of stars) cv.circle(rx(x, w, s[0]), ry(y, h, s[1]), 2, WHITE);
    cv.rect(x, ry(y, h, 0.86), w, h - Math.round(h * 0.86), [74, 110, 74]);
    const cx: number = rx(x, w, 0.50);
    cv.poly([[cx, ry(y, h, 0.10)], [cx + Math.round(w * 0.045), ry(y, h, 0.22)], [cx - Math.round(w * 0.045), ry(y, h, 0.22)]], RED);
    cv.rect(cx - Math.round(w * 0.045), ry(y, h, 0.22), Math.round(w * 0.09), Math.round(h * 0.50), WHITE);
    cv.circle(cx, ry(y, h, 0.38), Math.round(w * 0.02), NAVY);
    cv.poly([[cx - Math.round(w * 0.045), ry(y, h, 0.72)], [cx - Math.round(w * 0.09), ry(y, h, 0.80)], [cx - Math.round(w * 0.045), ry(y, h, 0.76)]], RED);
    cv.poly([[cx + Math.round(w * 0.045), ry(y, h, 0.72)], [cx + Math.round(w * 0.09), ry(y, h, 0.80)], [cx + Math.round(w * 0.045), ry(y, h, 0.76)]], RED);
    cv.poly([[cx, ry(y, h, 0.72)], [cx - Math.round(w * 0.035), ry(y, h, 0.86)], [cx + Math.round(w * 0.035), ry(y, h, 0.86)]], [240, 140, 40]);
    cv.circle(rx(x, w, 0.82), ry(y, h, 0.30), Math.round(h * 0.09), [240, 200, 90]);
  },
  4: (cv, x, y, w, h): void => { // Asia rout: red falling line
    cv.rect(x, y, w, h, DARKBG);
    for (let i = 1; i < 4; i++) cv.hline(x, ry(y, h, i * 0.25), w, [50, 62, 84], 1);
    const pts: Array<[number, number]> = [[0.06, 0.22], [0.26, 0.30], [0.44, 0.26], [0.62, 0.48], [0.78, 0.62], [0.94, 0.82]];
    for (let i = 0; i + 1 < pts.length; i++) {
      cv.line(rx(x, w, pts[i][0]), ry(y, h, pts[i][1]), rx(x, w, pts[i + 1][0]), ry(y, h, pts[i + 1][1]), [220, 60, 50], 3);
    }
    for (const p of pts) cv.circle(rx(x, w, p[0]), ry(y, h, p[1]), 3, [240, 90, 80]);
    cv.poly([[rx(x, w, 0.94), ry(y, h, 0.82)], [rx(x, w, 0.86), ry(y, h, 0.78)], [rx(x, w, 0.90), ry(y, h, 0.88)]], [220, 60, 50]);
  },
  5: (cv, x, y, w, h): void => { // Wall Street: plunge then recovery
    cv.rect(x, y, w, h, DARKBG);
    for (let i = 1; i < 4; i++) cv.hline(x, ry(y, h, i * 0.25), w, [50, 62, 84], 1);
    const down: Array<[number, number]> = [[0.06, 0.30], [0.18, 0.42], [0.30, 0.52], [0.42, 0.74]];
    const up: Array<[number, number]> = [[0.42, 0.74], [0.58, 0.62], [0.74, 0.50], [0.94, 0.38]];
    for (let i = 0; i + 1 < down.length; i++) cv.line(rx(x, w, down[i][0]), ry(y, h, down[i][1]), rx(x, w, down[i + 1][0]), ry(y, h, down[i + 1][1]), [220, 60, 50], 3);
    for (let i = 0; i + 1 < up.length; i++) cv.line(rx(x, w, up[i][0]), ry(y, h, up[i][1]), rx(x, w, up[i + 1][0]), ry(y, h, up[i + 1][1]), [70, 180, 110], 3);
    cv.poly([[rx(x, w, 0.94), ry(y, h, 0.38)], [rx(x, w, 0.86), ry(y, h, 0.38)], [rx(x, w, 0.90), ry(y, h, 0.30)]], [70, 180, 110]);
  },
  6: (cv, x, y, w, h): void => { // Ukraine energy: plant + fire
    cv.rect(x, y, w, h, [35, 42, 58]);
    cv.circle(rx(x, w, 0.80), ry(y, h, 0.20), Math.round(h * 0.12), [240, 200, 90]);
    cv.rect(rx(x, w, 0.08), ry(y, h, 0.55), Math.round(w * 0.34), Math.round(h * 0.33), [70, 74, 82]);
    cv.rect(rx(x, w, 0.46), ry(y, h, 0.45), Math.round(w * 0.10), Math.round(h * 0.43), [70, 74, 82]);
    cv.poly([[rx(x, w, 0.60), ry(y, h, 0.88)], [rx(x, w, 0.64), ry(y, h, 0.48)], [rx(x, w, 0.76), ry(y, h, 0.48)], [rx(x, w, 0.80), ry(y, h, 0.88)]], [90, 94, 102]);
    cv.circle(rx(x, w, 0.25), ry(y, h, 0.52), Math.round(h * 0.10), [240, 120, 40]);
    cv.circle(rx(x, w, 0.30), ry(y, h, 0.44), Math.round(h * 0.07), [250, 170, 60]);
    cv.poly([[rx(x, w, 0.55), ry(y, h, 0.10)], [rx(x, w, 0.50), ry(y, h, 0.26)], [rx(x, w, 0.56), ry(y, h, 0.26)], [rx(x, w, 0.50), ry(y, h, 0.44)], [rx(x, w, 0.62), ry(y, h, 0.22)], [rx(x, w, 0.56), ry(y, h, 0.22)]], GOLD);
  },
  7: (cv, x, y, w, h): void => { // Cartagena supermarket
    cv.rect(x, y, w, h, SKY);
    cv.circle(rx(x, w, 0.86), ry(y, h, 0.16), Math.round(h * 0.10), [240, 200, 90]);
    cv.rect(rx(x, w, 0.10), ry(y, h, 0.34), Math.round(w * 0.80), Math.round(h * 0.54), [245, 240, 225]);
    cv.rect(rx(x, w, 0.10), ry(y, h, 0.34), Math.round(w * 0.80), Math.round(h * 0.10), RED);
    for (let i = 0; i < 5; i++) cv.rect(rx(x, w, 0.14 + i * 0.16), ry(y, h, 0.50), Math.round(w * 0.11), Math.round(h * 0.20), [120, 160, 200]);
    cv.rect(rx(x, w, 0.44), ry(y, h, 0.72), Math.round(w * 0.12), Math.round(h * 0.16), [60, 60, 60]);
    cv.rect(x, ry(y, h, 0.88), w, h - Math.round(h * 0.88), [140, 140, 130]);
  },
  8: (cv, x, y, w, h): void => { // Dell servers
    cv.rect(x, y, w, h, [223, 230, 238]);
    cv.rect(rx(x, w, 0.08), ry(y, h, 0.14), Math.round(w * 0.30), Math.round(h * 0.72), [30, 34, 44]);
    for (let i = 0; i < 5; i++) {
      const yy: number = ry(y, h, 0.20 + i * 0.13);
      cv.rect(rx(x, w, 0.12), yy, Math.round(w * 0.22), 3, [60, 66, 76]);
      cv.circle(rx(x, w, 0.14), yy + 1, 2, i % 2 === 0 ? [70, 200, 110] : [240, 180, 60]);
    }
    cv.rect(rx(x, w, 0.46), ry(y, h, 0.20), Math.round(w * 0.46), Math.round(h * 0.44), [40, 48, 62]);
    cv.rect(rx(x, w, 0.49), ry(y, h, 0.24), Math.round(w * 0.40), Math.round(h * 0.36), [140, 200, 235]);
    cv.line(rx(x, w, 0.50), ry(y, h, 0.55), rx(x, w, 0.62), ry(y, h, 0.42), NAVY, 2);
    cv.line(rx(x, w, 0.62), ry(y, h, 0.42), rx(x, w, 0.74), ry(y, h, 0.46), NAVY, 2);
    cv.line(rx(x, w, 0.74), ry(y, h, 0.46), rx(x, w, 0.86), ry(y, h, 0.30), NAVY, 2);
    cv.poly([[rx(x, w, 0.42), ry(y, h, 0.64)], [rx(x, w, 0.96), ry(y, h, 0.64)], [rx(x, w, 0.90), ry(y, h, 0.72)], [rx(x, w, 0.48), ry(y, h, 0.72)]], [160, 165, 175]);
  },
  9: (cv, x, y, w, h): void => { // Gaza skyline at dusk
    cv.rect(x, y, w, h, [232, 160, 106]);
    cv.circle(rx(x, w, 0.78), ry(y, h, 0.22), Math.round(h * 0.11), [250, 210, 120]);
    cv.rect(x, ry(y, h, 0.62), w, h - Math.round(h * 0.62), [52, 44, 52]);
    const tops: Array<[number, number, number]> = [[0.06, 0.30, 0.62], [0.24, 0.42, 0.50], [0.40, 0.34, 0.58], [0.58, 0.44, 0.48], [0.74, 0.36, 0.60]];
    for (const t of tops) cv.rect(rx(x, w, t[0]), ry(y, h, t[2]), Math.round(w * 0.13), Math.round(h * (0.88 - t[2])), [40, 34, 42]);
    cv.circle(rx(x, w, 0.32), ry(y, h, 0.30), Math.round(h * 0.08), [120, 120, 125]);
    cv.circle(rx(x, w, 0.36), ry(y, h, 0.22), Math.round(h * 0.06), [140, 140, 145]);
    cv.circle(rx(x, w, 0.30), ry(y, h, 0.14), Math.round(h * 0.05), [150, 150, 155]);
  },
  10: (cv, x, y, w, h): void => { // Sudan desert + drone
    cv.rect(x, y, w, h, [238, 214, 170]);
    cv.circle(rx(x, w, 0.82), ry(y, h, 0.20), Math.round(h * 0.12), [232, 163, 61]);
    cv.rect(x, ry(y, h, 0.74), w, h - Math.round(h * 0.74), [196, 164, 110]);
    cv.poly([[x, ry(y, h, 0.74)], [rx(x, w, 0.30), ry(y, h, 0.58)], [rx(x, w, 0.62), ry(y, h, 0.74)]], [210, 178, 122]);
    const dx: number = rx(x, w, 0.34);
    const dy: number = ry(y, h, 0.30);
    const s: number = Math.round(w * 0.05);
    cv.rect(dx - s, dy - 2, s * 2, 4, [30, 30, 30]);
    cv.rect(dx - 2, dy - s, 4, s * 2, [30, 30, 30]);
    cv.rect(dx - Math.round(w * 0.02), dy - Math.round(h * 0.03), Math.round(w * 0.04), Math.round(h * 0.06), [30, 30, 30]);
    cv.circle(dx - s, dy - s, 3, [60, 60, 60]);
    cv.circle(dx + s, dy - s, 3, [60, 60, 60]);
    cv.circle(dx - s, dy + s, 3, [60, 60, 60]);
    cv.circle(dx + s, dy + s, 3, [60, 60, 60]);
  },
  11: (cv, x, y, w, h): void => { // Nepal quake: mountains + cracks
    cv.rect(x, y, w, h, SKY);
    cv.poly([[x, ry(y, h, 0.88)], [rx(x, w, 0.30), ry(y, h, 0.18)], [rx(x, w, 0.58), ry(y, h, 0.88)]], [96, 104, 122]);
    cv.poly([[rx(x, w, 0.22), ry(y, h, 0.32)], [rx(x, w, 0.30), ry(y, h, 0.18)], [rx(x, w, 0.38), ry(y, h, 0.32)]], WHITE);
    cv.poly([[rx(x, w, 0.42), ry(y, h, 0.88)], [rx(x, w, 0.68), ry(y, h, 0.34)], [rx(x, w, 0.96), ry(y, h, 0.88)]], [70, 78, 96]);
    cv.poly([[rx(x, w, 0.62), ry(y, h, 0.44)], [rx(x, w, 0.68), ry(y, h, 0.34)], [rx(x, w, 0.74), ry(y, h, 0.44)]], WHITE);
    cv.line(rx(x, w, 0.12), ry(y, h, 0.88), rx(x, w, 0.20), ry(y, h, 0.66), RED, 2);
    cv.line(rx(x, w, 0.20), ry(y, h, 0.66), rx(x, w, 0.16), ry(y, h, 0.50), RED, 2);
    cv.line(rx(x, w, 0.84), ry(y, h, 0.88), rx(x, w, 0.78), ry(y, h, 0.70), RED, 2);
    cv.line(rx(x, w, 0.78), ry(y, h, 0.70), rx(x, w, 0.82), ry(y, h, 0.56), RED, 2);
    cv.rect(rx(x, w, 0.44), ry(y, h, 0.72), Math.round(w * 0.12), Math.round(h * 0.16), [150, 120, 90]);
    cv.poly([[rx(x, w, 0.42), ry(y, h, 0.72)], [rx(x, w, 0.50), ry(y, h, 0.62)], [rx(x, w, 0.58), ry(y, h, 0.72)]], [120, 60, 50]);
  },
  12: (cv, x, y, w, h): void => { // Hormuz tankers + fire
    cv.rect(x, y, w, h, SKY);
    cv.rect(x, ry(y, h, 0.58), w, h - Math.round(h * 0.58), [42, 90, 122]);
    cv.poly([[rx(x, w, 0.06), ry(y, h, 0.58)], [rx(x, w, 0.44), ry(y, h, 0.58)], [rx(x, w, 0.40), ry(y, h, 0.72)], [rx(x, w, 0.10), ry(y, h, 0.72)]], [30, 30, 30]);
    cv.rect(rx(x, w, 0.34), ry(y, h, 0.44), Math.round(w * 0.06), Math.round(h * 0.14), [220, 220, 220]);
    cv.poly([[rx(x, w, 0.56), ry(y, h, 0.58)], [rx(x, w, 0.94), ry(y, h, 0.58)], [rx(x, w, 0.90), ry(y, h, 0.72)], [rx(x, w, 0.60), ry(y, h, 0.72)]], [40, 40, 40]);
    cv.rect(rx(x, w, 0.84), ry(y, h, 0.44), Math.round(w * 0.06), Math.round(h * 0.14), [220, 220, 220]);
    cv.circle(rx(x, w, 0.72), ry(y, h, 0.50), Math.round(h * 0.09), [240, 120, 40]);
    cv.circle(rx(x, w, 0.76), ry(y, h, 0.42), Math.round(h * 0.06), [250, 170, 60]);
    cv.circle(rx(x, w, 0.74), ry(y, h, 0.32), Math.round(h * 0.07), [120, 120, 125]);
    cv.circle(rx(x, w, 0.70), ry(y, h, 0.22), Math.round(h * 0.05), [140, 140, 145]);
  },
  13: (cv, x, y, w, h): void => { // Microsoft Code Red
    cv.rect(x, y, w, h, NAVYBG);
    const sq: number = Math.round(Math.min(w, h) * 0.30);
    const ox: number = rx(x, w, 0.10);
    const oy: number = ry(y, h, 0.16);
    cv.rect(ox, oy, sq, sq, [220, 60, 50]);
    cv.rect(ox + sq + 4, oy, sq, sq, [70, 180, 110]);
    cv.rect(ox, oy + sq + 4, sq, sq, [60, 140, 220]);
    cv.rect(ox + sq + 4, oy + sq + 4, sq, sq, [240, 200, 60]);
    const cx: number = rx(x, w, 0.82);
    const cy: number = ry(y, h, 0.72);
    cv.circle(cx, cy, Math.round(h * 0.20), RED);
    cv.ring(cx, cy, Math.round(h * 0.20), WHITE, 2);
    drawText(cv, "pin", cx - measure("pin", "!") / 2, cy + 3, "!", WHITE);
  },
};

function drawBadge(cv: Canvas, n: number, x: number, y: number, r: number): void {
  cv.circle(x, y, r, RED);
  cv.ring(x, y, r, WHITE, 1);
  const s: string = String(n);
  drawText(cv, "pin", x - measure("pin", s) / 2, y + 3, s, WHITE);
}
function drawChip(cv: Canvas, x: number, y: number, text: string): void {
  const w: number = Math.round(measure("chip", text)) + 12;
  cv.rect(x - w, y, w, 16, NAVYBG);
  drawText(cv, "chip", x - w + 6, y + 11, text, WHITE);
}

// ---------------------------------------------------------------------- map
type LonLat = [number, number];
const CONTINENTS: LonLat[][] = [
  // North America
  [[-168, 66], [-156, 71], [-140, 70], [-125, 70], [-110, 68], [-95, 69], [-88, 66], [-82, 63], [-78, 60], [-72, 62], [-65, 60], [-60, 55], [-55, 47], [-60, 44], [-68, 44], [-74, 39], [-76, 35], [-81, 26], [-82, 28], [-84, 30], [-87, 30], [-90, 29], [-94, 29], [-97, 26], [-97, 22], [-94, 19], [-90, 19], [-87, 16], [-84, 15], [-83, 10], [-79, 9], [-77, 7], [-80, 8], [-83, 10], [-86, 12], [-88, 14], [-91, 14], [-94, 16], [-97, 16], [-97, 19], [-100, 20], [-105, 20], [-109, 23], [-112, 26], [-114, 29], [-117, 33], [-122, 38], [-124, 43], [-124, 48], [-128, 51], [-132, 56], [-140, 60], [-150, 60], [-158, 58], [-163, 58], [-166, 60]],
  // South America
  [[-79, 9], [-77, 4], [-80, -3], [-81, -6], [-78, -12], [-74, -16], [-70, -19], [-70, -24], [-71, -30], [-72, -37], [-73, -44], [-74, -50], [-70, -54], [-66, -55], [-68, -50], [-65, -45], [-62, -41], [-58, -35], [-52, -32], [-48, -27], [-41, -23], [-39, -17], [-35, -9], [-35, -6], [-39, -3], [-44, -2], [-50, 0], [-53, 4], [-58, 6], [-62, 9], [-68, 11], [-72, 12], [-76, 10]],
  // Africa
  [[-17, 15], [-16, 21], [-15, 27], [-10, 31], [-5, 35], [0, 36], [10, 37], [11, 34], [15, 32], [20, 32], [25, 31], [30, 31], [32, 31], [34, 28], [35, 27], [37, 22], [39, 18], [41, 12], [43, 11], [46, 11], [48, 11], [51, 11], [51, 10], [48, 5], [44, 0], [41, -2], [40, -8], [39, -14], [36, -18], [33, -22], [32, -26], [31, -29], [28, -33], [25, -34], [20, -35], [17, -33], [15, -28], [13, -20], [12, -15], [12, -10], [13, -5], [9, -1], [9, 4], [4, 6], [-2, 5], [-8, 5], [-13, 8], [-17, 12]],
  // Eurasia (coarse; Mediterranean simplified to a straightish coast)
  [[-9, 37], [-9, 43], [-2, 44], [-1, 46], [-4, 48], [-1, 49], [2, 51], [4, 53], [7, 54], [8, 57], [10, 59], [6, 58], [5, 60], [6, 62], [10, 64], [13, 66], [16, 68], [19, 70], [25, 71], [30, 70], [34, 68], [38, 67], [42, 66], [45, 68], [48, 69], [52, 68], [56, 69], [60, 69], [64, 68], [68, 68], [72, 69], [76, 70], [80, 71], [85, 72], [90, 74], [95, 75], [100, 74], [105, 73], [110, 72], [115, 72], [120, 72], [125, 71], [130, 71], [135, 71], [140, 72], [145, 71], [150, 70], [155, 69], [158, 66], [160, 64], [162, 61], [160, 60], [158, 56], [156, 52], [153, 49], [150, 46], [147, 43], [144, 41], [142, 39], [141, 37], [139, 34], [137, 33], [135, 32], [132, 31], [130, 30], [128, 29], [126, 28], [124, 27], [122, 25], [120, 23], [118, 21], [116, 20], [114, 19], [112, 18], [110, 17], [108, 15], [106, 13], [105, 10], [104, 8], [102, 6], [100, 3], [98, 4], [97, 8], [96, 12], [94, 16], [92, 18], [91, 22], [89, 22], [88, 21], [86, 20], [84, 18], [82, 16], [80, 14], [80, 10], [77, 8], [76, 10], [74, 14], [72, 18], [70, 20], [68, 22], [66, 25], [61, 25], [58, 26], [56, 27], [54, 27], [52, 27], [50, 29], [48, 30], [48, 29], [50, 27], [52, 26], [54, 25], [56, 26], [58, 24], [59, 22], [58, 20], [55, 17], [52, 15], [48, 14], [45, 13], [43, 12], [42, 15], [41, 18], [40, 21], [39, 24], [38, 27], [37, 29], [36, 30], [35, 31], [36, 36], [33, 36], [30, 36], [27, 37], [23, 36], [22, 37], [20, 39], [19, 42], [16, 44], [12, 44], [8, 44], [6, 43], [3, 43], [0, 40], [-1, 37], [-2, 37], [-5, 36], [-6, 36]],
  // Australia
  [[113, -22], [114, -30], [115, -34], [118, -35], [124, -33], [129, -32], [132, -32], [135, -35], [138, -35], [140, -38], [144, -38], [147, -39], [150, -37], [153, -32], [153, -27], [151, -24], [149, -20], [146, -19], [143, -15], [142, -11], [141, -13], [137, -12], [136, -15], [135, -15], [132, -12], [130, -13], [127, -14], [124, -15], [122, -17], [119, -19], [116, -20]],
  // United Kingdom
  [[-3, 53], [-2, 55], [-1, 57], [0, 53], [-2, 51], [-4, 50]],
  // Japan
  [[130, 31], [132, 33], [134, 34], [136, 35], [138, 35], [140, 36], [141, 38], [141, 40], [140, 42], [142, 44], [144, 44], [143, 42], [141, 40], [140, 38], [139, 36], [137, 35], [135, 34], [133, 33], [131, 32]],
  // New Zealand
  [[167, -45], [170, -42], [173, -40], [175, -38], [177, -38], [175, -40], [173, -42], [170, -44], [167, -46]],
  // Madagascar
  [[44, -16], [47, -15], [50, -16], [50, -20], [48, -24], [45, -25], [43, -22], [44, -18]],
];
function onLand(lon: number, lat: number): boolean {
  for (const poly of CONTINENTS) {
    let inside: boolean = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi: number = poly[i][0]; const yi: number = poly[i][1];
      const xj: number = poly[j][0]; const yj: number = poly[j][1];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}
interface Pin { label: string; lat: number; lon: number; dx: number; dy: number }
const PINS: Pin[] = [
  { label: "1–2", lat: 38.9, lon: -77.0, dx: 0, dy: 0 },
  { label: "3", lat: 39.8, lon: 98.5, dx: 0, dy: 0 },
  { label: "4", lat: 37.6, lon: 127.0, dx: 0, dy: 0 },
  { label: "5", lat: 40.7, lon: -74.0, dx: 10, dy: -8 },
  { label: "6", lat: 46.5, lon: 30.7, dx: 0, dy: 0 },
  { label: "7", lat: 10.4, lon: -75.5, dx: 0, dy: 0 },
  { label: "8", lat: 30.5, lon: -97.7, dx: 0, dy: 0 },
  { label: "9", lat: 31.5, lon: 34.5, dx: 0, dy: 0 },
  { label: "10", lat: 11.5, lon: 34.0, dx: 0, dy: 0 },
  { label: "11", lat: 27.0, lon: 87.0, dx: 0, dy: 0 },
  { label: "12", lat: 27.0, lon: 56.4, dx: 0, dy: 0 },
  { label: "13", lat: 47.7, lon: -122.1, dx: 0, dy: 0 },
];
function drawMap(cv: Canvas, mx: number, my: number, mw: number, mh: number): void {
  const lon0: number = -170; const lon1: number = 180;
  const lat0: number = 72; const lat1: number = -58;
  const px = (lon: number): number => Math.round(mx + ((lon - lon0) / (lon1 - lon0)) * mw);
  const py = (lat: number): number => Math.round(my + ((lat0 - lat) / (lat0 - lat1)) * mh);
  const DOT: RGB = [96, 110, 140];
  for (let gy = my + 2; gy <= my + mh; gy += 5) {
    for (let gx = mx + 2; gx <= mx + mw; gx += 5) {
      const lon: number = lon0 + ((gx - mx) / mw) * (lon1 - lon0);
      const lat: number = lat0 - ((gy - my) / mh) * (lat0 - lat1);
      if (onLand(lon, lat)) cv.circle(gx, gy, 1, DOT);
    }
  }
  for (const p of PINS) {
    const tx: number = px(p.lon);
    const ty: number = py(p.lat);
    const cx: number = tx + p.dx;
    const cy: number = ty + p.dy;
    if (p.dx !== 0 || p.dy !== 0) cv.line(tx, ty, cx, cy, RED, 1);
    cv.circle(cx, cy, 7, RED);
    cv.ring(cx, cy, 7, WHITE, 1);
    const s: string = p.label;
    drawText(cv, "pin", cx - measure("pin", s) / 2, cy + 3, s, WHITE);
  }
}

// -------------------------------------------------------------------- layout
const MX: number = 24;
const RX: number = 1000;
const CW: number = RX - MX;

interface Run { text: string; style: string; color: RGB }
interface Placed { text: string; style: string; color: RGB; x: number }
// Flow mixed-style runs into lines of maxW starting at x0. Words keep the
// style of their run. Returns lines of placed words.
function flowLines(runs: Run[], x0: number, maxW: number): Placed[][] {
  type Tok = { text: string; style: string; color: RGB; w: number };
  const toks: Tok[] = [];
  for (const r of runs) {
    const words: string[] = r.text.split(" ");
    for (let i = 0; i < words.length; i++) {
      if (words[i].length === 0) continue;
      const t: string = i + 1 < words.length ? words[i] + " " : words[i];
      toks.push({ text: t, style: r.style, color: r.color, w: measure(r.style, t) });
    }
  }
  const lines: Placed[][] = [];
  let cur: Placed[] = [];
  let cx: number = x0;
  for (const t of toks) {
    if (cur.length > 0 && cx + t.w > x0 + maxW) {
      lines.push(cur);
      cur = [];
      cx = x0;
    }
    cur.push({ text: t.text, style: t.style, color: t.color, x: cx });
    cx += t.w;
  }
  if (cur.length > 0) lines.push(cur);
  return lines;
}
function drawFlowLines(cv: Canvas, lines: Placed[][], baseline0: number, leading: number): void {
  for (let i = 0; i < lines.length; i++) {
    for (const p of lines[i]) drawText(cv, p.style, p.x, baseline0 + i * leading, p.text, p.color);
  }
}

function build(): { png: Buffer; report: string[] } {
  const cv: Canvas = new Canvas(W, H, CREAM);
  const report: string[] = [];
  const log = (s: string): void => { report.push(s); };

  // Top strip
  drawText(cv, "topstrip", MX, 16, TOP_LEFT, INK);
  const trW: number = measure("topstrip", TOP_RIGHT);
  drawText(cv, "topstrip", RX - trW, 16, TOP_RIGHT, INK);
  cv.hline(MX, 22, CW, RED, 1);

  // Masthead
  drawCentred(cv, ["masthead"], 512, 82, MASTHEAD, CW, INK);
  log("masthead width=" + Math.round(measure("masthead", MASTHEAD)));
  cv.hline(MX, 90, CW, RED, 2);
  drawCentred(cv, ["subdeck"], 512, 108, SUBDECK, CW, RED);
  log("subdeck width=" + Math.round(measure("subdeck", SUBDECK)));
  cv.hline(MX, 116, CW, RED, 1);

  // Stats strip
  const colW: number = CW / 6;
  for (let i = 0; i < STATS.length; i++) {
    const cx: number = MX + colW * i + colW / 2;
    const num: string = STATS[i][0];
    const cap: string = STATS[i][1];
    drawText(cv, "statsNum", cx - measure("statsNum", num) / 2, 148, num, RED);
    drawText(cv, "statsCap", cx - measure("statsCap", cap) / 2, 162, cap, INK);
    if (i > 0) cv.vline(Math.round(MX + colW * i), 128, 38, [200, 190, 170], 1);
  }
  log("stats done y=166");

  // Timeline strip (navy, height by wrapped lines)
  const tlRuns: Run[] = [{ text: "THE DAY IN UTC   ", style: "timeLabel", color: GOLD }];
  TIMELINE.forEach((it, idx) => {
    tlRuns.push({ text: it.label + " ", style: "timeLabel", color: GOLD });
    tlRuns.push({ text: it.text, style: "timeBody", color: WHITE });
    if (idx + 1 < TIMELINE.length) tlRuns.push({ text: "  •  ", style: "timeLabel", color: GOLD });
  });
  const tlLines: Placed[][] = flowLines(tlRuns, 34, 956);
  const tlY: number = 172;
  const tlH: number = 12 + tlLines.length * 16 + 10;
  cv.rect(0, tlY, W, tlH, NAVYBG);
  drawFlowLines(cv, tlLines, tlY + 18, 16);
  log("timeline lines=" + tlLines.length + " stripY=" + tlY + " h=" + tlH + " end=" + (tlY + tlH));
  const leadsY: number = tlY + tlH + 8;

  // Lead panels
  const leadW: number = 317;
  const leadXs: number[] = [MX, MX + leadW + 12, MX + 2 * (leadW + 12)];
  const illoH: number = 80;
  let leadBandH: number = 0;
  for (let i = 0; i < LEADS.length; i++) {
    const L: Lead = LEADS[i];
    const x: number = leadXs[i];
    SCENES[L.n](cv, x, leadsY, leadW, illoH);
    drawBadge(cv, L.n, x + 13, leadsY + 13, 11);
    drawChip(cv, x + leadW - 6, leadsY + 6, L.chip);
    const kickY: number = leadsY + illoH + 14;
    drawText(cv, "leadKicker", x, kickY, L.kicker, RED);
    const headLines: string[] = wrap("leadHead", L.headline, leadW);
    const headY0: number = kickY + 24;
    for (let li = 0; li < headLines.length; li++) drawText(cv, "leadHead", x, headY0 + li * 21, headLines[li], NAVY);
    const bodyY0: number = headY0 + headLines.length * 21 + 14;
    const bodyLines: string[] = wrap("leadBody", L.body, leadW);
    for (let li = 0; li < bodyLines.length; li++) drawText(cv, "leadBody", x, bodyY0 + li * 13, bodyLines[li], INK);
    const srcY: number = bodyY0 + bodyLines.length * 13 + 12;
    drawText(cv, "leadSource", x, srcY, L.source + "  —  ", GREY);
    drawText(cv, "leadSource", x + measure("leadSource", L.source + "  —  "), srcY, L.chip, RED);
    const bandH: number = srcY - leadsY + 4;
    leadBandH = Math.max(leadBandH, bandH);
    log("lead " + L.n + " headLines=" + headLines.length + " bodyLines=" + bodyLines.length + " bandH=" + bandH);
  }
  const gridHeadY: number = leadsY + leadBandH + 10;

  // MORE TOP STORIES heading
  drawText(cv, "sectionHead", MX, gridHeadY, "MORE TOP STORIES", NAVY);
  const mtsW: number = measure("sectionHead", "MORE TOP STORIES");
  cv.hline(MX + mtsW + 8, gridHeadY - 4, RX - (MX + mtsW + 8), RED, 1);

  // Grid of 10 cards, 2 rows of 5
  const cardW: number = 187;
  const gap: number = 10;
  const gridY0: number = gridHeadY + 10;
  const gridIlloH: number = 40;
  let gridY: number = gridY0;
  for (let row = 0; row < 2; row++) {
    let rowH: number = 0;
    const cards: Card[] = CARDS.slice(row * 5, row * 5 + 5);
    // measure row height first
    const heights: number[] = cards.map((c) => {
      const hl: number = wrap("gridHead", c.headline, cardW).length;
      const bl: number = wrap("gridBody", c.body, cardW).length;
      return gridIlloH + 4 + 11 + hl * 14 + 6 + bl * 12 + 4;
    });
    rowH = Math.max(...heights);
    for (let i = 0; i < 5; i++) {
      const c: Card = cards[i];
      const x: number = MX + i * (cardW + gap);
      SCENES[c.n](cv, x, gridY, cardW, gridIlloH);
      drawBadge(cv, c.n, x + 11, gridY + 11, 9);
      const kickY: number = gridY + gridIlloH + 12;
      drawText(cv, "gridKicker", x, kickY, c.kicker, RED);
      const headLines: string[] = wrap("gridHead", c.headline, cardW);
      for (let li = 0; li < headLines.length; li++) drawText(cv, "gridHead", x, kickY + 15 + li * 14, headLines[li], DARKRED);
      const bodyLines: string[] = wrap("gridBody", c.body, cardW);
      const bodyY0: number = kickY + 15 + headLines.length * 14 + 6;
      for (let li = 0; li < bodyLines.length; li++) drawText(cv, "gridBody", x, bodyY0 + li * 12, bodyLines[li], INK);
      log("card " + c.n + " headLines=" + headLines.length + " bodyLines=" + bodyLines.length);
    }
    log("grid row " + row + " h=" + rowH + " end=" + (gridY + rowH));
    gridY += rowH + 6;
  }
  const alsoY: number = gridY + 6;

  // ALSO IN + WHERE IT HAPPENED
  drawText(cv, "sectionHead", MX, alsoY, "ALSO IN WEDNESDAY'S FULL-DAY WIRES — 23 MORE STORIES", NAVY);
  const aiW: number = measure("sectionHead", "ALSO IN WEDNESDAY'S FULL-DAY WIRES — 23 MORE STORIES");
  cv.hline(MX + aiW + 8, alsoY - 4, 776 - (MX + aiW + 8), RED, 1);
  drawText(cv, "sectionHead", 790, alsoY, "WHERE IT HAPPENED", NAVY);
  const wireY0: number = alsoY + 12;
  const wireLead: number = 11.5;
  let wireEnd: number = wireY0;
  const drawWireCol = (items: string[], x0: number, maxW: number): number => {
    let y: number = wireY0;
    for (const item of items) {
      const lines: string[] = wrap("wire", item, maxW);
      for (let li = 0; li < lines.length; li++) {
        const indent: number = li === 0 ? 0 : 14;
        drawText(cv, "wire", x0 + indent, y + li * wireLead, lines[li], INK);
      }
      y += lines.length * wireLead;
    }
    return y;
  };
  const leftEnd: number = drawWireCol(WIRES_LEFT, MX, 476);
  const rightEnd: number = drawWireCol(WIRES_RIGHT, 514, 262);
  wireEnd = Math.max(leftEnd, rightEnd);
  log("wires leftEnd=" + leftEnd + " rightEnd=" + rightEnd);
  const mapY: number = alsoY + 12;
  drawMap(cv, 790, mapY, 210, 78);
  const leg1: string = "1–2 Washington · 3 Jiuquan · 4 Seoul · 5 New York";
  const leg2: string = "6 Odesa · 7 Cartagena · 8 Round Rock · 9 Gaza City";
  const leg3: string = "10 Blue Nile · 11 Koshi · 12 Hormuz · 13 Redmond";
  drawText(cv, "legend", 790, mapY + 78 + 12, leg1, INK);
  drawText(cv, "legend", 790, mapY + 78 + 22, leg2, INK);
  drawText(cv, "legend", 790, mapY + 78 + 32, leg3, INK);
  log("map legend end=" + (mapY + 78 + 32));

  // DATE CHECK box
  const dcY: number = Math.max(wireEnd, mapY + 78 + 32 + 4) + 6;
  const dcRuns: Run[] = [
    { text: "DATE CHECK — FULL-DAY EDITION. ", style: "dateHead", color: NAVY },
    { text: DATE_CHECK_BODY, style: "dateBody", color: INK },
  ];
  const dcLines: Placed[][] = flowLines(dcRuns, 36, 952);
  const dcH: number = 10 + dcLines.length * 12 + 10;
  cv.rect(MX, dcY, CW, dcH, CREAM);
  cv.hline(MX, dcY, CW, RED, 2);
  cv.hline(MX, dcY + dcH - 2, CW, RED, 2);
  cv.vline(MX, dcY, dcH, RED, 2);
  cv.vline(RX - 2, dcY, dcH, RED, 2);
  drawFlowLines(cv, dcLines, dcY + 10 + 10, 12);
  log("datecheck lines=" + dcLines.length + " y=" + dcY + " h=" + dcH + " end=" + (dcY + dcH));
  const srcY: number = dcY + dcH + 14;
  drawText(cv, "sources", MX, srcY, SOURCES_LINE, INK);
  log("sources baseline=" + srcY);

  // Footer
  const footY: number = 998;
  cv.rect(0, footY, W, H - footY, NAVYBG);
  drawText(cv, "footer", MX, footY + 17, "THE WORLD IN ONE DAY", WHITE);
  const fr: string = "WEDNESDAY 25 NOVEMBER 2026 · ONE PAGE";
  drawText(cv, "footer", RX - measure("footer", fr), footY + 17, fr, WHITE);
  log("footer y=" + footY + " total height=" + H);

  return { png: encodePng(cv.px, W, H), report };
}

function main(): void {
  const { png, report } = build();
  for (const line of report) console.error("[layout] " + line);
  fs.mkdirSync("/output", { recursive: true });
  fs.writeFileSync(OUT_PATH, png);
  console.error("[done] bytes=" + png.length + " path=" + OUT_PATH);
}
main();

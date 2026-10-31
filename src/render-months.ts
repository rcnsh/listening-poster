// Draws the most-played album of every month as its cover, one row per year,
// with the album, artist and play count underneath. Reads data/plays.json and
// data/covers/; each month's cover is fetched once at 640 px.
import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { config } from "./config.ts";
import { type CoverPlay, largeCover } from "./covers.ts";
import { wallClock } from "./time.ts";

const { width: W, height: H, background, blank } = config.months;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

if (!GlobalFonts.has(config.font)) console.warn(`font "${config.font}" not found, using default`);
const font = (size: number, weight = 500) => `${weight} ${size}px "${config.font}"`;
const n = (x: number) => x.toLocaleString("en-GB");

// ---- data ---------------------------------------------------------------

const start = config.start ? Date.parse(`${config.start}T00:00:00Z`) : -Infinity;
const plays = (JSON.parse(readFileSync("data/plays.json", "utf8")) as CoverPlay[])
  .map((p) => ({ ...p, local: new Date(wallClock(p.ms)) }))
  .filter((p) => p.local.getTime() >= start)
  .sort((a, b) => a.ms - b.ms);
if (!plays.length) {
  console.error(`No plays in data/plays.json${config.start ? ` from ${config.start}` : ""}. Run pnpm import:spotify or pnpm fetch:covers first.`);
  process.exit(1);
}
const first = plays[0].local, last = plays.at(-1)!.local;
const years = Array.from({ length: last.getUTCFullYear() - first.getUTCFullYear() + 1 }, (_, i) => first.getUTCFullYear() + i);

// Each month's most-played cover, keyed "year-month". A cover stands for its
// album, as on the covers poster.
const tally = new Map<string, Map<string, { count: number; album: string; artist: string }>>();
for (const p of plays) {
  // Only covers on disk, as on the covers poster, so a month falls back to
  // its next album rather than a blank.
  if (!p.cover || !existsSync(`data/covers/${p.cover}.jpg`)) continue;
  const key = `${p.local.getUTCFullYear()}-${p.local.getUTCMonth()}`;
  const month = tally.get(key) ?? new Map();
  tally.set(key, month);
  const c = month.get(p.cover) ?? { count: 0, album: p.album ?? "", artist: p.artist };
  c.count++;
  month.set(p.cover, c);
}
const topOf = (y: number, m: number) => {
  const month = tally.get(`${y}-${m}`);
  return month && [...month].sort((a, b) => b[1].count - a[1].count)[0];
};

// ---- layout -------------------------------------------------------------

// Covers fill the width, or shrink so every year fits; the caption under a
// cover takes 175/640 of its size.
// The grid is centred in the space when it doesn't fill it.
const margin = 400, left = 1000, bottom = H - 300;
const cover = Math.floor(Math.min((W - left - margin) / 12 - 70, (bottom - 1250) / years.length / (1 + 175 / 640)));
const u = cover / 640;
const px = cover + 70;
const x0 = left + (W - left - margin - 12 * px + 70) / 2;
const py = cover * (1 + 175 / 640);
const top = 1250 + Math.max(0, (bottom - 1250 - years.length * py) / 2);

const canvas = createCanvas(W, H);
const ctx = canvas.getContext("2d");
ctx.imageSmoothingQuality = "high";
ctx.fillStyle = background;
ctx.fillRect(0, 0, W, H);

ctx.fillStyle = config.ink;
ctx.font = font(220, 700);
ctx.fillText(config.months.title, margin, 560);
ctx.fillStyle = config.muted;
ctx.font = font(70);
ctx.fillText(
  `The most-played album of every month, ${years[0]} to ${last.toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}, with its play count.`,
  margin + 6, 700,
);

ctx.textAlign = "center";
ctx.fillStyle = config.muted;
ctx.font = font(52, 600);
MONTHS.forEach((m, i) => ctx.fillText(m.toUpperCase(), x0 + i * px + cover / 2, top - 60));

let fallbacks = 0;
for (const [row, y] of years.entries()) {
  const yTop = top + row * py;
  ctx.textAlign = "left";
  ctx.fillStyle = config.ink;
  ctx.font = font(130 * u, 700);
  ctx.fillText(String(y), margin, yTop + cover / 2 + 45 * u);
  for (let m = 0; m < 12; m++) {
    const x = x0 + m * px;
    // Months outside the history are left empty rather than drawn blank.
    const ym = y * 12 + m;
    if (ym < first.getUTCFullYear() * 12 + first.getUTCMonth() || ym > last.getUTCFullYear() * 12 + last.getUTCMonth()) continue;
    const best = topOf(y, m);
    const img = best && (await image(best[0]));
    if (!best || !img) {
      ctx.fillStyle = blank;
      ctx.fillRect(x, yTop, cover, cover);
      continue;
    }
    ctx.drawImage(img, x, yTop, cover, cover);
    const { album, artist, count } = best[1];
    ctx.fillStyle = config.ink;
    ctx.font = font(34 * u, 600);
    ctx.fillText(fit(album, cover), x, yTop + cover + 52 * u);
    ctx.fillStyle = config.muted;
    ctx.font = font(28 * u);
    ctx.fillText(fit(`${artist} · ${n(count)}`, cover), x, yTop + cover + 94 * u);
  }
}

ctx.textAlign = "right";
ctx.fillStyle = config.muted;
ctx.font = font(44);
ctx.fillText(config.footer, W - margin, H - 160);

// The 640 px cover, or the 64 px one if it can't be fetched.
async function image(id: string) {
  const big = await largeCover(id);
  if (!big) fallbacks++;
  return loadImage(big ?? `data/covers/${id}.jpg`);
}

function fit(text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  while (text.length > 1 && ctx.measureText(`${text}…`).width > max) text = text.slice(0, -1);
  return `${text.trimEnd()}…`;
}

// ---- output -------------------------------------------------------------

mkdirSync("out", { recursive: true });
writeFileSync(config.months.out, await canvas.encode("png"));
const pw = 1754;
const preview = createCanvas(pw, Math.round((H * pw) / W));
const pctx = preview.getContext("2d");
pctx.imageSmoothingQuality = "high";
pctx.drawImage(canvas, 0, 0, preview.width, preview.height);
writeFileSync(config.months.preview, await preview.encode("png"));
if (!tally.size) console.warn("No covers in data/plays.json: the one-year export has none, so every month is blank.");
if (fallbacks) console.warn(`${fallbacks} months use the 64 px cover because the 640 px one couldn't be fetched; re-run to retry.`);
console.log(`${years.length} years, ${cover}px covers -> ${config.months.out}`);

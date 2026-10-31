// Draws one square per day, a block of weeks per year, shaded by how many
// plays the day had, with each year's total and most-played artist beside it.
// Reads data/plays.csv.
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import { config } from "./config.ts";
import { readPlays } from "./plays.ts";

const DAY = 86_400_000;
const { width: W, height: H, background, ink, muted, steps } = config.calendar;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

if (!GlobalFonts.has(config.font)) console.warn(`font "${config.font}" not found, using default`);
const font = (size: number, weight = 500) => `${weight} ${size}px "${config.font}"`;
const n = (x: number) => x.toLocaleString("en-GB");
const utcDate = (ms: number, opts: Intl.DateTimeFormatOptions) => new Date(ms).toLocaleString("en-GB", { ...opts, timeZone: "UTC" });

// ---- data ---------------------------------------------------------------

const { plays, start } = readPlays();
const last = plays.at(-1)!.t;
const perDay = new Map<number, number>();
for (const p of plays) {
  const d = Math.floor(p.t / DAY) * DAY;
  perDay.set(d, (perDay.get(d) ?? 0) + 1);
}

type Year = { year: number; plays: number; top?: [string, number] };
const years: Year[] = [];
for (let y = new Date(start).getUTCFullYear(); y <= new Date(last).getUTCFullYear(); y++) {
  const artists = new Map<string, number>();
  let count = 0;
  for (const p of plays) {
    if (new Date(p.t).getUTCFullYear() !== y) continue;
    count++;
    artists.set(p.artist, (artists.get(p.artist) ?? 0) + 1);
  }
  years.push({ year: y, plays: count, top: [...artists].sort((a, b) => b[1] - a[1])[0] });
}

// Quartiles of the days with any plays: steps[0] is a day with none.
const sorted = [...perDay.values()].sort((a, b) => a - b);
const cuts = [0.25, 0.5, 0.75].map((f) => sorted[Math.floor(f * (sorted.length - 1))]);
const most = sorted.at(-1)!;
// The busiest days always get the darkest step, even when counts tie.
const shade = (v: number) => steps[v === 0 ? 0 : v === most ? steps.length - 1 : 1 + cuts.filter((c) => v > c).length];

// ---- layout -------------------------------------------------------------

// A year is 7 rows of squares plus 4.5 rows of gap. The square pitch is the
// largest that fits both the width (53 weeks) and every year in the height.
// Up to 54 week columns (a leap year starting on a Sunday, like 2012). The
// grid and key are centred in the space when they don't fill it.
const margin = 360, left = 1080, gridBottom = H - 900;
const p = Math.min((W - left - margin) / 54, (gridBottom - 1000) / (years.length * 11.5));
const x0 = left + (W - left - margin - 54 * p) / 2, x1 = x0 + 54 * p;
const u = p / 66; // label scale, 1 at the A2 size with seven years
const cell = p * 0.88, block = p * 11.5;
const used = (years.length - 1) * block + 7 * p + 178;
const top = 1000 + Math.max(0, (gridBottom - 1000 - used) / 2);

const canvas = createCanvas(W, H);
const ctx = canvas.getContext("2d");
ctx.fillStyle = background;
ctx.fillRect(0, 0, W, H);

ctx.fillStyle = ink;
ctx.font = font(170, 700);
ctx.fillText(config.calendar.title, margin, 480);
ctx.fillStyle = muted;
ctx.font = font(54);
ctx.fillText(
  `${n(plays.length)} plays, ${years[0].year} to ${utcDate(last, { month: "long", year: "numeric" })}. One square per day, Monday at the top.`,
  margin + 6, 590,
);

const square = (x: number, y: number, colour: string) => {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.roundRect(x, y, cell, cell, cell * 0.17);
  ctx.fill();
};

years.forEach((year, i) => {
  const yTop = top + i * block;
  const jan1 = Date.UTC(year.year, 0, 1);
  const monday = jan1 - ((new Date(jan1).getUTCDay() + 6) % 7) * DAY;
  const firstDay = Math.floor(start / DAY) * DAY;
  ctx.textAlign = "left";
  for (let d = Math.max(jan1, firstDay); d < Date.UTC(year.year + 1, 0, 1) && d <= last; d += DAY) {
    const x = x0 + Math.floor((d - monday) / (7 * DAY)) * p;
    square(x, yTop + ((new Date(d).getUTCDay() + 6) % 7) * p, shade(perDay.get(d) ?? 0));
    if (new Date(d).getUTCDate() === 1 || d === firstDay) {
      ctx.fillStyle = muted;
      ctx.font = font(30 * u, 600);
      ctx.fillText(MONTHS[new Date(d).getUTCMonth()], x, yTop - 18 * u);
    }
  }
  ctx.fillStyle = ink;
  ctx.font = font(120 * u, 700);
  ctx.fillText(String(year.year), margin, yTop + 120 * u);
  ctx.fillStyle = muted;
  ctx.font = font(40 * u);
  ctx.fillText(`${n(year.plays)} plays`, margin + 6, yTop + 190 * u);
  if (year.top) {
    ctx.fillStyle = ink;
    ctx.font = font(38 * u, 600);
    ctx.fillText(fit(year.top[0], left - margin - 80), margin + 6, yTop + 290 * u);
    ctx.fillStyle = muted;
    ctx.font = font(32 * u);
    ctx.fillText(`most played, ${n(year.top[1])}`, margin + 6, yTop + 335 * u);
  }
});

// Key and busiest day, under the last year
const ly = top + (years.length - 1) * block + 7 * p + 120;
ctx.fillStyle = muted;
ctx.font = font(40);
ctx.textAlign = "left";
ctx.fillText("Fewer", x0, ly + 42);
steps.forEach((s, i) => {
  ctx.fillStyle = s;
  ctx.beginPath();
  ctx.roundRect(x0 + 140 + i * 72, ly, 58, 58, 10);
  ctx.fill();
});
ctx.fillStyle = muted;
ctx.fillText("More", x0 + 140 + steps.length * 72 + 20, ly + 42);
const [busiest] = [...perDay].sort((a, b) => b[1] - a[1])[0];
ctx.textAlign = "right";
ctx.fillText(`Busiest day: ${utcDate(busiest, { day: "numeric", month: "long", year: "numeric" })}, ${n(most)} plays`, x1, ly + 42);
ctx.fillText(config.footer, W - margin, H - 260);

function fit(text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  while (text.length > 1 && ctx.measureText(`${text}…`).width > max) text = text.slice(0, -1);
  return `${text.trimEnd()}…`;
}

// ---- output -------------------------------------------------------------

mkdirSync("out", { recursive: true });
writeFileSync(config.calendar.out, await canvas.encode("png"));
const pw = 1240;
const preview = createCanvas(pw, Math.round((H * pw) / W));
const pctx = preview.getContext("2d");
pctx.imageSmoothingQuality = "high";
pctx.drawImage(canvas, 0, 0, preview.width, preview.height);
writeFileSync(config.calendar.preview, await preview.encode("png"));
console.log(`${plays.length} plays over ${perDay.size} days -> ${config.calendar.out}`);

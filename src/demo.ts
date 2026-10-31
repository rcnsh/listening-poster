// Writes a made-up listening history into data/, the same files an import
// writes, then makes every poster from it, so the posters can be tried
// without a Spotify export:
// about 63,000 plays of 1,500 invented artists from 2020 to late 2026, with
// a generated cover for each of their 2,100 albums. The same seed always gives
// the same history, so the README's examples can be remade.
//
//   node src/demo.ts [--force]
import { createCanvas } from "@napi-rs/canvas";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { config } from "./config.ts";
import type { CoverPlay } from "./covers.ts";
import { wallClock } from "./time.ts";

const DAY = 86_400_000, MIN = 60_000;
const FIRST = Date.UTC(2020, 0, 1), LAST = Date.UTC(2026, 9, 29);
const TOTAL = 62_890, ARTISTS = 1_500;

if (existsSync(config.csv) && !process.argv.includes("--force")) {
  console.error(`${config.csv} already exists. Run with --force to replace data/ with the demo history.`);
  process.exit(1);
}

// ---- random -------------------------------------------------------------

let seed = 20_200_101;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
};
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
const normal = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
const weighted = (cum: number[]) => {
  const r = rand() * cum.at(-1)!;
  let lo = 0, hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < r) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};
const cumulative = (ws: number[]) => ws.map(((s) => (w: number) => (s += w))(0));
const id = (n: number, chars: string) => Array.from({ length: n }, () => pick(chars)).join("");
const base62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

// ---- names --------------------------------------------------------------

const ADJ = ["Velvet", "Paper", "Silver", "Hollow", "Golden", "Quiet", "Neon", "Wild", "Electric", "Glass", "Northern", "Burning",
  "Painted", "Lonely", "Distant", "Midnight", "Copper", "Blue", "Crimson", "Soft", "Broken", "Sleepy", "Lucky", "Static", "Faded",
  "Little", "Heavy", "Gentle", "Restless", "Cosmic", "Bitter", "Sunlit", "Paper", "Secret", "Analog", "Frozen", "Rusty", "Tender"];
const NOUN = ["Lanterns", "Wolves", "Harbour", "Satellites", "Orchards", "Rivers", "Engines", "Moths", "Arcade", "Tides", "Ghosts",
  "Parade", "Comets", "Machines", "Gardens", "Lions", "Mirrors", "Signals", "Owls", "Cathedral", "Daydreams", "Weather", "Kites",
  "Oceans", "Foxes", "Telephones", "Avenue", "Fireflies", "Islands", "Postcards", "Rockets", "Horses", "Atlas", "Choir", "Echoes"];
const FIRSTN = ["Mara", "Theo", "June", "Arlo", "Nadia", "Felix", "Iris", "Otis", "Lena", "Jonah", "Priya", "Remy", "Saoirse", "Kai",
  "Elsie", "Bruno", "Ada", "Yusuf", "Wren", "Milo", "Noor", "Cass", "Leif", "Tova", "Ezra", "Ines", "Rafe", "Suki", "Dara", "Hugo"];
const LASTN = ["Vale", "Okafor", "Lindqvist", "Marlowe", "Chen", "Duarte", "Kestrel", "Abara", "Holloway", "Sato", "Fontaine",
  "Reyes", "Achterberg", "Moss", "Novak", "Quill", "Baptiste", "Ferro", "Haddad", "Lune", "Winter", "Park", "Oduya", "Strand"];
const SOLO = ["Haze", "Kilo", "Vesper", "Nova", "Juno", "Sable", "Orrin", "Lumi", "Faye", "Corvid", "Halcyon", "Indigo", "Rook", "Tamsin",
  "Pilot", "Marrow", "Sparrow", "Ember", "Cinder", "Lark", "Moth", "Basil", "Quartz", "Delta", "Echo", "Atlas", "Willow", "Saint"];
const WORD = ["Light", "Summer", "Night", "Home", "Water", "Fire", "Gold", "Heart", "Rain", "Stars", "Road", "Dream", "Glass", "Bloom",
  "Signal", "Static", "Ocean", "Sugar", "Satellite", "Garden", "Motel", "Polaroid", "Velvet", "Thunder", "Paper", "Honey",
  "Neon", "Echo", "Wildfire", "Daylight", "Winter", "Fever", "Mirror", "Ghost", "Tides", "Dust", "Comet", "Kingdom", "Orbit"];
const VERB = ["Running", "Falling", "Dancing", "Waiting", "Burning", "Drifting", "Calling", "Holding", "Chasing", "Leaving", "Floating"];

const used = new Set<string>();
const unique = (make: () => string) => {
  for (let i = 0; ; i++) {
    const name = i < 20 ? make() : `${make()} ${i}`;
    if (!used.has(name)) return used.add(name), name;
  }
};
const artistName = () =>
  pick([
    () => `The ${pick(ADJ)} ${pick(NOUN)}`,
    () => `${pick(FIRSTN)} ${pick(LASTN)}`,
    () => pick(SOLO) + (rand() < 0.5 ? "" : ` ${pick(NOUN)}`),
    () => `${pick(ADJ)} ${pick(NOUN)}`,
    () => `${pick(FIRSTN)} & the ${pick(NOUN)}`,
  ])();
const albumName = () =>
  pick([
    () => `${pick(ADJ)} ${pick(WORD)}`,
    () => pick(WORD),
    () => `${pick(WORD)} ${pick(["Songs", "Tapes", "Sessions", "Club", "Season", "Machine", "Hours"])}`,
    () => `${pick(VERB)} ${pick(["Home", "Slowly", "in Colour", "Upstairs", "for Daylight", "Again"])}`,
    () => `The ${pick(WORD)} ${pick(NOUN)}`,
  ])();
const trackName = () =>
  pick([
    () => pick(WORD),
    () => `${pick(ADJ)} ${pick(WORD)}`,
    () => `${pick(VERB)} ${pick(["Home", "Away", "Back", "Slow", "Through", "Under", "Again", "Over"])}`,
    () => `${pick(WORD)} ${pick(["Song", "Interlude", "Reprise", "Pt. II", "Blues", "Waltz", "(Demo)"])}`,
  ])();

// ---- artists and albums -------------------------------------------------

type Album = { name: string; cover: string; uri: string; release: number; tracks: { name: string; id: string; len: number }[] };
type Artist = { name: string; albums: Album[]; weight: number; peak: number; spread: number; staple: number };

const span = LAST - FIRST;
// The favourites take turns: their peaks are spread across the years.
const slots = Array.from({ length: 30 }, (_, i) => (i + rand()) / 30).sort(() => rand() - 0.5);
const artists: Artist[] = Array.from({ length: ARTISTS }, (_, rank) => {
  const spread = (rank < 30 ? 0.25 + 0.7 * rand() : rank < 250 ? 0.08 + 0.4 * rand() : 0.03 + 0.25 * rand()) * 365 * DAY;
  const peak = rank < 30 ? FIRST + slots[rank] * span : FIRST - 0.1 * span + rand() * 1.2 * span;
  const n = rank < 80 ? int(2, 5) : rand() < 0.25 ? 2 : 1;
  const albums = Array.from({ length: n }, (_, k) => ({
    name: unique(albumName),
    cover: `ab67616d00004851${id(24, "0123456789abcdef")}`,
    uri: `spotify:album:${id(22, base62)}`,
    // Each album is played most around its release, in order across the
    // artist's time.
    release: peak + (k - (n - 1) / 2) * spread * 0.8,
    tracks: Array.from({ length: int(7, 14) }, () => ({ name: trackName(), id: id(22, base62), len: (int(140, 290) + rand()) * 1000 })),
  }));
  // A few artists get most plays; each is listened to around its peak.
  return { name: unique(artistName), albums, weight: 1 / (rank + 5) ** 1.15, peak, spread, staple: rank < 30 ? 0.06 : 0.01 };
});
const albums = artists.flatMap((a) => a.albums);

// Each month's chance of each artist.
const monthCum = new Map<number, number[]>();
const artistsFor = (t: number) => {
  const m = Math.floor((t - FIRST) / (30 * DAY));
  if (!monthCum.has(m)) {
    const mid = FIRST + (m + 0.5) * 30 * DAY;
    monthCum.set(m, cumulative(artists.map((a) => a.weight * (Math.exp(-(((mid - a.peak) / a.spread) ** 2) / 2) + a.staple))));
  }
  return monthCum.get(m)!;
};

// ---- plays --------------------------------------------------------------

// How many plays each day: a slow drift up, quieter weekends and summers,
// some days off, and one day with a playlist left on repeat.
const days = Math.round((LAST - FIRST) / DAY) + 1;
const repeatDay = Math.floor(days * 0.22);
const raw = Array.from({ length: days }, (_, i) => {
  const d = new Date(FIRST + i * DAY);
  if (rand() < 0.07) return 0;
  const weekend = d.getUTCDay() % 6 === 0 ? 0.8 : 1;
  const summer = [6, 7].includes(d.getUTCMonth()) ? 0.75 : 1;
  return (0.7 + 0.6 * (i / days) + 0.25 * Math.sin(i / 97)) * weekend * summer * Math.exp(0.55 * normal());
});
const scale = (TOTAL - 330) / raw.reduce((a, b) => a + b, 0);
const perDay = raw.map((r) => Math.round(r * scale));
perDay[repeatDay] = 330;

// Sessions start at these local hours, weighted towards commutes, afternoons
// and evenings.
const hourCum = cumulative([3, 2, 1, 0.5, 0.2, 0.2, 0.5, 2, 4, 3, 2, 2, 2.5, 2.5, 3, 3, 3.5, 3.5, 3, 3, 4, 4.5, 4.5, 4]);
const tz = config.timezones[0].tz;
// UTC for a wall-clock time in tz, inverting time.ts.
const toUtc = (local: number) => {
  let utc = local;
  for (let i = 0; i < 2; i++) utc = local - (wallClock(utc) + config.dayStartsAt * 3_600_000 - utc);
  return utc;
};

type Play = { at: number; artist: Artist; album: Album; track: Album["tracks"][number] };
const plays: Play[] = [];
perDay.forEach((count, i) => {
  const day = FIRST + i * DAY;
  const loop = i === repeatDay ? pick(albums.slice(0, 40)) : null;
  const sessions = Math.max(1, Math.round(count / int(8, 18)));
  let left = count;
  for (let s = 0; s < sessions && left > 0; s++) {
    const n = s === sessions - 1 ? left : Math.min(left, Math.max(1, Math.round((count / sessions) * (0.5 + rand()))));
    left -= n;
    let t = day + weighted(hourCum) * 3_600_000 + rand() * 3_600_000;
    let queue: Play[] = [];
    for (let k = 0; k < n; k++) {
      if (!queue.length) {
        // An album start to finish, or a few of an artist's songs.
        const artist = loop ? artists.find((a) => a.albums.includes(loop))! : artists[weighted(artistsFor(day))];
        const album = loop ?? artist.albums[weighted(cumulative(artist.albums.map((b) => Math.exp(-(((day - b.release) / (0.5 * artist.spread)) ** 2) / 2) + 0.05)))];
        const tracks = loop || rand() < 0.3 ? album.tracks : album.tracks.filter(() => rand() < 0.35);
        queue = (tracks.length ? tracks : [pick(album.tracks)]).map((track) => ({ at: 0, artist, album, track }));
      }
      const play = queue.shift()!;
      t += play.track.len;
      plays.push({ ...play, at: toUtc(t) });
    }
  }
});
plays.sort((a, b) => a.at - b.at);

// ---- write --------------------------------------------------------------

mkdirSync("data", { recursive: true });
rmSync("data/covers", { recursive: true, force: true });
rmSync("data/track-covers.json", { force: true });
mkdirSync("data/covers");

const csvField = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s);
writeFileSync(
  config.csv,
  ["played_at,track,artists,album,track_id,context_uri,context_name,source"]
    .concat(
      plays.map((p) =>
        [new Date(p.at).toISOString(), p.track.name, p.artist.name, p.album.name, p.track.id, p.album.uri, p.album.name, "demo"]
          .map(csvField)
          .join(","),
      ),
    )
    .join("\n") + "\n",
);
const coverPlays: CoverPlay[] = plays.map((p) => ({ ms: p.at, artist: p.artist.name, album: p.album.name, cover: p.album.cover }));
writeFileSync("data/plays.json", JSON.stringify(coverPlays));
console.log(`${plays.length.toLocaleString("en-GB")} plays of ${artists.length.toLocaleString("en-GB")} artists in ${tz} -> ${config.csv}, data/plays.json`);

// ---- covers -------------------------------------------------------------

// Each album gets an abstract cover in its own colours, at 640 px and the
// 64 px the cover posters tile with (the names covers.ts expects).
const big = createCanvas(640, 640), small = createCanvas(64, 64);
const ctx = big.getContext("2d"), sctx = small.getContext("2d");
sctx.imageSmoothingQuality = "high";
for (const [i, album] of albums.entries()) {
  drawCover(album);
  writeFileSync(`data/covers/large-${album.cover.replace(/^ab67616d00004851/, "ab67616d0000b273")}.jpg`, await big.encode("jpeg", 82));
  sctx.drawImage(big, 0, 0, 64, 64);
  writeFileSync(`data/covers/${album.cover}.jpg`, await small.encode("jpeg", 90));
  if ((i + 1) % 200 === 0) process.stdout.write(`\r${i + 1} covers`);
}
console.log(`\r${albums.length.toLocaleString("en-GB")} covers -> data/covers/`);

process.exit(spawnSync(process.execPath, ["src/posters.ts"], { stdio: "inherit" }).status ?? 1);

function drawCover(album: Album) {
  const h = rand() * 360, dark = rand() < 0.35;
  const hsl = (dh: number, s: number, l: number) => `hsl(${(h + dh + 360) % 360} ${s}% ${dark ? l * 0.45 : l}%)`;
  const c = [hsl(0, 55 + 35 * rand(), 50 + 20 * rand()), hsl(pick([30, 150, 180, 210]), 60, 55), hsl(-25, 40, 85), hsl(10, 70, 25)];
  const S = 640;
  ctx.save();
  ctx.fillStyle = c[2];
  ctx.fillRect(0, 0, S, S);
  switch (int(0, 5)) {
    case 0: { // horizon and sun
      const g = ctx.createLinearGradient(0, 0, 0, S);
      g.addColorStop(0, c[0]);
      g.addColorStop(1, c[3]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, S, S);
      ctx.fillStyle = c[1];
      ctx.beginPath();
      ctx.arc(S * (0.3 + 0.4 * rand()), S * (0.35 + 0.3 * rand()), S * (0.15 + 0.15 * rand()), 0, 2 * Math.PI);
      ctx.fill();
      break;
    }
    case 1: { // stripes
      const n = int(3, 9);
      for (let k = 0; k < n; k++) {
        ctx.fillStyle = c[k % c.length];
        ctx.fillRect(0, (k * S) / n, S, S / n + 1);
      }
      break;
    }
    case 2: { // tiles
      const n = int(3, 6);
      for (let x = 0; x < n; x++)
        for (let y = 0; y < n; y++) {
          ctx.fillStyle = pick(c);
          ctx.fillRect((x * S) / n, (y * S) / n, S / n + 1, S / n + 1);
        }
      break;
    }
    case 3: { // rings
      ctx.fillStyle = c[3];
      ctx.fillRect(0, 0, S, S);
      const n = int(4, 10);
      for (let k = n; k > 0; k--) {
        ctx.fillStyle = c[k % 3];
        ctx.beginPath();
        ctx.arc(S / 2, S / 2, (k * S * 0.7) / n, 0, 2 * Math.PI);
        ctx.fill();
      }
      break;
    }
    case 4: { // blurred colour fields
      ctx.fillStyle = c[3];
      ctx.fillRect(0, 0, S, S);
      for (let k = 0; k < 5; k++) {
        const x = rand() * S, y = rand() * S, r = S * (0.3 + 0.4 * rand());
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, c[k % 3]);
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, S, S);
      }
      break;
    }
    default: { // a diagonal split under the title
      ctx.fillStyle = c[0];
      ctx.beginPath();
      ctx.moveTo(0, S * rand());
      ctx.lineTo(S, S * rand());
      ctx.lineTo(S, S);
      ctx.lineTo(0, S);
      ctx.fill();
      ctx.fillStyle = c[3];
      ctx.font = `700 ${int(48, 72)}px "${config.font}"`;
      ctx.fillText(album.name.toUpperCase(), 40, 100, S - 80);
    }
  }
  ctx.restore();
}

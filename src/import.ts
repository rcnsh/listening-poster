// Imports a Spotify Extended Streaming History export (the folder or the .zip)
// into the same data/plays.csv and data/plays.json the music-warehouse
// fetchers write, then looks up each track's cover through Spotify's public
// oEmbed endpoint and downloads it. Filtering follows music-warehouse's
// importer (src/import.ts there): track URIs only, no skips under 30 s.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { config } from "./config.ts";
import { type CoverPlay, downloadCovers, get, HttpError, pool, smallCover } from "./covers.ts";

const MIN_PLAY_MS = 30_000;
const CACHE = "data/track-covers.json";

// One record. endTime, trackName, artistName and msPlayed are the older
// one-year "Account data" export's names; that export has no track URIs.
type ExportRecord = {
  ts?: string | null;
  ms_played?: number | null;
  spotify_track_uri?: string | null;
  master_metadata_track_name?: string | null;
  master_metadata_album_artist_name?: string | null;
  master_metadata_album_album_name?: string | null;
  endTime?: string | null;
  msPlayed?: number | null;
  trackName?: string | null;
  artistName?: string | null;
};
type Play = { ms: number; trackId: string | null; track: string; artist: string; album: string | null };

const input = process.argv[2];
if (!input) {
  console.error("usage: pnpm import:spotify <export folder or .zip>");
  process.exit(1);
}

// ---- read ---------------------------------------------------------------

// Extended export: Streaming_History_Audio_*.json, or endsong_*.json before
// 2023 (video files are skipped). One-year export: StreamingHistory0.json or
// StreamingHistory_music_0.json.
const AUDIO = /^(Streaming_History_Audio_.*|endsong_\d+)\.json$/;
const OLD = /^StreamingHistory(_music_)?\d+\.json$/;
const wanted = (name: string) => AUDIO.test(basename(name)) || OLD.test(basename(name));

function readFolder(dir: string): Array<[string, string]> {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter(wanted)
    .sort()
    .map((f) => [f, readFileSync(join(dir, f), "utf8")]);
}

// Just enough of the zip format for Spotify's export: stored or deflated
// entries listed in the central directory, no zip64.
function readZip(path: string): Array<[string, string]> {
  const buf = readFileSync(path);
  // The end record sits before a comment of up to 64 KiB.
  let eocd = buf.length - 22;
  const stop = Math.max(0, eocd - 0xffff);
  while (eocd >= stop && !(buf.readUInt32LE(eocd) === 0x06054b50 && eocd + 22 + buf.readUInt16LE(eocd + 20) === buf.length)) eocd--;
  if (eocd < stop) throw new Error(`${path} is not a zip file`);
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || p === 0xffffffff) throw new Error(`${path} is a zip64 archive; unzip it and pass the folder`);
  const files: Array<[string, string]> = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error(`${path}: bad central directory`);
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
    if (!wanted(name)) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    if (method !== 0 && method !== 8) throw new Error(`${name}: unsupported compression; unzip it and pass the folder`);
    files.push([name, (method === 8 ? inflateRawSync(data) : data).toString("utf8")]);
  }
  return files.sort((a, b) => a[0].localeCompare(b[0]));
}

let files = statSync(input).isDirectory() ? readFolder(input) : readZip(input);
// Both exports side by side would count the overlapping year twice.
if (files.some(([f]) => AUDIO.test(basename(f)))) files = files.filter(([f]) => AUDIO.test(basename(f)));
if (!files.length) throw new Error(`no Streaming_History_Audio_*.json files in ${input}`);

// ---- normalise ----------------------------------------------------------

const plays = new Map<string, Play>();
let noTrack = 0, short = 0, oldFormat = 0;
for (const [name, text] of files) {
  for (const r of JSON.parse(text) as ExportRecord[]) {
    // `ts` is when playback ended, in UTC: the moment the API calls played_at.
    // The old export's endTime is the same, as "YYYY-MM-DD HH:MM" in UTC.
    const old = r.ts == null && r.endTime != null;
    const uri = r.spotify_track_uri;
    if (!old && !uri?.startsWith("spotify:track:")) {
      noTrack++; // podcasts, audiobooks, local files
      continue;
    }
    const played = r.ms_played ?? r.msPlayed;
    if (typeof played === "number" && played < MIN_PLAY_MS) {
      short++;
      continue;
    }
    const ms = old ? Date.parse(`${r.endTime!.replace(" ", "T")}Z`) : Date.parse(r.ts!);
    if (!Number.isFinite(ms)) {
      console.warn(`${name}: skipping a record with an unreadable time`);
      continue;
    }
    if (old) oldFormat++;
    const trackId = old ? null : uri!.slice("spotify:track:".length);
    const track = r.master_metadata_track_name ?? r.trackName ?? "";
    // The album artist is all the export carries: featured artists are absent.
    const artist = r.master_metadata_album_artist_name ?? r.artistName ?? "";
    const album = r.master_metadata_album_album_name ?? null;
    plays.set(`${ms}:${trackId ?? `${track}\n${artist}`}`, { ms, trackId, track, artist, album });
  }
}
const sorted = [...plays.values()].sort((a, b) => b.ms - a.ms);
console.log(
  `${files.length} files: ${sorted.length} plays, ${short} skips under 30 s and ${noTrack} non-track records dropped`,
);
if (!sorted.length) throw new Error("no plays to import");
if (oldFormat) {
  console.warn(
    `warning: ${oldFormat} plays come from the one-year "Account data" export, which has no track IDs or albums. ` +
      "They draw on the dots poster but are blank on the covers poster. Request the Extended streaming history for covers.",
  );
}

// ---- write --------------------------------------------------------------

const csvField = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s);
mkdirSync("data", { recursive: true });
writeFileSync(
  config.csv,
  ["played_at,track,artists,album,track_id,context_uri,context_name,source"]
    .concat(
      sorted.map((p) =>
        [new Date(p.ms).toISOString(), p.track, p.artist, p.album ?? "", p.trackId ?? "", "", "", "spotify-export"]
          .map(csvField)
          .join(","),
      ),
    )
    .join("\n") + "\n",
);
console.log(`-> ${config.csv}`);

// ---- covers -------------------------------------------------------------

// Track ID -> 64 px cover image ID, or null when Spotify has no such track.
// Kept between runs so a re-import only looks up tracks it hasn't seen.
const cache: Record<string, string | null> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
const ids = [...new Set(sorted.map((p) => p.trackId).filter((id): id is string => !!id))];
const todo = ids.filter((id) => !(id in cache));
console.log(`${ids.length} tracks, ${todo.length} covers to look up`);
let looked = 0, failed = 0;
await pool(todo, 4, async (id) => {
  try {
    const url = `https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/track/${id}`)}`;
    const { thumbnail_url } = (await (await get(url)).json()) as { thumbnail_url?: string };
    cache[id] = thumbnail_url ? smallCover(thumbnail_url.split("/").pop()!) : null;
  } catch (e) {
    // A track Spotify no longer has answers 4xx; remember that. Anything
    // else, including a 429 that outlasted the retries, is left out of the
    // cache so the next run tries again.
    if (e instanceof HttpError && e.status >= 400 && e.status < 500 && e.status !== 429) cache[id] = null;
    else failed++;
    console.warn(`\n${id}: ${(e as Error).message}`);
  }
  if (++looked % 100 === 0) {
    writeFileSync(CACHE, JSON.stringify(cache));
    process.stdout.write(`\r${looked} looked up`);
  }
});
writeFileSync(CACHE, JSON.stringify(cache));
if (todo.length) console.log(`\r${looked} looked up${failed ? `, ${failed} failed (re-run to retry)` : ""}`);

const coverPlays: CoverPlay[] = sorted.map((p) => ({
  ms: p.ms,
  artist: p.artist || "Unknown",
  album: p.album,
  cover: p.trackId ? (cache[p.trackId] ?? null) : null,
}));
writeFileSync("data/plays.json", JSON.stringify(coverPlays));
console.log("-> data/plays.json");
await downloadCovers(coverPlays);

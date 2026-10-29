// Pages /api/plays for every play's album cover, then downloads each cover
// once from Spotify's image CDN (no Web API calls, so no quota cost).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const base = process.env.MW_URL ?? "https://music-api.rcn.sh";
const token =
  process.env.MW_TOKEN ??
  execFileSync("security", ["find-generic-password", "-s", "music-warehouse-mcp", "-w"], {
    encoding: "utf8",
  }).trim();
const headers = { authorization: `Bearer ${token}`, "user-agent": "Mozilla/5.0 listening-poster" };

async function get(url: string): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers });
    if (res.ok) return res;
    if (attempt >= 5 || (res.status !== 429 && res.status < 500)) throw new Error(`${res.status} ${url}`);
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
  }
}

type ApiPlay = { played_at_ms: number; artists: string | null; album_name: string | null; image_url: string | null };
export type CoverPlay = { ms: number; artist: string; album: string | null; cover: string | null };

const plays: CoverPlay[] = [];
let before: string | null = "";
while (before !== null) {
  const q = before ? `&before=${encodeURIComponent(before)}` : "";
  const page = (await (await get(`${base}/api/plays?limit=500${q}`)).json()) as {
    plays: ApiPlay[];
    next_before: string | null;
  };
  for (const p of page.plays) {
    plays.push({
      ms: p.played_at_ms,
      artist: p.artists?.split(", ")[0] ?? "Unknown",
      album: p.album_name,
      // The 64 px rendition of the same image: ab67616d00004851 instead of 0000b273.
      cover: p.image_url?.split("/").pop()?.replace(/^ab67616d0000b273/, "ab67616d00004851") ?? null,
    });
  }
  before = page.next_before;
  process.stdout.write(`\r${plays.length} plays`);
}
mkdirSync("data/covers", { recursive: true });
writeFileSync("data/plays.json", JSON.stringify(plays));

const ids = [...new Set(plays.map((p) => p.cover).filter((c): c is string => !!c))];
const missing = ids.filter((id) => !existsSync(`data/covers/${id}.jpg`));
console.log(`\n${ids.length} covers, ${missing.length} to download`);
let done = 0;
const worker = async () => {
  for (let id = missing.pop(); id; id = missing.pop()) {
    try {
      writeFileSync(`data/covers/${id}.jpg`, Buffer.from(await (await get(`https://i.scdn.co/image/${id}`)).arrayBuffer()));
    } catch (e) {
      console.warn(`\n${id}: ${(e as Error).message}`);
    }
    if (++done % 100 === 0) process.stdout.write(`\r${done} downloaded`);
  }
};
await Promise.all(Array.from({ length: 12 }, worker));
console.log(`\r${done} downloaded`);

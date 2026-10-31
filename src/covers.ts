// Shared by both cover sources: the play shape render-covers.ts reads, and
// downloading covers once each from Spotify's image CDN into data/covers/.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

export type CoverPlay = { ms: number; artist: string; album: string | null; cover: string | null };

const userAgent = "Mozilla/5.0 listening-poster";

// GET with retries on 429 and 5xx, honouring Retry-After when it is given.
export async function get(url: string, headers: Record<string, string> = {}): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { "user-agent": userAgent, ...headers } });
    if (res.ok) return res;
    if (attempt >= 5 || (res.status !== 429 && res.status < 500)) throw new HttpError(res.status, url);
    const after = Number(res.headers.get("retry-after"));
    await new Promise((r) => setTimeout(r, after > 0 ? after * 1000 : 2000 * 2 ** attempt));
  }
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, url: string) {
    super(`${status} ${url}`);
    this.status = status;
  }
}

// Runs fn over items with at most `limit` in flight.
export async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  const worker = async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await fn(item);
  };
  await Promise.all(Array.from({ length: limit }, worker));
}

// The 64 px rendition of an album image ID: ab67616d00004851 instead of
// 0000b273 (640 px) or 00001e02 (300 px).
export const smallCover = (id: string) => id.replace(/^ab67616d0000[0-9a-f]{4}/, "ab67616d00004851");

// The 640 px rendition of a 64 px cover ID, downloaded once into
// data/covers/. Null when it can't be fetched (missing, rate-limited past the
// retries, offline), so the caller can fall back to the 64 px file.
export async function largeCover(id: string): Promise<string | null> {
  const big = id.replace(/^ab67616d00004851/, "ab67616d0000b273");
  const path = `data/covers/large-${big}.jpg`;
  if (!existsSync(path)) {
    try {
      const body = Buffer.from(await (await get(`https://i.scdn.co/image/${big}`)).arrayBuffer());
      mkdirSync("data/covers", { recursive: true });
      writeFileSync(path, body);
    } catch {
      return null;
    }
  }
  return path;
}

export async function downloadCovers(plays: CoverPlay[]) {
  mkdirSync("data/covers", { recursive: true });
  const ids = [...new Set(plays.map((p) => p.cover).filter((c): c is string => !!c))];
  const missing = ids.filter((id) => !existsSync(`data/covers/${id}.jpg`));
  console.log(`${ids.length} covers, ${missing.length} to download`);
  let done = 0;
  await pool(missing, 12, async (id) => {
    try {
      writeFileSync(`data/covers/${id}.jpg`, Buffer.from(await (await get(`https://i.scdn.co/image/${id}`)).arrayBuffer()));
    } catch (e) {
      console.warn(`\n${id}: ${(e as Error).message}`);
    }
    if (++done % 100 === 0) process.stdout.write(`\r${done} downloaded`);
  });
  console.log(`\r${done} downloaded`);
}

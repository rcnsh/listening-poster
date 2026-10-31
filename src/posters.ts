// One command for every poster: optionally import or fetch the data, then
// render the posters named on the command line (all four by default).
// Each step runs as its own node process, the same as its pnpm script.
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { parseArgs } from "node:util";
import { config } from "./config.ts";

type Poster = { script: string; about: string; size: string; out: string; needs: string[] };
const POSTERS: Record<string, Poster> = {
  dots: {
    script: "src/render.ts",
    about: "every play as a dot: date across, time of day down, colour by artist",
    size: "A2 landscape",
    out: config.out,
    needs: [config.csv],
  },
  covers: {
    script: "src/render-covers.ts",
    about: "every play as its album cover, in order, one band per year",
    size: "A1 portrait",
    out: config.covers.out,
    needs: ["data/plays.json", "data/covers"],
  },
  calendar: {
    script: "src/render-calendar.ts",
    about: "one square per day, shaded by how much you listened",
    size: "A2 portrait",
    out: config.calendar.out,
    needs: [config.csv],
  },
  months: {
    script: "src/render-months.ts",
    about: "the most-played album cover of every month",
    size: "A1 landscape",
    out: config.months.out,
    needs: ["data/plays.json", "data/covers"],
  },
};
const NAMES = Object.keys(POSTERS);

const HELP = `Make listening posters from your Spotify history.

Usage
  npm run posters -- [poster ...] [options]
  pnpm posters [poster ...] [options]

Posters (default: all)
${NAMES.map((k) => `  ${k.padEnd(10)}${POSTERS[k].about}\n  ${"".padEnd(10)}${POSTERS[k].size} -> ${POSTERS[k].out}`).join("\n")}
  all       all four

Options
  -i, --import <path>  import a Spotify export first (the .zip or its folder)
  -f, --fetch          fetch from a music-warehouse instance first (MW_URL, MW_TOKEN)
  -l, --list           show each poster and whether its data is ready, then stop
  -h, --help           show this help

Examples
  npm run posters -- --import ~/Downloads/my_spotify_data.zip
  npm run posters -- calendar months
  npm run posters -- --list

Settings (titles, time zones, start date, colours) live in src/config.ts;
override them in src/config.local.ts. See the README.`;

let args;
try {
  args = parseArgs({
    allowPositionals: true,
    options: {
      import: { type: "string", short: "i" },
      fetch: { type: "boolean", short: "f" },
      list: { type: "boolean", short: "l" },
      help: { type: "boolean", short: "h" },
    },
  });
} catch (e) {
  fail(`${(e as Error).message}\n\nRun with --help for usage.`);
}
const { values: opts, positionals } = args;

if (opts.help) {
  console.log(HELP);
  process.exit(0);
}

const unknown = positionals.filter((p) => p !== "all" && !(p in POSTERS));
if (unknown.length) fail(`Unknown poster: ${unknown.join(", ")}. Choose from ${NAMES.join(", ")} or all.`);
const chosen = !positionals.length || positionals.includes("all") ? NAMES : [...new Set(positionals)];
if (opts.import && opts.fetch) fail("Use --import or --fetch, not both.");

const missing = (p: Poster) => p.needs.filter((f) => !existsSync(f));

if (opts.list) {
  for (const k of NAMES) {
    const p = POSTERS[k];
    const gaps = missing(p);
    const state = gaps.length ? `needs ${gaps.join(", ")}` : existsSync(p.out) ? `ready, last made ${statSync(p.out).mtime.toLocaleString("en-GB")}` : "ready";
    console.log(`${k.padEnd(10)}${p.size.padEnd(14)}${p.out.padEnd(22)}${state}`);
  }
  process.exit(0);
}

// ---- data ---------------------------------------------------------------

if (opts.import) {
  step("Importing", ["src/import.ts", opts.import]);
} else if (opts.fetch) {
  // Each fetcher only when a chosen poster reads its output.
  if (chosen.some((k) => POSTERS[k].needs.includes(config.csv))) step("Fetching plays", ["src/fetch.ts"]);
  if (chosen.some((k) => POSTERS[k].needs.includes("data/plays.json"))) step("Fetching covers", ["src/fetch-covers.ts"]);
}

const notReady = chosen.filter((k) => missing(POSTERS[k]).length);
if (notReady.length) {
  fail(
    `No data for ${notReady.join(", ")} yet (missing ${[...new Set(notReady.flatMap((k) => missing(POSTERS[k])))].join(", ")}).\n` +
      "Import a Spotify export first:  npm run posters -- --import <export .zip or folder>",
  );
}

// ---- render -------------------------------------------------------------

const made: string[] = [];
for (const k of chosen) {
  const seconds = step(`Rendering ${k}`, [POSTERS[k].script]);
  made.push(`  ${k.padEnd(10)}${POSTERS[k].out}  (${seconds}s)`);
}
console.log(`\nDone:\n${made.join("\n")}\nEach has a small *-preview.png beside it.`);

// Runs one script with node, streaming its output; exits if it fails.
function step(label: string, argv: string[]) {
  console.log(`\n== ${label}`);
  const t0 = Date.now();
  const res = spawnSync(process.execPath, argv, { stdio: "inherit" });
  if (res.status !== 0) fail(`${label} failed (exit ${res.status ?? res.signal}).`);
  return ((Date.now() - t0) / 1000).toFixed(1);
}

function fail(message: string): never {
  console.error(`\n${message}`);
  process.exit(1);
}

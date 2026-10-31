// Settings for both posters. These are neutral defaults; put your own values
// in src/config.local.ts (gitignored), which is merged over them:
//
//   export default {
//     title: "Every song I played",
//     footer: "me · music-warehouse",
//     start: "2020-01-01",
//     timezones: [{ from: "2000-01-01", tz: "Europe/London" }],
//     covers: { title: "Every song I played, by its cover" },
//   };
import { existsSync } from "node:fs";

const defaults = {
  csv: "data/plays.csv",
  out: "out/poster.png",
  preview: "out/preview.png",

  title: "Every song played",
  // Bottom-right corner, e.g. "name · source". Empty draws nothing.
  footer: "",

  // First day drawn, YYYY-MM-DD. Null starts at the first play; set it to
  // drop a sparse early stretch.
  start: null as string | null,

  // Local time is wherever you were. Each entry applies from its date on,
  // and a later entry is marked on the dots poster. The default is this
  // machine's time zone throughout.
  timezones: [{ from: "2000-01-01", tz: Intl.DateTimeFormat().resolvedOptions().timeZone }],

  // The day runs from this hour to the same hour next morning, so late
  // nights stay with the evening before them.
  dayStartsAt: 5,

  // A2 landscape at 300 dpi.
  width: 7016,
  height: 4961,

  // The most-played artists get a colour; everyone else is grey.
  colours: [
    "#ff5a4e", "#3cc8ff", "#ff8ad6", "#ffd23c", "#ff9a3c", "#9b86ff",
    "#6ef08a", "#4a7dff", "#c6f03c", "#2fe0bf", "#e8b98a", "#ff4f9a",
  ],
  other: "rgba(150, 150, 170, 0.38)",
  background: "#0a0a0f",
  ink: "#ececf2",
  muted: "#6e6e80",
  font: "Avenir Next",

  // The album-cover mosaic (pnpm render:covers): A1 portrait at 300 dpi.
  covers: {
    out: "out/covers.png",
    preview: "out/covers-preview.png",
    title: "Every song played, by its cover",
    width: 7016,
    height: 9933,
    gap: 2,
    blank: "#1b1b24",
  },
};

type Config = typeof defaults;
type Local = Partial<Omit<Config, "covers">> & { covers?: Partial<Config["covers"]> };

const local: Local = existsSync(new URL("./config.local.ts", import.meta.url))
  ? (await import("./config.local.ts")).default
  : {};

export const config: Config = { ...defaults, ...local, covers: { ...defaults.covers, ...local.covers } };

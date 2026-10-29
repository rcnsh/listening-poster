// Everything personal lives here; the render scripts only read this file.

export const config = {
  csv: "data/plays.csv",

  // Plays before this are too sparse to draw (about 50 between 2017 and 2019).
  start: "2020-01-01",

  // Local time is wherever you were. Each entry applies from its date on.
  // The Singapore date is where the listening hours jump by 8 hours.
  timezones: [
    { from: "2000-01-01", tz: "Europe/London" },
    { from: "2026-07-28", tz: "Asia/Singapore" },
  ],

  // The day runs from this hour to the same hour next morning, so late
  // nights stay with the evening before them.
  dayStartsAt: 5,

  // pnpm render: one dot per play. A2 landscape at 300 dpi.
  dots: {
    out: "out/poster.png",
    preview: "out/preview.png",
    width: 7016,
    height: 4961,
    // The most-played artists get a colour; everyone else is grey.
    colours: [
      "#ff5a4e", "#3cc8ff", "#ff8ad6", "#ffd23c", "#ff9a3c", "#9b86ff",
      "#6ef08a", "#4a7dff", "#c6f03c", "#2fe0bf", "#e8b98a", "#ff4f9a",
    ],
    other: "rgba(160, 160, 185, 0.4)",
    background: ["#120f24", "#06060b"],
  },

  // pnpm render:covers: every play as its album cover. A1 portrait at 300 dpi.
  covers: {
    out: "out/covers.png",
    preview: "out/covers-preview.png",
    width: 7016,
    height: 9933,
    gap: 3,
    radius: 4,
    blank: "#2a2a30",
    paper: ["#f3efe8", "#e7e1d7"],
  },
};

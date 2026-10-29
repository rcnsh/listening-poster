// Everything personal lives here; src/render.ts only reads this file.

export const config = {
  csv: "data/plays.csv",
  out: "out/poster.png",
  preview: "out/preview.png",

  title: "Every song I played",
  author: "rcnsh",

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
};

import { config } from "./config.ts";

const zones = config.timezones.map((z) => ({
  from: Date.parse(`${z.from}T00:00:00Z`),
  fmt: new Intl.DateTimeFormat("en-GB", {
    timeZone: z.tz,
    hourCycle: "h23",
    year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric",
  }),
}));

// Wall-clock time where the play happened, as if it were UTC, shifted so the
// day starts at config.dayStartsAt.
export function wallClock(ms: number) {
  const zone = zones.findLast((z) => ms >= z.from) ?? zones[0];
  const p = Object.fromEntries(zone.fmt.formatToParts(ms).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - config.dayStartsAt * 3_600_000;
}

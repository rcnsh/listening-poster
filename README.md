# listening-poster

Four print posters of a Spotify listening history:

- **Dots** (A2 landscape): every play is one dot. Across is the date, down is the local time of day, and the colour is the artist.
- **Covers** (A1 portrait): every play is its album cover, in order, with one band per year and the year's most-played album shown large.
- **Calendar** (A2 portrait): one square per day, shaded by how many plays it had, with each year's total and most-played artist.
- **Album of the month** (A1 landscape): the most-played album cover of every month, one row per year.

The plays come from a Spotify streaming history export, or from a [music-warehouse](https://github.com/rcnsh/music-warehouse) instance if you run one.

```sh
pnpm install   # Node 23.6 or later, which runs the TypeScript directly
```

## Extended export

1. On Spotify's [privacy page](https://www.spotify.com/account/privacy/), under "Download your data", tick **Extended streaming history** and request it. Spotify says it can take up to 30 days. It arrives as a link to a `.zip`.
2. Import it. Pass the `.zip` or the unzipped folder:

   ```sh
   pnpm import:spotify ~/Downloads/my_spotify_data.zip
   ```

3. Render:

   ```sh
   pnpm render            # out/poster.png (A2, 300 dpi) and out/preview.png
   pnpm render:covers     # out/covers.png (A1, 300 dpi) and out/covers-preview.png
   pnpm render:calendar   # out/calendar.png (A2, 300 dpi) and out/calendar-preview.png
   pnpm render:months     # out/months.png (A1, 300 dpi) and out/months-preview.png
   ```

   The dots and calendar posters need only `data/plays.csv`; the covers and album-of-the-month posters also need the covers the import downloads. Album of the month fetches each month's cover once more at 640 px.

The import reads every `Streaming_History_Audio_*.json` (`endsong_*.json` in exports from before 2023) and skips the video files. It keeps only song plays: podcast episodes, audiobooks and local files have no track ID and are dropped. So are plays under 30 seconds, which Spotify logs but doesn't count as plays. Each play is timed by when it stopped, in UTC.

The export names only the album artist, so featured artists don't appear: a track "by" two artists counts for the album's artist only.

Covers come from Spotify's public oEmbed endpoint, one request per distinct track and no account needed. The import caches the results in `data/track-covers.json`, so a re-run only looks up new tracks. If some lookups fail, run the import again. Album names come from the export.

The one-year "Account data" export (`StreamingHistory_music_*.json`) also imports, but it has no track IDs or albums. Its plays draw on the dots poster and show as blank tiles on the covers poster.

## music-warehouse

If you run music-warehouse, fetch from its API instead of importing:

```sh
pnpm fetch           # /api/plays.csv into data/plays.csv
pnpm fetch:covers    # pages /api/plays into data/plays.json and downloads each cover once
pnpm render
pnpm render:covers
pnpm render:calendar
pnpm render:months
```

Both fetchers read `MW_URL` and `MW_TOKEN`. On macOS the token falls back to the Keychain entry `music-warehouse-mcp`.

## Settings

`src/config.ts` holds the titles, footer, first day, time zones, size and palette. By default the posters start at the first play and use this machine's time zone throughout. To use your own values, create `src/config.local.ts` (it's gitignored). It's merged over the defaults:

```ts
export default {
  title: "Every song I played",
  footer: "me · Spotify",
  start: "2020-01-01", // drop a sparse early stretch
  // Where you were, each from its date on. A move is marked on the dots poster.
  timezones: [
    { from: "2000-01-01", tz: "Europe/London" },
    { from: "2024-07-28", tz: "Asia/Singapore" },
  ],
  covers: { title: "Every song I played, by its cover" },
  calendar: { title: "Days I listened" },
};
```

Each poster's own settings (`covers`, `calendar`, `months`) merge key by key, so you can change one title without repeating the rest. A day runs from 5 am to 5 am (`dayStartsAt`) on every poster, so a 1 am play counts for the evening before.

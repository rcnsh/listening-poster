# listening-poster

Every Spotify play in a [music-warehouse](https://github.com/rcnsh/music-warehouse) history as one dot on a print-size poster: across is the date, down is the local time of day, colour is the artist.

```sh
pnpm install
pnpm fetch    # downloads /api/plays.csv into data/
pnpm render   # writes out/poster.png (A2, 300 dpi) and out/preview.png
```

`pnpm fetch` reads `MW_URL` and `MW_TOKEN`, falling back to the Keychain entry `music-warehouse-mcp`. Title, start date, time zones, size and palette are in `src/config.ts`.

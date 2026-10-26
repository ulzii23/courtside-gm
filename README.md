# Courtside GM

A fantasy-draft basketball GM sim. Pick any season from 2007-08 to 2025-26, draft that year's real players
against 29 AI teams, set your rotation and game plan, and simulate a full season, play-in, playoffs and future seasons.

Fan-made. Not affiliated with, endorsed by, or sponsored by the NBA, its teams, or the NBPA.

## Run it

    npm install
    npm run dev

Saves are kept in your browser (IndexedDB). To play on your phone, run `npm run dev -- --host` and open the Network URL it prints (same Wi-Fi).

## Data

`public/data/<year>.json` is built from Basketball-Reference season pages (per-game and advanced stats):

    npm run fetch-data            # all seasons 2008..2026 (season end years)
    npm run fetch-data 2027 2027  # add a single season later

Pages are cached in `scripts/.cache` and requested at most once every 4 seconds.
Headshots are loaded from Basketball-Reference at runtime (`headshotUrl` in `src/data/teams.ts`).

## How it works

- `src/engine/ratings.ts` turns real stats into 14 ratings (each is a linear map of one real stat, so the
  sim reproduces real production), plus personality traits, overall/potential, aging and fictional rookies.
- `src/engine/sim.ts` simulates every possession: usage, shot selection, makes vs. defenders on the floor,
  assists, rebounds, steals, blocks, fouls, fatigue, substitutions, clutch time, injuries, technicals.
- `src/engine/league.ts` holds the fantasy draft AI, rotations, morale and chemistry, schedule, playoffs, awards
  and the season rollover.
- `npm run sim-test` sims two full seasons headless and prints league averages and leaders as a sanity check.

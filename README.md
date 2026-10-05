# Commit Forest

A pixel forest for your GitHub profile. Every day you contribute plants a tree. Trees grow
older with you, a break of two weeks or more becomes a pond, and nothing ever dies.

The forest is drawn by the engine of [Memory Forest](https://ankiweb.net/shared/info/1255432496), an
Anki add-on where study days grow the same trees.

## Set it up

1. In your profile repository (the one named after you, `<you>/<you>`), add a file called
   `.github/workflows/forest.yml` with this in it, and commit it:

   ```yaml
   name: forest
   on:
     schedule: [{ cron: "17 4 * * *" }]   # once a day
     workflow_dispatch:
     push: { paths: [.github/workflows/forest.yml] }
   permissions:
     contents: write
   jobs:
     grow:
       runs-on: ubuntu-latest
       steps:
         - uses: baraklevy20/commit-forest@v1
           with:
             scenery: golden_lake
             dark_scenery: aurora
   ```

2. The workflow runs as soon as the file is committed. After about a minute, its run
   summary (Actions, then the latest "forest" run) shows a snippet for your README.

3. Paste the snippet into your README.md:

   ```html
   <a href="https://github.com/baraklevy20/commit-forest">
     <picture>
       <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/<you>/<you>/output/forest-dark.png">
       <img alt="My contribution forest" src="https://raw.githubusercontent.com/<you>/<you>/output/forest.png">
     </picture>
   </a>
   ```

No token or secret is needed. If "Include private contributions" is on in your profile
settings, private work counts too, as the number of contributions only.

## Settings

| Input | Default | |
|---|---|---|
| `scenery` | `golden_lake` | `golden_lake`, `misty_valley`, `aurora`, `lanterns`, `bamboo` or `synthwave` |
| `dark_scenery` | `aurora` | Shown to people who use GitHub in dark mode. Empty for none. |
| `period` | `last-year` | `last-year` for the same year as the calendar on your profile (the numbers match it), `this-year` for the current calendar year, `all` for your whole history, or a year such as `2025` |
| `stats` | `true` | The number of trees and contributions, in small pixel letters at the bottom |
| `timezone` | none | Your time zone, such as `Europe/Berlin`. The light image then shows dawn, day, golden hour, dusk or night where you are. Change the schedule to `cron: "0 * * * *"` so it redraws every hour. |
| `format` | `apng` | `apng` (animated PNG), `gif`, or `png` (still) |
| `branch` | `output` | Where the images go. It holds only the latest images. |

`@v1` always points at the latest 1.x release, so fixes reach you without changing
anything. To stay on one release, use its full tag, such as `@v1.0.0`.

## How the forest grows

- One tree for each day with at least one contribution, as counted by your contribution calendar.
- Trees grow with age: a sapling, then young, mature, old, and ancient after a year.
- Your busiest days (the darkest squares on your calendar) grow broader crowns. How many
  commits you make doesn't matter: the darkest square is relative to your own history.
- Two weeks or more without a contribution leaves a pond.
- Animals move in: a rabbit at 50 trees, a deer at 100, a heron at the first pond, an owl
  at the first ancient tree, and a cabin when the forest turns one.
- The newest 730 trees are drawn one by one; older ones become the deep forest behind them
  (with `period: all`).
- The animation is a 4-second loop that repeats without a seam.

## Questions

**The workflow was turned off.** GitHub switches off scheduled workflows in public
repositories after 60 days without activity. Go to Actions, pick "forest", and click
"Enable workflow".

**My image didn't change.** GitHub caches images for up to 5 minutes.

**Do the forest's own commits count as contributions?** No. They are made by the Actions
bot on a separate branch.

## Development

```sh
npm install
npm run local -- --user <login>     # draws into out/, pushes nothing
npm test
npm run sync-engine                 # copies the engine from the Memory Forest add-on
npm run build                       # bundles the Action into dist/
```

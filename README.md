# PBFinance

Personal budget tracker: import your bank statement, auto-categorize
expenses, split shared-account spending with your partner, set budgets,
and see where your money goes — all running locally, with your data
never leaving your machine.

## Features

- **CSV bank statement import** with automatic column detection and a
  preview step before anything is added
- **Rules-based auto-categorization** — teach it once ("Continente" →
  Groceries), it remembers
- **Duplicate detection** when re-importing overlapping statement periods
- **Shared account support** — set a split % (e.g. 50/50) so a joint
  account only counts your share everywhere in the app
- **Manual expense & income entry**, fully editable after the fact
- **Recurring expense tracking**
- **Monthly budgets per category** with over/under indicators
- **Dashboard**: spend by category, spend trends over time, income vs.
  expenses, personal vs. shared breakdown, savings rate
- **CSV export** and full **JSON backup/restore**
- Runs as a website (dev mode) or a native desktop app (Windows/macOS/
  Linux) via Tauri — no data ever sent to a server

## Tech stack

React, Vite, Recharts, PapaParse, Tauri.

## Getting started (development)

```bash
npm install
npm run dev
```
Opens at `http://localhost:5173`.

## Building a desktop installer (.exe / .dmg / .AppImage)

The easiest way is via the included GitHub Actions workflow — push a
version tag and it builds installers for Windows, macOS, and Linux in
the cloud automatically:

```bash
git tag v1.0.0
git push --tags
```

Then grab the installer from the repo's **Releases** page. See
[`.github/workflows/build.yml`](.github/workflows/build.yml) for details,
or build locally with `npm run tauri build` (requires Rust).

## Data & privacy

All data is stored locally — in the browser (`localStorage`) in dev
mode, or locally on disk once packaged as a desktop app. Nothing is
sent to any server. Use **Settings → Export backup** inside the app
to back up your data.

## License

MIT — see [LICENSE](LICENSE).

# Archery Scoring

A phone app for scoring indoor archery rounds. It installs from Chrome onto your home screen and works offline.

> **This app has a new version: https://archery-scoring.curtis-wyvern.workers.dev/**
> Its code is in [archery-scoring-next](https://github.com/TheOneWyvern/archery-scoring-next).
> This older version still works and stays online. To bring your scores across, tap
> **Move my scores** on its home screen or in Settings, then tap **Import** in the new app.
> Rounds the new app already has are skipped, and nothing in this app is removed.

**Open this older app: https://theonewyvern.github.io/archery-scoring/**

## What it does

- **World Archery 18m round:** 60 arrows in 20 ends of 3, in two halves.
- **Bows:** recurve, compound, barebow, longbow, flatbow, traditional and horse bow. Compound only scores 10 in the inner ring and has no separate X count.
- **Faces:** 40cm full face (rings 10–1) or triple spot (rings 10–6, anything outside is a miss).
- **Practice rounds:** no set length, with a fixed number of arrows per end or no limit.
- **Three ways to enter scores:** a keypad, touching and dragging on the target face, or a photo of the target: the app finds the rings, and you touch where each arrow went in. Photos can be saved to the phone, with where each arrow was tapped, for teaching the app to find arrows itself later.
- **Target face:** Arrows touching a line score the higher ring, taking your arrow shaft diameter into account. Tap an arrow on the target to move it or change its score.
- **Scorecard:** arrows sorted highest first, end and running totals, half subtotals, and 10 and X counts. Tap any end to correct it.
- **Classifications:** a complete WA 18m round shows the Archery GB indoor class it reaches and how far it is from the next one, and Stats shows progress towards claiming each class. Set each archer's age group and category in Settings.
- **History and stats:** personal bests, score trend, first vs second half averages, score distribution and an arrow grouping plot.
- **Backup:** export and import as JSON, and export to CSV for spreadsheets.

Scores are stored only in the phone's browser storage. Nothing is uploaded.

## Install on Android

1. Open https://theonewyvern.github.io/archery-scoring/ in **Chrome**.
2. Tap **⋮** → **Install app** (or **Add to Home screen**).

## Run locally

```bash
python -m http.server 8080
```

Then open http://localhost:8080.

## Files

- `index.html`, `css/styles.css`: page and styles
- `js/rules.js`: round definitions and scoring rules
- `js/face.js`: target face drawing and hit testing
- `js/share.js`: scorecard and arrow plot pictures for sharing
- `js/classes.js`: Archery GB indoor classification scores for the WA 18m round
- `js/photo.js`: finding the target in a photo and lining its spots up with the face
- `js/store.js`: saving to phone storage, backup import and export
- `js/app.js`: screens and interactions
- `sw.js`, `manifest.webmanifest`, `icons/`: offline support and installing to the home screen

When adding or renaming files, add them to the `FILES` list in `sw.js` and bump `VERSION`.

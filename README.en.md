# Resonance Vault

[简体中文](README.md) | English

> Let the sounds worth treasuring never slip away.
>
> Let music be heard, let the artwork be admired, let the works be remembered.

An offline-first audiovisual archive and exhibition program for niche, obscure, and treasured digital music (inspired by Luo Tianyi's debut *Resonate* series).

The idea started as a rejection of everything streaming platforms do: identical card grids, garish neon, and an over-engineered dashboard feel. We want to treat music, high-resolution key art, and original PVs as genuine artworks, books, and historical documents — generous whitespace, with the weight and restraint of a printed art book and a gallery.

---

## Status: in development

The project is in early, active development. The visual design, 3D physical interaction, and core audio/video experience are already in place.

### Screenshots

| Obsidian Night (dark shelf) |
| :---: |
| ![Obsidian Night shelf](docs/screenshots/shelf-dark-mode.png) |

| Xuan Paper Daylight (light shelf) |
| :---: |
| ![Xuan Paper Daylight shelf](docs/screenshots/shelf-light-mode.png) |

### Progress

- **Done**:
  - [x] Fully 3D physical interaction (no sidebar — every level transition is a hardcover book opening or closing)
  - [x] Two shelf display modes ("upright row" and "stacked folios") with smooth switching
  - [x] 3D hardcover modelling (cloth-grain embossing, page-edge thickness, silk ribbon bookmark, pointer-reactive sheen and contact shadows)
  - [x] Two-page art spread system (opening animation around the binding gutter, single-screen full-bleed layout)
  - [x] Playback motion detail (vinyl record sliding out and spinning, animated level bars, track indicator lines)
  - [x] Full-screen gallery stage (matted artwork zoom plus official HD PV toggle)
  - [x] Dark/light material switch (Obsidian Night and Xuan Paper Daylight)
  - [x] Four playback modes (vault-wide continuous, album loop, single-track loop, shuffle)
  - [x] Smart previous-track logic (past 3 s: restart the current track; under 3 s: go to the previous track)
  - [x] Xuan-paper folio queue drawer (up-next queue, animated waveform, grouped track jumping)
  - [x] Minimal persistent player (native audio streaming, smooth pointer-capture seek bar)
  - [x] System-level lock-screen and notification media controls (deep MediaSession API integration, hardware key support)
  - [x] Local offline-first archive convention (one folder per track or album with audio, key art, and video)

- **In progress / roadmap**:
  - [ ] **Beginner-friendly import**: drag-and-drop folder parsing, IndexedDB-only local persistence, open-source scraper toolchain
  - [ ] **Tags and classification**: native ID3 extraction, smart album clustering, user-defined bookmark labels
  - [ ] **Lyrics system**: smooth lyrics built on the microsecond-eased interpolation used by desktop wallpaper players, in an ink-and-stone visual style
  - [ ] **Cross-platform desktop**: Tauri v2 packaging for Linux (.AppImage/.deb) and Windows (.exe/.msi)
  - [ ] **Mobile and sensors**: Android support, with gyroscope-driven physical light (tilt parallax) and touch pressure feedback

---

## Design philosophy and interaction

### 1. Pure 3D physical interaction (no admin sidebar)
The conventional left-hand management menu is gone entirely; every interface transition is driven by physical operations in 3D space:
- **Shelf**: supports two display modes, "upright row" and "stacked folios". Books have real embossed spines, page-edge texture, and hanging silk ribbons; lighting and perspective tilt smoothly with the pointer.
- **Opening a spread**: clicking a book triggers a smooth lift and open animation, unfolding around the binding gutter into a flat two-page spread.
- **Gallery stage**: click the matted plate or the stage button in the top-right corner to inspect the artwork full-screen. Entries with an original PV can play it on the stage; after returning to the spread or the shelf it keeps playing as a synchronized background. Toggle it with "PV background" in the player.
- **Physical back-out**: click the back button or press `Esc` to close the book smoothly and return to the shelf.

### 2. Playback state and motion detail
- **Vinyl slide-out**: while music plays, a vinyl record slides out smoothly from behind the left plate — recessed groove sheen and a custom label — and spins at a constant rate with playback, stopping on pause.
- **Waveform and track state**: the playing track gets animated level bars next to its title, and the selected track gets its own indicator line.
- **Single-screen fit**: the spread and track typography are proportionally fitted so every release detail and track fits on one screen, with no vertical scrolling.

### 3. Dark/light material switch
A toggle in the header switches between two low-saturation material themes:
- **Obsidian Night**: deep grey ink-wash paper texture with muted gold accents and cloth-grain spines.
- **Xuan Paper Daylight**: hand-made white xuan paper backing with deep ink-wash type and an antique amber-brown accent.

### 4. Designing the app like a game (game feel and spatial continuity)
- **Physical, continuous movement**: no hard page refreshes or teleporting elements. When switching between upright row and stacked folios, books slide into place along physically plausible paths, preserving strict spatial permanence.
- **Game-grade tactile quality**: recessed embossing sheen, page-edge thickness, softly hanging silk ribbons, two-page opening motion, and the sliding, spinning vinyl. The interface is not a cold web form — it is a pocket-sized digital exhibition hall you can touch.

---

## Implementation

### Stack
- Framework: React 18
- Dev server and build: Vite 5
- Types: TypeScript
- Styling: Tailwind CSS
- Motion and physical interpolation: Framer Motion
- Icons: Lucide React

### Project structure

```
resonance-vault/
├── docs/
│   └── screenshots/             # Screenshots
├── public/
│   └── albums/                  # Audio, key art, and video assets (local library may be symlinked here)
├── src/
│   ├── components/
│   │   ├── BookshelfView.tsx    # 3D shelf view (upright row and stacked folios)
│   │   ├── ThreeDimensionalBook.tsx # 3D hardcover model and sheen interaction
│   │   ├── BookSpreadView.tsx   # Two-page spread (track list, vinyl, production credits)
│   │   ├── GalleryStageView.tsx # Full-screen gallery stage (artwork zoom and PV playback)
│   │   ├── QuietPlayer.tsx      # Persistent minimal bottom player
│   │   └── FolioQueueDrawer.tsx # Xuan-paper folio queue drawer
│   ├── data/
│   │   └── vaultData.ts         # Archive metadata structures and track configuration
│   ├── types.ts                 # TypeScript interfaces
│   ├── usePlayback.ts           # Audio engine and playback mode management
│   ├── index.css                # Paper textures and physical shadow styles
│   ├── App.tsx                  # State management and view transitions
│   └── main.tsx                 # Entry point
├── package.json
└── vite.config.ts
```

---

## Running locally

### 1. Install dependencies

```bash
npm install
```

### 2. Start the dev server

```bash
npm run dev
```

The dev server runs at `http://localhost:5173/` by default.

### 3. Build for production

```bash
npm run build
```

---

## Library layout and archive convention

The system is local and offline-first: one folder holds one track or one album. A suggested folder layout:

```
local-music-library/
├── album-or-track-name/
│   ├── cover.jpg               # High-res key art or cover image (portrait or landscape)
│   ├── 01. track-name.m4a      # Original audio file (lossless, or bit-perfect AAC/FLAC, recommended)
│   ├── 02. track-name.m4a
│   ├── official-pv.mp4         # Official HD video (optional)
│   ├── metadata.json           # Album metadata (creators, release, genre, ...)
│   └── README.md               # Historical background and archive notes
```

Place the folder under `public/albums/<folder_name>` (or symlink it there) and configure its tracks and paths in `src/data/vaultData.ts`; the spread and player load it automatically.

---

## Keyboard shortcuts

- `Space`: pause / resume playback
- `Esc`: return from the gallery stage to the spread, or from the spread to the shelf

---

## License

This project's code is released under the [GNU General Public License v3.0](LICENSE), Copyright (C) 2026 eryuemu.

- You may freely use, modify, and distribute this project's code; **if you distribute it (ship binaries or deploy it as a service), the derivative must also be released under GPL-3.0 with the complete corresponding source**.
- Running it locally or modifying it for your own use creates no obligations.
- GPL-3.0 **permits commercial use**. If you want to restrict commercial use, you can only do so for assets and branding — you cannot add restrictions to the code itself.

### Media assets are not covered by this license

Preview images under `docs/screenshots/`, and the music, key art, and PVs in the sample entries, remain the property of their respective rights holders and are **not included in this project's GPL-3.0 grant**. Before archiving, playing, or redistributing someone else's work, make sure you have the legal right to do so; any copyright dispute arising from the content a user archives is the user's own responsibility, not the author's.

Always respect digital copyright, and support official releases whenever you can.

<div align="center">
  <img src="src/assets/logo.png" alt="Motrix Next" width="128" height="128" style="border-radius: 24px;" />
  <h1>Motrix Next — ATLAS Edition</h1>
  <p>A full-featured download manager — rebuilt from the ground up.</p>
  <p><strong>Turkish localization, enhanced documentation</strong></p>

  [![GitHub release](https://img.shields.io/github/v/release/ATLASxDevx/motrix-next.svg)](https://github.com/ATLASxDevx/motrix-next/releases)
  ![Build](https://img.shields.io/github/actions/workflow/status/ATLASxDevx/motrix-next/release.yml?label=Build)
  ![Total Downloads](https://img.shields.io/github/downloads/ATLASxDevx/motrix-next/total.svg)
  <br>
  ![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue.svg)
  ![Bundle Size](https://img.shields.io/badge/bundle%20size-~20MB-brightgreen.svg)

  <br>

  <a href="https://atlasmedya.net"><img src="https://img.shields.io/badge/ATLAS-atlasmedya.net-0A66C2?style=for-the-badge&amp;logo=web&amp;logoColor=white" alt="ATLAS Website" /></a>
  <a href="https://github.com/ATLASxDevx"><img src="https://img.shields.io/badge/GitHub-ATLASxDevx-181717?style=for-the-badge&amp;logo=github&amp;logoColor=white" alt="ATLAS GitHub" /></a>
  <a href="https://github.com/ATLASxDevx/motrix-next/releases"><img src="https://img.shields.io/badge/Download-Latest_Release-2b2b2b?style=for-the-badge&amp;logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTIxIDE1djRhMiAyIDAgMCAxLTIgMkg1YTIgMiAwIDAgMS0yLTJ2LTQiLz48cG9seWxpbmUgcG9pbnRzPSI3IDEwIDEyIDE1IDE3IDEwIi8+PGxpbmUgeDE9IjEyIiB5MT0iMTUiIHgyPSIxMiIgeTI9IjMiLz48L3N2Zz4=&amp;logoColor=white" alt="Download" /></a>

</div>

---

> **Built on top of [AnInsomniacy/motrix-next](https://github.com/AnInsomniacy/motrix-next)**
> This fork adds Turkish localization, enhanced documentation, and ATLAS branding.

---

<div align="center">
  <table><tr>
    <td><img src="docs/media/screenshot-light.png" alt="Light Mode" width="400" /></td>
    <td><img src="docs/media/screenshot-dark.png" alt="Dark Mode" width="400" /></td>
  </tr><tr>
    <td align="center"><sub>Light Mode</sub></td>
    <td align="center"><sub>Dark Mode</sub></td>
  </tr></table>
</div>

## Why Motrix Next?

[Motrix](https://github.com/agalwood/Motrix) by [agalwood](https://github.com/agalwood) was one of the best open-source download managers available — clean UI, aria2-powered, cross-platform. It inspired thousands of users and developers alike.

However, the original project has been largely inactive since 2023. The Electron + Vue 2 + Vuex + Element UI stack accumulated technical debt, making it increasingly difficult to maintain, extend, or package for modern platforms.

### What we rebuilt

Motrix Next is a ground-up rewrite — same download manager spirit, entirely new codebase.

| Layer | Motrix (Legacy) | Motrix Next |
|-------|----------------|-------------|
| **Runtime** | Electron | **Tauri 2** (Rust) |
| **Frontend** | Vue 2 + Vuex | **Vue 3 Composition API + Pinia** |
| **UI Framework** | Element UI | **Naive UI** |
| **Language** | JavaScript | **TypeScript + Rust** |
| **Styling** | SCSS + Element theme | **Vanilla CSS + custom properties** |
| **Engine Mgmt** | Node.js `child_process` | **Tauri sidecar** |
| **Build System** | electron-builder | **Vite + Cargo** |
| **Bundle Size** | ~80 MB | **~20 MB** |
| **Auto-Update** | electron-updater | **Tauri updater plugin** |

> [!NOTE]
> **6-platform aria2 engine** — the [official aria2 release](https://github.com/aria2/aria2/releases) only ships Windows 32/64-bit and Android ARM64 pre-built binaries. We [compile aria2 from source](https://github.com/AnInsomniacy/aria2-builder) as fully static binaries for all 6 targets: macOS (Apple Silicon / Intel), Windows (x64 / ARM64), and Linux (x64 / ARM64).


### Design & Motion

The overall UI layout stays true to Motrix's original design — the sidebar navigation, task list, and preference panels all follow the familiar structure that made Motrix intuitive from day one.

What changed is everything underneath. Every transition and micro-interaction has been carefully tuned to follow [Material Design 3](https://m3.material.io/styles/motion/overview) motion guidelines:

- **Asymmetric timing** — enter animations are slightly longer than exits, giving new content time to land while dismissed content leaves quickly
- **Emphasized easing curves** — decelerate on enter (`cubic-bezier(0.2, 0, 0, 1)`), accelerate on exit (`cubic-bezier(0.3, 0, 0.8, 0.15)`), replacing generic `ease` curves throughout the codebase
- **Spring-based modals** — dialogs use physically-modeled spring animations for a natural, responsive feel
- **Consistent motion tokens** — all durations and curves are defined as CSS custom properties, ensuring a unified rhythm across 12+ components

## Features

- **Multi-protocol downloads** — HTTP, FTP, BitTorrent, Magnet links
- **BitTorrent** — Selective file download, DHT, peer exchange, encryption
- **Tracker management** — Auto-sync from community tracker lists
- **Concurrent downloads** — Up to 10 tasks with configurable thread count
- **Speed control** — Global and per-task upload/download limits
- **System tray** — Real-time speed display in the menu bar (macOS)
- **Dark mode** — Native dark theme with system preference detection
- **i18n** — Auto-detects system language on first launch
- **Task management** — Pause, resume, delete with file cleanup, batch operations
- **Download protocols** — Register as default handler for magnet and thunder links
- **Notifications** — System notifications on task completion
- **Lightweight** — Tauri-powered, minimal resource footprint

## Installation

Download the latest release from [GitHub Releases](https://github.com/ATLASxDevx/motrix-next/releases).

### macOS Users

This app is not code-signed — Apple charges $99/year.

> If macOS says the app is **"damaged and can't be opened"**, open Terminal and run:
>
> ```bash
> xattr -cr /Applications/MotrixNext.app
> ```
>
> This removes the quarantine flag that macOS Gatekeeper applies to unsigned apps.


### Why No Portable Version?

Motrix Next relies on [aria2](https://aria2.github.io/) as a sidecar process — a separate executable that Tauri launches at runtime. The aria2 binaries are [compiled from source](https://github.com/AnInsomniacy/aria2-builder) as fully static builds covering all 6 supported platforms. This architecture means:

- The **aria2 binary must exist alongside the main executable** — it cannot be embedded into a single `.exe`.
- **Deep links** (`magnet://`, `thunder://`) and **file associations** (`.torrent`) require Windows registry entries that only an installer can configure.
- The **auto-updater** needs a known installation path to replace files in place.

These are fundamental constraints of the Tauri sidecar model and the Windows operating system, not limitations we can work around. Notable Tauri projects like [Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev) (80k+ stars) previously shipped portable builds but [discontinued them](https://clash-verge.com/) due to the same set of issues.

We provide **NSIS installers** for Windows — lightweight (~20 MB), fast to install, and fully featured.

---

## Turkce Kurulum Rehberi

### Gereksinimler

- **Windows 10/11** (x64 veya ARM64)
- **macOS** 12+ (Apple Silicon veya Intel)
- **Linux** (x64 veya ARM64, `.deb` / `.AppImage`)

### Kurulum Adimlari

#### Windows

1. [Releases](https://github.com/ATLASxDevx/motrix-next/releases) sayfasindan en son `.exe` kurulum dosyasini indirin.
2. Indirilen `.exe` dosyasini calistirin.
3. Kurulum sihirbazini takip edin — varsayilan ayarlar cogu kullanici icin yeterlidir.
4. Kurulum tamamlandiginda Motrix Next otomatik olarak baslatilabilir.

#### macOS

1. [Releases](https://github.com/ATLASxDevx/motrix-next/releases) sayfasindan `.dmg` dosyasini indirin.
2. `.dmg` dosyasini acin ve uygulamayi `Applications` klasorune surukleyin.
3. Eger macOS uygulamanin **"hasarli oldugunu ve acilamayacagini"** soylerse, Terminal'i acin ve su komutu calistirin:
   ```bash
   xattr -cr /Applications/MotrixNext.app
   ```

#### Linux

1. [Releases](https://github.com/ATLASxDevx/motrix-next/releases) sayfasindan `.deb` veya `.AppImage` dosyasini indirin.
2. **Debian/Ubuntu** icin:
   ```bash
   sudo dpkg -i motrix-next_*.deb
   ```
3. **AppImage** icin:
   ```bash
   chmod +x MotrixNext_*.AppImage
   ./MotrixNext_*.AppImage
   ```

### Ozellikler

- **Coklu protokol destegi** — HTTP, FTP, BitTorrent, Magnet baglantilari
- **BitTorrent** — Secici dosya indirme, DHT, peer degisimi, sifreleme
- **Es zamanli indirme** — 10'a kadar gorev, yapilandilabilir is parcacigi sayisi
- **Hiz kontrolu** — Genel ve gorev bazinda yukleme/indirme limitleri
- **Karanlik mod** — Sistem tercihi algilamali yerel karanlik tema
- **Hafif** — Tauri tabanli, minimum kaynak kullanimi (~20 MB)

---

## Development

### Prerequisites

- [Rust](https://rustup.rs/) (latest stable)
- [Node.js](https://nodejs.org/) >= 22
- [pnpm](https://pnpm.io/)

### Setup

```bash
# Clone the repository
git clone https://github.com/ATLASxDevx/motrix-next.git
cd motrix-next

# Install frontend dependencies
pnpm install

# Start development server (launches Tauri + Vite)
pnpm tauri dev

# Build for production
pnpm tauri build
```

### Project Structure

```
motrix-next/
├── src/                        # Frontend (Vue 3 + TypeScript)
│   ├── api/                    # Aria2 JSON-RPC client
│   ├── components/             # Vue components
│   │   ├── about/              #   About panel
│   │   ├── layout/             #   Sidebar, speedometer, navigation
│   │   ├── preference/         #   Settings pages, update dialog
│   │   └── task/               #   Task list, detail, add task
│   ├── composables/            # Reusable composition functions
│   ├── router/                 # Vue Router configuration
│   ├── shared/                 # Shared utilities & config
│   │   ├── locales/            #   26 language packs
│   │   ├── utils/              #   Pure utility functions (with tests)
│   │   ├── aria2/              #   Aria2 RPC library
│   │   ├── types.ts            #   TypeScript interfaces
│   │   ├── constants.ts        #   App constants
│   │   └── configKeys.ts       #   Persisted config key registry
│   ├── stores/                 # Pinia state management (with tests)
│   ├── styles/                 # Global CSS custom properties
│   └── views/                  # Page-level route views
├── src-tauri/                  # Backend (Rust + Tauri 2)
│   ├── src/
│   │   ├── commands/           #   config, engine, ui, tracker, fs, updater, upnp
│   │   ├── engine/             #   Aria2 sidecar lifecycle (args, state, cleanup)
│   │   ├── error.rs            #   AppError enum
│   │   ├── menu.rs             #   Native menu builder
│   │   ├── tray.rs             #   System tray setup
│   │   ├── upnp.rs             #   UPnP/IGD port mapping
│   │   └── lib.rs              #   Tauri builder & plugin registration
│   └── binaries/               # Aria2 sidecar binaries (6 platforms)
├── scripts/                    # bump-version.sh
├── .github/workflows/          # CI (ci.yml) + Release (release.yml)
└── website/                    # Landing page (static HTML)
```



## Acknowledgements

- **Original project**: [AnInsomniacy/motrix-next](https://github.com/AnInsomniacy/motrix-next) — Built on top of this incredible rewrite
- [Motrix](https://github.com/agalwood/Motrix) by [agalwood](https://github.com/agalwood) and all its contributors
- [Aria2](https://aria2.github.io/) — the powerful download engine at the core
- Community translators who contributed 25+ locale files for worldwide accessibility

## ATLAS Fork Changes

- Turkish localization, enhanced documentation
- ATLAS branding and badge integration
- Updated repository links and references

## Sponsor

Support the original developer: [AnInsomniacy on GitHub](https://github.com/AnInsomniacy)

[Buy them a coffee](https://github.com/AnInsomniacy/AnInsomniacy/blob/main/SPONSOR.md)

## Contributing

PRs and issues are welcome! Please read the [Contributing Guide](docs/CONTRIBUTING.md) and [Code of Conduct](docs/CODE_OF_CONDUCT.md) before getting started.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=ATLASxDevx/motrix-next&amp;type=Date)](https://star-history.com/#ATLASxDevx/motrix-next&amp;Date)

## License

[MIT](https://opensource.org/licenses/MIT) — Copyright (c) 2025-present AnInsomniacy | Fork maintained by [ATLAS](https://github.com/ATLASxDevx)

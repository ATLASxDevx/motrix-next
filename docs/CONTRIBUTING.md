# Motrix Next Contributing Guide

Maintained by [@AnInsomniacy](https://github.com/AnInsomniacy). PRs and issues are welcome!

Before you start contributing, make sure you understand [GitHub flow](https://guides.github.com/introduction/flow/).

## 🛠 Development Setup

### Prerequisites

- [Rust](https://rustup.rs/) (latest stable)
- [Node.js](https://nodejs.org/) >= 22
- [pnpm](https://pnpm.io/) >= 9

### Getting Started

```bash
git clone https://github.com/AnInsomniacy/motrix-next.git
cd motrix-next
pnpm install
pnpm tauri dev    # Start dev server (Tauri + Vite)
```

Rust backend (standalone):

```bash
cd src-tauri
cargo build
cargo test
```

## ✅ Code Quality

All checks must pass before PR merge:

```bash
pnpm lint               # ESLint (0 errors, 0 warnings)
pnpm test               # Vitest
npx vue-tsc --noEmit    # TypeScript strict mode
cd src-tauri && cargo test  # Rust tests
```

Pre-commit hooks (husky + lint-staged) auto-run `eslint --fix` and `prettier --write` on staged files.

## 📐 Component Guidelines

- **Keep `<script>` logic under 300 lines.** Extract composables when approaching this limit. Template and scoped CSS may exceed this — Naive UI components often require extensive style overrides.
- Use `<script setup lang="ts">` with composition API.
- Every file starts with a `/** @fileoverview ... */` doc comment.
- Use `logger` from `@shared/logger` for all runtime logging — **no bare `console.*`**.

## 🛡 Error Handling

- **TypeScript**: Never leave `catch` blocks empty — always call `logger.debug()` at minimum.
- **Rust**: Use the `AppError` enum (`Store`, `Engine`, `Io`, `NotFound`, `Updater`, `Upnp`) for all command return types.

## 🧪 Testing

- Follow **TDD** (Red → Green → Refactor) for new utilities and guards.
- Test files live alongside source: `__tests__/filename.test.ts`.
- Runtime type guards (in `guards.ts`) validate all external API responses.

## 🌍 Translation Guide

First you need to determine the English abbreviation of a language as **locale**, such as `en-US`. This locale value should strictly refer to the [Chromium Source Code](https://source.chromium.org/chromium/chromium/src/+/main:ui/base/l10n/l10n_util.cc).

The internationalization of Motrix Next uses [vue-i18n](https://vue-i18n.intlify.dev/).

The configuration files are divided by **locale** under `src/shared/locales/`, such as `src/shared/locales/en-US` and `src/shared/locales/zh-CN`.

There are language files in each directory organized by business module:

- `about.js`
- `app.js`
- `edit.js`
- `help.js`
- `index.js`
- `menu.js`
- `preferences.js`
- `subnav.js`
- `task.js`
- `window.js`

### Adding a New Language

1. Create a new directory under `src/shared/locales/` with the locale code (e.g. `src/shared/locales/de/`)
2. Copy the files from `src/shared/locales/en-US/` as a template
3. Translate each file
4. Register the locale in `src/shared/locales/all.js`
5. Submit a Pull Request

## 💬 Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add torrent file selection
fix: handle empty bitfield in peer parser
refactor: extract TorrentUpload sub-component
test: add rename utility tests
docs: update CONTRIBUTING guidelines
```

## 🤝 Pull Requests

### Size and scope

Hard limits — PRs that exceed these will be closed without review:

- **< 300 lines** of changed code (excluding tests and auto-generated files like `Cargo.lock`).
- **< 10 files** touched. Docs-only or config-only PRs may exceed this.
- **One concern per PR.** A single PR should do exactly one thing.

How to split a large change:

| Instead of | Split into |
|-----------|-----------|
| "Add error notification system" (1000 LOC) | PR 1: `errorNormalizer.ts` + tests → PR 2: `useAppNotification.ts` + tests → PR 3: integrate into components |
| "Add feature + fix lint + update config" | PR 1: lint/config fixes → PR 2: the feature |
| "Update i18n for 3 features" | One PR per feature, each updating all 26 locales |

### Before you start

- **Bug fixes** — open an issue first to confirm the bug, then reference it in the PR.
- **New features** — open an issue and get maintainer approval before writing code. PRs for undiscussed features will be closed. This is standard practice across the Tauri ecosystem.
- **Refactors** — keep them purely behavioral-neutral. Don't sneak functional changes into a refactor PR.

### PR titles

PR titles must follow [Conventional Commits](https://www.conventionalcommits.org/) format:

```
feat(macos): add native traffic light toggle
fix: handle null errorCode in task notification
refactor: extract tracker sync into composable
docs: update i18n translation guide
```

### Before you push

Run the full check suite locally. PRs that fail any of these will not be reviewed:

```bash
pnpm format:check           # Prettier formatting
npx vue-tsc --noEmit        # TypeScript strict mode
pnpm test                   # Vitest unit tests
cd src-tauri && cargo test   # Rust tests
cd src-tauri && cargo clippy # Rust lints (zero warnings)
```

### i18n changes

If you add or modify i18n keys, **all 26 locales must be updated** using a batch Python script. Partial updates (e.g., only `en-US` and `zh-CN`) break the app for other languages and will not be accepted. See `AGENTS.md` Section D for the script template and the full list of locale directories.

### AI-assisted development

Using AI tools (Copilot, Claude, ChatGPT, Cursor, etc.) to assist development is welcome and encouraged. What is not acceptable is blind vibe coding — generating code with AI and submitting it without understanding or reviewing it.

**Rules:**

1. You must **review and understand every line** you submit, whether you wrote it or an AI did.
2. You must be able to **explain any change** if asked during review.
3. Tests must be written **before** implementation (TDD), not bolted on after.
4. All checks must **pass locally** before pushing — not after a chain of fix commits.

**Disclosure:**

The PR template includes an AI usage disclosure section. Fill it out honestly. Following the [OpenInfra Foundation standard](https://openinfra.org), you may also add a commit trailer:

```
feat: add speed limit control

AI-Assisted-By: Claude
```

**What gets your PR closed immediately:**

- Commit history showing a "generate → push → fix → fix → fix" loop.
- Code that doesn't pass lint, type checks, or tests on first push.
- Misleading AI disclosure (claiming no AI was used when it was).

This policy follows practices adopted by [Mozilla.ai](https://mozilla.ai), [Drupal](https://drupal.org), and [Ghostty](https://github.com/ghostty-org/ghostty), among others.

## 📜 License

By contributing, you agree that your contributions will be licensed under the [MIT License](https://opensource.org/licenses/MIT).

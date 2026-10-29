# AGENTS.md — Repository Guidelines & Operating Manual

This repository contains **Starship Studio**, an interactive web-based visual editor and preset generator for the [Starship](https://starship.rs) prompt.

---

## 🤖 Rules for AI Coding Assistants (Agents)

### 1. Git & Commit Guidelines
- **Always commit in English** whenever implementing a new feature, improvement, refactoring, or bug fix requested by the user.
- Use [Conventional Commits](https://www.conventionalcommits.org/) format:
  - `feat: <description>` for new features or capabilities
  - `fix: <description>` for bug fixes or corrections
  - `style: <description>` for UI/UX tweaks or formatting
  - `docs: <description>` for documentation or SEO updates
  - `refactor: <description>` for code restructuring without changing behavior
- Make atomic, well-tested commits with descriptive messages.

### 2. Architecture & Design Principles
- **Zero Build Step & Zero External Frameworks**:
  - The project is built entirely in vanilla HTML5, CSS3, and modern client-side JavaScript.
  - Do not introduce heavy dependencies, build tools (Webpack, Vite, Tailwind CLI), or npm runtime dependencies unless explicitly instructed by the user.
- **Font & Glyph Rendering**:
  - The UI relies on Nerd Font and Powerline glyphs.
  - Always maintain high-contrast styling and proper line-height scaling for Powerline separators to prevent vertical cutoff.
- **Starship Schema Compatibility**:
  - All generated TOML configs must adhere to the official Starship configuration schema (`https://starship.rs/config-schema.json`).

### 3. Preset Preview Fidelity
- **Every new or changed preset must render in the live preview and its gallery card exactly as it renders in a real terminal (or as close as the browser allows).** A preset is not done until its preview matches its TOML.
- **Workflow** (stdlib Python 3.11+ and Chromium, no dependencies):
  1. `scripts/import-preset.py path/to/preset.toml [...]` writes the theme and preset entries into `index.html`, deriving every field below from the TOML. Re-running it replaces the entries for that id (use `--id`/`--name` to fix a misspelled filename or header; `--dry-run` prints instead of writing). Re-apply any hand edits after a re-import.
  2. `scripts/preview-sheet.sh -o /tmp/sheet.png <preset_id> [...]` renders the live preview of the given presets into one PNG. Compare it with the TOML / a real terminal and fix differences (in the importer or the renderer, generically) before committing.
- The `rawToml` is the source of truth and ships verbatim; the preview fields are derived from it, with colors resolved from its own palette (never approximated):
  - `theme`: a matching entry in `themes` (bg/fg per segment: `os`, `dir`, `git`, `lang`, `ai`, `time`).
  - `leftCap` / `sep` / `rightCap`: enough for presets with a single glyph per transition.
  - `lead`: `[glyph, fg, bg]` cells drawn before the first segment (replaces `leftCap`).
  - `chains`: `{ os|dir|git|lang: [[glyph, fg, bg], ...] }` multi-glyph transitions after that module.
  - `tail`: cells after the last segment (replaces `rightCap`).
  - `bleed`: a `$fill` band before `time`: a list of colors (smooth gradient) or `[top, bottom]` pairs (U+2580 half-block columns).
  - `layout: "divider"` + `ruleStops`: full-width rule with `dir`/`time` set into it and the other modules on line 2.
  - `charSymbol` / `charColor` / `errorCharColor` and `moduleIcons` from `[character]` and each module's format.
- Use `"transparent"` for `bg` cells over the terminal background. Glyphs outside the Powerline/block ranges (dots, braille, stars) render at text size automatically.
- **Verify visually**: apply the preset in headless Chromium (`chromium --headless=new --screenshot`) and compare the preview with the format string glyph by glyph (caps, every transition, decorations, fills). Check the gallery card too and a narrow width (~420px) for overflow.
- If a terminal feature can't be expressed with the existing fields, extend the renderer generically (opt-in preset field) instead of special-casing one preset ID.

### 4. SEO & Discoverability
- Maintain `<meta>` description, Open Graph, Twitter cards, and Schema.org JSON-LD structured data in `index.html`.
- Keep `robots.txt` and `sitemap.xml` in sync with any structural or URL changes.

---

## 🛠️ Testing & Local Verification
- Before finishing any task or committing changes:
  1. Validate HTML structure (e.g. `python3 -m html.parser` or unclosed tag checks).
  2. Verify JavaScript execution and syntax (e.g. `node -e "..."`).
  3. Ensure default configurations remain intact unless intentionally changed.

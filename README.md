# 🚀 Starship Studio

> Starship Studio is an interactive visual editor and preset generator for the [Starship](https://starship.rs) prompt. Customize themes and export your `starship.toml` easily.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub](https://img.shields.io/badge/GitHub-starship--studio-blue?logo=github)](https://github.com/felipecm-br/starship-studio)
[![GitHub Pages](https://img.shields.io/badge/Live-Demo-brightgreen.svg)](https://felipecm-br.github.io/starship-studio/)

---

## ✨ Features

- **🎨 60+ Curated & Awesome Presets**: Explore official and community favorites (Tokyo Night, Catppuccin Powerline, Gruvbox Rainbow, HyDE, Omarchy, Zephyr, Pure, Hydro, and more from awesome-starship-prompts), plus creative Powerline, minimal, and light themes.
- **🌈 Curated Color Palettes**: Seamlessly switch between popular terminal aesthetics (Firewatch Sunset, Catppuccin Mocha, Tokyo Night, Lumon Oceanic, Cyberpunk Matrix, and more).
- **⚡ Live Interactive Prompt Studio**: Real-time prompt preview reflecting your chosen directory path, git branch, execution status, and separator style.
- **📏 Fine-Tuned Typography**: Adjust prompt line height (px) and vertical separator scaling for pixel-perfect Powerline alignment.
- **🔗 Shareable Preset Links**: Every preset has its own URL, e.g. [`?preset=chroma-opal`](https://felipecm-br.github.io/starship-studio/?preset=chroma-opal). The address bar follows the applied preset, and **Share Link** copies it.
- **📥 One-Click Export**: Copy the generated `starship.toml` directly to your clipboard or download it as a configuration file.
- **🏎️ Zero Dependencies**: 100% client-side HTML, CSS, and vanilla JavaScript. No build step or backend required.

---

## 🚀 Live Demo

Access the studio directly in your browser:  
👉 **[felipecm-br.github.io/starship-studio](https://felipecm-br.github.io/starship-studio/)**

---

## 🛠️ Usage

### Quick Start
Open `index.html` in any modern web browser:

```bash
# Using python http server
python3 -m http.server 8080

# Or open directly
xdg-open index.html
```

### Applying your config to Starship
1. Customize your prompt design and colors in the Studio.
2. Click **Copy Config** or **Download .toml**.
3. Place or append the configuration into your Starship config directory:
   ```bash
   # Linux / macOS
   cp starship.toml ~/.config/starship.toml

   # Windows PowerShell
   cp starship.toml $HOME\.config\starship.toml
   ```
4. Restart your shell or run `source ~/.zshrc` / `source ~/.bashrc`.

---

## 📄 License

MIT © [Felipe Miranda](https://github.com/felipecm-br)

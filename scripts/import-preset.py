#!/usr/bin/env python3
"""Import Starship preset TOML files into Starship Studio (index.html).

For each TOML this writes (or replaces, when the id already exists):
  * a theme entry in `themes` (bg/fg per segment, resolved from the preset's palette)
  * a preset entry in `presets` with the TOML verbatim as `rawToml`, plus every
    preview field the renderer needs to draw the prompt as the terminal does:
    leftCap/sep/rightCap, lead/chains/tail glyph cells, the $fill band (bleed),
    the divider layout, character symbol and module icons.

Only the Python standard library is used (tomllib, Python 3.11+).
preset-import.js is the browser port (user imports); keep the two in step.

Usage:
  scripts/import-preset.py PRESET.toml [PRESET.toml ...] [--dry-run]
      [--id ID] [--name NAME] [--category powerline|minimal|light] [--bg HEX] [--index PATH]

--id / --name / --category / --bg apply to a single file only. Re-importing a
preset overwrites its entries, so re-apply any hand edits afterwards. Always
check the result with scripts/preview-sheet.sh (see AGENTS.md).
"""
import argparse
import json
import re
import sys
import tomllib
from pathlib import Path

INDEX = Path(__file__).resolve().parent.parent / "index.html"

LANGS = ["rust", "nodejs", "python", "golang", "c", "deno", "php", "java", "kotlin", "haskell"]
GROUP = {"os": "os", "directory": "dir", "git_branch": "git", "git_status": "git", "time": "time",
         **{lang: "lang" for lang in LANGS}}
ORDER = ["os", "dir", "git", "lang", "time"]
MODULE = {"os": "os", "dir": "directory", "git": "git_branch", "time": "time"}
TOKEN = re.compile(r"\[([^\]]*)\]\(([^)]*)\)|\$(\w+)")
POWERLINE = re.compile(r"[-]")
DEFAULT_BG, DEFAULT_FG = "#16161e", "#e6e6f0"
AUTHOR, AUTHOR_URL = "Starship Studio", "https://github.com/felipecm-br/starship-studio"


class Preset:
    def __init__(self, path, opts):
        self.path = Path(path)
        self.raw = self.path.read_text(encoding="utf-8")
        self.toml = tomllib.loads(self.raw)
        self.pal = self.toml.get("palettes", {}).get(self.toml.get("palette"), {})
        self.opts = opts

    # ── color helpers ─────────────────────────────────────────────────────────
    def color(self, c):
        """Resolve a palette name or hex; None for prev_bg/prev_fg (unknown statically)."""
        if c in (None, "transparent"):
            return "transparent"
        if c.startswith("prev_"):
            return None
        return (c if c.startswith("#") else self.pal.get(c, c)).lower()

    def style_colors(self, mod):
        """(bg, fg) of a module: its inner format colors win over `style` (e.g. typecraft)."""
        m = self.toml.get(mod) or {}
        inner = [g for g in re.findall(r"\]\((?!\$style)([^)]*)\)", m.get("format", ""))
                 if "bg:" in g and "prev_" not in g]  # skip embedded [sep](fg:prev_bg ...) cells
        src = inner[0] if inner else m.get("style", "")
        bg, fg = re.search(r"bg:(\S+)", src), re.search(r"fg:(\S+)", src)
        if not fg:
            fg = re.search(r"fg:(\S+)", m.get("style", ""))
        return (self.color(bg.group(1)) if bg else None), (self.color(fg.group(1)) if fg else None)

    # ── format parsing ────────────────────────────────────────────────────────
    def lang_module(self):
        return next((lang for lang in LANGS if lang in self.toml), None)

    def runs(self):
        """Split the first prompt line into (group, literal cells, had_fill) runs."""
        fmt = self.toml["format"].split("$character")[0]
        runs, cur, run, fill = [], None, [], False
        for text, style, var in TOKEN.findall(fmt):
            if var:
                if var == "fill":
                    fill = True
                    continue
                g = GROUP.get(var)
                if not g or g == cur:  # optional modules (username, docker_context...) render nothing
                    continue
                runs.append((cur, run, fill))
                cur, run, fill = g, [], False
                continue
            fg, bg = re.search(r"fg:(\S+)", style), re.search(r"bg:(\S+)", style)
            bare = style.split()[0] if style and not fg and not bg else None
            run.append([text, self.color(fg.group(1) if fg else bare),
                        self.color(bg.group(1)) if bg else "transparent"])
        runs.append((cur, run, fill))
        return runs

    # ── entry builders ────────────────────────────────────────────────────────
    def ident(self):
        if self.opts.get("id"):
            return self.opts["id"]
        return re.sub(r"^\d+-", "", self.path.stem).replace("-", "_")

    def name(self):
        if self.opts.get("name"):
            return self.opts["name"]
        m = re.search(r"^#\s+Preset:\s*(.+)$", self.raw, re.M)
        return m.group(1).strip() if m else self.path.stem.replace("-", " ").title()

    def segments(self):
        seg = {k: self.style_colors(mod) for k, mod in MODULE.items()}
        lang = self.lang_module()
        seg["lang"] = self.style_colors(lang) if lang else (None, None)
        return seg

    def icons(self):
        out = {}
        for k, mod in {**MODULE, "lang": self.lang_module()}.items():
            m = self.toml.get(mod) or {}
            sym = (m.get("symbol") or "").strip()
            if not sym:
                text = re.sub(r"\$\w+|\]\([^)]*\)|\[", "", m.get("format", ""))
                found = re.search(r"[^\x00-\x7f\s]+", POWERLINE.sub("", text))
                sym = found.group(0) if found else ""
            if POWERLINE.sub("", sym).strip():
                out[k] = POWERLINE.sub("", sym).strip()
        return out

    def character(self):
        ch = self.toml.get("character", {})
        ok, err = ch.get("success_symbol", ""), ch.get("error_symbol", "")
        first = lambda s: re.search(r"\]\((?:bold )?(?:fg:)?([#\w]+)", s)
        out = {}
        sym = "".join(re.findall(r"\[([^\]]*)\]", ok)).strip()
        if sym:
            out["charSymbol"] = sym
        if first(ok):
            out["charColor"] = self.color(first(ok).group(1))
        if first(err):
            out["errorCharColor"] = self.color(first(err).group(1))
        return out

    def build(self):
        seg = self.segments()
        transparent = all(bg is None for bg, _ in seg.values())
        # terminal background/text: catppuccin-style palettes name them base/text
        bg = self.opts.get("bg") or (self.color(self.pal["base"]) if "base" in self.pal else DEFAULT_BG)
        fg = self.color(self.pal["text"]) if "text" in self.pal else DEFAULT_FG
        if transparent:  # text-only styles: the segment color is the text color
            colors = {k: (f or fg, bg) for k, (_, f) in seg.items()}
        else:
            colors = {k: (b or bg, f or fg) for k, (b, f) in seg.items()}

        runs = self.runs()
        lead, tail = runs[0][1], runs[-1][1]
        unresolved = lambda cells: any(c[2] is None or (c[1] is None and c[0].strip()) for c in cells)
        first_glyph = lambda cells: (cells[0][0].strip() if cells else "")

        # single-glyph caps and separators (fallbacks when the cells below don't apply)
        seps = []
        for g in ORDER[:-1]:
            run = next((cells for grp, cells, _ in runs if grp == g), [])
            sep = first_glyph(run)
            if not sep:  # separators living inside the next module's format: [X](fg:prev_bg ...)
                nxt = ORDER[ORDER.index(g) + 1]
                mod = MODULE.get(nxt) or self.lang_module()
                m = re.match(r"\[([^\]]+)\]\(fg:prev_bg", (self.toml.get(mod) or {}).get("format", ""))
                sep = m.group(1) if m else ""
            seps.append(sep)

        entry = {"id": self.ident(), "name": self.name(), "preview": " █  █ ",
                 "promptStyle": "transparent" if transparent else "powerline",
                 "leftCap": "" if transparent else first_glyph(lead),
                 "sep": "" if transparent else (seps[0] if len(set(seps)) == 1 else seps),
                 "rightCap": "" if transparent else (tail[-1][0].strip() if tail and runs[-1][0] == "time" else ""),
                 "theme": self.ident()}
        icons = self.icons()
        entry["icon"] = icons.get("os", "󰣇")
        entry.update(self.character())
        entry["moduleIcons"] = icons

        if transparent and any(fill for _, _, fill in runs):
            # divider: a full-width rule ($fill) with dir/time set into it
            rule = [c[1] for _, cells, _ in runs for c in cells if c[0].strip() and c[1] not in (None, "transparent")]
            if rule:
                entry["layout"] = "divider"
                entry["ruleStops"] = [rule[round(i * (len(rule) - 1) / 5)] for i in range(6)]
        elif not transparent:
            if lead and not unresolved(lead) and not (
                    len(lead) == 1 and lead[0][1] == colors["os"][0] and lead[0][2] == "transparent"
                    and len(lead[0][0].strip()) <= 1):
                entry["lead"] = lead
            chains, bleed = {}, None
            for (a, cells, fill), (b, _, _) in zip(runs[1:], runs[2:]):
                if not a or not cells or unresolved(cells) or ORDER.index(b) != ORDER.index(a) + 1:
                    continue
                if fill:
                    bleed = ([c[2] for c in cells] if all(not c[0].strip() for c in cells)
                             else [[c[1], c[2]] for c in cells])
                elif not (len(cells) == 1 and cells[0][1] == colors[a][0] and cells[0][2] == colors[b][0]):
                    chains[a] = cells
            if chains:
                entry["chains"] = chains
            if runs[-1][0] == "time" and tail and not unresolved(tail) and not (
                    len(tail) == 1 and tail[0][1] == colors["time"][0] and len(tail[0][0].strip()) <= 1):
                entry["tail"] = tail
            if bleed:
                entry["bleed"] = bleed

        entry["category"] = self.opts.get("category") or ("minimal" if transparent else "powerline")
        entry["modules"] = {k: True for k in ORDER}
        entry["author"] = AUTHOR
        entry["authorUrl"] = AUTHOR_URL
        entry["rawToml"] = self.raw.strip()
        return entry, (bg, fg, colors)


# ── index.html writers ────────────────────────────────────────────────────────
def theme_js(key, name, bg, fg, c):
    seg = lambda k: f'{{ bg: "{c[k][0]}", fg: "{c[k][1]}" }}'
    return (f'      {key}: {{\n        name: {json.dumps(name, ensure_ascii=False)},\n'
            f'        bg: "{bg}",\n        fg: "{fg}",\n'
            + "".join(f"        {k}: {seg(k)},\n" for k in ["os", "dir", "git", "lang"])
            + f'        ai: {seg("git")},\n        time: {seg("time")}\n      }}')


def preset_js(e):
    rows = []
    for k, v in e.items():
        s = ('{ "os": true, "dir": true, "git": true, "lang": true, "time": true }' if k == "modules"
             else json.dumps(v, ensure_ascii=False))
        rows.append(f"        {json.dumps(k)}: {s}")
    return "      {\n" + ",\n".join(rows) + "\n      }"


def upsert(html, start, block, anchor):
    """Replace the block that begins at `start` (up to its closing `\\n      }`), or insert before `anchor`."""
    i = html.find(start)
    if i != -1:
        e = html.index("\n      }", i) + len("\n      }")
        return html[:i] + block + html[e:], "replaced"
    a = html.index(anchor)
    return html[:a] + ",\n" + block + html[a:], "added"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="+")
    ap.add_argument("--id")
    ap.add_argument("--name")
    ap.add_argument("--category", choices=["powerline", "minimal", "light"])
    ap.add_argument("--bg")
    ap.add_argument("--index", type=Path, default=INDEX, help="target page (default: the repo's index.html)")
    ap.add_argument("--dry-run", action="store_true", help="print the entries instead of writing index.html")
    args = ap.parse_args()
    opts = {k: getattr(args, k) for k in ("id", "name", "category", "bg")}
    if len(args.files) > 1 and any(opts.values()):
        sys.exit("--id/--name/--category/--bg apply to a single file")

    html = args.index.read_text(encoding="utf-8")
    for f in args.files:
        entry, (bg, fg, colors) = Preset(f, opts).build()
        key = entry["id"]
        t_block, p_block = theme_js(key, entry["name"], bg, fg, colors), preset_js(entry)
        if args.dry_run:
            print(t_block, p_block, sep="\n")
            continue
        html, t_state = upsert(html, f"      {key}: {{\n", t_block, "\n    };\n\n    // ── Presets")
        html, p_state = upsert(html, f'      {{\n        "id": "{key}",', p_block, "\n    ];\n    // ── State")
        extras = [k for k in ("lead", "chains", "tail", "bleed", "layout") if k in entry]
        print(f"{key}: theme {t_state}, preset {p_state} ({entry['promptStyle']}"
              + (f"; {', '.join(extras)}" if extras else "") + ")")
    if not args.dry_run:
        args.index.write_text(html, encoding="utf-8")


if __name__ == "__main__":
    main()

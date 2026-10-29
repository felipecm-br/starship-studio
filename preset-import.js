// Starship Studio preset importer: turns a starship.toml into the theme and
// preset entries the gallery and live preview render (lead/chains/tail glyph
// cells, $fill band, divider layout, character, module icons).
//
// Browser port of scripts/import-preset.py; keep the two in step. Loaded as a
// classic script (window.importStarshipPreset) and from Node (module.exports).
(function (root) {
  "use strict";

  // ── Minimal TOML parser (the subset starship.toml files use) ──────────────
  // Tables, dotted keys, arrays of tables, basic/literal/multi-line strings,
  // numbers, booleans, arrays and inline tables. Dates are kept as strings.
  function parseToml(src) {
    const out = {};
    let cur = out;
    let i = 0;
    const n = src.length;

    const fail = (msg) => {
      const line = src.slice(0, i).split("\n").length;
      throw new SyntaxError(`TOML line ${line}: ${msg}`);
    };
    const skipWs = () => { while (i < n && (src[i] === " " || src[i] === "\t")) i++; };
    const skipComment = () => { if (src[i] === "#") while (i < n && src[i] !== "\n") i++; };
    const skipBlank = () => {  // whitespace, newlines and comments (inside arrays)
      for (;;) {
        skipWs();
        if (src[i] === "#") skipComment();
        else if (src[i] === "\n" || src[i] === "\r") i++;
        else return;
      }
    };
    const endOfLine = () => {
      skipWs();
      skipComment();
      if (i < n && src[i] !== "\n" && src[i] !== "\r") fail(`unexpected "${src[i]}"`);
    };

    function escape() {
      const c = src[i++];
      const simple = { b: "\b", t: "\t", n: "\n", f: "\f", r: "\r", e: "\x1b", '"': '"', "\\": "\\" };
      if (c in simple) return simple[c];
      if (c === "u" || c === "U") {
        const len = c === "u" ? 4 : 8;
        const hex = src.slice(i, i + len);
        if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length !== len) fail("bad unicode escape");
        i += len;
        return String.fromCodePoint(parseInt(hex, 16));
      }
      return "\\" + c;  // lenient: keep unknown escapes (tomllib rejects them)
    }

    function string() {
      const q = src[i];
      const multi = src.startsWith(q.repeat(3), i);
      i += multi ? 3 : 1;
      if (multi && src[i] === "\r") i++;
      if (multi && src[i] === "\n") i++;  // a newline right after the opening quotes is trimmed
      let s = "";
      for (;;) {
        if (i >= n) fail("unterminated string");
        const c = src[i];
        if (multi && src.startsWith(q.repeat(3), i)) {
          let run = 3;
          while (run < 5 && src[i + run] === q) run++;  // up to two quotes may end the content
          s += q.repeat(run - 3);
          i += run;
          return s;
        }
        if (!multi && c === q) { i++; return s; }
        if (!multi && c === "\n") fail("newline in string");
        if (q === '"' && c === "\\") {
          i++;
          if (multi && /[ \t\r\n]/.test(src[i])) {  // line-ending backslash
            let j = i;
            while (j < n && (src[j] === " " || src[j] === "\t")) j++;
            if (src[j] === "\n" || src[j] === "\r") {
              i = j;
              while (i < n && /[ \t\r\n]/.test(src[i])) i++;
              continue;
            }
          }
          s += escape();
          continue;
        }
        s += c;
        i++;
      }
    }

    function key() {
      skipWs();
      if (src[i] === '"' || src[i] === "'") return string();
      const m = /^[A-Za-z0-9_-]+/.exec(src.slice(i, i + 256));
      if (!m) fail("expected a key");
      i += m[0].length;
      return m[0];
    }

    function keyPath() {
      const parts = [key()];
      for (;;) {
        skipWs();
        if (src[i] !== ".") return parts;
        i++;
        parts.push(key());
      }
    }

    function value() {
      skipWs();
      const c = src[i];
      if (c === '"' || c === "'") return string();
      if (c === "[") {
        i++;
        const arr = [];
        for (;;) {
          skipBlank();
          if (src[i] === "]") { i++; return arr; }
          arr.push(value());
          skipBlank();
          if (src[i] === ",") { i++; continue; }
          if (src[i] === "]") { i++; return arr; }
          fail("expected , or ] in array");
        }
      }
      if (c === "{") {
        i++;
        const tbl = {};
        skipWs();
        if (src[i] === "}") { i++; return tbl; }
        for (;;) {
          const path = keyPath();
          skipWs();
          if (src[i] !== "=") fail("expected =");
          i++;
          assign(tbl, path, value());
          skipWs();
          if (src[i] === ",") { i++; continue; }
          if (src[i] === "}") { i++; return tbl; }
          fail("expected , or } in inline table");
        }
      }
      const m = /^[^\s,\]}#]+/.exec(src.slice(i, i + 64));
      if (!m) fail("expected a value");
      i += m[0].length;
      const t = m[0];
      if (t === "true") return true;
      if (t === "false") return false;
      const num = t.replace(/_/g, "");
      if (/^[+-]?(0x[0-9a-fA-F]+|0o[0-7]+|0b[01]+)$/.test(num)) return Number(num.replace(/^\+/, ""));
      if (/^[+-]?(\d+(\.\d+)?([eE][+-]?\d+)?|inf|nan)$/.test(num)) {
        return /inf/.test(num) ? (num[0] === "-" ? -Infinity : Infinity) : /nan/.test(num) ? NaN : Number(num);
      }
      if (/^\d{4}-\d{2}-\d{2}|^\d{2}:\d{2}/.test(t)) {  // date/time: may continue after a space
        const rest = /^ \d{2}:\d{2}[^\s,\]}#]*/.exec(src.slice(i, i + 64));
        if (rest) { i += rest[0].length; return t + rest[0]; }
        return t;
      }
      fail(`invalid value "${t}"`);
    }

    function table(path, isArray) {
      let t = out;
      path.forEach((k, idx) => {
        const last = idx === path.length - 1;
        if (last && isArray) {
          if (!(k in t)) t[k] = [];
          if (!Array.isArray(t[k])) fail(`"${k}" is not an array of tables`);
          t[k].push({});
          t = t[k][t[k].length - 1];
          return;
        }
        if (!(k in t)) t[k] = {};
        t = Array.isArray(t[k]) ? t[k][t[k].length - 1] : t[k];
        if (typeof t !== "object" || t === null) fail(`"${k}" is not a table`);
      });
      return t;
    }

    function assign(tbl, path, val) {
      let t = tbl;
      path.slice(0, -1).forEach(k => {
        if (!(k in t)) t[k] = {};
        t = t[k];
        if (typeof t !== "object" || t === null || Array.isArray(t)) fail(`"${k}" is not a table`);
      });
      const last = path[path.length - 1];
      if (last in t) fail(`duplicate key "${last}"`);
      t[last] = val;
    }

    while (i < n) {
      skipBlank();
      if (i >= n) break;
      if (src[i] === "[") {
        const isArray = src[i + 1] === "[";
        i += isArray ? 2 : 1;
        const path = keyPath();
        skipWs();
        if (!src.startsWith(isArray ? "]]" : "]", i)) fail("expected ] after table name");
        i += isArray ? 2 : 1;
        cur = table(path, isArray);
      } else {
        const path = keyPath();
        skipWs();
        if (src[i] !== "=") fail("expected =");
        i++;
        assign(cur, path, value());
      }
      endOfLine();
    }
    return out;
  }

  // ── Preset derivation (mirrors scripts/import-preset.py) ──────────────────
  const LANGS = ["rust", "nodejs", "python", "golang", "c", "deno", "php", "java", "kotlin", "haskell"];
  const GROUP = { os: "os", directory: "dir", git_branch: "git", git_status: "git", time: "time" };
  LANGS.forEach(l => { GROUP[l] = "lang"; });
  const ORDER = ["os", "dir", "git", "lang", "time"];
  const MODULE = { os: "os", dir: "directory", git: "git_branch", time: "time" };
  const TOKEN = /\[([^\]]*)\]\(([^)]*)\)|\$(\w+)/gu;
  const POWERLINE = /[-]/gu;
  const DEFAULT_BG = "#16161e", DEFAULT_FG = "#e6e6f0";
  const DEFAULT_ICON = "\u{f08c7}";

  const len = (s) => [...s].length;  // code points, as Python's len()
  const search = (re, s) => { const m = re.exec(s); return m ? m[1] : null; };

  function importStarshipPreset(raw, opts = {}) {
    const toml = parseToml(raw);
    const pal = (toml.palettes || {})[toml.palette] || {};
    const mod = (name) => (name && toml[name]) || {};

    // palette name or hex; null for prev_bg/prev_fg (unknown statically)
    const color = (c) => {
      if (c == null || c === "transparent") return "transparent";
      if (c.startsWith("prev_")) return null;
      return String(c.startsWith("#") ? c : (pal[c] ?? c)).toLowerCase();
    };

    // (bg, fg) of a module: its inner format colors win over `style`
    const styleColors = (name) => {
      const m = mod(name);
      const fmt = m.format || "", style = m.style || "";
      const inner = [...fmt.matchAll(/\]\((?!\$style)([^)]*)\)/gu)].map(x => x[1])
        .filter(g => g.includes("bg:") && !g.includes("prev_"));
      const src = inner.length ? inner[0] : style;
      const bg = search(/bg:(\S+)/u, src);
      const fg = search(/fg:(\S+)/u, src) ?? search(/fg:(\S+)/u, style);
      return [bg != null ? color(bg) : null, fg != null ? color(fg) : null];
    };

    const langModule = LANGS.find(l => l in toml) || null;

    // first prompt line split into [group, literal cells, had $fill] runs
    const runs = (() => {
      const fmt = String(toml.format || "").split("$character")[0];
      const out = [];
      let cur = null, run = [], fill = false;
      for (const [, text = "", style = "", v] of fmt.matchAll(TOKEN)) {
        if (v) {
          if (v === "fill") { fill = true; continue; }
          const g = GROUP[v];
          if (!g || g === cur) continue;  // optional modules (username, docker_context...) render nothing
          out.push([cur, run, fill]);
          cur = g; run = []; fill = false;
          continue;
        }
        const fg = search(/fg:(\S+)/u, style), bg = search(/bg:(\S+)/u, style);
        const words = style.split(/\s+/u).filter(Boolean);
        const bare = style && fg == null && bg == null && words.length ? words[0] : null;
        run.push([text, color(fg ?? bare), bg != null ? color(bg) : "transparent"]);
      }
      out.push([cur, run, fill]);
      return out;
    })();

    const icons = (() => {
      const out = {};
      const mods = { ...MODULE, lang: langModule };
      for (const k of Object.keys(mods)) {
        const m = mod(mods[k]);
        let sym = String(m.symbol || "").trim();
        if (!sym) {
          const text = String(m.format || "").replace(/\$\w+|\]\([^)]*\)|\[/gu, "");
          sym = search(/([^\x00-\x7f\s]+)/u, text.replace(POWERLINE, "")) || "";
        }
        const clean = sym.replace(POWERLINE, "").trim();
        if (clean) out[k] = clean;
      }
      return out;
    })();

    const character = (() => {
      const ch = toml.character || {};
      const ok = ch.success_symbol || "", err = ch.error_symbol || "";
      const first = (s) => search(/\]\((?:bold )?(?:fg:)?([#\w]+)/u, s);
      const out = {};
      const sym = [...ok.matchAll(/\[([^\]]*)\]/gu)].map(x => x[1]).join("").trim();
      if (sym) out.charSymbol = sym;
      if (first(ok)) out.charColor = color(first(ok));
      if (first(err)) out.errorCharColor = color(first(err));
      return out;
    })();

    const id = opts.id || slugify(opts.name || presetName(raw) || "custom");
    const name = opts.name || presetName(raw) || "Custom Prompt";

    const seg = {};
    for (const k of Object.keys(MODULE)) seg[k] = styleColors(MODULE[k]);
    seg.lang = langModule ? styleColors(langModule) : [null, null];
    const transparent = Object.values(seg).every(([b]) => b == null);
    const bg = opts.bg || ("base" in pal ? color(pal.base) : DEFAULT_BG);
    const fg = "text" in pal ? color(pal.text) : DEFAULT_FG;
    const colors = {};
    for (const [k, [b, f]] of Object.entries(seg)) {
      colors[k] = transparent ? [f || fg, bg] : [b || bg, f || fg];
    }

    const lead = runs[0][1], tail = runs[runs.length - 1][1];
    const lastGroup = runs[runs.length - 1][0];
    const unresolved = (cells) => cells.some(c => c[2] == null || (c[1] == null && c[0].trim()));
    const firstGlyph = (cells) => (cells.length ? cells[0][0].trim() : "");

    // single-glyph caps and separators (fallbacks when the cells below don't apply)
    const seps = ORDER.slice(0, -1).map((g, idx) => {
      const found = runs.find(([grp]) => grp === g);
      let sep = firstGlyph(found ? found[1] : []);
      if (!sep) {  // separators living inside the next module's format: [X](fg:prev_bg ...)
        const nxt = ORDER[idx + 1];
        const m = /^\[([^\]]+)\]\(fg:prev_bg/u.exec(mod(MODULE[nxt] || langModule).format || "");
        sep = m ? m[1] : "";
      }
      return sep;
    });

    const entry = {
      id, name, preview: " █  █ ",
      promptStyle: transparent ? "transparent" : "powerline",
      leftCap: transparent ? "" : firstGlyph(lead),
      sep: transparent ? "" : (new Set(seps).size === 1 ? seps[0] : seps),
      rightCap: transparent ? "" : (tail.length && lastGroup === "time" ? tail[tail.length - 1][0].trim() : ""),
      theme: id,
      icon: icons.os || DEFAULT_ICON,
      ...character,
      moduleIcons: icons
    };

    if (transparent && runs.some(([, , f]) => f)) {
      // divider: a full-width rule ($fill) with dir/time set into it
      const rule = runs.flatMap(([, cells]) => cells)
        .filter(c => c[0].trim() && c[1] != null && c[1] !== "transparent").map(c => c[1]);
      if (rule.length) {
        entry.layout = "divider";
        entry.ruleStops = [0, 1, 2, 3, 4, 5].map(k => rule[Math.round(k * (rule.length - 1) / 5)]);
      }
    } else if (!transparent) {
      if (lead.length && !unresolved(lead) && !(
        lead.length === 1 && lead[0][1] === colors.os[0] && lead[0][2] === "transparent"
        && len(lead[0][0].trim()) <= 1)) {
        entry.lead = lead;
      }
      const chains = {};
      let bleed = null;
      for (let r = 1; r + 1 < runs.length; r++) {
        const [a, cells, fill] = runs[r], b = runs[r + 1][0];
        if (!a || !cells.length || unresolved(cells) || ORDER.indexOf(b) !== ORDER.indexOf(a) + 1) continue;
        if (fill) {
          bleed = cells.every(c => !c[0].trim()) ? cells.map(c => c[2]) : cells.map(c => [c[1], c[2]]);
        } else if (!(cells.length === 1 && cells[0][1] === colors[a][0] && cells[0][2] === colors[b][0])) {
          chains[a] = cells;
        }
      }
      if (Object.keys(chains).length) entry.chains = chains;
      if (lastGroup === "time" && tail.length && !unresolved(tail) && !(
        tail.length === 1 && tail[0][1] === colors.time[0] && len(tail[0][0].trim()) <= 1)) {
        entry.tail = tail;
      }
      if (bleed) entry.bleed = bleed;
    }

    entry.category = opts.category || (transparent ? "minimal" : "powerline");
    entry.modules = { os: true, dir: true, git: true, lang: true, time: true };
    entry.author = opts.author || "Starship Studio";
    entry.authorUrl = opts.authorUrl ?? "https://github.com/felipecm-br/starship-studio";
    entry.rawToml = raw.trim();

    const pair = (k) => ({ bg: colors[k][0], fg: colors[k][1] });
    const theme = {
      name, bg, fg,
      os: pair("os"), dir: pair("dir"), git: pair("git"), lang: pair("lang"),
      ai: pair("git"), time: pair("time")
    };
    return { preset: entry, theme };
  }

  function presetName(raw) {
    const m = /^#\s+Preset:\s*(.+)$/mu.exec(raw);
    return m ? m[1].trim() : null;
  }

  function slugify(s) {
    return String(s).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "custom";
  }

  // Colors from someone else's TOML end up in inline styles: keep only hex and
  // plain color names (palette values that aren't colors become `fallback`).
  const SAFE_COLOR = /^(#[0-9a-f]{3,8}|[a-z]+)$/i;

  function sanitizePresetColors({ preset, theme }, fallback = "transparent") {
    const c = (v) => (v == null || SAFE_COLOR.test(v) ? v : fallback);
    const cells = (list) => list.map(([glyph, fg, bg]) => [glyph, c(fg), c(bg)]);
    const p = { ...preset };
    ["charColor", "errorCharColor"].forEach(k => { if (k in p) p[k] = c(p[k]); });
    if (p.ruleStops) p.ruleStops = p.ruleStops.map(c);
    if (p.lead) p.lead = cells(p.lead);
    if (p.tail) p.tail = cells(p.tail);
    if (p.chains) p.chains = Object.fromEntries(Object.entries(p.chains).map(([k, v]) => [k, cells(v)]));
    if (p.bleed) p.bleed = p.bleed.map(b => (Array.isArray(b) ? b.map(c) : c(b)));
    const t = { ...theme, bg: SAFE_COLOR.test(theme.bg) ? theme.bg : DEFAULT_BG, fg: SAFE_COLOR.test(theme.fg) ? theme.fg : DEFAULT_FG };
    ["os", "dir", "git", "lang", "ai", "time"].forEach(k => { t[k] = { bg: c(theme[k].bg), fg: c(theme[k].fg) }; });
    return { preset: p, theme: t };
  }

  const api = { importStarshipPreset, parseToml, sanitizePresetColors };
  if (typeof module === "object" && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof window !== "undefined" ? window : globalThis);

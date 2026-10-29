#!/usr/bin/env bash
# Render the live preview of Starship Studio presets into one PNG contact sheet,
# so each preset can be compared with its TOML / a real terminal (see AGENTS.md).
#
# Usage: scripts/preview-sheet.sh [-o sheet.png] [-w width] [PRESET_ID ...]
#   No ids: every preset. Ids are the preset "id" fields (e.g. chroma_opal).
#   Each row shows both prompt lines on the preset's terminal background.
# Needs chromium or google-chrome on PATH.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="preset-sheet.png"
width=1120
while getopts "o:w:h" opt; do
  case "$opt" in
    o) out="$OPTARG" ;;
    w) width="$OPTARG" ;;
    *) sed -n '2,8p' "$0"; exit 0 ;;
  esac
done
shift $((OPTIND - 1))

browser="$(command -v chromium || command -v google-chrome-stable || command -v google-chrome || true)"
[[ -n "$browser" ]] || { echo "chromium or google-chrome is required" >&2; exit 1; }

ids_json="[]"
if (($#)); then ids_json="[$(printf '"%s",' "$@" | sed 's/,$//')]"; fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# Build the sheet in the page itself: apply each preset, clone both prompt lines into a row
cat > "$tmp/sheet.js" <<EOF
window.onerror = (m) => { document.title = "ERROR: " + m; };
window.addEventListener("load", () => {
  const wanted = $ids_json;
  const list = wanted.length ? wanted.map(id => presets.find(p => p.id === id)) : presets;
  const missing = wanted.filter((id, i) => !list[i]);
  if (missing.length) { document.title = "ERROR: unknown preset " + missing.join(", "); return; }
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:0;top:0;width:${width}px;padding:10px;box-sizing:border-box;background:#0d0f17;--prompt-height:30px;--sep-scale:1";
  list.forEach(p => {
    applyPreset(p);
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:12px;padding:6px 10px;margin-bottom:4px;background:" + terminalPreview.style.backgroundColor;
    const label = document.createElement("div");
    label.textContent = p.id;
    label.style.cssText = "width:230px;flex:none;color:#aaa;font:12px sans-serif";
    const lines = document.createElement("div");
    lines.style.cssText = "flex:1;min-width:0;display:flex;flex-direction:column;font-family:var(--font-code)";
    lines.appendChild(promptContainer.cloneNode(true));
    const line2 = document.querySelector(".prompt-line-2").cloneNode(true);
    line2.style.marginTop = "2px";
    lines.appendChild(line2);
    row.append(label, lines);
    host.appendChild(row);
  });
  document.body.replaceChildren(host);
  document.body.style.cssText = "margin:0;padding:0;background:#0d0f17";
  document.documentElement.style.overflow = "hidden";
  document.title = "rows=" + list.length + " height=" + host.offsetHeight;
});
EOF

# Same page, with a <base> so its relative assets still resolve from the repo
sed -e "s#<head>#<head><base href=\"file://$repo/\">#" \
    -e "s#</body>#<script src=\"file://$tmp/sheet.js\"></script></body>#" \
    "$repo/index.html" > "$tmp/sheet.html"

flags=(--headless=new --no-sandbox --disable-gpu --allow-file-access-from-files --virtual-time-budget=6000)
title="$("$browser" "${flags[@]}" --window-size="$width,1000" --dump-dom "file://$tmp/sheet.html" 2>/dev/null \
  | grep -o '<title>[^<]*' | sed 's/<title>//' || true)"
case "$title" in
  rows=*) ;;
  *) echo "sheet failed: ${title:-no output}" >&2; exit 1 ;;
esac
height="${title##*height=}"
"$browser" "${flags[@]}" --window-size="$width,$((height + 20))" --screenshot="$(realpath -m "$out")" \
  "file://$tmp/sheet.html" >/dev/null 2>&1
echo "${title%% *} -> $out"

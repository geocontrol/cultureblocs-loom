#!/bin/sh
# Refresh app/vendor from the sibling cultureblocs-string checkout.
# Loom must work with no String running, so the validator, strip, refs
# helpers and lexicons are copied in rather than loaded from the String.
# app/test/vendor.test.mjs fails if these copies drift from the String's.
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
string=${STRING_REPO:-"$here/../cultureblocs-string"}
[ -d "$string/sdk/js" ] || { echo "no cultureblocs-string at $string (set STRING_REPO)" >&2; exit 1; }

vendor="$here/app/vendor"
rm -rf "$vendor/lexicons"
mkdir -p "$vendor/lexicons"
cp "$string/sdk/js/lexicon.js" "$string/sdk/js/strip.js" "$string/sdk/js/refs.js" "$vendor/"
(cd "$string/lexicons" && find . -name '*.json' | sed 's|^\./||' | sort) > "$vendor/lexicons/.files"
while read -r f; do
  mkdir -p "$vendor/lexicons/$(dirname "$f")"
  cp "$string/lexicons/$f" "$vendor/lexicons/$f"
done < "$vendor/lexicons/.files"
# The browser cannot list a directory, so ship the list as JSON.
node -e 'const fs=require("fs");const f=process.argv[1];fs.writeFileSync(f.replace(/\.files$/,"index.json"),JSON.stringify(fs.readFileSync(f,"utf8").trim().split("\n"),null,2)+"\n");fs.unlinkSync(f)' "$vendor/lexicons/.files"
echo "vendored $(ls "$vendor"/*.js | wc -l | tr -d ' ') modules and $(node -e 'console.log(require(process.argv[1]).length)' "$vendor/lexicons/index.json") lexicons from $string"

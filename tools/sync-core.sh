#!/bin/sh
# Copies the shared core from this checkout to the other line's checkout.
#
# Two release lines share one core: main (module API 2.1, Companion 5.1+) and companion-4
# (module API 1.13, Companion 4.1+). Files directly in src/ and test-api.mjs are the core and
# must stay identical; src/companion.ts (the module API adapter), src/main.ts (the entry),
# src/presets/, test-presets.mjs, package.json and companion/ belong to each line.
#
#   tools/sync-core.sh ../companion-module-multicam-rcp-v4
#
# then build and test there, and commit on that branch.
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
there=${1:?usage: tools/sync-core.sh <other checkout>}
[ -f "$there/companion/manifest.json" ] || { echo "$there is not a module checkout" >&2; exit 1; }
for file in "$here"/src/*.ts; do
	name=$(basename "$file")
	case "$name" in companion.ts | main.ts) continue ;; esac
	cp "$file" "$there/src/$name"
done
# A core file deleted here goes there too.
for file in "$there"/src/*.ts; do
	name=$(basename "$file")
	case "$name" in companion.ts | main.ts) continue ;; esac
	[ -f "$here/src/$name" ] || rm "$file"
done
cp "$here/test-api.mjs" "$there/test-api.mjs"
git -C "$there" status --short -- src test-api.mjs

#!/usr/bin/env bash
# Builds the Mailbox Ghia app.
#   build.sh                      vendor/ghia (link:) -> dist/Mailbox-Ghia.app
#   build.sh vendor <label>       vendor/ghia (link:) -> dist/history/Mailbox-Ghia-<label>.app
#   build.sh npm:<version> [label] the published @ghia/solid + @ghia/native <version>, installed in an
#                                  isolated temp copy -> dist/history/Mailbox-Ghia-<label, default version>.app
# The app source (src/) is the same for every source; only the Ghia packages differ.
set -euo pipefail

cd "$(dirname "$0")"
here="$PWD"
repo_root="$(cd ../.. && pwd)"
source="${1:-vendor}"
label="${2:-}"

# The solid-js vendor/ghia resolves, so every Ghia source builds against the same Solid.
SOLID_JS_VERSION=1.9.15

[ -f "$repo_root/data/messages.json" ] || bun "$repo_root/data/generate.ts"

if [ -n "$label" ] || [[ "$source" == npm:* ]]; then
  label="${label:-${source#npm:}}"
  out="$repo_root/dist/history/Mailbox-Ghia-$label.app"
  mkdir -p "$repo_root/dist/history"
else
  out="$repo_root/dist/Mailbox-Ghia.app"
fi

case "$source" in
  vendor)
    [ -f "$repo_root/vendor/ghia/packages/native/gpuix-native.darwin-arm64.node" ] \
      || { echo "vendor/ghia is not built: run scripts/setup-ghia.sh" >&2; exit 1; }
    bun install --frozen-lockfile
    GHIA_APP_OUT="$out" BENCH_ROOT="$repo_root" NODE_ENV=production bun build.ts
    ;;
  npm:*)
    version="${source#npm:}"
    [ -n "$version" ] || { echo "npm: needs a version" >&2; exit 1; }
    work="$(mktemp -d "${TMPDIR:-/tmp}/ghia-bench-npm.XXXXXX")"
    trap 'rm -rf "$work"' EXIT
    cp -R src build.ts native-cjs-plugin.ts tsconfig.json bunfig.toml "$work/"
    bun -e '
      const pkg = JSON.parse(await Bun.file(process.argv[1]).text())
      pkg.dependencies = { "@ghia/native": process.argv[2], "@ghia/solid": process.argv[2], "solid-js": process.argv[3] }
      await Bun.write(process.argv[4], JSON.stringify(pkg, null, 2) + "\n")
    ' package.json "$version" "$SOLID_JS_VERSION" "$work/package.json"
    (
      cd "$work"
      bun install
      copies="$(find node_modules -type d -name solid-js -path '*node_modules/solid-js' | wc -l | tr -d ' ')"
      [ "$copies" = 1 ] || { echo "expected one solid-js instance, found $copies" >&2; exit 1; }
      for name in solid native; do
        [ "$(bun -e 'console.log(JSON.parse(await Bun.file(process.argv[1]).text()).version)' "node_modules/@ghia/$name/package.json")" = "$version" ] \
          || { echo "@ghia/$name did not resolve to $version" >&2; exit 1; }
      done
      GHIA_APP_OUT="$out" BENCH_ROOT="$repo_root" NODE_ENV=production bun build.ts
    )
    ;;
  *)
    echo "usage: build.sh [vendor|npm:<version>] [label]" >&2
    exit 1
    ;;
esac
echo "$out"

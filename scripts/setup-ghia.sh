#!/usr/bin/env bash
# Clones a local Ghia checkout at a pinned revision into vendor/ghia and builds it the way Ghia
# publishes it (release addon with test-support, then @ghia/solid's dist).
set -euo pipefail

GHIA_SRC="${GHIA_SRC:-$HOME/code/fdarian/ghia}"
GHIA_REV="${GHIA_REV:-8fcd806f5969c5eafc00ee1114ef7b66d8a2ca15}"
ZED_REV="${ZED_REV:-451f7ec4d15f7d7444a1f347d5b916e2a7989bab}"
HEAVY="${GHIA_HEAVY:-$HOME/.claude/notes/plans/gpuix-heavy.sh}"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dest="$root/vendor/ghia"
addon="$dest/packages/native/gpuix-native.darwin-arm64.node"
stamp="$dest/.setup-ghia-built"

[ -d "$GHIA_SRC/.git" ] || { echo "GHIA_SRC is not a git checkout: $GHIA_SRC" >&2; exit 1; }
[ -d "$GHIA_SRC/zed" ] || { echo "no zed checkout at $GHIA_SRC/zed" >&2; exit 1; }
git -C "$GHIA_SRC" cat-file -e "$GHIA_REV^{commit}" \
  || { echo "GHIA_REV $GHIA_REV is not in $GHIA_SRC" >&2; exit 1; }
git -C "$GHIA_SRC/zed" cat-file -e "$ZED_REV^{commit}" \
  || { echo "zed commit $ZED_REV is not in $GHIA_SRC/zed" >&2; exit 1; }

if [ -d "$dest/.git" ]; then
  git -C "$dest" remote set-url origin "$GHIA_SRC"
  git -C "$dest" fetch --quiet origin '+refs/heads/*:refs/remotes/origin/*'
else
  mkdir -p "$root/vendor"
  git clone --quiet --no-checkout "$GHIA_SRC" "$dest"
fi
git -C "$dest" checkout --quiet --detach "$GHIA_REV"

# The submodule URL is overridden in this clone's config only, so .gitmodules stays untouched and
# nothing reaches the network (the zed repo is several GB).
gitlink="$(git -C "$dest" rev-parse HEAD:zed)"
if [ "$gitlink" != "$ZED_REV" ]; then
  echo "zed gitlink at $GHIA_REV is $gitlink, expected $ZED_REV" >&2
  exit 1
fi
git -C "$dest" submodule init zed >/dev/null
git -C "$dest" config submodule.zed.url "$GHIA_SRC/zed"
git -C "$dest" -c protocol.file.allow=always submodule update --init zed
[ "$(git -C "$dest/zed" rev-parse HEAD)" = "$ZED_REV" ] \
  || { echo "vendor/ghia/zed is not at $ZED_REV" >&2; exit 1; }
[ -f "$dest/zed/crates/gpui/Cargo.toml" ] \
  || { echo "vendor/ghia/zed/crates/gpui/Cargo.toml is missing" >&2; exit 1; }

(cd "$dest" && pnpm install --frozen-lockfile)

want="$GHIA_REV $ZED_REV"
if [ "${FORCE_BUILD:-0}" != 1 ] && [ -f "$addon" ] && [ "$(cat "$stamp" 2>/dev/null)" = "$want" ]; then
  echo "addon already built for $want (FORCE_BUILD=1 to rebuild)"
else
  rm -f "$stamp"
  if [ -x "$HEAVY" ]; then
    (cd "$dest/packages/native" && "$HEAVY" bun run build)
  else
    (cd "$dest/packages/native" && bun run build)
  fi
  echo "$want" > "$stamp"
fi

(cd "$dest/packages/solid" && bun run build)
[ -d "$dest/packages/solid/dist" ] || { echo "packages/solid/dist missing after build" >&2; exit 1; }

echo
echo "ghia   $(git -C "$dest" rev-parse HEAD)"
echo "zed    $(git -C "$dest/zed" rev-parse HEAD)"
echo "addon  $addon ($(stat -f %z "$addon") bytes)"
echo "rustc  $(cd "$dest" && rustc --version)"
echo "bun    $(bun --version)"

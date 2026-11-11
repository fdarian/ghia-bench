#!/usr/bin/env bash
# Clones Ghia at a pinned revision into vendor/ghia and builds it the way Ghia publishes it
# (release addon with test-support, then @ghia/solid's dist).
#
# GHIA_SRC=/path/to/ghia  clone from a local checkout (zed taken from its zed/ too, no network).
# unset                   clone https://github.com/fdarian/ghia.git; zed (several GB) is fetched as a
#                         blobless single-commit fetch of the pinned gitlink only.
# GHIA_HEAVY=<wrapper>    optional command that wraps the native build (e.g. a lock script).
set -euo pipefail

GHIA_SRC="${GHIA_SRC:-}"
GHIA_REV="${GHIA_REV:-8c3ad3d14c31b88d6d7da9685b21586cb6409f66}"
ZED_REV="${ZED_REV:-59a0a038c85089511f63097a175305f808b9373a}"
HEAVY="${GHIA_HEAVY:-}"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dest="$root/vendor/ghia"
addon="$dest/packages/native/gpuix-native.darwin-arm64.node"
stamp="$dest/.setup-ghia-built"

mkdir -p "$root/vendor"

if [ -n "$GHIA_SRC" ]; then
  [ -e "$GHIA_SRC/.git" ] || { echo "GHIA_SRC is not a git checkout: $GHIA_SRC" >&2; exit 1; }
  [ -d "$GHIA_SRC/zed" ] || { echo "no zed checkout at $GHIA_SRC/zed" >&2; exit 1; }
  git -C "$GHIA_SRC" cat-file -e "$GHIA_REV^{commit}" \
    || { echo "GHIA_REV $GHIA_REV is not in $GHIA_SRC" >&2; exit 1; }
  git -C "$GHIA_SRC/zed" cat-file -e "$ZED_REV^{commit}" \
    || { echo "zed commit $ZED_REV is not in $GHIA_SRC/zed" >&2; exit 1; }
  origin="$GHIA_SRC"
  clone_args=()
else
  origin=https://github.com/fdarian/ghia.git
  clone_args=(--filter=blob:none)
fi

if [ -d "$dest/.git" ]; then
  git -C "$dest" remote set-url origin "$origin"
  git -C "$dest" fetch --quiet --no-recurse-submodules origin '+refs/heads/*:refs/remotes/origin/*'
else
  git clone --quiet --no-checkout ${clone_args[@]+"${clone_args[@]}"} "$origin" "$dest"
fi
git -C "$dest" cat-file -e "$GHIA_REV^{commit}" \
  || { echo "GHIA_REV $GHIA_REV is not in $origin" >&2; exit 1; }
# --force: the native build rewrites the tracked packages/native/index.{js,cjs}, which would block the checkout.
git -C "$dest" checkout --quiet --force --detach "$GHIA_REV"

gitlink="$(git -C "$dest" rev-parse HEAD:zed)"
if [ "$gitlink" != "$ZED_REV" ]; then
  echo "zed gitlink at $GHIA_REV is $gitlink, expected $ZED_REV" >&2
  exit 1
fi
git -C "$dest" submodule init zed >/dev/null
if [ -n "$GHIA_SRC" ]; then
  # Overridden in this clone's config only, so .gitmodules stays untouched.
  git -C "$dest" config submodule.zed.url "$GHIA_SRC/zed"
  git -C "$dest" -c protocol.file.allow=always submodule update --init zed
else
  git -C "$dest" submodule update --init --depth 1 --filter=blob:none zed
fi
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
  if [ -n "$HEAVY" ] && [ -x "$HEAVY" ]; then
    (cd "$dest/packages/native" && "$HEAVY" bun run build)
  else
    (cd "$dest/packages/native" && bun run build)
  fi
  echo "$want" > "$stamp"
fi

# @ghia/solid imports the `ghia` package (Vite plugin), so its dist has to exist first.
(cd "$dest/packages/ghia" && bun run build)
(cd "$dest/packages/solid" && bun run build)
[ -d "$dest/packages/solid/dist" ] || { echo "packages/solid/dist missing after build" >&2; exit 1; }

echo
echo "ghia   $(git -C "$dest" rev-parse HEAD)"
echo "zed    $(git -C "$dest/zed" rev-parse HEAD)"
echo "addon  $addon ($(stat -f %z "$addon") bytes)"
echo "rustc  $(cd "$dest" && rustc --version)"
echo "bun    $(bun --version)"

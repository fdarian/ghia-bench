#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
swift build -c release
mkdir -p ../bin
cp "$(swift build -c release --show-bin-path)/benchhelper" ../bin/benchhelper
echo "built ../bin/benchhelper"

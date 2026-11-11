#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
swift build -c release
mkdir -p ../bin
cp "$(swift build -c release --show-bin-path)/benchstatus" ../bin/benchstatus
echo "built ../bin/benchstatus"

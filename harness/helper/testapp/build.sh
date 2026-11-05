#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p ../../bin
swiftc -O main.swift -o ../../bin/testapp
echo "built ../../bin/testapp"

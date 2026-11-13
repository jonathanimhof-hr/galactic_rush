#!/bin/bash
# Each course at three moments, chase and cockpit view (medium quality). Usage: tests/moments.sh OUTDIR
OUT=${1:-/tmp/gr2}; mkdir -p "$OUT"; cd "$(dirname "$0")/.."
for trk in ${TRACKS:-foundry belt spire ring}; do
  python3 tests/shots.py "$OUT/m-$trk.png" --size 960x540 \
    "track=$trk&quality=medium&ff=6&wait=4" "track=$trk&quality=medium&ff=6&wait=4&cam=cockpit" \
    "track=$trk&quality=medium&ff=19&wait=4" "track=$trk&quality=medium&ff=19&wait=4&cam=cockpit" \
    "track=$trk&quality=medium&ff=31&wait=4" "track=$trk&quality=medium&ff=31&wait=4&cam=cockpit"
done

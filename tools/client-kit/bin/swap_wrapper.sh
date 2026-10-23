#!/bin/sh
# ICST copy swap wrapper (DD ICST-SLOTMAP-1). Runs the generator in a scratch copy (never inside DD's folder), then the applier on the
# fresh recipe. Dry run unless "--apply" is passed. Usage:
#   swap_wrapper.sh <slotmap_gen.py> <approved_copy_docs dir> [--only slug ...] [--apply] [--out dir]
set -e
GEN="$1"; DOCS="$2"; shift 2
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
cp "$GEN" "$WORK/slotmap_gen.py"
(cd "$WORK" && python3 slotmap_gen.py > "$WORK/gen.log" 2>&1) || { cat "$WORK/gen.log"; echo "generator failed"; exit 5; }
python3 "$HERE/copy_swap.py" --spec "$WORK/ICST_SLOTMAP_1.json" --docs "$DOCS" --out "${OUT:-$WORK/out}" "$@"
echo "recipe and output in $WORK"

#!/bin/sh
# Runs every check for the game; all must pass before a slice is done.
set -e
cd "$(dirname "$0")"
node check.mjs | grep -q "^PASS" && echo "PASS rules"
node difficulty.check.mjs | grep -q "^PASS" && echo "PASS difficulty"
node play.mjs | tail -1

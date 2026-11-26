#!/usr/bin/env bash
set -Eeuo pipefail

echo "Starting CareerScout with sleep/idle inhibition for overnight discovery..."
if command -v systemd-inhibit >/dev/null 2>&1; then
  exec systemd-inhibit \
    --what=idle:sleep \
    --who="CareerScout" \
    --why="Running CareerScout overnight job discovery & contact research" \
    npm run dev
else
  echo "Note: systemd-inhibit not available on this system; starting npm run dev directly."
  exec npm run dev
fi

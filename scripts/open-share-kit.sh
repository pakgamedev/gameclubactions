#!/usr/bin/env bash
# Open this week's curator share kit (cover + copy + social composers).
set -euo pipefail

URL="${SHARE_KIT_URL:-https://pakgamedev.com/gameclubactions/outreach/share.html}"

if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 &
elif command -v open >/dev/null 2>&1; then
  open "$URL"
else
  echo "$URL"
fi

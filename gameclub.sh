#!/usr/bin/env bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="$SCRIPT_DIR/gameclub.log"

exec >> "$LOG" 2>&1
set -x
set -e

echo "========== START =========="
date
echo "Raw arg: $1"

# Strip scheme
RAW="${1#gameclub://}"

# Decode %xx once
DECODED=$(printf '%b' "${RAW//%/\\x}")

echo "Decoded: $DECODED"

# Extract query
QUERY="${DECODED#*\?}"

SOURCE=""
URL_PARAM=""

while IFS='=' read -r key value; do
  case "$key" in
    source) SOURCE="$value" ;;
    url) URL_PARAM="$value" ;;
  esac
done <<EOF
$(echo "$QUERY" | tr '&' '\n')
EOF

if [ -z "$SOURCE" ] || [ -z "$URL_PARAM" ]; then
  echo "ERROR: source or url missing"
  exit 1
fi

echo "SOURCE=$SOURCE"
echo "URL=$URL_PARAM"

case "$SOURCE" in
  steam)
    ruby "$SCRIPT_DIR/newsteamgame.rb" "$URL_PARAM"
    ;;
  itch)
    ruby "$SCRIPT_DIR/newitchgame.rb" "$URL_PARAM"
    ;;
  *)
    echo "ERROR: unsupported source '$SOURCE'"
    exit 1
    ;;
esac

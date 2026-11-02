#!/bin/sh
set -eu
KIT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PYTHON=${PYTHON:-python3}
if ! command -v "$PYTHON" >/dev/null 2>&1; then
  echo 'Python 3.11+ is required. Install it, then rerun this installer.' >&2
  exit 1
fi
"$PYTHON" -c 'import sys; sys.exit(0 if sys.version_info >= (3,11) else "Python 3.11+ is required.")'
exec "$PYTHON" "$KIT_DIR/scripts/install.py" "$@"

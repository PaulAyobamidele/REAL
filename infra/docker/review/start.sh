#!/bin/sh
# The authoring helper in the background, nginx in the foreground (the container's main process).
set -e
cd /opt/real
python -m scripts.redsl.serve --port 8765 &
exec nginx -g 'daemon off;'

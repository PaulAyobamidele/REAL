#!/usr/bin/env bash
# Build the study site and publish it to a gh-pages branch (GitHub Pages).
#
#   npm run publish:study                 # to the remote "origin"
#   npm run publish:study -- <remote>     # another remote name or URL
#
# Builds with `npm run build:study` (the study rounds copied from
# ../artifacts/study, read only), then pushes ONLY the built site, as a single
# commit, to the remote's gh-pages branch (force: the branch holds the latest
# site and no history, so the 250 MB of round data never accumulates). Your
# working branch and the main history are not touched. Asks before pushing.
# GitHub: Settings -> Pages -> Deploy from branch -> gh-pages, / (root).
set -euo pipefail
cd "$(dirname "$0")/.."

REMOTE="${1:-origin}"
URL="$(git remote get-url "$REMOTE" 2>/dev/null || echo "$REMOTE")"

npm run build:study

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp -R dist-study/. "$TMP/"
touch "$TMP/.nojekyll"   # serve every file as it is (no Jekyll processing)
SIZE="$(du -sh "$TMP" | cut -f1)"
BUILD="$(git describe --always --dirty)"  # "-dirty": uncommitted changes are in the site

echo
echo "About to publish the study site (${SIZE}, code ${BUILD}) to:"
echo "  ${URL}  branch gh-pages  (replaced, force push)"
read -r -p "Publish? [y/N] " answer
[[ "$answer" == "y" || "$answer" == "Y" ]] || { echo "Not published."; exit 1; }

cd "$TMP"
git init -q
git checkout -q -b gh-pages
git add -A
git -c user.name="study site" -c user.email="study-site@users.noreply.github.com" \
  commit -q -m "Study site, code ${BUILD}"
git push -f "$URL" gh-pages
echo "Published. Pages: Settings -> Pages -> Deploy from branch -> gh-pages."

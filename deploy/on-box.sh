#!/usr/bin/env bash
#
# Build the current main on the box and swap it in [DEPLOY-AWS.md §11].
#
# Run by the self-hosted runner after the checks on GitHub have gone green, and by hand over SSH
# when the runner is not there. Nginx serves `/srv/npt/web/dist` off disk — there is no process
# to reload, so a web deploy is a build and a rename.
#
# **The build does not happen in `dist/`.** `vite build` empties its output directory first, so
# building in place takes the site down for the length of the build — thirty seconds of a blank
# page on a 2 GB box, at whatever moment somebody pressed merge. It builds into a sibling and is
# renamed into position at the end, which is two filesystem operations rather than thirty
# seconds. The previous build is kept as `dist.old`, so putting it back is one `mv`.
#
set -Eeuo pipefail

APP="${DEPLOY_DIR:-/srv/npt/web}"
SITE="${SITE_URL:-http://127.0.0.1/}"

say() { printf '\n\033[1m→ %s\033[0m\n' "$*"; }

cd "$APP"

PREVIOUS=$(git rev-parse HEAD)

say "Fetching"
git fetch --quiet origin main
TARGET=$(git rev-parse origin/main)

if [ "$PREVIOUS" = "$TARGET" ] && [ -d dist ]; then
  echo "Already on ${TARGET:0:8} — nothing to do."
  exit 0
fi

# `reset --hard` rather than `pull`: the box is a checkout nobody edits, and a merge commit
# created here by a stray local change is a divergence that has to be untangled over SSH.
git reset --hard --quiet "$TARGET"
echo "${PREVIOUS:0:8} → ${TARGET:0:8}"

# The API base URL is baked in at build time, so `.env.production` has to exist before this and
# is never in the repo. Said out loud rather than discovered as a site that loads and can reach
# nothing, which is what a missing VITE_API_URL actually looks like.
if [ ! -f .env.production ]; then
  echo "No .env.production — the build would bake in no API URL and every request would" >&2
  echo "fail against the browser's own origin. Create it first:" >&2
  echo "  echo 'VITE_API_URL=https://api2.baluelastics.com/api' > $APP/.env.production" >&2
  exit 1
fi

say "Installing"
npm ci --no-audit --no-fund

say "Building"
rm -rf dist.new
npm run build -- --outDir dist.new --emptyOutDir

# A build that produced no entry point is a build that failed quietly, and swapping it in would
# replace a working site with a directory listing.
if [ ! -s dist.new/index.html ]; then
  echo "The build produced no index.html — nothing has been swapped in." >&2
  rm -rf dist.new
  exit 1
fi

say "Swapping in"
rm -rf dist.old
[ -d dist ] && mv dist dist.old
mv dist.new dist

# Nginx is not reloaded: it resolves the path per request, so the new files are served the
# instant the rename lands. Reloading here would only mask a config change nobody made.
if curl -fsS --max-time 5 -o /dev/null "$SITE" 2>/dev/null; then
  echo "✓ ${TARGET:0:8} is being served"
else
  # Not a rollback: the files are on disk and correct, and a failure here is Nginx or the
  # certificate rather than this build. Rolling back would hide that.
  echo "The site did not answer at $SITE — the build is in place, so look at Nginx:" >&2
  echo "  sudo nginx -t && sudo systemctl status nginx" >&2
  echo "  Previous build is still at $APP/dist.old if you need it back." >&2
  exit 1
fi

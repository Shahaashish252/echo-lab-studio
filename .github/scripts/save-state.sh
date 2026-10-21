#!/usr/bin/env bash
# Commits the channel's plain-data state (videos, schedule, comments seen, analytics, job logs) back to the repo.
# Runs at the END of a job (never while the video maker is working: live progress uses the contents API instead).
set -e
cd "$GITHUB_WORKSPACE"
git config user.name "echo-lab-bot"
git config user.email "echo-lab-bot@users.noreply.github.com"
git add channel/*.json channel/analytics channel/jobs channel/videos 2>/dev/null || true
git diff --cached --quiet && { echo "no state changes"; exit 0; }
git commit -q -m "state: $1"
# the video maker leaves edited working files (app/src/scenes/auto/...); they are throwaway in the cloud and would
# block the rebase below, so drop them (only tracked edits outside the committed state)
git checkout -- . 2>/dev/null || true
for i in 1 2 3 4 5; do
  git pull -q --rebase -X theirs origin main && git push -q origin main HEAD:main && { echo "state saved"; exit 0; }
  git rebase --abort 2>/dev/null || true
  sleep $((i * 5))
done
echo "could not save state" && exit 1

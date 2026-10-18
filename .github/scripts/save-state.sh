#!/usr/bin/env bash
# Commits the channel's plain-data state (videos, schedule, comments seen, analytics, job logs) back to the repo.
set -e
cd "$GITHUB_WORKSPACE"
git config user.name "echo-lab-bot"
git config user.email "echo-lab-bot@users.noreply.github.com"
git add channel/*.json channel/analytics channel/jobs channel/videos 2>/dev/null || true
git diff --cached --quiet && { echo "no state changes"; exit 0; }
git commit -q -m "state: $1"
for i in 1 2 3 4 5; do
  git pull -q --rebase -X theirs origin main && git push -q origin HEAD:main && { echo "state saved"; exit 0; }
  sleep $((i * 5))
done
echo "could not save state" && exit 1

#!/usr/bin/env bash
# Writes the channel's login files from GitHub secrets (they are never committed).
set -e
cd "$GITHUB_WORKSPACE/channel"
[ -n "$YT_TOKEN_JSON" ] && printf '%s' "$YT_TOKEN_JSON" > token.json
[ -n "$YT_CLIENT_SECRET_JSON" ] && printf '%s' "$YT_CLIENT_SECRET_JSON" > client_secret.json
[ -n "$META_CONFIG_JSON" ] && printf '%s' "$META_CONFIG_JSON" > instagram.json
echo "secrets written"

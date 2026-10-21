#!/usr/bin/env bash
set -e
python -m pip install -q --upgrade pip
python -m pip install -q google-api-python-client google-auth-oauthlib requests pillow uv edge-tts
npm install -g -s @anthropic-ai/claude-code

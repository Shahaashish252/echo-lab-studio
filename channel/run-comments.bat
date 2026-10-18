@echo off
rem Scheduled every 10 minutes (Task Scheduler "EchoLab\Comments"): replies to new YouTube, Instagram and Facebook comments.
cd /d "%~dp0.."
python -m uv run --with google-api-python-client --with google-auth-oauthlib --with requests python -u channel/manager.py comments >> "channel\logs\comments.log" 2>&1

@echo off
rem Scheduled every 30 minutes (Task Scheduler "EchoLab\PostDue"): publishes approved videos at their time.
cd /d "%~dp0.."
python -m uv run --with google-api-python-client --with google-auth-oauthlib --with requests python -u channel/manager.py post-due >> "channel\logs\post-due.log" 2>&1

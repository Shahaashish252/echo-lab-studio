@echo off
rem Scheduled every morning (Task Scheduler "EchoLab\Daily"): new video, comment drafts, dashboard.
cd /d "%~dp0.."
for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set "D=%%d"
python -m uv run --with google-api-python-client --with google-auth-oauthlib --with requests python -u channel/manager.py daily >> "channel\logs\%D%.log" 2>&1

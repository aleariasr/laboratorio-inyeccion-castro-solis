@echo off
powershell -NoProfile -ExecutionPolicy Bypass -Command "docker compose --env-file '%~dp0..\docker\.env.prod' --file '%~dp0..\docker\compose.prod.yml' stop"
pause
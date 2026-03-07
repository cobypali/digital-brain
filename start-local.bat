@echo off
setlocal
cd /d "%~dp0"
start "" http://localhost:4173/index.html
python server.py

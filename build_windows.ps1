# Local Windows build (fallback for when you don't want to use GitHub Actions).
# Run from the repo root in PowerShell:  .\build_windows.ps1
# Requires: Node 18+, Python 3.10+, and (for a working board) the Phidget driver.

$ErrorActionPreference = "Stop"

Write-Host "==> Building web UI..." -ForegroundColor Cyan
Push-Location web
npm ci
npm run build
Pop-Location

Write-Host "==> Installing Python deps..." -ForegroundColor Cyan
python -m pip install --upgrade pip
pip install -r adapter/requirements.txt
pip install pyinstaller Phidget22

Write-Host "==> Packaging exe..." -ForegroundColor Cyan
pyinstaller roastmonitor.spec --noconfirm

Write-Host "==> Done. Output: dist\RoastMonitor.exe" -ForegroundColor Green

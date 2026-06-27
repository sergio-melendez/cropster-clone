# -*- mode: python ; coding: utf-8 -*-
#
# PyInstaller spec for the Windows single-file build.
# Build with:  pyinstaller roastmonitor.spec --noconfirm
# (Run from the repo root, AFTER `npm run build` in web/ so web/dist exists.)

from PyInstaller.utils.hooks import collect_all

datas = [("web/dist", "web_dist")]   # the built UI, unpacked to _MEIPASS/web_dist
binaries = []
hiddenimports = []

# Packages whose submodules load dynamically / lazily, so PyInstaller's static
# analysis can miss them — pull each in whole:
#   uvicorn    - loads protocol/loop submodules by name
#   Phidget22  - the Phidget Python wrapper
#   pypdf      - Cropster PDF profile import
#   multipart  - python-multipart; starlette imports it inside a try/except for
#                file uploads (profile import), which PyInstaller often misses.
for pkg in ("uvicorn", "Phidget22", "pypdf", "multipart"):
    d, b, h = collect_all(pkg)
    datas += d
    binaries += b
    hiddenimports += h

a = Analysis(
    ["adapter/run_app.py"],
    pathex=["adapter"],          # so `from main import app` resolves
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="RoastMonitor",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,            # shows a log window; set False for a silent launch
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

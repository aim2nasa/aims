# -*- mode: python ; coding: utf-8 -*-
"""AutoClicker v2 PyInstaller 빌드 스펙

사용법:
    cd D:\aims\tools\auto_clicker_v2
    pyinstaller build/AutoClicker.spec

결과:
    dist/AutoClicker/AutoClicker.exe
"""
import os
from PyInstaller.utils.hooks import collect_data_files

block_cipher = None

# 소스 루트
SRC_DIR = os.path.abspath(os.path.join(SPECPATH, ".."))

a = Analysis(
    [os.path.join(SRC_DIR, "AutoClicker.pyw")],
    pathex=[SRC_DIR],
    binaries=[],
    datas=[
        # customtkinter 테마/에셋 (CTk 내부 리소스)
        *collect_data_files("customtkinter"),
        # VERSION 파일
        (os.path.join(SRC_DIR, "VERSION"), "."),
    ],
    hiddenimports=[
        "customtkinter",
        "httpx",
        "httpx._transports",
        "httpx._transports.default",
        "httpcore",
        "httpcore._async",
        "httpcore._sync",
        "h11",
        "certifi",
        "idna",
        "sniffio",
        "anyio",
        "anyio._backends",
        "anyio._backends._asyncio",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "matplotlib",
        "numpy",
        "scipy",
        "pandas",
        "PIL",
        "PyQt5",
        "PyQt6",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="AutoClicker",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,  # GUI 앱이므로 콘솔 없음 (.pyw)
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,  # TODO: 아이콘 추가 시 여기에 .ico 경로
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="AutoClicker",
)

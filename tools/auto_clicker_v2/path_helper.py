# -*- coding: utf-8 -*-
"""경로 해석 유틸리티 — 개발 모드와 PyInstaller 패키징 모드 통합

개발 모드:
    python gui_main.py → __file__ 기준 auto_clicker_v2/ 경로 사용

패키징 모드 (PyInstaller --onedir):
    AutoClicker.exe → sys.executable 기준 설치 디렉토리 경로 사용
"""
import os
import sys


def is_frozen() -> bool:
    """PyInstaller로 빌드된 exe인지 판별"""
    return getattr(sys, "frozen", False)


def get_app_dir() -> str:
    """애플리케이션 루트 디렉토리 반환.

    - 개발: auto_clicker_v2/ 디렉토리
    - 패키징: AutoClicker.exe가 위치한 설치 디렉토리
    """
    if is_frozen():
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


def get_java_exe() -> str:
    """Java 실행 파일 경로.

    - 패키징: runtime/jre/bin/java.exe (번들 JRE)
    - 개발: 시스템 PATH의 java
    """
    if is_frozen():
        bundled = os.path.join(get_app_dir(), "runtime", "jre", "bin", "java.exe")
        if os.path.isfile(bundled):
            return bundled
    return "java"


def get_sikulix_jar() -> str:
    """SikuliX JAR 파일 경로.

    - 패키징: runtime/sikulix/sikulixide-2.0.5.jar (번들)
    - 폴백: C:\\Sikulix\\sikulixide-2.0.5.jar (시스템 설치)
    """
    if is_frozen():
        bundled = os.path.join(get_app_dir(), "runtime", "sikulix", "sikulixide-2.0.5.jar")
        if os.path.isfile(bundled):
            return bundled
    # 번들 없으면 시스템 설치 경로
    system_jar = r"C:\Sikulix\sikulixide-2.0.5.jar"
    if os.path.isfile(system_jar):
        return system_jar
    # 최종 폴백: 번들 경로 반환 (에러 메시지에 경로가 나오도록)
    return os.path.join(get_app_dir(), "runtime", "sikulix", "sikulixide-2.0.5.jar")


def get_sikulix_script() -> str:
    """MetlifeCustomerList.py 경로 (SikuliX가 실행할 스크립트)"""
    path = os.path.join(get_app_dir(), "MetlifeCustomerList.py")
    if os.path.isfile(path):
        return path
    # 폴백: 소스 디렉토리 (build.ps1 없이 PyInstaller만 돌린 경우)
    src = os.path.join(os.path.dirname(os.path.abspath(__file__)), "MetlifeCustomerList.py")
    if os.path.isfile(src):
        return src
    return path


def get_ocr_exe() -> str:
    """OCR 실행 명령어.

    - 패키징: AutoClicker.exe --run-ocr (자기 자신이 OCR 프록시)
    - 개발: python (시스템 Python)
    """
    if is_frozen():
        return sys.executable
    return "python"


def get_ocr_script() -> str:
    """OCR 스크립트 경로 (개발 모드에서만 사용)"""
    return os.path.join(get_app_dir(), "ocr", "upstage_ocr_api.py")


def get_version_file() -> str:
    """VERSION 파일 경로.

    PyInstaller onedir에서는 _internal/ 안에 들어갈 수 있으므로 양쪽 탐색.
    """
    app = get_app_dir()
    root_ver = os.path.join(app, "VERSION")
    if os.path.isfile(root_ver):
        return root_ver
    internal_ver = os.path.join(app, "_internal", "VERSION")
    if os.path.isfile(internal_ver):
        return internal_ver
    return root_ver


def get_output_dir() -> str:
    """기본 출력 디렉토리"""
    return os.path.join(get_app_dir(), "output")

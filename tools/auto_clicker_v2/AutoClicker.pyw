# -*- coding: utf-8 -*-
"""AutoClicker v2 — 엔트리 포인트

실행 모드:
  1. GUI 모드 (기본): AutoClicker.exe → GUI 실행
  2. OCR 프록시 모드: AutoClicker.exe --run-ocr <image_path> <output_json_path>
     - SikuliX가 OCR을 호출할 때 사용 (패키징 후 system Python 불필요)
  3. 경로 진단 모드: AutoClicker.exe --check-paths
     - 패키징/개발 환경의 경로 해석 결과를 출력
  4. URI Scheme 모드: AutoClicker.exe "aims-ac://start?token=NONCE"
     - AIMS 웹에서 URI 호출 시 Windows가 실행 (Phase 1 토큰 인증)
  5. MetDO Reader 모드: AutoClicker.exe --run-metdo <screenshot_path>
     - SikuliX가 고객 상세정보 OCR 호출 시 사용 (stdout으로 JSON 출력)
  6. 리포트 생성 모드: AutoClicker.exe --run-reports <output_dir>
     - SikuliX 완료 후 AIMS 엑셀 + JSON + 실행결과 엑셀 생성
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

if len(sys.argv) >= 2 and sys.argv[1] == "--check-paths":
    # 경로 진단 모드
    from path_helper import (
        is_frozen, get_app_dir, get_java_exe, get_sikulix_jar,
        get_sikulix_script, get_ocr_exe, get_ocr_script,
        get_version_file, get_output_dir,
    )
    import shutil
    # output_dir은 런타임 생성, java_exe는 bare command일 수 있음
    RUNTIME_DIRS = ("output_dir",)
    COMMAND_NAMES = ("java_exe", "ocr_exe")
    items = [
        ("is_frozen", is_frozen()),
        ("app_dir", get_app_dir()),
        ("java_exe", get_java_exe()),
        ("sikulix_jar", get_sikulix_jar()),
        ("sikulix_script", get_sikulix_script()),
        ("ocr_exe", get_ocr_exe()),
        ("ocr_script", get_ocr_script()),
        ("version_file", get_version_file()),
        ("output_dir", get_output_dir()),
    ]
    ok = True
    for name, value in items:
        exists = ""
        if isinstance(value, str) and not name.startswith("is_"):
            if name in COMMAND_NAMES and not os.path.isabs(value):
                # bare command (e.g. "java") → shutil.which 으로 PATH 검색
                found = shutil.which(value)
                exists = f" [PATH: {found}]" if found else " [NOT IN PATH]"
                if not found:
                    ok = False
            elif name in RUNTIME_DIRS:
                exists = " [OK]" if os.path.exists(value) else " [WILL CREATE]"
            else:
                exists = " [OK]" if os.path.exists(value) else " [MISSING]"
                if "[MISSING]" in exists:
                    ok = False
        print(f"  {name}: {value}{exists}")
    # VERSION 내용 확인
    try:
        with open(get_version_file()) as f:
            print(f"  version_content: {f.read().strip()}")
    except Exception as e:
        print(f"  version_content: ERROR - {e}")
        ok = False
    print(f"\n  RESULT: {'ALL OK' if ok else 'SOME MISSING'}")
    sys.exit(0 if ok else 1)

elif len(sys.argv) >= 2 and sys.argv[1] == "--run-ocr":
    # OCR 프록시 모드: SikuliX → AutoClicker.exe --run-ocr <image> <output>
    sys.argv = [sys.argv[0]] + sys.argv[2:]
    from ocr.upstage_ocr_api import main as ocr_main
    sys.exit(ocr_main())

elif len(sys.argv) >= 3 and sys.argv[1] == "--run-metdo":
    # MetDO Reader 프록시 모드: SikuliX → AutoClicker.exe --run-metdo <screenshot>
    # stdout으로 JSON 출력 (SikuliX subprocess에서 캡처)
    screenshot_path = sys.argv[2]
    sys.argv = [sys.argv[0], screenshot_path, "--json"]
    # metdo_reader를 번들 내 또는 상위 디렉토리에서 찾아 실행
    metdo_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "metdo_reader")
    if not os.path.isdir(metdo_dir):
        metdo_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "metdo_reader")
    sys.path.insert(0, metdo_dir)
    from read_customer import main as metdo_main
    sys.exit(metdo_main())

elif len(sys.argv) >= 3 and sys.argv[1] == "--run-reports":
    # 리포트 생성 모드: SikuliX → AutoClicker.exe --run-reports <output_dir> [--timestamp TS]
    output_dir = sys.argv[2]
    new_argv = [sys.argv[0], output_dir]
    # --timestamp를 위치 무관하게 파싱하여 전달
    if "--timestamp" in sys.argv:
        _ts_idx = sys.argv.index("--timestamp")
        if _ts_idx + 1 < len(sys.argv):
            new_argv.extend(["--timestamp", sys.argv[_ts_idx + 1]])
    sys.argv = new_argv
    from generate_reports import main as reports_main
    reports_main()
    sys.exit(0)

elif len(sys.argv) >= 2 and sys.argv[1].startswith("aims-ac://"):
    # URI Scheme 모드: AIMS 웹 → aims-ac://start?token=NONCE → AC 실행
    from uri_handler import handle_uri_launch
    sys.exit(handle_uri_launch(sys.argv[1]))

else:
    from gui_main import AutoClickerApp
    AutoClickerApp().mainloop()

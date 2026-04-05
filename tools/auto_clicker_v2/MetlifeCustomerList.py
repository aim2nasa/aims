# -*- coding: utf-8 -*-
# MetLife PDF 자동 다운로드 (고객목록조회 - OCR 연동 버전)
# 고객 클릭 → 고객등록/조회 → 종료(x) 테스트
# Upstage Enhanced OCR로 고객명 인식

import os
import sys
import time
import subprocess
import json
import codecs
import traceback
from java.awt import Robot
from java.awt.event import KeyEvent

# Java Robot 인스턴스 (Page Up 키 입력용)
_robot = Robot()

# SikuliX 설정
Settings.ActionLogs = False  # [log] CLICK 메시지 숨김
setFindFailedResponse(ABORT)  # 이미지 못 찾으면 즉시 중단

# 경로 설정
# AC_HOME 환경변수 (gui_main → data_source가 설정) 우선, 없으면 개발 경로 폴백
SCRIPT_DIR = os.environ.get("AC_HOME", r"D:\aims\tools\auto_clicker_v2")
_DEFAULT_CAPTURE_BASE = os.path.join(SCRIPT_DIR, "output")
OCR_SCRIPT = os.path.join(SCRIPT_DIR, "ocr", "upstage_ocr_api.py")
# metdo_reader: 고객 상세정보 OCR (고객등록/조회 페이지 스크린샷 → 상세정보 추출)
METDO_READER_SCRIPT = os.path.join(os.path.dirname(SCRIPT_DIR), "metdo_reader", "read_customer.py")
# 패키징 모드: AC_EXE_PATH가 설정되면 AutoClicker.exe --run-ocr 사용 (system Python 불필요)
_AC_EXE_PATH = os.environ.get("AC_EXE_PATH", "")


def _parse_save_dir_early():
    """--save-dir 인자를 미리 파싱하여 저장 경로 결정"""
    args = sys.argv[1:] if len(sys.argv) > 1 else []
    if '--' in args:
        args = args[args.index('--') + 1:]
    if '--save-dir' in args:
        idx = args.index('--save-dir')
        if idx + 1 < len(args):
            return args[idx + 1]
    return None

CAPTURE_BASE_DIR = _parse_save_dir_early() or _DEFAULT_CAPTURE_BASE

# ============================================================
# 초성 파싱 (먼저 수행하여 폴더 경로 결정)
# ============================================================
def _parse_chosung_early():
    """초성 인자를 미리 파싱하여 폴더 경로 결정"""
    args = sys.argv[1:] if len(sys.argv) > 1 else []
    if '--' in args:
        args = args[args.index('--') + 1:]

    # --no-click 제거
    args = [a for a in args if a != '--no-click']

    # --chosung 옵션
    if '--chosung' in args:
        idx = args.index('--chosung')
        if idx + 1 < len(args):
            raw = args[idx + 1]
            if isinstance(raw, str):
                return raw.decode('utf-8')
            return raw

    # 위치 인자
    if args and not args[0].startswith('-'):
        raw = args[0]
        if isinstance(raw, str):
            return raw.decode('utf-8')
        return raw

    return None

_early_chosung = _parse_chosung_early()

# 초성이 주어지면 초성 폴더에 저장, 아니면 기본 폴더
if _early_chosung:
    CAPTURE_DIR = os.path.join(CAPTURE_BASE_DIR, _early_chosung)
else:
    CAPTURE_DIR = CAPTURE_BASE_DIR

# 캡처 디렉토리 생성
if not os.path.exists(CAPTURE_DIR):
    os.makedirs(CAPTURE_DIR)

# DEV_MODE 판별: AC_EXE_PATH 존재=패키징(프로덕션), 미존재=소스(개발)
# 주의: sys.frozen은 PyInstaller exe 내부에서만 True.
#        이 스크립트는 SikuliX Jython에서 실행되므로 sys.frozen은 항상 False!
#        따라서 gui_main.py가 설정하는 AC_EXE_PATH 환경변수로 판별한다.
_is_packaged = bool(os.environ.get("AC_EXE_PATH", ""))
DEV_MODE = not _is_packaged
if os.environ.get("AC_DEV_MODE", "").strip() == "1":
    DEV_MODE = True
elif os.environ.get("AC_DEV_MODE", "").strip() == "0":
    DEV_MODE = False

# ============================================================
# DEV_DIR / PROD 암호화 진단 초기화
# ============================================================
import datetime
_now = datetime.datetime.now()
_date_str = _now.strftime("%Y%m%d_%H%M%S")
# 리포트 파일명 고정 타임스탬프 (증분 갱신 시 동일 파일명으로 덮어쓰기)
_REPORT_TIMESTAMP = _now.strftime("%Y%m%d_%H%M")
GENERATE_REPORTS_SCRIPT = os.path.join(SCRIPT_DIR, "generate_reports.py")

# PROD 암호화 진단 writer (secure_diag.py)
_diag = None  # DiagWriter 인스턴스 (PROD에서만 사용)
_acdump_path = None  # .acdump 파일 경로

if DEV_MODE:
    # DEV: 기존과 동일 — dev/ 폴더에 평문 저장
    DEV_DIR = os.path.join(CAPTURE_DIR, "dev")
    if not os.path.exists(DEV_DIR):
        os.makedirs(DEV_DIR)
else:
    # PROD: dev/ 폴더 생성하지 않음 — 단일 암호화 .acdump 파일 사용
    DEV_DIR = None
    try:
        from secure_diag import DiagWriter
        _acdump_path = os.path.join(CAPTURE_DIR, ".ac_%s.acdump" % _date_str)
        _KEY_HEX = "7e66b5dd3d158d14ba3300cad5702ee6d72befaec37890eed25c91687bb649df"
        _diag = DiagWriter(_acdump_path, _KEY_HEX)
        # 시스템 정보 기록
        import platform as _pf
        _sys_info = u"OS=%s\nUser=%s\nTime=%s\nAC_HOME=%s\nSave=%s" % (
            _pf.platform(), os.environ.get("AC_USER", "?"), _date_str,
            os.environ.get("AC_HOME", "?"), CAPTURE_DIR)
        _diag.write_entry(0x01, u"system_info", _sys_info)
    except Exception as _e:
        print("[WARN] PROD DiagWriter init failed: %s" % str(_e))
        _diag = None

# verify_customer_integrated_view에 PROD 설정 전달
try:
    import verify_customer_integrated_view as _vciv_mod
    _vciv_mod._VCIV_DIAG = _diag
except:
    pass

# atexit: 종료 시 정리
import atexit as _atexit
def _cleanup_on_exit():
    if DEV_MODE:
        _close_log_file()  # 중복 호출 안전 (핸들 None 체크)
        # DEV: dev/ 폴더 보존 (삭제하지 않음)
    else:
        # PROD 정상 종료: .acdump 삭제 (흔적 없음)
        if _diag:
            _diag.delete()
_atexit.register(_cleanup_on_exit)

# 로그 파일 설정 (DEV 모드에서만 사용)
_log_file_handle = None
LOG_FILE = None

if DEV_MODE:
    _log_base = os.path.join(DEV_DIR, u"run_%s" % _date_str)
    _log_seq = 0
    LOG_FILE = u"%s.log" % _log_base
    while os.path.exists(LOG_FILE):
        _log_seq += 1
        LOG_FILE = u"%s_%d.log" % (_log_base, _log_seq)


def _open_log_file():
    """로그 파일 핸들 열기 (DEV 모드에서만 사용)"""
    global _log_file_handle
    if _log_file_handle is None and LOG_FILE:
        _log_file_handle = codecs.open(LOG_FILE, "w", "utf-8")
    return _log_file_handle


def _close_log_file():
    """로그 파일 핸들 닫기"""
    global _log_file_handle
    if _log_file_handle is not None:
        _log_file_handle.close()
        _log_file_handle = None


def log(msg):
    """콘솔과 파일에 동시 로그 출력 (예외 안전)"""
    try:
        print(msg)
        # Jython에서는 sys.stdout.flush()가 Java System.out을 flush하지 않음
        # Java 레벨 flush 필요 (subprocess.PIPE 실시간 전달용)
        from java.lang import System as _JS
        _JS.out.flush()
    except:
        pass  # 콘솔 출력 실패 무시

    if DEV_MODE:
        # DEV: 평문 파일에 쓰기
        try:
            f = _open_log_file()
            if f and not f.closed:
                if isinstance(msg, unicode):
                    f.write(msg + u"\n")
                else:
                    f.write(unicode(msg, "utf-8") + u"\n")
                f.flush()
        except:
            pass  # 파일 쓰기 실패 무시
    elif _diag:
        # PROD: .acdump에 암호화 append
        try:
            _diag.write_log(msg if isinstance(msg, unicode) else unicode(msg, "utf-8"))
        except:
            pass


# ===== 일시정지 신호 파일 체크 (GUI ↔ SikuliX IPC) =====
_AC_HOME = os.environ.get("AC_HOME", r"D:\aims\tools\auto_clicker_v2")
_PAUSE_SIGNAL = os.path.join(_AC_HOME, ".pause_signal")
log(u"[IPC] AC_HOME=%s, PAUSE_SIGNAL=%s" % (_AC_HOME, _PAUSE_SIGNAL))

def check_pause():
    """GUI 일시정지 신호 파일이 존재하면 삭제될 때까지 대기"""
    if not os.path.exists(_PAUSE_SIGNAL):
        return
    log(u"    [PAUSE] 일시정지 감지 → 재개 대기 중...")
    while os.path.exists(_PAUSE_SIGNAL):
        time.sleep(0.5)
    log(u"    [PAUSE] 재개됨!")

# ===== SikuliX 함수 래핑: 모든 UI 조작 전에 자동으로 일시정지 체크 =====
_sikuli_click = click  # SikuliX 원본 click 보존
_sikuli_find = find    # SikuliX 원본 find 보존
_sikuli_type = type    # SikuliX 원본 type(키보드 입력) 보존

def click(target, *args):
    """SikuliX click 래퍼 - 일시정지 체크 + 이미지 미발견 시 재시도"""
    check_pause()
    if isinstance(target, (str, unicode)):
        for _retry in range(3):
            _match = exists(target, 5)
            if _match:
                return _sikuli_click(_match, *args)
            if _retry < 2:
                log(u"    [RETRY] click 이미지 미발견, 재시도 %d/3: %s" % (_retry + 2, target))
                sleep(1)
        return _sikuli_click(target, *args)
    return _sikuli_click(target, *args)

def find(target, *args):
    """SikuliX find 래퍼 - 일시정지 체크 + 이미지 미발견 시 재시도"""
    check_pause()
    if isinstance(target, (str, unicode)):
        for _retry in range(3):
            _match = exists(target, 5)
            if _match:
                return _match
            if _retry < 2:
                log(u"    [RETRY] find 이미지 미발견, 재시도 %d/3: %s" % (_retry + 2, target))
                sleep(1)
        return _sikuli_find(target, *args)
    return _sikuli_find(target, *args)

def type(target, *args):
    """SikuliX type 래퍼 - 키 입력 전 항상 일시정지 체크"""
    check_pause()
    return _sikuli_type(target, *args)


# 진단 모드 설정 (클릭 위치 분석용 스크린샷 저장, DEV only)
DIAGNOSTIC_MODE = DEV_MODE  # PROD에서는 클릭 진단 비활성화
DIAGNOSTIC_DIR = None
if DIAGNOSTIC_MODE and DEV_DIR:
    DIAGNOSTIC_DIR = os.path.join(DEV_DIR, "diagnostic")
    if not os.path.exists(DIAGNOSTIC_DIR):
        os.makedirs(DIAGNOSTIC_DIR)
_diagnostic_counter = [0]  # 스크린샷 순번


def save_click_diagnostic(click_x, click_y, customer_name, page_num, row_idx):
    """클릭 위치 진단용 스크린샷 저장 (클릭 위치에 빨간 점 표시, DEV only)"""
    if not DIAGNOSTIC_MODE or not DEV_DIR:
        return None

    try:
        from javax.imageio import ImageIO
        from java.io import File
        from java.awt import Color, BasicStroke
        from java.awt.image import BufferedImage

        _diagnostic_counter[0] += 1
        seq = _diagnostic_counter[0]

        # 스크린샷 캡처
        screen = Screen()
        img = screen.capture()
        buffered_img = img.getImage()

        # Graphics2D로 클릭 위치 표시
        g2d = buffered_img.createGraphics()

        # 빨간색 십자선 + 원 그리기
        g2d.setColor(Color.RED)
        g2d.setStroke(BasicStroke(3))

        # 십자선
        g2d.drawLine(click_x - 20, click_y, click_x + 20, click_y)
        g2d.drawLine(click_x, click_y - 20, click_x, click_y + 20)

        # 원
        g2d.drawOval(click_x - 10, click_y - 10, 20, 20)

        # 텍스트 (클릭 정보)
        g2d.setColor(Color.YELLOW)
        from java.awt import Font
        g2d.setFont(Font("Arial", Font.BOLD, 14))
        info_text = "P%d R%d: %s (y=%d)" % (page_num, row_idx, customer_name, click_y)
        g2d.drawString(info_text, click_x + 25, click_y + 5)

        g2d.dispose()

        # 파일 저장
        filename = "click_%03d_P%d_R%02d_%s.png" % (seq, page_num, row_idx, customer_name[:10])
        filepath = os.path.join(DIAGNOSTIC_DIR, filename)
        ImageIO.write(buffered_img, "PNG", File(filepath))

        log(u"        [DIAG] 스크린샷 저장: %s" % filename)
        return filepath

    except Exception as e:
        log(u"        [DIAG] 스크린샷 저장 실패: %s" % str(e))
        return None


DEBUG_LOG_FILE = os.path.join(SCRIPT_DIR, "debug_log.txt") if DEV_MODE else None


def _crash_log(msg):
    """크래시 로그를 run_*.log + debug_log.txt 양쪽에 기록"""
    log(msg)  # run_*.log(DEV) 또는 .acdump(PROD) + 콘솔
    if DEV_MODE and DEBUG_LOG_FILE:
        try:
            with codecs.open(DEBUG_LOG_FILE, "a", "utf-8") as f:
                if isinstance(msg, unicode):
                    f.write(msg + u"\n")
                else:
                    f.write(unicode(msg, "utf-8") + u"\n")
                f.flush()
        except:
            pass
    # PROD: log()가 이미 _diag.write_log()로 기록하므로 추가 처리 불필요


# 디버그: 마지막 클릭/검색 위치 추적 (크래시 스크린샷에 오버레이용)
_debug_markers = []  # [(type, x, y, w, h, label), ...] type: "click" | "region"

def _debug_mark_click(x, y, label=""):
    """클릭 위치 기록"""
    global _debug_markers
    _debug_markers.append(("click", int(x), int(y), 0, 0, label))
    if len(_debug_markers) > 20:
        _debug_markers = _debug_markers[-20:]

def _debug_mark_region(x, y, w, h, label=""):
    """검색 영역 기록"""
    global _debug_markers
    _debug_markers.append(("region", int(x), int(y), int(w), int(h), label))
    if len(_debug_markers) > 20:
        _debug_markers = _debug_markers[-20:]

def _take_crash_screenshot(label):
    """크래시 시 스크린샷 저장 (SikuliX capture 사용) + 디버그 마커 오버레이"""
    try:
        ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        temp_path = capture(SCREEN)
        if not temp_path:
            return
        filename = u"CRASH_%s_%s.png" % (label, ts)

        # 디버그 마커 오버레이 (마커가 있으면)
        final_path = temp_path  # 기본: SikuliX temp
        if _debug_markers:
            try:
                from javax.imageio import ImageIO
                from java.io import File as JFile
                from java.awt import Color, BasicStroke, Font, RenderingHints
                bimg = ImageIO.read(JFile(temp_path))
                g = bimg.createGraphics()
                g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
                for mtype, mx, my, mw, mh, mlabel in _debug_markers:
                    if mtype == "click":
                        g.setColor(Color.RED)
                        g.setStroke(BasicStroke(2))
                        g.drawLine(mx - 15, my, mx + 15, my)
                        g.drawLine(mx, my - 15, mx, my + 15)
                        g.drawOval(mx - 12, my - 12, 24, 24)
                        if mlabel:
                            g.setFont(Font("SansSerif", Font.BOLD, 12))
                            g.drawString(mlabel, mx + 16, my - 4)
                    elif mtype == "region":
                        g.setColor(Color.YELLOW)
                        g.setStroke(BasicStroke(2))
                        g.drawRect(mx, my, mw, mh)
                        if mlabel:
                            g.setFont(Font("SansSerif", Font.BOLD, 12))
                            g.drawString(mlabel, mx, my - 4)
                g.dispose()
                # 마커 적용된 이미지를 temp 파일로 저장
                import tempfile as _tf
                _marker_tmp = _tf.NamedTemporaryFile(suffix=".png", delete=False)
                _marker_tmp.close()
                ImageIO.write(bimg, "png", JFile(_marker_tmp.name))
                final_path = _marker_tmp.name
                log(u"[CRASH 스크린샷] %s (마커 %d개)" % (filename, len(_debug_markers)))
            except:
                log(u"[CRASH 스크린샷] %s (마커 오버레이 실패)" % filename)

        if DEV_MODE and DEV_DIR:
            # DEV: dev/ 폴더에 평문 저장
            import shutil
            dest = os.path.join(DEV_DIR, filename)
            shutil.copy(final_path, dest)
            log(u"[CRASH 스크린샷] %s" % dest)
        elif _diag:
            # PROD: .acdump에 암호화 저장
            _diag.write_image(filename, final_path)
            log(u"[CRASH 스크린샷] 암호화 저장: %s" % filename)
    except:
        log(u"[WARN] 크래시 스크린샷 저장 실패")


def _global_exception_handler(exc_type, exc_value, exc_tb):
    """전역 예외 핸들러 - 모든 미처리 예외를 로그에 기록"""
    try:
        # 타임스탬프
        import datetime
        ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # 예외 정보 포맷팅
        tb_lines = traceback.format_exception(exc_type, exc_value, exc_tb)
        tb_str = "".join(tb_lines)

        # 에러 로그 기록
        log(u"")
        log(u"=" * 60)
        log(u"[FATAL ERROR] %s" % ts)
        log(u"=" * 60)
        log(u"예외 타입: %s" % exc_type.__name__)
        log(u"예외 메시지: %s" % unicode(str(exc_value), "utf-8"))
        log(u"")
        log(u"스택 트레이스:")
        for line in tb_str.split("\n"):
            if line.strip():
                log(u"  %s" % unicode(line, "utf-8"))
        log(u"=" * 60)

        # 크래시 스크린샷
        _take_crash_screenshot(u"FATAL_excepthook")

        # 로그 파일 닫기
        _close_log_file()

    except Exception as e:
        # 로깅 실패해도 콘솔에는 출력 시도
        print("[FATAL] Exception handler failed: %s" % str(e))
        traceback.print_exception(exc_type, exc_value, exc_tb)

    # 종료 코드 1로 종료
    sys.exit(1)


# 전역 예외 핸들러 등록
sys.excepthook = _global_exception_handler


def _fatal_crash(context, chosung, exception=None):
    """인프라 크래시 시 상세 로그 → run_*.log + debug_log.txt + 프로그램 종료

    SikuliX FindFailed는 Java 예외이므로 except Exception으로 잡히지 않음.
    bare except: + sys.exc_info()로 잡아야 함.
    """
    _crash_log(u"")
    _crash_log(u"=" * 60)
    _crash_log(u"[FATAL] 크래시 발생 - 프로그램 종료")
    _crash_log(u"=" * 60)
    _crash_log(u"위치: %s" % context)
    _crash_log(u"초성: %s" % chosung)
    try:
        if exception is not None:
            _crash_log(u"오류 타입: %s" % exception.__class__.__name__)
            _crash_log(u"오류 내용: %s" % exception)
        else:
            exc_info = sys.exc_info()
            if exc_info[1] is not None:
                _crash_log(u"오류 타입: %s" % exc_info[0])
                _crash_log(u"오류 내용: %s" % exc_info[1])
    except:
        _crash_log(u"오류 정보: (표시 불가)")
    _crash_log(u"")
    _crash_log(u"스택 트레이스:")
    try:
        tb_str = traceback.format_exc()
        for line in tb_str.split("\n"):
            if line.strip():
                _crash_log(u"  %s" % line)
    except:
        pass
    _crash_log(u"=" * 60)
    _take_crash_screenshot(u"FATAL")
    _close_log_file()
    raise SystemExit(1)


# 헬퍼 함수
def find_any(*imgs):
    """여러 이미지 중 하나라도 있으면 해당 이미지 반환. 모두 없으면 종료."""
    for img in imgs:
        if exists(img):
            return img
    log("[ERROR] 다음 이미지 중 하나도 찾을 수 없음: " + str(imgs))
    exit(1)


def capture_customer_detail(customer_name):
    """
    고객등록/조회 페이지 스크린샷 → metdo_reader OCR → 고객 상세정보 반환

    고객을 클릭하면 표시되는 '고객등록/조회' 페이지에서
    전체 화면 스크린샷을 캡처하고, metdo_reader를 통해
    전화번호, 이메일, 주소, 개인/법인 구분 등 상세정보를 추출합니다.

    Args:
        customer_name: 고객명 (파일명 및 로그용)

    Returns:
        dict: 상세정보 dict (metdo_reader JSON 출력)
              {'customer_type': '개인', 'name': '홍길동', 'mobile_phone': '010-...', ...}
              실패 시 None
    """
    import shutil
    # 안전한 파일명 생성 (특수문자 제거)
    safe_name = customer_name.replace("/", "_").replace("\\", "_").replace(":", "_")

    try:
        # 1. 전체 화면 캡처 (SikuliX capture)
        temp = capture(SCREEN)

        if DEV_MODE and DEV_DIR:
            screenshot_path = os.path.join(DEV_DIR, u"detail_%s.png" % safe_name)
            shutil.copy(temp, screenshot_path)
        else:
            # PROD: SikuliX temp 파일을 그대로 사용 (OCR 후 .acdump에 암호화)
            screenshot_path = temp
            if _diag:
                _diag.write_image(u"detail_%s.png" % safe_name, temp)
        log(u"        [고객상세] 스크린샷 저장: detail_%s.png" % safe_name)

        # 2. metdo_reader 호출 (subprocess)
        ocr_env = os.environ.copy()
        ocr_start = time.time()

        if _AC_EXE_PATH:
            # 패키징 모드: AutoClicker.exe --run-metdo <screenshot> → stdout JSON
            cmd = [_AC_EXE_PATH, "--run-metdo", screenshot_path]
        else:
            # 개발 모드: system Python으로 metdo_reader 직접 호출
            cmd = ["python", METDO_READER_SCRIPT, screenshot_path, "--json"]

        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=ocr_env)
        stdout_data, stderr_data = proc.communicate()
        ocr_elapsed = time.time() - ocr_start

        if proc.returncode != 0:
            log(u"        [고객상세] OCR 실패 (exit code: %d, %.1f초)" % (proc.returncode, ocr_elapsed))
            if stderr_data:
                log(u"        [고객상세] stderr: %s" % stderr_data[:200])
            return None

        # 3. JSON 파싱
        # stdout에서 JSON 부분만 추출 (metdo_reader는 로그 + multi-line JSON 출력)
        json_str = stdout_data.strip()
        json_data = None

        # 방법 1: single-line JSON (한 줄에 {...})
        lines = json_str.split('\n')
        for line in reversed(lines):
            line = line.strip()
            if line.startswith('{') and line.endswith('}'):
                try:
                    json_data = json.loads(line)
                    break
                except:
                    continue

        # 방법 2: multi-line JSON (indent=2 등) — 중괄호 매칭으로 추출
        if not json_data:
            last_close = json_str.rfind('}')
            if last_close >= 0:
                depth = 0
                for i in range(last_close, -1, -1):
                    if json_str[i] == '}':
                        depth += 1
                    elif json_str[i] == '{':
                        depth -= 1
                        if depth == 0:
                            try:
                                json_data = json.loads(json_str[i:last_close + 1])
                            except:
                                pass
                            break

        if not json_data:
            log(u"        [고객상세] JSON 파싱 실패 (%.1f초)" % ocr_elapsed)
            if json_str:
                log(u"        [고객상세] stdout 앞 200자: %s" % json_str[:200])
            return None

        log(u"        [고객상세] OCR 완료 (%.1f초) → %s, %s" % (
            ocr_elapsed,
            json_data.get('customer_type', '?'),
            json_data.get('name', '?')
        ))
        return json_data

    except Exception as e:
        log(u"        [고객상세] 예외 발생: %s" % e)
        return None


def capture_and_ocr(chosung_name, page_num):
    """
    화면 캡처 후 Upstage Enhanced OCR 호출

    Returns:
        list: 고객 데이터 리스트
        str: JSON 파일 경로
    """
    timestamp = int(time.time())
    capture_filename = u"page_%s_%d_%d.png" % (chosung_name, page_num, timestamp)
    cropped_filename = capture_filename.replace(".png", "_cropped.png")

    import shutil

    if DEV_MODE and DEV_DIR:
        capture_path = os.path.join(DEV_DIR, capture_filename)
        cropped_path = os.path.join(DEV_DIR, cropped_filename)
        json_path = cropped_path.replace(".png", ".json")
        _ocr_env_dir = DEV_DIR
    else:
        # PROD: temp 디렉토리에 임시 파일 (OCR subprocess 입출력용)
        import tempfile as _tf
        _prod_tmp = _tf.mkdtemp(prefix="ac_ocr_")
        capture_path = os.path.join(_prod_tmp, capture_filename)
        cropped_path = os.path.join(_prod_tmp, cropped_filename)
        json_path = cropped_path.replace(".png", ".json")
        _ocr_env_dir = _prod_tmp

    log(u"  [OCR] ----------------------------------------")
    log(u"  [OCR] 1/4. 화면 캡처")

    # 1. 전체 화면 캡처 (원본 보관용)
    captured_full = capture(SCREEN)
    shutil.copy(captured_full, capture_path)
    log(u"  [OCR]   - 원본: %s" % capture_filename)

    # PROD: 원본 캡처를 .acdump에 암호화 저장
    if not DEV_MODE and _diag:
        _diag.write_image(capture_filename, capture_path)

    # 2. 테이블 영역만 크롭 (필터 영역 + AutoClicker 영역 제외)
    TABLE_REGION_X = 20
    TABLE_REGION_Y = 362
    TABLE_REGION_WIDTH = 1346
    TABLE_REGION_HEIGHT = 590
    table_region = Region(TABLE_REGION_X, TABLE_REGION_Y, TABLE_REGION_WIDTH, TABLE_REGION_HEIGHT)
    captured_cropped = capture(table_region)
    shutil.copy(captured_cropped, cropped_path)
    log(u"  [OCR]   - 크롭: %s" % cropped_filename)

    # PROD: 크롭 캡처를 .acdump에 암호화 저장
    if not DEV_MODE and _diag:
        _diag.write_image(cropped_filename, cropped_path)

    # 크롭된 이미지로 OCR 수행
    json_path = cropped_path.replace(".png", ".json")

    # Python3로 OCR 스크립트 호출 (환경변수로 로그 디렉토리 전달)
    log(u"  [OCR] 2/4. Upstage Enhanced API 호출...")

    ocr_start = time.time()
    try:
        # 환경변수에 CAPTURE_DIR 추가하여 OCR 스크립트에 전달
        ocr_env = os.environ.copy()
        ocr_env["METLIFE_CAPTURE_DIR"] = _ocr_env_dir
        if _AC_EXE_PATH:
            # 패키징 모드: AutoClicker.exe --run-ocr <image> <output>
            result = subprocess.call([_AC_EXE_PATH, "--run-ocr", cropped_path, json_path], env=ocr_env)
        else:
            # 개발 모드: system Python으로 OCR 스크립트 직접 호출
            result = subprocess.call(["python", OCR_SCRIPT, cropped_path, json_path], env=ocr_env)
        ocr_elapsed = time.time() - ocr_start

        if result != 0:
            log(u"  [OCR] ERROR: OCR 스크립트 실패 (exit: %d)" % result)
            return [], json_path
    except Exception as e:
        log(u"  [OCR] ERROR: %s" % str(e))
        return [], json_path

    # JSON 결과 로드
    log(u"  [OCR] 3/4. API 응답 (%.1f초)" % ocr_elapsed)
    if os.path.exists(json_path):
        with codecs.open(json_path, "r", "utf-8") as f:
            customers = json.load(f)
        # PROD: OCR 결과 JSON을 .acdump에 암호화 저장
        if not DEV_MODE and _diag:
            with codecs.open(json_path, "r", "utf-8") as f:
                _diag.write_json(cropped_filename.replace(".png", ".json"), f.read())
        log(u"  [OCR] 4/4. %d명 인식 완료" % len(customers))
        log(u"  [OCR] ----------------------------------------")
        # PROD: temp 디렉토리 정리
        if not DEV_MODE:
            try:
                import shutil as _sh_ocr
                _sh_ocr.rmtree(_ocr_env_dir)
            except:
                pass
        return customers, json_path
    else:
        log(u"  [OCR] ERROR: JSON 없음")
        log(u"  [OCR] ----------------------------------------")
        # PROD: temp 디렉토리 정리
        if not DEV_MODE:
            try:
                import shutil as _sh_ocr
                _sh_ocr.rmtree(_ocr_env_dir)
            except:
                pass
        return [], json_path


def get_customer_name(customers, row_index):
    """
    고객 리스트에서 해당 인덱스의 고객명 반환

    Args:
        customers: OCR로 추출한 고객 리스트
        row_index: 0-based 행 인덱스

    Returns:
        str: 고객명 또는 "?"
    """
    if row_index < len(customers):
        return customers[row_index].get(u"고객명", "?")
    return "?"


def print_customer_table(customers, chosung_name, page_num):
    """
    OCR로 읽은 고객 표를 로그에 출력

    Args:
        customers: OCR로 추출한 고객 리스트
        chosung_name: 초성 이름
        page_num: 페이지 번호
    """
    log("")
    log(u"  [OCR] === [%s] 페이지 %d - OCR 결과 (%d명) ===" % (chosung_name, page_num, len(customers)))
    log(u"  [OCR]  No  고객명      구분   생년월일     나이  성별   휴대폰")
    log(u"  [OCR] ---- ----------  ----  ----------  ----  ----  --------------")

    for i, c in enumerate(customers):
        # Jython 유니코드 키 호환
        name = c.get(u"고객명", "") or ""
        gubun = c.get(u"구분", "") or "-"
        birth = c.get(u"생년월일", "") or "-"
        age = c.get(u"보험나이", "") or "-"
        gender = c.get(u"성별", "") or "-"
        phone = c.get(u"휴대폰", "") or "-"
        log(u"  [OCR]  %2d  %-8s  %-4s  %-10s  %4s  %-4s  %s" % (i+1, name[:8], gubun[:4], birth[:10], age[:4], gender[:4], phone[:14]))

    log(u"  [OCR] ================================================")


def generate_blind_customers(count):
    """
    No-OCR 모드: 행 번호 기반 가상 고객 리스트 생성

    OCR 없이 순차적으로 행을 클릭하기 위해
    행 번호를 고객명으로 사용하는 가상 데이터 생성.

    Args:
        count: 생성할 행 수

    Returns:
        list: 가상 고객 데이터 리스트
    """
    rows = []
    for i in range(count):
        rows.append({
            u"고객명": u"ROW_%02d" % (i + 1),
            u"구분": u"",
            u"생년월일": u"",
            u"보험나이": u"",
            u"성별": u"",
            u"휴대폰": u"",
        })
    return rows


def get_row_y(header_y, row_index, is_scrolled=False):
    """
    특정 행의 Y좌표 계산

    Args:
        header_y: 고객명 헤더 Y좌표
        row_index: 0-based 행 인덱스
        is_scrolled: 스크롤 후 페이지 여부 (True면 FIRST_ROW_OFFSET_SCROLLED 사용)

    Returns:
        int: 행의 Y좌표
    """
    offset = FIRST_ROW_OFFSET_SCROLLED if is_scrolled else FIRST_ROW_OFFSET
    return header_y + offset + (ROW_HEIGHT * row_index)


def scroll_to_top(header, max_pageup=20):
    """
    Java Robot의 Page Up 키로 스크롤을 맨 위로 이동
    (Sikuli type()은 메트라이프 사이트에서 동작하지 않음)

    Args:
        header: 고객명 헤더 Match 객체
        max_pageup: 최대 Page Up 횟수 (무한루프 방지)
    """
    click(header.right(300).below(150))
    sleep(0.3)
    for i in range(max_pageup):
        _robot.keyPress(KeyEvent.VK_PAGE_UP)
        _robot.keyRelease(KeyEvent.VK_PAGE_UP)
        sleep(0.1)
    sleep(0.5)


def scroll_page_down():
    """
    Page Down 키로 한 페이지 스크롤 (100% 줌 대응)

    100% 줌에서는 16번째 행이 화면에 보이지 않아 클릭 방식 불가.
    Java Robot의 Page Down 키 사용.

    주의: Nexacro 그리드는 현재 커서 행 기준으로 Page Down 수행.
    테이블 하단 행을 클릭하여 커서를 아래쪽에 배치한 후 Page Down해야
    충분한 새 콘텐츠가 스크롤됨.
    (상단 행 클릭 시 Page Down이 같은 영역 대부분을 다시 보여줌)
    """
    # 테이블 하단 행 클릭하여 포커스 확보 + 커서를 하단에 배치
    try:
        header = find(IMG_CUSTNAME)
        hx = int(header.getCenter().getX())
        hy = int(header.getCenter().getY())
        # 테이블 마지막 행 근처 클릭 (header 아래 ~370px = 13번째 행 영역)
        bottom_y = hy + 370
        click(Location(hx + 200, bottom_y))
        log(u"        -> 포커스: 테이블 하단 클릭 (%d, %d)" % (hx + 200, bottom_y))
        sleep(0.3)
    except:
        # 헤더를 못 찾으면 테이블 하단 영역 클릭
        click(Location(500, 700))
        log(u"        -> 포커스: 폴백 위치 클릭 (500, 700)")
        sleep(0.3)

    _robot.keyPress(KeyEvent.VK_PAGE_DOWN)
    _robot.keyRelease(KeyEvent.VK_PAGE_DOWN)
    sleep(0.5)
    log(u"        -> Page Down 완료")


def capture_table_region():
    """
    테이블 전체 영역 캡처 (마지막 페이지 감지용)

    여러 행을 포함한 테이블 영역을 캡처하여 스크롤 전후 비교.
    한 행만 비교하면 중복 영역 때문에 오판 위험이 있음.

    Returns:
        str: 캡처된 이미지 경로
    """
    # OCR 크롭과 동일한 테이블 영역 사용
    TABLE_REGION_X = 20
    TABLE_REGION_Y = 362
    TABLE_REGION_WIDTH = 1890
    TABLE_REGION_HEIGHT = 590
    table_region = Region(TABLE_REGION_X, TABLE_REGION_Y, TABLE_REGION_WIDTH, TABLE_REGION_HEIGHT)
    return capture(table_region)


def _compare_two_captures(path1, path2):
    """두 캡처 이미지의 상단 10% 영역(첫 행) 픽셀 유사도 비교.

    Page Down은 항상 첫 번째 행을 변경한다 (스크롤 끝이 아닌 한).
    - 스크롤됨: 첫 행 완전 교체 → 상단 유사도 ~50% (확실히 낮음)
    - 스크롤 끝: 첫 행 동일 → 상단 유사도 ~100% (확실히 높음)
    전체 테이블이나 하단 비교는 행 구조가 균일해서 오탐 발생.

    Returns:
        (similarity, same_count, total_samples) 튜플.
        이미지 크기가 다르면 (0.0, 0, 1) 반환.
    """
    from javax.imageio import ImageIO
    from java.io import File

    img1 = ImageIO.read(File(path1))
    img2 = ImageIO.read(File(path2))

    if img1.getWidth() != img2.getWidth() or img1.getHeight() != img2.getHeight():
        return (0.0, 0, 1)

    width = img1.getWidth()
    height = img1.getHeight()

    # 상단 10%만 비교 (첫 1-2행 영역 - Page Down 시 반드시 변경됨)
    y_end = int(height * 0.10)
    sample_step = max(1, min(width, y_end) // 20)

    same_count = 0
    diff_count = 0

    for y in range(0, y_end, sample_step):
        for x in range(0, width, sample_step):
            p1 = img1.getRGB(x, y)
            p2 = img2.getRGB(x, y)
            if p1 == p2:
                same_count += 1
            else:
                diff_count += 1

    total_samples = same_count + diff_count
    similarity = float(same_count) / total_samples if total_samples > 0 else 0
    return (similarity, same_count, total_samples)


def is_last_page(prev_capture_path):
    """
    스크롤 전후 테이블 상단 10%(첫 행) 비교로 마지막 페이지 감지.

    Page Down은 항상 첫 행을 바꾼다 (끝이 아닌 한).
    상단 비교로 미세한 스크롤도 정확히 감지 (오탐 없음).
    90% 이상 동일하면 마지막 페이지로 판정.

    Args:
        prev_capture_path: 스크롤 전 테이블 캡처 이미지 경로

    Returns:
        bool: 마지막 페이지면 True
    """
    try:
        current_capture = capture_table_region()

        similarity, same_count, total_samples = _compare_two_captures(prev_capture_path, current_capture)

        if total_samples <= 1 and same_count == 0:
            log(u"    [COMPARE] 이미지 크기 다름 → 계속 진행")
            return False

        log(u"    [COMPARE] 상단10%%(첫행) 비교: %.1f%% 동일 (%d/%d 샘플)" % (similarity * 100, same_count, total_samples))

        if similarity >= 0.90:
            log(u"    [COMPARE] → 첫 행 동일(90%+) → 마지막 페이지 확정")
            return True
        else:
            log(u"    [COMPARE] → 첫 행 변경됨 → 계속 진행")
            return False

    except Exception as e:
        log(u"    [COMPARE] 비교 오류: %s → 계속 진행" % str(e))
        return False


def dismiss_alert_if_exists():
    """
    알림 팝업이 있으면 확인 클릭하여 닫기

    Returns:
        bool: 팝업이 있어서 닫았으면 True
    """
    try:
        if exists(IMG_ALERT_OK, 1):  # 1초 대기
            log(u"        -> [ALERT] 알림 팝업 감지! 스크린샷 저장 후 확인 클릭...")
            _take_crash_screenshot(u"ALERT_POPUP")
            click(IMG_ALERT_OK)
            sleep(1)
            return True
    except:
        pass
    return False


def dismiss_notice_popups(max_attempts=10):
    """
    공지사항 팝업이 있으면 모두 닫기 (레이어링 대응).

    MetLife 로그인 후 공지사항이 여러 개 겹쳐서 표시될 수 있다.
    "오늘 하루 이 창을 열지 않음" 체크 → X 닫기를 반복하여 모두 제거한다.

    Args:
        max_attempts: 최대 시도 횟수 (무한루프 방지)

    Returns:
        int: 닫은 팝업 수
    """
    dismissed = 0
    for _ in range(max_attempts):
        # 체크박스 텍스트로 공지사항 팝업 감지
        checkbox = exists(IMG_NOTICE_CHECKBOX, 2)
        if not checkbox:
            break

        log(u"    [NOTICE] 공지사항 팝업 감지 (%d번째)" % (dismissed + 1))

        # "오늘 하루 이 창을 열지 않음" 체크
        try:
            click(checkbox)
            sleep(0.5)
        except:
            log(u"    [NOTICE] 체크박스 클릭 실패")

        # X(닫기) 버튼 클릭
        close_btn = exists(IMG_NOTICE_CLOSE, 2)
        if close_btn:
            try:
                click(close_btn)
                sleep(1)
                dismissed += 1
                log(u"    [NOTICE] 공지사항 팝업 닫음 (누적: %d)" % dismissed)
            except:
                log(u"    [NOTICE] X 버튼 클릭 실패")
                break
        else:
            log(u"    [NOTICE] X 버튼 미발견 → 중단")
            break

    if dismissed > 0:
        log(u"    [NOTICE] 총 %d개 공지사항 팝업 처리 완료" % dismissed)
    return dismissed


def process_customers(customers, fixed_x, base_y, chosung_name, global_page, skip_count=0, is_scrolled=False,
                      nav_page=1, scroll_page=1, resume_skip_until=-1):
    """
    OCR로 인식한 고객들을 순차적으로 클릭하여 처리

    Args:
        customers: OCR로 추출한 고객 리스트
        fixed_x: 고객명 클릭 X좌표
        base_y: 고객명 헤더 Y좌표
        chosung_name: 초성 이름
        global_page: 전체 페이지 번호
        skip_count: 스크롤 중복으로 스킵할 행 수
        is_scrolled: 스크롤 후 페이지 여부 (True면 FIRST_ROW_OFFSET_SCROLLED 사용)
        nav_page: 현재 네비게이션 페이지 번호
        scroll_page: 현재 스크롤 페이지 번호
        resume_skip_until: --resume 모드에서 이 행까지 스킵 (-1이면 스킵 없음)

    Returns:
        tuple: (처리한 고객 수, 오류 발생 고객 목록, 갱신된 base_y)
    """
    error_customers = []
    processed = 0
    current_base_y = base_y  # ALERT 발생 시 갱신될 수 있음

    # 화면에 보이는 행 수만큼 처리 (최대 15행, 중복 제외)
    customers_to_process = customers[skip_count:ROWS_PER_PAGE]
    total_to_process = len(customers_to_process)

    if total_to_process == 0:
        log(u"        [SKIP] 처리할 고객 없음 (중복 %d행 스킵)" % skip_count)
        return 0, error_customers, current_base_y

    # 사용할 오프셋 결정
    offset_used = FIRST_ROW_OFFSET_SCROLLED if is_scrolled else FIRST_ROW_OFFSET
    resume_info = u" (재개모드: %d행까지 스킵)" % resume_skip_until if resume_skip_until >= 0 else ""
    log(u"      [고객처리] %d명 처리 시작 (중복 %d행 스킵, offset=%d)%s" % (total_to_process, skip_count, offset_used, resume_info))

    # Arrow Down 방식: 현재 Y좌표 추적
    current_click_y = None

    for i, customer in enumerate(customers_to_process):
        row_index = skip_count + i  # 실제 화면상 행 인덱스
        row_in_page = i + 1  # 페이지 내 행 번호 (1-based)
        name = customer.get(u"고객명", "") or ""

        if not name:
            continue

        # --start-from 모드: 지정된 고객을 찾을 때까지 스킵 (해당 고객 포함 처리)
        global _start_from_found
        if START_FROM_MODE and not _start_from_found:
            if name == START_FROM_CUSTOMER:
                _start_from_found = True
                log(u"        [%d/%d] %s 발견! → 이 고객부터 처리 시작" % (i + 1, total_to_process, name))
                # continue 없음 - 이 고객부터 처리
            else:
                log(u"        [%d/%d] %s 스킵 (--start-from '%s' 찾는 중)" % (i + 1, total_to_process, name, START_FROM_CUSTOMER))
                continue

        # --resume 모드: 재개 위치까지 스킵
        if resume_skip_until >= 0 and row_in_page <= resume_skip_until:
            log(u"        [%d/%d] %s 스킵 (재개모드: %d행까지 스킵)" % (i + 1, total_to_process, name, resume_skip_until))
            continue

        # --only 모드: 특정 고객명만 처리
        global _only_found_count, _only_all_done
        if ONLY_MODE:
            if name != ONLY_CUSTOMER:
                log(u"        [%d/%d] %s 스킵 (--only '%s' 모드)" % (i + 1, total_to_process, name, ONLY_CUSTOMER))
                # 이미 처리한 고객이 있고, 다른 이름이 나왔으면 종료 플래그 설정
                if _only_found_count > 0:
                    _only_all_done = True
                    log(u"        [ONLY] '%s' 처리 완료 (%d명) → 종료 예정" % (ONLY_CUSTOMER, _only_found_count))
                    return processed, error_customers, current_base_y
                continue

        check_pause()  # GUI 일시정지 체크

        log(u"        [%d/%d] %s 클릭..." % (i + 1, total_to_process, name))

        try:
            # Arrow Down 방식으로 행 이동
            # (--start-from 모드에서 스킵 후 처음 처리하는 행도 첫 행처럼 처리)
            if i == 0 or current_click_y is None:
                # 첫 행 (또는 스킵 후 첫 처리 행): offset으로 Y좌표 계산 (선택 상태 진입)
                current_click_y = get_row_y(current_base_y, row_index, is_scrolled)
                log(u"        [ARROW] 첫 행 클릭 (offset): y=%d (row_index=%d)" % (current_click_y, row_index))
            else:
                # 다음 행: Arrow Down으로 선택 이동 + ROW_HEIGHT로 클릭 위치 계산
                type(Key.DOWN)
                sleep(0.3)
                current_click_y += ROW_HEIGHT
                log(u"        [ARROW] Arrow Down + ROW_HEIGHT: y=%d" % current_click_y)

            row_y = current_click_y

            # 진단용 스크린샷 (클릭 전)
            save_click_diagnostic(fixed_x, row_y, name, global_page, row_index)

            click(Location(fixed_x, row_y))
            sleep(5)  # 고객등록/조회 페이지 로딩 대기

            # 알림 팝업 확인
            alert_occurred = dismiss_alert_if_exists()

            # No-OCR 모드: 빈 행 감지 (클릭 후에도 목록 페이지에 있으면 빈 행)
            if NO_OCR_MODE and not alert_occurred:
                if exists(IMG_CUSTNAME, 1):
                    global _no_ocr_empty_row_detected
                    _no_ocr_empty_row_detected = True
                    log(u"        [NO-OCR] 빈 행 감지 (행 %d) → 나머지 행 스킵" % (row_index + 1))
                    break

            # 고객 상세정보 캡처 (고객등록/조회 페이지에서 metdo_reader OCR)
            _customer_detail = None
            if not alert_occurred:
                _customer_detail = capture_customer_detail(name)

            # 고객통합뷰 모드인 경우 리포트 다운로드 (알림이 없었을 때만)
            if INTEGRATED_VIEW_ENABLED:
                if alert_occurred:
                    log(u"        -> [SKIP] 알림 발생 → 리포트 다운로드 스킵 (스크린샷은 dismiss_alert_if_exists에서 저장됨)")
                    save_error(name, u"알림 팝업 감지 (화면 캡처 저장됨)", chosung_name, nav_page, scroll_page, row_in_page)
                else:
                    log(u"        -> 고객통합뷰 진입 및 리포트 다운로드...")
                    try:
                        from verify_customer_integrated_view import verify_customer_integrated_view
                        view_result = verify_customer_integrated_view(pdf_save_dir=PDF_SAVE_DIR, customer_name=name, output_dir=CAPTURE_DIR)
                        log(u"        -> 고객통합뷰 처리 완료")
                        # 고객 상세정보 병합
                        if isinstance(view_result, dict):
                            if _customer_detail:
                                view_result['customer_detail'] = _customer_detail
                            # 테이블 OCR 데이터는 항상 기록 (이메일 등 — metdo_reader와 병합됨)
                            # customer는 루프 변수 — 재조회 없음
                            view_result['customer_detail_fallback'] = {
                                'name': name,
                                'customer_type': u'법인' if customer.get(u'성별') == u'미사용' else u'개인',
                                'gubun': customer.get(u'구분', u''),
                                'insurance_age': customer.get(u'보험나이', u''),
                                'mobile_phone': customer.get(u'휴대폰', u''),
                                'birth_date': customer.get(u'생년월일', u''),
                                'gender': customer.get(u'성별', u''),
                                'email': customer.get(u'이메일', u''),
                            }
                            _chosung_customer_results.append(view_result)
                            _save_results_incremental(chosung_name)
                            _trigger_sync_reports()
                    except Exception as e:
                        # Jython/SikuliX 모듈 로딩 특성상 클래스명으로 비교
                        # (cross-module 예외 클래스 identity 불일치 문제 회피)
                        # 주의: SikuliX가 type()을 키보드 입력 함수로 오버라이드하므로 __class__ 사용
                        err_type_name = e.__class__.__name__
                        err_msg = u"%s" % e
                        if err_type_name == 'NavigationResetRequired':
                            # === 검증 실패 → 프로그램 종료 ===
                            _crash_log(u"")
                            _crash_log(u"    " + u"=" * 60)
                            _crash_log(u"    [FATAL] 검증 실패 - 프로그램 종료")
                            _crash_log(u"    " + u"=" * 60)
                            _crash_log(u"    고객명: %s" % name)
                            _crash_log(u"    초성: %s" % chosung_name)
                            _crash_log(u"    위치: N%d-S%d-R%d" % (nav_page, scroll_page, row_in_page))
                            _crash_log(u"    원인: %s" % err_msg)
                            _crash_log(u"    ")
                            _crash_log(u"    → 문제 분석 후 --start-from '%s' 옵션으로 재개하세요." % name)
                            _crash_log(u"    " + u"=" * 60)
                            _take_crash_screenshot(u"FATAL_verification_failed_%s" % name)
                            # 에러 + 체크포인트 저장
                            save_error(name, err_msg, chosung_name, nav_page, scroll_page, row_in_page)
                            save_checkpoint(name, chosung_name, nav_page, scroll_page, row_in_page)
                            _close_log_file()
                            raise SystemExit(1)
                        else:
                            log(u"        -> [ERROR] 고객통합뷰 처리 중 오류: %s" % err_msg)
                            # 고객통합뷰가 열려있을 수 있으므로 닫기 시도
                            try:
                                from verify_customer_integrated_view import IMG_INTEGRATED_VIEW_CLOSE_BTN
                                if exists(IMG_INTEGRATED_VIEW_CLOSE_BTN, 3):
                                    click(IMG_INTEGRATED_VIEW_CLOSE_BTN)
                                    log(u"        -> 고객통합뷰 X 버튼 클릭 (정리)")
                                    sleep(2)
                            except:
                                pass  # 이미 닫혀있으면 무시
                            # 오류 기록
                            save_error(name, err_msg, chosung_name, nav_page, scroll_page, row_in_page)
                    except:
                        # Java 예외 (SikuliX FindFailed 등) - Python except Exception으로 안 잡힘
                        exc_info = sys.exc_info()
                        _crash_log(u"")
                        _crash_log(u"    " + u"=" * 60)
                        _crash_log(u"    [FATAL] 고객통합뷰 Java 예외 - 프로그램 종료")
                        _crash_log(u"    " + u"=" * 60)
                        _crash_log(u"    고객명: %s" % name)
                        _crash_log(u"    초성: %s" % chosung_name)
                        _crash_log(u"    위치: N%d-S%d-R%d" % (nav_page, scroll_page, row_in_page))
                        try:
                            _crash_log(u"    오류 타입: %s" % exc_info[0])
                            _crash_log(u"    오류 내용: %s" % exc_info[1])
                        except:
                            pass
                        _crash_log(u"    " + u"=" * 60)
                        _take_crash_screenshot(u"FATAL_java_exception_%s" % name)
                        save_error(name, u"Java exception: %s" % exc_info[1], chosung_name, nav_page, scroll_page, row_in_page)
                        _close_log_file()
                        raise SystemExit(1)
                    sleep(2)  # 화면 안정화 대기

            # 종료(x) 버튼 클릭
            log(u"        -> 종료(x) 클릭...")
            click(IMG_CLOSE_BTN)
            sleep(3)  # 목록 복귀 대기

            # 알림 팝업 확인
            dismiss_alert_if_exists()

            # 고객 목록 복귀 검증 (고객명 헤더가 보이는지 확인)
            if not exists(IMG_CUSTNAME, 3):
                log(u"        -> [WARN] 고객목록 미복귀! 복구 시도...")
                # 1차: 종료(x) 버튼 재시도
                if exists(IMG_CLOSE_BTN, 2):
                    click(IMG_CLOSE_BTN)
                    sleep(2)
                    dismiss_alert_if_exists()
                # 2차: 여전히 목록이 아니면 ESC 시도
                if not exists(IMG_CUSTNAME, 3):
                    type(Key.ESC)
                    sleep(2)
                    dismiss_alert_if_exists()
                # 최종 확인
                if exists(IMG_CUSTNAME, 3):
                    log(u"        -> [WARN] 고객목록 복귀 성공")
                else:
                    log(u"        -> [ERROR] 고객목록 복귀 실패! 다음 고객 처리에 영향 가능")

            log(u"        -> %s 처리 완료" % name)
            processed += 1

            # --only 모드: 처리 카운트 증가
            if ONLY_MODE and name == ONLY_CUSTOMER:
                _only_found_count += 1
                log(u"        [ONLY] '%s' %d번째 처리 완료" % (ONLY_CUSTOMER, _only_found_count))

            # 체크포인트 저장 (성공한 고객)
            save_checkpoint(name, chosung_name, nav_page, scroll_page, row_in_page)

        except SystemExit:
            raise  # SystemExit는 절대 삼키지 않음 → 프로그램 종료
        except Exception as e:
            # NavigationResetRequired가 inner try에서 안 잡혔을 경우 대비
            err_type_name = e.__class__.__name__
            if err_type_name == 'NavigationResetRequired':
                log(u"        -> [FATAL] 검증 실패 (outer catch): %s" % e)
                _close_log_file()
                raise SystemExit(1)
            err_msg = u"%s" % e if isinstance(e, BaseException) else unicode(e)
            log(u"        -> [ERROR] %s 처리 중 오류: %s" % (name, err_msg))
            error_customers.append({
                u"초성": chosung_name,
                u"페이지": global_page,
                u"행": row_index + 1,
                u"고객명": name,
                u"오류": err_msg
            })

            # 오류 발생 고객 저장
            save_error(name, err_msg, chosung_name, nav_page, scroll_page, row_in_page)
        except:
            # Java 예외 (SikuliX FindFailed 등) - outer 레벨
            exc_info = sys.exc_info()
            _crash_log(u"")
            _crash_log(u"=" * 60)
            _crash_log(u"[FATAL] 고객 처리 중 Java 예외 - 프로그램 종료")
            _crash_log(u"=" * 60)
            _crash_log(u"고객명: %s" % name)
            _crash_log(u"초성: %s" % chosung_name)
            try:
                _crash_log(u"오류 타입: %s" % exc_info[0])
                _crash_log(u"오류 내용: %s" % exc_info[1])
            except:
                pass
            _crash_log(u"=" * 60)
            _take_crash_screenshot(u"FATAL_outer_java_%s" % name)
            save_error(name, u"Java exception (outer)", chosung_name, nav_page, scroll_page, row_in_page)
            _close_log_file()
            raise SystemExit(1)

    log(u"      [고객처리] %d명 처리 완료" % processed)
    return processed, error_customers, current_base_y


# 설정
WAIT_TIME = 3
# ===== 클릭 위치 튜닝 파라미터 (offset 방식용) =====
# [100% 화면 기준 - 2026-01-29 측정값]
# IMG_CUSTNAME = "고객명 ↓" 헤더 이미지 사용
FIRST_ROW_OFFSET = 32           # 첫 페이지: 헤더 → 첫 행 중앙 (픽셀) - 50에서 32로 수정 (행 중앙)
FIRST_ROW_OFFSET_SCROLLED = 32  # 스크롤 후 페이지 (P1과 동일하게 테스트)
ROW_HEIGHT = 37                 # 행 간 간격 (픽셀) - 실측값
# ================================
ROWS_PER_PAGE = 12     # 화면에 완전히 보이는 행 수 (100% 줌, AC 영역 제외)
MAX_CUSTOMERS_PER_PAGE = 12  # OCR로 처리하는 행 수

# 고객명 정렬 이미지 [100% 줌 - 2026-01-29]
IMG_CUSTNAME = "img/1769599404157.png"         # 고객명 ↓ 헤더 (내림차순 상태)
IMG_ARROW_DESC = "img/1769598882979.png"       # ↓ (내림차순 화살표)
IMG_ARROW_ASC = "img/1769598893800.png"        # ↑ (오름차순 화살표)

# 고객등록/조회 페이지
IMG_CLOSE_BTN = "img/1769602665952.png"        # 종료(x) 버튼 [100% 줌]
IMG_ALERT_OK = "img/1769251121685.png"         # 알림 팝업 "확인" 버튼 (TODO: 100% 캡처 필요)
IMG_NEXT_BTN = "img/next_btn_100.png"           # 다음 버튼 [100% 줌 - 2026-01-30]

# 공지사항 팝업 (로그인 후 레이어링 표시)
IMG_NOTICE_CHECKBOX = "img/notice_checkbox.png"  # "오늘 하루 이 창을 열지 않음" 체크박스+텍스트
IMG_NOTICE_CLOSE = "img/notice_close_btn.png"    # 공지사항 X(닫기) 버튼

# 초성 버튼 이미지 (전체) [100% 줌 - 2026-01-29]
ALL_CHOSUNG_BUTTONS = [
    (u"ㄱ", "img/1769598464024.png"),
    (u"ㄴ", "img/1769598473156.png"),
    (u"ㄷ", "img/1769598483435.png"),
    (u"ㄹ", "img/1769598490826.png"),
    (u"ㅁ", "img/1769598498525.png"),
    (u"ㅂ", "img/1769598509352.png"),
    (u"ㅅ", "img/1769598520565.png"),
    (u"ㅇ", "img/1769598525890.png"),
    (u"ㅈ", "img/1769598531942.png"),
    (u"ㅊ", "img/1769598539058.png"),
    (u"ㅋ", "img/1769598547853.png"),
    (u"ㅌ", "img/1769598553214.png"),
    (u"ㅍ", "img/1769598561676.png"),
    (u"ㅎ", "img/1769598568884.png"),
    (u"기타", "img/1769598576170.png"),
]

# 초성 선택: 명령줄 인자 > 환경변수 > 전체
# 사용법: java -jar sikulixide.jar -r MetlifeCustomerList.py -- ㄱ
#        java -jar sikulixide.jar -r MetlifeCustomerList.py -- --chosung ㄱ
#        java -jar sikulixide.jar -r MetlifeCustomerList.py -- ㄱ --no-click
import sys

def parse_args():
    """명령줄 인자 파싱 (초성, --no-click, --integrated-view 등)"""
    # sys.argv 예시: ['MetlifeCustomerList.py', '--', 'ㄱ'] 또는 ['...', '--', '--chosung', 'ㄱ', '--no-click']
    args = sys.argv[1:] if len(sys.argv) > 1 else []

    # '--' 이후의 인자만 처리 (SikuliX 방식)
    if '--' in args:
        args = args[args.index('--') + 1:]

    result = {
        'chosung': None,
        'no_click': False,
        'integrated_view': False,  # 고객통합뷰 진입 및 리포트 다운로드 옵션
        'start_from': None,  # 특정 고객부터 시작 (해당 고객 포함)
        'resume': False,  # checkpoint.json에서 위치 읽어서 재개
        'only': None,  # 특정 고객명만 처리 (동일 이름 여러 명 처리용)
        'no_ocr': False,  # OCR 없이 순차 클릭 모드
        'scroll_test': False,  # 스크롤 테스트 모드 (클릭 없이 스크롤만)
    }

    # --no-click 옵션 처리
    if '--no-click' in args:
        result['no_click'] = True
        args = [a for a in args if a != '--no-click']

    # --integrated-view 옵션 처리 (고객통합뷰 진입 및 리포트 다운로드)
    if '--integrated-view' in args:
        result['integrated_view'] = True
        args = [a for a in args if a != '--integrated-view']

    # --start-from 옵션 처리 (특정 고객부터 시작 - 해당 고객 포함)
    if '--start-from' in args:
        idx = args.index('--start-from')
        if idx + 1 < len(args):
            raw_name = args[idx + 1]
            if isinstance(raw_name, str):
                result['start_from'] = raw_name.decode('utf-8')
            else:
                result['start_from'] = raw_name
            args = args[:idx] + args[idx + 2:]

    # --resume 옵션 처리 (checkpoint.json에서 위치 읽어서 재개)
    if '--resume' in args:
        result['resume'] = True
        args = [a for a in args if a != '--resume']

    # --no-ocr 옵션 처리 (OCR 없이 순차 클릭)
    if '--no-ocr' in args:
        result['no_ocr'] = True
        args = [a for a in args if a != '--no-ocr']

    # --scroll-test 옵션 처리 (스크롤 테스트: 클릭 없이 페이지별 스크린샷)
    if '--scroll-test' in args:
        result['scroll_test'] = True
        args = [a for a in args if a != '--scroll-test']

    # --only 옵션 처리 (특정 고객명만 처리)
    if '--only' in args:
        idx = args.index('--only')
        if idx + 1 < len(args):
            raw_name = args[idx + 1]
            if isinstance(raw_name, str):
                result['only'] = raw_name.decode('utf-8')
            else:
                result['only'] = raw_name
            args = args[:idx] + args[idx + 2:]

    # --save-dir 옵션 제거 (이미 early parsing에서 처리됨)
    if '--save-dir' in args:
        idx = args.index('--save-dir')
        args = args[:idx] + args[idx + 2:]

    # --chosung 옵션 처리
    if '--chosung' in args:
        idx = args.index('--chosung')
        if idx + 1 < len(args):
            result['chosung'] = args[idx + 1]

    # 단순 위치 인자 (첫 번째 인자가 초성)
    elif args and not args[0].startswith('-'):
        result['chosung'] = args[0]

    return result

_parsed_args = parse_args()
_arg_chosung = _parsed_args['chosung']
_arg_no_click = _parsed_args['no_click']
_arg_integrated_view = _parsed_args['integrated_view']
_arg_start_from = _parsed_args['start_from']
_arg_resume = _parsed_args['resume']
_arg_only = _parsed_args['only']
_arg_no_ocr = _parsed_args.get('no_ocr', False)
_arg_scroll_test = _parsed_args.get('scroll_test', False)
_env_chosung = os.environ.get("METLIFE_CHOSUNG", "")
_env_no_click = os.environ.get("METLIFE_NO_CLICK", "").lower() in ("1", "true", "yes")
_env_integrated_view = os.environ.get("METLIFE_INTEGRATED_VIEW", "").lower() in ("1", "true", "yes")

# 우선순위: 명령줄 > 환경변수
_raw_chosung = _arg_chosung or _env_chosung

# 고객 클릭 기능: 기본 활성화, --no-click 또는 환경변수로 비활성화
CLICK_ENABLED = not (_arg_no_click or _env_no_click)

# 스크롤 테스트 모드: 클릭 없이 스크롤만 수행 (페이지별 스크린샷 + 경계 로깅)
SCROLL_TEST = _arg_scroll_test
if SCROLL_TEST:
    CLICK_ENABLED = False

# 고객통합뷰 기능: --integrated-view 또는 환경변수로 활성화
INTEGRATED_VIEW_ENABLED = _arg_integrated_view or _env_integrated_view

# 재개 기능: --resume으로 checkpoint에서 자동 재개
RESUME_MODE = _arg_resume
START_FROM_CUSTOMER = _arg_start_from

# --start-from 모드 플래그 (해당 고객부터 처리 시작)
START_FROM_MODE = START_FROM_CUSTOMER is not None
_start_from_found = False  # 해당 고객을 찾았는지 여부

# --no-ocr 모드: OCR 없이 순차 클릭
NO_OCR_MODE = _arg_no_ocr
_no_ocr_empty_row_detected = False  # 빈 행 감지 플래그

# --only 모드: 특정 고객명만 처리
ONLY_CUSTOMER = _arg_only
ONLY_MODE = ONLY_CUSTOMER is not None
_only_found_count = 0  # 해당 고객 처리 횟수
_only_all_done = False  # 모든 해당 고객 처리 완료 여부

# 스크롤 테스트 디렉토리 (SCROLL_TEST 모드에서 페이지별 스크린샷 저장, DEV only)
SCROLL_TEST_DIR = None
if SCROLL_TEST and DEV_MODE and DEV_DIR:
    SCROLL_TEST_DIR = os.path.join(DEV_DIR, "scroll_test")
    if not os.path.exists(SCROLL_TEST_DIR):
        os.makedirs(SCROLL_TEST_DIR)

# 에러/체크포인트 파일 경로 (DEV: 평문 파일, PROD: .acdump에 암호화)
ERROR_FILE = os.path.join(DEV_DIR, u"errors.json") if DEV_DIR else None
CHECKPOINT_FILE = os.path.join(DEV_DIR, u"checkpoint.json") if DEV_DIR else None

# 재개 위치 정보 (--resume 모드에서 사용)
_resume_info = None
_skip_until_row = -1  # 이 행까지 스킵 (해당 행 포함)


def load_checkpoint():
    """checkpoint.json에서 마지막 위치 로드"""
    if not CHECKPOINT_FILE or not os.path.exists(CHECKPOINT_FILE):
        return None
    try:
        with codecs.open(CHECKPOINT_FILE, "r", "utf-8") as f:
            return json.load(f)
    except Exception as e:
        log(u"[ERROR] 체크포인트 로드 실패: %s" % str(e))
        return None


# PROD용 에러 목록 (메모리 보관, .acdump에 기록)
_prod_errors = []


def save_error(customer_name, error_msg, chosung, nav_page, scroll_page, row_in_page):
    """오류 발생 고객을 errors.json에 기록 (위치 정보 포함)"""
    try:
        import datetime as _dt
        error_entry = {
            u"고객명": customer_name,
            u"초성": chosung,
            u"네비페이지": nav_page,
            u"스크롤페이지": scroll_page,
            u"행": row_in_page,
            u"오류": error_msg,
            u"시간": _dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }

        if DEV_MODE and ERROR_FILE:
            errors = []
            if os.path.exists(ERROR_FILE):
                with codecs.open(ERROR_FILE, "r", "utf-8") as f:
                    errors = json.load(f)
            errors.append(error_entry)
            with codecs.open(ERROR_FILE, "w", "utf-8") as f:
                json.dump(errors, f, ensure_ascii=False, indent=2)
        elif _diag:
            # PROD: .acdump에 암호화 저장
            _prod_errors.append(error_entry)
            _diag.write_json(u"errors.json", json.dumps(_prod_errors, ensure_ascii=False, indent=2))

        log(u"    [ERROR_LOG] 오류 기록됨: %s (N%d-S%d-R%d)" % (customer_name, nav_page, scroll_page, row_in_page))
    except Exception as e:
        log(u"    [ERROR_LOG] 오류 기록 실패: %s" % str(e))


def save_checkpoint(customer_name, chosung, nav_page, scroll_page, row_in_page):
    """마지막 성공 고객을 checkpoint.json에 기록 (위치 정보 포함)"""
    try:
        import datetime as _dt
        checkpoint = {
            u"마지막고객": customer_name,
            u"초성": chosung,
            u"네비페이지": nav_page,
            u"스크롤페이지": scroll_page,
            u"행": row_in_page,
            u"시간": _dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }

        if DEV_MODE and CHECKPOINT_FILE:
            with codecs.open(CHECKPOINT_FILE, "w", "utf-8") as f:
                json.dump(checkpoint, f, ensure_ascii=False, indent=2)
        elif _diag:
            # PROD: .acdump에 암호화 저장
            _diag.write_json(u"checkpoint.json", json.dumps(checkpoint, ensure_ascii=False, indent=2))
    except Exception as e:
        log(u"    [CHECKPOINT] 저장 실패: %s" % str(e))


# ★ 초성별 고객통합뷰 처리 결과 수집용
_chosung_customer_results = []


def _jython_safe_replace(tmp_path, target_path):
    """Jython 2.7 호환 atomic 파일 교체 (os.replace는 Python 3.3+에서만 지원)"""
    try:
        if os.path.exists(target_path):
            os.remove(target_path)
        os.rename(tmp_path, target_path)
    except Exception:
        pass  # rename 실패 시 tmp 파일 잔존 (다음 시도에서 덮어쓰기)


def _save_results_incremental(chosung_name):
    """고객 결과를 즉시 디스크에 저장 (크래시 대비 증분 저장, atomic write)"""
    if not _chosung_customer_results:
        return
    try:
        if DEV_MODE and DEV_DIR:
            path = os.path.join(DEV_DIR, u"customer_results_%s.json" % chosung_name)
            tmp_path = path + u".tmp"
            with codecs.open(tmp_path, "w", "utf-8") as f:
                json.dump(_chosung_customer_results, f, ensure_ascii=False, indent=2)
            _jython_safe_replace(tmp_path, path)
        elif _diag:
            # PROD: .acdump에 암호화 저장
            _diag.write_json(
                u"customer_results_%s.json" % chosung_name,
                json.dumps(_chosung_customer_results, ensure_ascii=False, indent=2))
    except Exception:
        pass  # 증분 저장 실패가 실행을 막으면 안 됨


def _trigger_sync_reports():
    """고객 처리 완료 시마다 동기(blocking) subprocess로 리포트 갱신.

    - INTEGRATED_VIEW_ENABLED이 아니거나 SCROLL_TEST 시 스킵
    - subprocess.call (blocking): 완료 후 다음 고객 처리 진행
    - 실패해도 메인 처리에 영향 없음
    """
    try:
        if not INTEGRATED_VIEW_ENABLED or SCROLL_TEST:
            return
        if _AC_EXE_PATH:
            cmd = [_AC_EXE_PATH, "--run-reports", CAPTURE_DIR,
                   "--timestamp", _REPORT_TIMESTAMP]
        elif os.path.exists(GENERATE_REPORTS_SCRIPT):
            cmd = ["python", GENERATE_REPORTS_SCRIPT, CAPTURE_DIR,
                   "--timestamp", _REPORT_TIMESTAMP]
        else:
            return
        with open(os.devnull, 'w') as _devnull:
            subprocess.call(cmd, stdout=_devnull, stderr=_devnull)
    except Exception:
        pass  # 증분 리포트 실패가 메인 처리를 막으면 안 됨


def generate_chosung_summary(chosung_name, total_rows, total_errors, error_customers, nav_page, global_page, elapsed_sec):
    """
    초성 처리 완료 후 Summary + 문제 Report 출력

    Args:
        chosung_name: 초성 이름 (예: 'ㅁ')
        total_rows: 처리한 총 행수
        total_errors: 오류 발생 고객 수
        error_customers: 오류 고객 목록 (process_customers에서 반환)
        nav_page: 네비게이션 페이지 수
        global_page: 스크롤 페이지 수
        elapsed_sec: 소요 시간 (초)
    """
    global _chosung_customer_results

    results = _chosung_customer_results
    minutes = int(elapsed_sec // 60)
    seconds = int(elapsed_sec % 60)

    log(u"")
    log(u"=" * 70)
    log(u"  [%s] 초성 처리 결과 Summary" % chosung_name)
    log(u"=" * 70)

    # 기본 통계
    log(u"  총 행수: %d행 | 오류: %d건 | 소요: %d분 %d초" % (total_rows, total_errors, minutes, seconds))
    log(u"  네비 페이지: %d회 | 스크롤 페이지: %d개" % (nav_page, global_page))

    # 고객통합뷰 결과 통계 (결과가 있는 경우)
    if results:
        log(u"  고객통합뷰 처리: %d명" % len(results))

        # 변액리포트 통계
        var_exists_count = sum(1 for r in results if r.get('variable_insurance', {}).get('exists'))
        var_saved_total = sum(r.get('variable_insurance', {}).get('saved', 0) for r in results)
        var_dup_total = sum(r.get('variable_insurance', {}).get('duplicate', 0) for r in results)
        var_metlife_err = sum(r.get('variable_insurance', {}).get('metlife_errors', 0) for r in results)
        var_no_contract = sum(1 for r in results if r.get('variable_insurance', {}).get('no_variable_contract'))

        log(u"")
        log(u"  [변액리포트]")
        log(u"    변액보험 존재: %d명 | 미존재: %d명" % (var_exists_count, var_no_contract))
        log(u"    PDF 저장: %d건 | 중복스킵: %d건 | MetLife 오류 스킵: %d건" % (var_saved_total, var_dup_total, var_metlife_err))

        # Annual Report 통계
        ar_exists = sum(1 for r in results if r.get('annual_report', {}).get('exists') == True)
        ar_saved = sum(1 for r in results if r.get('annual_report', {}).get('saved') == True)
        ar_not_exists = sum(1 for r in results if r.get('annual_report', {}).get('exists') == False)
        ar_unknown = sum(1 for r in results if r.get('annual_report', {}).get('exists') is None)

        log(u"")
        log(u"  [Annual Report]")
        log(u"    존재+저장: %d건 | 미존재: %d건 | 버튼없음: %d건" % (ar_saved, ar_not_exists, ar_unknown))

    # ★ 문제 Report (별도 섹션)
    issues_found = []

    # 고객통합뷰 내 문제
    for r in results:
        cname = r.get('customer_name', u'?')
        for issue in r.get('issues', []):
            issues_found.append(u"[%s] %s" % (cname, issue))

    # process_customers 오류
    for err in error_customers:
        issues_found.append(u"[%s] 클릭 처리 오류: %s" % (
            err.get(u"고객명", u"?"), err.get(u"오류", u"?")))

    if issues_found:
        log(u"")
        log(u"  " + u"!" * 60)
        log(u"  [문제 Report] %d건" % len(issues_found))
        log(u"  " + u"!" * 60)
        for idx, issue in enumerate(issues_found, 1):
            log(u"    %d. %s" % (idx, issue))
        log(u"  " + u"!" * 60)
    else:
        log(u"")
        log(u"  [문제 Report] 문제 없음!")

    log(u"=" * 70)

    # ★ 초성별 고객 결과 JSON 저장 (리셋 전 디스크에 영속화, atomic write)
    if results:
        _results_name = u"customer_results_%s.json" % chosung_name
        if DEV_MODE and DEV_DIR:
            results_json_path = os.path.join(DEV_DIR, _results_name)
            tmp_path = results_json_path + u".tmp"
            try:
                with codecs.open(tmp_path, "w", "utf-8") as f:
                    json.dump(results, f, ensure_ascii=False, indent=2)
                _jython_safe_replace(tmp_path, results_json_path)
                log(u"  [저장] 고객 결과 JSON: %s (%d명)" % (_results_name, len(results)))
            except Exception as e:
                log(u"  [ERROR] 고객 결과 JSON 저장 실패: %s" % e)
        elif _diag:
            try:
                _diag.write_json(_results_name, json.dumps(results, ensure_ascii=False, indent=2))
                log(u"  [저장] 고객 결과 JSON (암호화): %s (%d명)" % (_results_name, len(results)))
            except Exception as e:
                log(u"  [ERROR] 고객 결과 JSON 저장 실패: %s" % e)

    # 결과 초기화 (다음 초성용)
    _chosung_customer_results = []


# PDF 저장 디렉토리 (고객통합뷰 모드에서 사용)
PDF_SAVE_DIR = os.path.join(CAPTURE_DIR, "pdf") if INTEGRATED_VIEW_ENABLED else None
if PDF_SAVE_DIR and not os.path.exists(PDF_SAVE_DIR):
    os.makedirs(PDF_SAVE_DIR)

# Jython: 바이트 문자열 → 유니코드 변환
if _raw_chosung:
    if isinstance(_raw_chosung, str):
        SELECTED_CHOSUNG = _raw_chosung.decode('utf-8')
    else:
        SELECTED_CHOSUNG = _raw_chosung
    # 콤마 구분 복수 초성 지원 (예: "ㄱ,ㄴ,ㄷ")
    if u"," in SELECTED_CHOSUNG:
        _selected_set = set(SELECTED_CHOSUNG.split(u","))
        CHOSUNG_BUTTONS = [(name, img) for name, img in ALL_CHOSUNG_BUTTONS if name in _selected_set]
    else:
        CHOSUNG_BUTTONS = [(name, img) for name, img in ALL_CHOSUNG_BUTTONS if name == SELECTED_CHOSUNG]
    if not CHOSUNG_BUTTONS:
        raise ValueError(u"잘못된 초성: %s (가능: ㄱ,ㄴ,ㄷ,ㄹ,ㅁ,ㅂ,ㅅ,ㅇ,ㅈ,ㅊ,ㅋ,ㅌ,ㅍ,ㅎ,기타)" % SELECTED_CHOSUNG)
else:
    SELECTED_CHOSUNG = u""
    CHOSUNG_BUTTONS = ALL_CHOSUNG_BUTTONS

log("=" * 60)
if NO_OCR_MODE:
    log(u"MetLife 고객목록조회 - [실험] No-OCR 순차 클릭 모드")
else:
    log(u"MetLife 고객목록조회 - Upstage Enhanced OCR 연동")
if LOG_FILE:
    log(u"로그 파일: %s" % os.path.basename(LOG_FILE))
elif _acdump_path:
    log(u"로그 파일: %s" % os.path.basename(_acdump_path))
if SELECTED_CHOSUNG:
    log(u"선택 초성: %s" % SELECTED_CHOSUNG)
else:
    log(u"선택 초성: 전체 (%d개)" % len(CHOSUNG_BUTTONS))
log(u"고객 클릭: %s" % (u"활성화" if CLICK_ENABLED else u"비활성화 (--no-click)"))
log(u"통합뷰/리포트: %s" % (u"활성화 (--integrated-view)" if INTEGRATED_VIEW_ENABLED else u"비활성화"))
if ONLY_MODE:
    log(u"특정 고객만: '%s' (--only 모드)" % ONLY_CUSTOMER)
if NO_OCR_MODE:
    log(u"OCR 모드: 비활성화 (--no-ocr) → 순차 클릭 + 빈 행 감지")
if SCROLL_TEST:
    log(u"스크롤 테스트: 활성화 (고객 클릭 비활성화, 페이지별 스크린샷)")
    log(u"스크린샷 저장: %s" % SCROLL_TEST_DIR)
log(u"네비 모드: Arrow Down (키보드)")

# --resume 모드 처리
if RESUME_MODE:
    _resume_info = load_checkpoint()
    if _resume_info:
        log(u"재개 모드: 활성화")
        log(u"  - 마지막 고객: %s" % _resume_info.get(u"마지막고객", "?"))
        log(u"  - 위치: N%d-S%d-R%d" % (
            _resume_info.get(u"네비페이지", 1),
            _resume_info.get(u"스크롤페이지", 1),
            _resume_info.get(u"행", 0)
        ))
    else:
        log(u"[WARN] --resume 지정되었지만 checkpoint.json 없음 → 처음부터 시작")
        RESUME_MODE = False
        _resume_info = None
else:
    _resume_info = None

log("=" * 60)

start_time = time.time()

###########################################
# 1단계: 고객목록조회 메뉴 진입
###########################################
log(u"\n[1단계] 고객목록조회 진입")

try:
    log(u"  [1-1] 메인 화면으로 이동...")
    click("img/1769598099792.png")  # MetLife 로고 [100% 줌]
    log(u"  [1-1] 메인 화면 로딩 대기 (10초)...")
    sleep(10)

    # 공지사항 팝업 닫기 (레이어링 대응 - 모두 닫을 때까지 반복)
    log(u"  [1-1a] 공지사항 팝업 확인...")
    dismiss_notice_popups()

    log(u"  [1-2] 고객관리 클릭...")
    _mgmt = find("img/1769598228284.png")  # 고객관리 탭 [100% 줌]
    _debug_mark_click(_mgmt.getTarget().x, _mgmt.getTarget().y, "1-2 mgmt tab")
    click(_mgmt)
    sleep(5)  # 서브메뉴 열릴 시간 확보

    # "고객등록 >"과 "고객관리 >"가 시각적으로 유사하여 오매칭 발생
    # → 드롭다운은 고객관리 탭 아래~오른쪽에 나타남
    #   상위 2행(계약정보, 고객등록)만 포함하여 "고객관리 >"(3번째 행) 제외
    # → 템플릿도 현재 화면에서 재캡처 (기존 이미지는 렌더링 차이로 매칭 실패)
    log(u"  [1-3] 고객등록 클릭...")
    _dd_region = Region(int(_mgmt.x), int(_mgmt.y + _mgmt.h), int(_mgmt.w) + 60, 75)
    _debug_mark_region(_dd_region.x, _dd_region.y, _dd_region.w, _dd_region.h, "1-3 search")
    log(u"  [DEBUG] 고객관리 탭: x=%d y=%d w=%d h=%d" % (_mgmt.x, _mgmt.y, _mgmt.w, _mgmt.h))
    log(u"  [DEBUG] 검색 영역: x=%d y=%d w=%d h=%d" % (_dd_region.x, _dd_region.y, _dd_region.w, _dd_region.h))
    for _reg_retry in range(3):
        _reg_match = _dd_region.exists("img/customer_reg_menu.png", 5)
        if _reg_match:
            _dd_region.click(_reg_match)
            break
        if _reg_retry < 2:
            log(u"  [RETRY] 고객등록 메뉴 재시도 %d/3" % (_reg_retry + 2))
            sleep(1)
    else:
        _dd_region.click("img/customer_reg_menu.png")  # 최종 실패 → FindFailed
    try:
        if _reg_match:
            _debug_mark_click(_reg_match.getTarget().x, _reg_match.getTarget().y, "1-3 reg click")
        else:
            _lm = _dd_region.getLastMatch()
            _debug_mark_click(_lm.getTarget().x, _lm.getTarget().y, "1-3 reg click")
    except:
        pass
    sleep(3)

    log(u"  [1-4] 고객목록조회 클릭...")
    click("img/1769598272319.png")  # 고객목록조회 [100% 줌]
    sleep(5)

except:
    # bare except: Java 예외(SikuliX FindFailed) + Python 예외 모두 캐치
    exc_info = sys.exc_info()
    _crash_log(u"")
    _crash_log(u"=" * 60)
    _crash_log(u"[FATAL] 1단계 네비게이션 실패 - 프로그램 종료")
    _crash_log(u"=" * 60)
    _crash_log(u"오류 타입: %s" % exc_info[0])
    _crash_log(u"오류 내용: %s" % exc_info[1])
    _crash_log(u"화면이 고객목록조회 메뉴에 접근 가능한 상태인지 확인하세요.")
    _crash_log(u"")
    _crash_log(u"스택 트레이스:")
    try:
        tb_str = traceback.format_exc()
        for line in tb_str.split("\n"):
            if line.strip():
                _crash_log(u"  %s" % line)
    except:
        pass
    _crash_log(u"=" * 60)
    _take_crash_screenshot(u"FATAL_navigation_failed")
    _close_log_file()
    raise SystemExit(1)

log(u"[1단계 완료]")

###########################################
# 2단계: 초성 버튼 클릭 및 고객 처리
###########################################
log(u"\n[2단계] 초성 버튼 및 고객 처리")

# 전체 통계 (모든 초성 합산)
all_total_rows = 0
all_error_customers = []

# OCR 연속 실패 추적
MAX_OCR_FAILURES = 3  # 연속 실패 허용 횟수
ocr_consecutive_failures = 0  # 연속 실패 카운터

for chosung_name, chosung_img in CHOSUNG_BUTTONS:
    chosung_start_time = time.time()
    _chosung_customer_results = []  # 초성별 결과 초기화
    log(u"\n  === [%s] 초성 처리 시작 ===" % chosung_name)
    log(u"  [%s] 버튼 클릭..." % chosung_name)
    try:
        click(chosung_img)
    except:
        _fatal_crash(u"초성 [%s] 버튼 클릭" % chosung_name, chosung_name)
    sleep(5)  # 목록 로딩 대기

    # 고객명 내림차순 정렬 - ↓ 화살표가 나타날 때까지 클릭
    for attempt in range(3):
        desc_found = exists(IMG_ARROW_DESC, 2)
        asc_found = exists(IMG_ARROW_ASC, 2)
        log(u"        -> 감지: ↓=%s, ↑=%s" % (desc_found is not None, asc_found is not None))
        if desc_found:
            log(u"        -> 내림차순 확인됨")
            break
        log(u"        -> 고객명 클릭 (%d차)" % (attempt + 1))
        try:
            click(IMG_CUSTNAME)
        except:
            _fatal_crash(u"내림차순 정렬 - 고객명 헤더 클릭 (%d차)" % (attempt + 1), chosung_name)
        sleep(3)
    else:
        log(u"[ERROR] 내림차순 정렬 실패!")
        exit(1)

    # 스크롤을 맨 위로 (정렬 후 스크롤이 중간에 있을 수 있음)
    log(u"  [SCROLL] 스크롤을 맨 위로 이동...")
    try:
        header = find(IMG_CUSTNAME)
        scroll_to_top(header)
    except:
        _fatal_crash(u"정렬 후 스크롤 맨 위 이동", chosung_name)
    log(u"  [SCROLL] 스크롤 맨 위 완료")

    ###########################################
    # 페이지 처리 루프
    # 구조: [네비 루프 (다음버튼)] → [스크롤 루프]
    ###########################################
    nav_page = 1                   # 네비게이션 페이지 (다음 버튼으로 이동)
    global_page = 0                # 전체 페이지 번호 (누적)
    total_rows = 0                 # 총 행수
    total_errors = 0
    error_customers = []           # 이번 초성의 오류 발생 고객 목록
    prev_page_rows = []            # 이전 페이지 행 리스트 (스크롤 중복 감지용)
    prev_customers = None          # 이전 페이지 OCR 결과 (OCR 실패 시 복구용)
    zero_new_rows_count = 0        # 연속 신규 행 0건 카운트 (무한루프 방지)

    # 좌표 설정 (한 번만 측정)
    try:
        header = find(IMG_CUSTNAME)
        fixed_x = header.getCenter().getX()       # 고객명 클릭용 X좌표
        base_y = header.getCenter().getY()
        scroll_x = fixed_x + 100                  # 스크롤 클릭용 X좌표 (구분 컬럼)
    except:
        _fatal_crash(u"좌표 설정 (header find)", chosung_name)
    log(u"  [INIT] 고객명 클릭: x=%d, 스크롤 클릭: x=%d, 기준 y=%d" % (fixed_x, scroll_x, base_y))

    # ========================================
    # 재개 모드: 시작 위치 계산
    # ========================================
    resume_nav_page = 1
    resume_scroll_page = 1
    resume_row = -1  # -1이면 스킵 없음

    if RESUME_MODE and _resume_info:
        resume_chosung = _resume_info.get(u"초성", "")
        if resume_chosung == chosung_name:
            resume_nav_page = _resume_info.get(u"네비페이지", 1)
            resume_scroll_page = _resume_info.get(u"스크롤페이지", 1)
            resume_row = _resume_info.get(u"행", 0)
            log(u"  [RESUME] 재개 위치: N%d-S%d-R%d (다음 행부터 처리)" % (resume_nav_page, resume_scroll_page, resume_row))

    # ========================================
    # 네비게이션 루프 (외부) - 다음 버튼으로 이동
    # ========================================
    while True:
        scroll_page = 1  # 스크롤 페이지 (각 네비 페이지마다 리셋)

        log(u"\n  " + u"=" * 50)
        log(u"  [네비 %d] 시작" % nav_page)
        log(u"  " + u"=" * 50)

        # 재개 모드: 네비 페이지 스킵
        if RESUME_MODE and nav_page < resume_nav_page:
            log(u"  [RESUME] 네비 %d 스킵 (재개 위치: N%d)" % (nav_page, resume_nav_page))
            next_btn = exists(IMG_NEXT_BTN, 5)
            if next_btn:
                click(next_btn)
                sleep(3)
                nav_page += 1
                continue
            else:
                log(u"  [WARN] 다음 버튼 없음 - 재개 불가")
                break

        # 네비 페이지 시작 시 스크롤 맨 위로 이동
        log(u"  [SCROLL] 스크롤을 맨 위로 이동...")
        try:
            header = find(IMG_CUSTNAME)
            scroll_to_top(header)
        except:
            _fatal_crash(u"네비 페이지 시작 - 스크롤 맨 위 이동", chosung_name)
        log(u"  [SCROLL] 스크롤 맨 위 완료")

        # ========================================
        # 스크롤 루프 (내부) - 스크롤로 이동
        # ========================================
        while True:
            global_page += 1
            page_label = u"N%d-S%d" % (nav_page, scroll_page)  # 예: N1-S3

            log(u"\n    " + u"-" * 40)
            log(u"    [%s] 스크롤 페이지 %d (전체 %d)" % (page_label, scroll_page, global_page))
            log(u"    " + u"-" * 40)

            # 재개 모드: 스크롤 페이지 스킵
            if RESUME_MODE and nav_page == resume_nav_page and scroll_page < resume_scroll_page:
                log(u"    [RESUME] 스크롤 %d 스킵 (재개 위치: S%d)" % (scroll_page, resume_scroll_page))
                scroll_page_down()
                scroll_page += 1
                continue

            # 화면 안정화 대기
            sleep(2)

            # OCR 기반 스크롤 끝 감지 플래그 (매 반복 초기화)
            _scroll_end_by_ocr = False

            # 1. 고객 인식 (OCR 또는 No-OCR)
            if NO_OCR_MODE:
                # No-OCR 모드: 행 번호 기반 가상 고객 생성
                customers = generate_blind_customers(ROWS_PER_PAGE)
                json_path = None
                log(u"    [NO-OCR] %d행 가상 고객 생성 (OCR 스킵)" % len(customers))
                _no_ocr_empty_row_detected = False  # 페이지마다 리셋
            else:
                customers, json_path = capture_and_ocr(chosung_name, global_page)

                if not customers:
                    log(u"    [WARN] OCR 결과 없음 → 재시도...")
                    sleep(2)
                    customers, json_path = capture_and_ocr(chosung_name, global_page)

                    if not customers:
                        # OCR 연속 실패 카운터 증가
                        ocr_consecutive_failures += 1
                        log(u"    [ERROR] OCR 연속 실패: %d/%d회" % (ocr_consecutive_failures, MAX_OCR_FAILURES))

                        if ocr_consecutive_failures >= MAX_OCR_FAILURES:
                            log(u"")
                            log(u"=" * 60)
                            log(u"[FATAL] OCR %d회 연속 실패 - 프로그램 종료!" % MAX_OCR_FAILURES)
                            log(u"        Upstage API 장애 가능성 있음")
                            log(u"        잠시 후 다시 시도하세요")
                            log(u"=" * 60)
                            _close_log_file()
                            exit(1)

                        log(u"    [WARN] 재시도 실패 → 스크롤 끝으로 간주")
                        # 이전 페이지의 16번째 행이 있으면 처리
                        if prev_customers and len(prev_customers) > ROWS_PER_PAGE:
                            extra = prev_customers[ROWS_PER_PAGE]
                            name = extra.get(u"고객명", "") or ""
                            birth = extra.get(u"생년월일", "") or ""
                            if name:
                                # --start-from / --only 모드 체크
                                _skip_last = False
                                if START_FROM_MODE and not _start_from_found:
                                    if name == START_FROM_CUSTOMER:
                                        _start_from_found = True
                                        log(u"    [LAST] ★ %s 발견! → 이 고객부터 처리 시작" % name)
                                    else:
                                        log(u"    [LAST] %s 스킵 (--start-from '%s' 찾는 중)" % (name, START_FROM_CUSTOMER))
                                        _skip_last = True
                                if ONLY_MODE and not _skip_last and name != ONLY_CUSTOMER:
                                    log(u"    [LAST] %s 스킵 (--only '%s' 모드)" % (name, ONLY_CUSTOMER))
                                    _skip_last = True

                                if not _skip_last:
                                    log(u"    [LAST] 이전 페이지 16번째 행 추가: %s (%s)" % (name, birth))
                                    total_rows += 1

                                # 16번째 행 고객 클릭 처리 (CLICK_ENABLED이고 스킵 아닐 때만)
                                if CLICK_ENABLED and not _skip_last:
                                    # 16번째 행 클릭 전 헤더 위치 재측정
                                    try:
                                        header = find(IMG_CUSTNAME)
                                        new_base_y = header.getCenter().getY()
                                        if new_base_y != base_y:
                                            log(u"        [RECALIBRATE] 16번째 행: base_y %d → %d" % (base_y, new_base_y))
                                            base_y = new_base_y
                                    except:
                                        pass

                                    check_pause()  # GUI 일시정지 체크
                                    log(u"        [LAST] %s 클릭..." % name)
                                    try:
                                        row_y = get_row_y(base_y, ROWS_PER_PAGE, is_scrolled=(scroll_page > 1))
                                        click(Location(fixed_x, row_y))
                                        sleep(5)

                                        # 알림 팝업 확인
                                        alert_occurred = dismiss_alert_if_exists()

                                        # 고객 상세정보 캡처 (13번째 행)
                                        _last_customer_detail = None
                                        if not alert_occurred:
                                            _last_customer_detail = capture_customer_detail(name)

                                        # 고객통합뷰 모드인 경우 리포트 다운로드 (정상 처리와 동일)
                                        if INTEGRATED_VIEW_ENABLED:
                                            if alert_occurred:
                                                log(u"        -> [SKIP] 알림 발생 → 리포트 다운로드 스킵 (스크린샷은 dismiss_alert_if_exists에서 저장됨)")
                                                save_error(name, u"알림 팝업 감지 (화면 캡처 저장됨)", chosung_name, nav_page, scroll_page, ROWS_PER_PAGE + 1)
                                            else:
                                                log(u"        -> 고객통합뷰 진입 및 리포트 다운로드...")
                                                try:
                                                    from verify_customer_integrated_view import verify_customer_integrated_view
                                                    view_result = verify_customer_integrated_view(pdf_save_dir=PDF_SAVE_DIR, customer_name=name, output_dir=CAPTURE_DIR)
                                                    log(u"        -> 고객통합뷰 처리 완료")
                                                    if isinstance(view_result, dict):
                                                        if _last_customer_detail:
                                                            view_result['customer_detail'] = _last_customer_detail
                                                        # 테이블 OCR 데이터 (이메일 등 — metdo_reader와 병합됨)
                                                        ocr_row = extra if extra else {}
                                                        view_result['customer_detail_fallback'] = {
                                                            'name': name,
                                                            'customer_type': u'법인' if ocr_row.get(u'성별') == u'미사용' else u'개인',
                                                            'gubun': ocr_row.get(u'구분', u''),
                                                            'insurance_age': ocr_row.get(u'보험나이', u''),
                                                            'mobile_phone': ocr_row.get(u'휴대폰', u''),
                                                            'birth_date': ocr_row.get(u'생년월일', u''),
                                                            'gender': ocr_row.get(u'성별', u''),
                                                            'email': ocr_row.get(u'이메일', u''),
                                                        }
                                                        _chosung_customer_results.append(view_result)
                                                        _save_results_incremental(chosung_name)
                                                        _trigger_sync_reports()
                                                except Exception as e2:
                                                    err_type_name = e2.__class__.__name__
                                                    err_msg = u"%s" % e2
                                                    if err_type_name == 'NavigationResetRequired':
                                                        _crash_log(u"")
                                                        _crash_log(u"    " + u"=" * 60)
                                                        _crash_log(u"    [FATAL] 검증 실패 - 프로그램 종료")
                                                        _crash_log(u"    " + u"=" * 60)
                                                        _crash_log(u"    고객명: %s" % name)
                                                        _crash_log(u"    초성: %s" % chosung_name)
                                                        _crash_log(u"    위치: N%d-S%d-LAST" % (nav_page, scroll_page))
                                                        _crash_log(u"    원인: %s" % err_msg)
                                                        _crash_log(u"    " + u"=" * 60)
                                                        _take_crash_screenshot(u"FATAL_verification_failed_%s" % name)
                                                        save_error(name, err_msg, chosung_name, nav_page, scroll_page, ROWS_PER_PAGE)
                                                        _close_log_file()
                                                        raise SystemExit(1)
                                                    else:
                                                        log(u"        -> [ERROR] 고객통합뷰 처리 중 오류: %s" % err_msg)
                                                        try:
                                                            from verify_customer_integrated_view import IMG_INTEGRATED_VIEW_CLOSE_BTN
                                                            if exists(IMG_INTEGRATED_VIEW_CLOSE_BTN, 3):
                                                                click(IMG_INTEGRATED_VIEW_CLOSE_BTN)
                                                                log(u"        -> 고객통합뷰 X 버튼 클릭 (정리)")
                                                                sleep(2)
                                                        except:
                                                            pass
                                                        save_error(name, err_msg, chosung_name, nav_page, scroll_page, ROWS_PER_PAGE)
                                                except:
                                                    exc_info = sys.exc_info()
                                                    _crash_log(u"")
                                                    _crash_log(u"    " + u"=" * 60)
                                                    _crash_log(u"    [FATAL] 고객통합뷰 Java 예외 - 프로그램 종료")
                                                    _crash_log(u"    " + u"=" * 60)
                                                    _crash_log(u"    고객명: %s" % name)
                                                    _crash_log(u"    초성: %s" % chosung_name)
                                                    _crash_log(u"    위치: N%d-S%d-LAST" % (nav_page, scroll_page))
                                                    try:
                                                        _crash_log(u"    오류 타입: %s" % exc_info[0])
                                                        _crash_log(u"    오류 내용: %s" % exc_info[1])
                                                    except:
                                                        pass
                                                    _crash_log(u"    " + u"=" * 60)
                                                    _take_crash_screenshot(u"FATAL_java_exception_%s" % name)
                                                    save_error(name, u"Java exception: %s" % exc_info[1], chosung_name, nav_page, scroll_page, ROWS_PER_PAGE)
                                                    _close_log_file()
                                                    raise SystemExit(1)
                                                sleep(2)  # 화면 안정화 대기

                                        log(u"        -> 종료(x) 클릭...")
                                        click(IMG_CLOSE_BTN)
                                        sleep(3)
                                        dismiss_alert_if_exists()
                                        log(u"        -> %s 처리 완료" % name)
                                    except Exception as e:
                                        log(u"        -> [ERROR] %s 처리 중 오류: %s" % (name, str(e)))
                                        total_errors += 1
                                        error_customers.append({
                                            u"초성": chosung_name,
                                            u"페이지": global_page - 1,
                                            u"행": ROWS_PER_PAGE + 1,
                                            u"고객명": name,
                                            u"오류": str(e)
                                        })
                        break  # 스크롤 루프 탈출
                else:
                    # OCR 성공 시 연속 실패 카운터 리셋
                    ocr_consecutive_failures = 0

            # 결과 표 출력 (No-OCR 모드에서는 스킵)
            if not NO_OCR_MODE:
                print_customer_table(customers[:ROWS_PER_PAGE], chosung_name, global_page)

            # 3. 행수 카운트 (스크롤 중복만 제외 - 순서 비교 방식)
            if NO_OCR_MODE:
                # No-OCR 모드: 이름 비교 불가 → 중복 감지 없이 전체 행 사용
                scroll_dups = 0
                page_rows = ROWS_PER_PAGE
                total_rows += page_rows
                log(u"    [NO-OCR] %d행 (중복 감지 비활성화)" % page_rows)
            else:
                current_rows = []
                for c in customers[:ROWS_PER_PAGE]:
                    name = c.get(u"고객명", "") or ""
                    birth = c.get(u"생년월일", "") or ""
                    if name:
                        current_rows.append((name, birth))

                # 스크롤 중복 감지: 이전 페이지 끝과 현재 페이지 시작 비교
                scroll_dups = 0
                if prev_page_rows:
                    # 이전 페이지 끝 N행과 현재 페이지 시작 N행이 얼마나 겹치는지 확인
                    for overlap in range(min(len(prev_page_rows), len(current_rows)), 0, -1):
                        # 이전 페이지 끝 overlap행 vs 현재 페이지 시작 overlap행
                        if prev_page_rows[-overlap:] == current_rows[:overlap]:
                            scroll_dups = overlap
                            break

                page_rows = len(current_rows) - scroll_dups
                total_rows += page_rows

                # 스크롤 끝 감지 (OCR 기반): 신규 행 0건 = 이전 Page Down이 스크롤하지 못함
                if page_rows <= 0 and len(current_rows) > 0:
                    _scroll_end_by_ocr = True
                    log(u"    [SCROLL_END] OCR 기반 스크롤 끝 감지! (신규 행 0건 = 이전 Page Down 무효)")

                # 이전 페이지 마지막 고객명 보존 (스크롤 테스트 로깅용)
                _st_prev_last = prev_page_rows[-1][0] if prev_page_rows else u""

                # 다음 페이지를 위해 현재 페이지 행 저장
                prev_page_rows = current_rows

                # 페이지 처리 완료 요약
                if scroll_dups > 0:
                    log(u"    [%s] %d행 (스크롤중복 %d행 제외)" % (page_label, page_rows, scroll_dups))
                else:
                    log(u"    [%s] %d행" % (page_label, page_rows))

            # 3-1. 스크롤 테스트 로깅 (SCROLL_TEST 모드)
            if SCROLL_TEST and not NO_OCR_MODE:
                import shutil as _st_shutil
                # 스크린샷 저장
                try:
                    _st_cap = capture(SCREEN)
                    _st_fname = u"page_%s_N%d_S%d.png" % (chosung_name, nav_page, scroll_page)
                    _st_dest = os.path.join(SCROLL_TEST_DIR, _st_fname)
                    _st_shutil.copy(_st_cap, _st_dest)
                except:
                    _st_fname = u"(저장 실패)"

                log(u"    [SCROLL_TEST] ──── 페이지 N%d-S%d ────" % (nav_page, scroll_page))
                log(u"    [SCROLL_TEST] 스크린샷: %s" % _st_fname)

                _st_ocr_total = len(customers)
                _st_page_count = len(current_rows)
                if scroll_dups > 0:
                    log(u"    [SCROLL_TEST] 행수: %d (OCR 총 %d행, 중복 %d행)" % (page_rows, _st_ocr_total, scroll_dups))
                    # 중복 행 상세 로깅
                    if _st_prev_last and scroll_dups > 0:
                        _st_dup_names = [r[0] for r in current_rows[:scroll_dups]]
                        log(u"    [SCROLL_TEST] 경계: 이전 마지막=%s → 현재 첫번째=%s (중복 %d행: %s)" % (
                            _st_prev_last,
                            current_rows[0][0] if current_rows else u"?",
                            scroll_dups,
                            u", ".join(_st_dup_names)
                        ))
                else:
                    log(u"    [SCROLL_TEST] 행수: %d (OCR 총 %d행)" % (page_rows, _st_ocr_total))

                # 경계 고객 로깅 (첫번째 / 12번째 / 13번째)
                _st_first = current_rows[0][0] if current_rows else u"없음"
                _st_12th = current_rows[ROWS_PER_PAGE - 1][0] if len(current_rows) >= ROWS_PER_PAGE else u"없음"
                _st_13th_name = u"없음"
                if len(customers) > ROWS_PER_PAGE:
                    _st_13th = customers[ROWS_PER_PAGE]
                    _st_13th_name = _st_13th.get(u"고객명", "") or u"없음"
                log(u"    [SCROLL_TEST] 첫번째: %s | %d번째: %s | %d번째(잘림): %s" % (
                    _st_first, ROWS_PER_PAGE, _st_12th, ROWS_PER_PAGE + 1, _st_13th_name))

            # 4. 고객 클릭 처리 (스크롤 중복 제외, CLICK_ENABLED일 때만)
            if CLICK_ENABLED:
                # 페이지 시작 전 헤더 위치 재측정 (마지막 페이지 등 레이아웃 변화 대응)
                try:
                    header = find(IMG_CUSTNAME)
                    new_base_y = header.getCenter().getY()
                    if new_base_y != base_y:
                        log(u"      [RECALIBRATE] 페이지 시작: base_y %d → %d" % (base_y, new_base_y))
                        base_y = new_base_y
                except:
                    pass

                # 디버그: scroll_page와 is_scrolled 판단
                is_scrolled_page = (scroll_page > 1)
                offset_to_use = FIRST_ROW_OFFSET_SCROLLED if is_scrolled_page else FIRST_ROW_OFFSET
                log(u"      [PAGE_INFO] scroll_page=%d, is_scrolled=%s, offset=%d" % (scroll_page, is_scrolled_page, offset_to_use))

                # 재개 모드: 현재 페이지가 재개 위치인 경우 스킵할 행 계산
                current_resume_skip = -1
                if RESUME_MODE and nav_page == resume_nav_page and scroll_page == resume_scroll_page:
                    current_resume_skip = resume_row
                    log(u"      [RESUME] 현재 페이지에서 %d행까지 스킵" % current_resume_skip)

                processed, errors, base_y = process_customers(
                    customers, fixed_x, base_y, chosung_name, global_page,
                    skip_count=scroll_dups, is_scrolled=is_scrolled_page,
                    nav_page=nav_page, scroll_page=scroll_page, resume_skip_until=current_resume_skip
                )
                total_errors += len(errors)
                error_customers.extend(errors)

                # --only 모드: 대상 고객 처리 완료 시 즉시 종료
                if ONLY_MODE and _only_all_done:
                    log(u"\n    *** --only 모드: '%s' 처리 완료 (%d명) → 프로그램 종료 ***" % (ONLY_CUSTOMER, _only_found_count))
                    break

                # No-OCR 모드: 빈 행 감지 시 스크롤 루프 탈출
                if NO_OCR_MODE and _no_ocr_empty_row_detected:
                    log(u"\n    *** [NO-OCR] 빈 행 감지 → 이 페이지가 마지막 (스크롤 불필요) ***")
                    break

            # 5. 스크롤 끝 감지 (OCR 기반: 신규 행 0건 → LAST 핸들러 + break)
            if _scroll_end_by_ocr:
                log(u"\n    *** 스크롤 끝 도달! (OCR: 신규 행 0건 → 이전 Page Down 무효) ***")

                # 스크롤 테스트: 마지막 페이지 스크린샷 + 요약
                if SCROLL_TEST and not NO_OCR_MODE:
                    import shutil as _st_shutil2
                    try:
                        _st_cap2 = capture(SCREEN)
                        _st_fname2 = u"page_%s_N%d_S%d_LAST.png" % (chosung_name, nav_page, scroll_page)
                        _st_dest2 = os.path.join(SCROLL_TEST_DIR, _st_fname2)
                        _st_shutil2.copy(_st_cap2, _st_dest2)
                    except:
                        _st_fname2 = u"(저장 실패)"
                    log(u"    [SCROLL_TEST] ──── 마지막 페이지 N%d-S%d ────" % (nav_page, scroll_page))
                    log(u"    [SCROLL_TEST] 스크린샷: %s" % _st_fname2)
                    _st_has_13th = len(customers) > ROWS_PER_PAGE
                    if _st_has_13th:
                        _st_13th_last = customers[ROWS_PER_PAGE]
                        _st_13th_last_name = _st_13th_last.get(u"고객명", "") or u"없음"
                        log(u"    [SCROLL_TEST] %d번째 행: 있음 → %s (마지막 페이지이므로 잘림 없이 처리 가능)" % (ROWS_PER_PAGE + 1, _st_13th_last_name))
                    else:
                        log(u"    [SCROLL_TEST] %d번째 행: 없음" % (ROWS_PER_PAGE + 1))
                    log(u"    [SCROLL_TEST] 총 스크롤 페이지: %d (네비 %d)" % (scroll_page, nav_page))

                # 마지막 페이지: 16번째 행이 있으면 처리
                if len(customers) > ROWS_PER_PAGE:
                    extra_customer = customers[ROWS_PER_PAGE]
                    name = extra_customer.get(u"고객명", "") or ""
                    birth = extra_customer.get(u"생년월일", "") or ""
                    if name:
                        # --start-from / --only 모드 체크
                        _skip_last = False
                        if START_FROM_MODE and not _start_from_found:
                            if name == START_FROM_CUSTOMER:
                                _start_from_found = True
                                log(u"    [LAST] ★ %s 발견! → 이 고객부터 처리 시작" % name)
                            else:
                                log(u"    [LAST] %s 스킵 (--start-from '%s' 찾는 중)" % (name, START_FROM_CUSTOMER))
                                _skip_last = True
                        if ONLY_MODE and not _skip_last and name != ONLY_CUSTOMER:
                            log(u"    [LAST] %s 스킵 (--only '%s' 모드)" % (name, ONLY_CUSTOMER))
                            _skip_last = True

                        if not _skip_last:
                            log(u"    [LAST] 16번째 행 추가: %s (%s)" % (name, birth))
                            total_rows += 1

                        # 16번째 행 고객 클릭 처리 (CLICK_ENABLED이고 스킵 아닐 때만)
                        if CLICK_ENABLED and not _skip_last:
                            # 16번째 행 클릭 전 헤더 위치 재측정
                            try:
                                header = find(IMG_CUSTNAME)
                                new_base_y = header.getCenter().getY()
                                if new_base_y != base_y:
                                    log(u"        [RECALIBRATE] 16번째 행: base_y %d → %d" % (base_y, new_base_y))
                                    base_y = new_base_y
                            except:
                                pass

                            check_pause()  # GUI 일시정지 체크
                            log(u"        [LAST] %s 클릭..." % name)
                            try:
                                row_y = get_row_y(base_y, ROWS_PER_PAGE, is_scrolled=(scroll_page > 1))  # 16번째 행
                                click(Location(fixed_x, row_y))
                                sleep(5)

                                # 알림 팝업 확인
                                alert_occurred = dismiss_alert_if_exists()

                                # 고객 상세정보 캡처 (16번째 행)
                                _last16_customer_detail = None
                                if not alert_occurred:
                                    _last16_customer_detail = capture_customer_detail(name)

                                # 고객통합뷰 모드인 경우 리포트 다운로드 (정상 처리와 동일)
                                if INTEGRATED_VIEW_ENABLED:
                                    if alert_occurred:
                                        log(u"        -> [SKIP] 알림 발생 → 리포트 다운로드 스킵")
                                    else:
                                        log(u"        -> 고객통합뷰 진입 및 리포트 다운로드...")
                                        try:
                                            from verify_customer_integrated_view import verify_customer_integrated_view
                                            view_result = verify_customer_integrated_view(pdf_save_dir=PDF_SAVE_DIR, customer_name=name, output_dir=CAPTURE_DIR)
                                            log(u"        -> 고객통합뷰 처리 완료")
                                            if isinstance(view_result, dict):
                                                if _last16_customer_detail:
                                                    view_result['customer_detail'] = _last16_customer_detail
                                                # 테이블 OCR 데이터 (이메일 등 — metdo_reader와 병합됨)
                                                ocr_row = extra_customer if extra_customer else {}
                                                view_result['customer_detail_fallback'] = {
                                                    'name': name,
                                                    'customer_type': u'법인' if ocr_row.get(u'성별') == u'미사용' else u'개인',
                                                    'gubun': ocr_row.get(u'구분', u''),
                                                    'insurance_age': ocr_row.get(u'보험나이', u''),
                                                    'mobile_phone': ocr_row.get(u'휴대폰', u''),
                                                    'birth_date': ocr_row.get(u'생년월일', u''),
                                                    'gender': ocr_row.get(u'성별', u''),
                                                    'email': ocr_row.get(u'이메일', u''),
                                                }
                                                _chosung_customer_results.append(view_result)
                                                _save_results_incremental(chosung_name)
                                                _trigger_sync_reports()
                                        except Exception as e:
                                            err_type_name = e.__class__.__name__
                                            err_msg = u"%s" % e
                                            if err_type_name == 'NavigationResetRequired':
                                                _crash_log(u"")
                                                _crash_log(u"    " + u"=" * 60)
                                                _crash_log(u"    [FATAL] 검증 실패 - 프로그램 종료")
                                                _crash_log(u"    " + u"=" * 60)
                                                _crash_log(u"    고객명: %s" % name)
                                                _crash_log(u"    초성: %s" % chosung_name)
                                                _crash_log(u"    위치: N%d-S%d-LAST" % (nav_page, scroll_page))
                                                _crash_log(u"    원인: %s" % err_msg)
                                                _crash_log(u"    " + u"=" * 60)
                                                _take_crash_screenshot(u"FATAL_verification_failed_%s" % name)
                                                save_error(name, err_msg, chosung_name, nav_page, scroll_page, ROWS_PER_PAGE)
                                                _close_log_file()
                                                raise SystemExit(1)
                                            else:
                                                log(u"        -> [ERROR] 고객통합뷰 처리 중 오류: %s" % err_msg)
                                                try:
                                                    from verify_customer_integrated_view import IMG_INTEGRATED_VIEW_CLOSE_BTN
                                                    if exists(IMG_INTEGRATED_VIEW_CLOSE_BTN, 3):
                                                        click(IMG_INTEGRATED_VIEW_CLOSE_BTN)
                                                        log(u"        -> 고객통합뷰 X 버튼 클릭 (정리)")
                                                        sleep(2)
                                                except:
                                                    pass
                                                save_error(name, err_msg, chosung_name, nav_page, scroll_page, ROWS_PER_PAGE)
                                        except:
                                            exc_info = sys.exc_info()
                                            _crash_log(u"")
                                            _crash_log(u"    " + u"=" * 60)
                                            _crash_log(u"    [FATAL] 고객통합뷰 Java 예외 - 프로그램 종료")
                                            _crash_log(u"    " + u"=" * 60)
                                            _crash_log(u"    고객명: %s" % name)
                                            _crash_log(u"    초성: %s" % chosung_name)
                                            _crash_log(u"    위치: N%d-S%d-LAST" % (nav_page, scroll_page))
                                            try:
                                                _crash_log(u"    오류 타입: %s" % exc_info[0])
                                                _crash_log(u"    오류 내용: %s" % exc_info[1])
                                            except:
                                                pass
                                            _crash_log(u"    " + u"=" * 60)
                                            _take_crash_screenshot(u"FATAL_java_exception_%s" % name)
                                            save_error(name, u"Java exception: %s" % exc_info[1], chosung_name, nav_page, scroll_page, ROWS_PER_PAGE)
                                            _close_log_file()
                                            raise SystemExit(1)
                                        sleep(2)  # 화면 안정화 대기

                                log(u"        -> 종료(x) 클릭...")
                                click(IMG_CLOSE_BTN)
                                sleep(3)
                                dismiss_alert_if_exists()
                                log(u"        -> %s 처리 완료" % name)
                            except Exception as e:
                                log(u"        -> [ERROR] %s 처리 중 오류: %s" % (name, str(e)))
                                total_errors += 1
                                error_customers.append({
                                    u"초성": chosung_name,
                                    u"페이지": global_page,
                                    u"행": ROWS_PER_PAGE + 1,
                                    u"고객명": name,
                                    u"오류": str(e)
                                })

                log(u"    [네비 %d] 스크롤 페이지 %d개 완료" % (nav_page, scroll_page))
                break  # 스크롤 루프 탈출

            # 6. 스크롤 (Page Down 키)
            check_pause()  # GUI 일시정지 체크
            log(u"    [SCROLL] Page Down 스크롤...")
            scroll_page_down()

            log(u"\n    *** 스크롤 %d → %d 이동 ***" % (scroll_page, scroll_page + 1))
            prev_customers = customers  # 다음 페이지 OCR 실패 시 복구용
            scroll_page += 1
            sleep(1)  # 다음 페이지 전 대기

        # ========================================
        # 다음 버튼 확인 (스크롤 루프 탈출 후)
        # ========================================

        # --only 모드: 대상 고객 처리 완료 시 네비 루프도 탈출
        if ONLY_MODE and _only_all_done:
            log(u"\n  [ONLY] '%s' 처리 완료 → 네비 루프 종료" % ONLY_CUSTOMER)
            break

        log(u"\n  [네비 %d] 스크롤 완료 → '다음' 버튼 확인..." % nav_page)
        sleep(1)

        next_btn = exists(IMG_NEXT_BTN, 5)
        if next_btn:
            log(u"\n  " + u"#" * 50)
            log(u"  #  [다음] 버튼 발견! 클릭...")
            log(u"  #  네비 %d → 네비 %d 페이지로 이동" % (nav_page, nav_page + 1))
            log(u"  " + u"#" * 50)
            click(next_btn)
            sleep(3)  # 다음 페이지 로딩 대기

            # 스크롤 맨 위로 이동
            log(u"  [SCROLL] 스크롤을 맨 위로 이동...")
            try:
                header = find(IMG_CUSTNAME)
                scroll_to_top(header)
            except:
                _fatal_crash(u"다음 페이지 후 스크롤 맨 위 이동", chosung_name)
            log(u"  [SCROLL] 스크롤 맨 위 완료")

            nav_page += 1
            # 네비 루프 계속 (다음 네비 페이지 처리)
        else:
            log(u"\n  " + u"#" * 50)
            log(u"  #  [다음] 버튼 없음!")
            log(u"  #  초성 [%s] 모든 페이지 처리 완료!" % chosung_name)
            log(u"  " + u"#" * 50)
            # 진단용: 다음 버튼 없음 시점의 전체 화면 캡처
            if DEV_MODE and DEV_DIR:
                try:
                    diag_path = os.path.join(DEV_DIR, "DIAG_no_next_btn_nav%d_%s.png" % (nav_page, chosung_name))
                    diag_cap = capture(Screen())
                    import shutil
                    shutil.copy(diag_cap, diag_path)
                    log(u"  [DIAG] 다음버튼 없음 진단 캡처: %s" % diag_path)
                except Exception as e:
                    log(u"  [DIAG] 진단 캡처 실패: %s" % str(e))
            break  # 네비 루프 탈출

    # 초성 처리 완료 Summary + 문제 Report
    chosung_elapsed = time.time() - chosung_start_time
    generate_chosung_summary(
        chosung_name, total_rows, total_errors, error_customers,
        nav_page, global_page, chosung_elapsed
    )

    # 전체 통계에 합산
    all_total_rows += total_rows
    all_error_customers.extend(error_customers)

log(u"\n[2단계 완료]")

###########################################
# 완료
###########################################
elapsed_time = time.time() - start_time
minutes = int(elapsed_time // 60)
seconds = int(elapsed_time % 60)

log(u"\n" + "=" * 60)
if SCROLL_TEST:
    log(u"스크롤 테스트 완료!")
else:
    log(u"초성 버튼 테스트 완료!")
log(u"소요 시간: %d분 %d초" % (minutes, seconds))
log(u"총 행수: %d행, 오류: %d명" % (all_total_rows, len(all_error_customers)))
log(u"캡처/OCR 결과: %s" % CAPTURE_DIR)
if LOG_FILE:
    log(u"로그 파일: %s" % LOG_FILE)
elif _acdump_path:
    log(u"로그 파일: %s" % _acdump_path)

if SCROLL_TEST:
    log(u"")
    log(u"[SCROLL_TEST] ════════════════════════════════════")
    log(u"[SCROLL_TEST] 스크롤 테스트 요약")
    log(u"[SCROLL_TEST] 총 고객 수: %d행" % all_total_rows)
    log(u"[SCROLL_TEST] 스크린샷 폴더: %s" % SCROLL_TEST_DIR)
    log(u"[SCROLL_TEST] ════════════════════════════════════")

# 오류 고객 목록 (로그에 기록)
if all_error_customers:
    log(u"")
    log(u"[WARNING] 오류 발생 고객: %d명" % len(all_error_customers))
    for err in all_error_customers:
        log(u"  - [%s] P%d R%d: %s" % (
            err.get(u"초성", "?"),
            err.get(u"페이지", 0),
            err.get(u"행", 0),
            err.get(u"고객명", "?")
        ))
        log(u"    오류: %s" % err.get(u"오류", "?"))
else:
    log(u"")
    log(u"[OK] 오류 없이 완료!")

log("=" * 60)

# ★ 최종 리포트 생성 (AIMS 엑셀 + JSON + 실행결과 엑셀)
# 증분 갱신으로 이미 최신 파일이 있지만, 마지막 고객의 리포트가
# 반영되지 않았을 수 있으므로 blocking으로 최종 1회 더 생성한다.
if INTEGRATED_VIEW_ENABLED and not SCROLL_TEST:
    # 패키징 모드: generate_reports.py는 exe 내부에 번들되어 독립 파일로 존재하지 않음
    # → _AC_EXE_PATH가 있으면 .py 파일 존재 여부와 무관하게 exe --run-reports 사용
    if _AC_EXE_PATH:
        report_cmd = [_AC_EXE_PATH, "--run-reports", CAPTURE_DIR,
                      "--timestamp", _REPORT_TIMESTAMP]
    elif os.path.exists(GENERATE_REPORTS_SCRIPT):
        report_cmd = ["python", GENERATE_REPORTS_SCRIPT, CAPTURE_DIR,
                      "--timestamp", _REPORT_TIMESTAMP]
    else:
        report_cmd = None

    if report_cmd:
        log(u"")
        log(u"[3단계] 최종 리포트 생성 (AIMS 엑셀 + JSON + 실행결과 엑셀)...")
        log(u"  명령: %s" % " ".join(report_cmd))
        try:
            report_result = subprocess.call(report_cmd)
            if report_result == 0:
                log(u"[3단계 완료] 리포트 생성 성공")
            else:
                log(u"[3단계 WARNING] 리포트 생성 실패 (exit code: %d)" % report_result)
        except Exception as e:
            log(u"[3단계 ERROR] 리포트 생성 중 예외: %s" % e)
    else:
        log(u"")
        log(u"[3단계 SKIP] generate_reports.py 없음 + AC_EXE_PATH 없음 → 리포트 생성 건너뜀")

log("=" * 60)

# dev 폴더 정리 및 로그 닫기는 atexit 핸들러(_cleanup_on_exit)에서 처리

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

# 경로 설정 (SikuliX/Jython에서는 __file__ 사용 불가)
SCRIPT_DIR = r"D:\aims\tools\MetlifePDF.sikuli"
CAPTURE_BASE_DIR = r"D:\captures\metlife_ocr"
OCR_SCRIPT = SCRIPT_DIR + r"\ocr\upstage_ocr_api.py"

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

# 로그 파일 설정 (중복 방지: 날짜시간 + 순번)
import datetime
_now = datetime.datetime.now()
_date_str = _now.strftime("%Y%m%d_%H%M%S")
_log_base = os.path.join(CAPTURE_DIR, u"run_%s" % _date_str)
_log_seq = 0
LOG_FILE = u"%s.log" % _log_base
while os.path.exists(LOG_FILE):
    _log_seq += 1
    LOG_FILE = u"%s_%d.log" % (_log_base, _log_seq)
_log_file_handle = None


def _open_log_file():
    """로그 파일 핸들 열기"""
    global _log_file_handle
    if _log_file_handle is None:
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
    except:
        pass  # 콘솔 출력 실패 무시

    try:
        f = _open_log_file()
        if f and not f.closed:
            if isinstance(msg, unicode):
                f.write(msg + u"\n")
            else:
                f.write(unicode(msg, "utf-8") + u"\n")
            f.flush()
    except:
        pass  # 파일 쓰기 실패 무시 (프로세스 종료 시 발생 가능)


# 진단 모드 설정 (클릭 위치 분석용 스크린샷 저장)
DIAGNOSTIC_MODE = True  # True면 클릭 전 스크린샷 저장
DIAGNOSTIC_DIR = os.path.join(CAPTURE_DIR, "diagnostic")
if DIAGNOSTIC_MODE and not os.path.exists(DIAGNOSTIC_DIR):
    os.makedirs(DIAGNOSTIC_DIR)
_diagnostic_counter = [0]  # 스크린샷 순번


def save_click_diagnostic(click_x, click_y, customer_name, page_num, row_idx):
    """클릭 위치 진단용 스크린샷 저장 (클릭 위치에 빨간 점 표시)"""
    if not DIAGNOSTIC_MODE:
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


DEBUG_LOG_FILE = os.path.join(SCRIPT_DIR, "debug_log.txt")


def _crash_log(msg):
    """크래시 로그를 run_*.log + debug_log.txt 양쪽에 기록"""
    log(msg)  # run_*.log + 콘솔
    try:
        with codecs.open(DEBUG_LOG_FILE, "a", "utf-8") as f:
            if isinstance(msg, unicode):
                f.write(msg + u"\n")
            else:
                f.write(unicode(msg, "utf-8") + u"\n")
            f.flush()
    except:
        pass


def _take_crash_screenshot(label):
    """크래시 시 스크린샷 저장 (SikuliX capture 사용)"""
    try:
        ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        temp_path = capture(SCREEN)
        if temp_path:
            import shutil
            dest = os.path.join(CAPTURE_DIR, u"CRASH_%s_%s.png" % (label, ts))
            shutil.copy(temp_path, dest)
            log(u"[CRASH 스크린샷] %s" % dest)
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


def capture_and_ocr(chosung_name, page_num):
    """
    화면 캡처 후 Upstage Enhanced OCR 호출

    Returns:
        list: 고객 데이터 리스트
        str: JSON 파일 경로
    """
    timestamp = int(time.time())
    capture_filename = u"page_%s_%d_%d.png" % (chosung_name, page_num, timestamp)
    capture_path = os.path.join(CAPTURE_DIR, capture_filename)
    json_path = capture_path.replace(".png", ".json")

    log(u"  [OCR] ----------------------------------------")
    log(u"  [OCR] 1/4. 화면 캡처")

    # 1. 전체 화면 캡처 (원본 보관용)
    import shutil
    captured_full = capture(SCREEN)
    shutil.copy(captured_full, capture_path)
    log(u"  [OCR]   - 원본: %s" % capture_filename)

    # 2. 테이블 영역만 크롭 (필터 영역 제외)
    TABLE_REGION_X = 20
    TABLE_REGION_Y = 362
    TABLE_REGION_WIDTH = 1890
    TABLE_REGION_HEIGHT = 590
    table_region = Region(TABLE_REGION_X, TABLE_REGION_Y, TABLE_REGION_WIDTH, TABLE_REGION_HEIGHT)
    captured_cropped = capture(table_region)
    cropped_filename = capture_filename.replace(".png", "_cropped.png")
    cropped_path = os.path.join(CAPTURE_DIR, cropped_filename)
    shutil.copy(captured_cropped, cropped_path)
    log(u"  [OCR]   - 크롭: %s" % cropped_filename)

    # 크롭된 이미지로 OCR 수행
    json_path = cropped_path.replace(".png", ".json")

    # Python3로 OCR 스크립트 호출 (환경변수로 로그 디렉토리 전달)
    log(u"  [OCR] 2/4. Upstage Enhanced API 호출...")

    ocr_start = time.time()
    try:
        # 환경변수에 CAPTURE_DIR 추가하여 OCR 스크립트에 전달
        ocr_env = os.environ.copy()
        ocr_env["METLIFE_CAPTURE_DIR"] = CAPTURE_DIR
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
        log(u"  [OCR] 4/4. %d명 인식 완료" % len(customers))
        log(u"  [OCR] ----------------------------------------")
        return customers, json_path
    else:
        log(u"  [OCR] ERROR: JSON 없음")
        log(u"  [OCR] ----------------------------------------")
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
        gubun = c.get(u"구분", "") or ""
        birth = c.get(u"생년월일", "") or ""
        age = c.get(u"보험나이", "") or ""
        gender = c.get(u"성별", "") or ""
        phone = c.get(u"휴대폰", "") or ""
        log(u"  [OCR]  %2d  %-8s  %-4s  %-10s  %4s  %-4s  %s" % (i+1, name[:8], gubun[:4], birth[:10], age[:4], gender[:4], phone[:14]))

    log(u"  [OCR] ================================================")


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


def is_last_page(prev_capture_path):
    """
    스크롤 전후 테이블 전체 영역 비교로 마지막 페이지 감지

    스크롤 후 테이블 전체를 다시 캡처하여 스크롤 전 캡처와 비교.
    98% 이상 동일하면 마지막 페이지로 판단.

    임계값 98%인 이유:
    - Nexacro 그리드의 Page Down은 커서 위치 기준으로 스크롤
    - 커서가 상단에 있으면 부분 스크롤(1~2행)만 발생 가능 → 95% 유사
    - 98% 이상이면 스크롤이 실질적으로 발생하지 않은 것으로 확정
    - 부분 스크롤(90~97%)은 다음 루프에서 자연스럽게 처리

    Args:
        prev_capture_path: 스크롤 전 테이블 캡처 이미지 경로

    Returns:
        bool: 마지막 페이지면 True
    """
    try:
        # 스크롤 후 테이블 전체 영역 캡처
        current_capture = capture_table_region()

        # 두 이미지 비교 (Java ImageIO 사용)
        from javax.imageio import ImageIO
        from java.io import File

        img1 = ImageIO.read(File(prev_capture_path))
        img2 = ImageIO.read(File(current_capture))

        # 크기가 다르면 다른 이미지
        if img1.getWidth() != img2.getWidth() or img1.getHeight() != img2.getHeight():
            log(u"    [COMPARE] 이미지 크기 다름 → 계속 진행")
            return False

        # 픽셀 비교 (샘플링: 약 1000개 샘플 - 테이블 전체 비교)
        width = img1.getWidth()
        height = img1.getHeight()
        sample_step = max(1, min(width, height) // 30)  # 약 900~1000개 샘플

        same_count = 0
        diff_count = 0

        for y in range(0, height, sample_step):
            for x in range(0, width, sample_step):
                p1 = img1.getRGB(x, y)
                p2 = img2.getRGB(x, y)
                if p1 == p2:
                    same_count += 1
                else:
                    diff_count += 1

        total_samples = same_count + diff_count
        similarity = float(same_count) / total_samples if total_samples > 0 else 0

        log(u"    [COMPARE] 테이블 전체 비교: %.1f%% 동일 (%d/%d 샘플)" % (similarity * 100, same_count, total_samples))

        # 98% 이상 동일하면 마지막 페이지 (스크롤이 실질적으로 발생하지 않음)
        if similarity >= 0.98:
            log(u"    [COMPARE] → 마지막 페이지 (98%+ 동일)")
            return True
        else:
            log(u"    [COMPARE] → 계속 진행 (충분히 다름)")
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
            log(u"        -> [ALERT] 알림 팝업 감지! 확인 클릭...")
            click(IMG_ALERT_OK)
            sleep(1)
            return True
    except:
        pass
    return False


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

            # 고객통합뷰 모드인 경우 리포트 다운로드 (알림이 없었을 때만)
            if INTEGRATED_VIEW_ENABLED:
                if alert_occurred:
                    log(u"        -> [SKIP] 알림 발생 → 리포트 다운로드 스킵")
                else:
                    log(u"        -> 고객통합뷰 진입 및 리포트 다운로드...")
                    try:
                        from verify_customer_integrated_view import verify_customer_integrated_view
                        view_result = verify_customer_integrated_view(pdf_save_dir=PDF_SAVE_DIR, customer_name=name)
                        log(u"        -> 고객통합뷰 처리 완료")
                        # 결과 수집 (초성별 summary용)
                        if isinstance(view_result, dict):
                            _chosung_customer_results.append(view_result)
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
ROWS_PER_PAGE = 13     # 화면에 보이는 행 수 (100% 줌 기준)
MAX_CUSTOMERS_PER_PAGE = 13  # OCR로 인식하는 행 수

# 고객명 정렬 이미지 [100% 줌 - 2026-01-29]
IMG_CUSTNAME = "img/1769599404157.png"         # 고객명 ↓ 헤더 (내림차순 상태)
IMG_ARROW_DESC = "img/1769598882979.png"       # ↓ (내림차순 화살표)
IMG_ARROW_ASC = "img/1769598893800.png"        # ↑ (오름차순 화살표)

# 고객등록/조회 페이지
IMG_CLOSE_BTN = "img/1769602665952.png"        # 종료(x) 버튼 [100% 줌]
IMG_ALERT_OK = "img/1769251121685.png"         # 알림 팝업 "확인" 버튼 (TODO: 100% 캡처 필요)
IMG_NEXT_BTN = "img/next_btn_100.png"           # 다음 버튼 [100% 줌 - 2026-01-30]

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
_env_chosung = os.environ.get("METLIFE_CHOSUNG", "")
_env_no_click = os.environ.get("METLIFE_NO_CLICK", "").lower() in ("1", "true", "yes")
_env_integrated_view = os.environ.get("METLIFE_INTEGRATED_VIEW", "").lower() in ("1", "true", "yes")

# 우선순위: 명령줄 > 환경변수
_raw_chosung = _arg_chosung or _env_chosung

# 고객 클릭 기능: 기본 활성화, --no-click 또는 환경변수로 비활성화
CLICK_ENABLED = not (_arg_no_click or _env_no_click)

# 고객통합뷰 기능: --integrated-view 또는 환경변수로 활성화
INTEGRATED_VIEW_ENABLED = _arg_integrated_view or _env_integrated_view

# 재개 기능: --resume으로 checkpoint에서 자동 재개
RESUME_MODE = _arg_resume
START_FROM_CUSTOMER = _arg_start_from

# --start-from 모드 플래그 (해당 고객부터 처리 시작)
START_FROM_MODE = START_FROM_CUSTOMER is not None
_start_from_found = False  # 해당 고객을 찾았는지 여부

# --only 모드: 특정 고객명만 처리
ONLY_CUSTOMER = _arg_only
ONLY_MODE = ONLY_CUSTOMER is not None
_only_found_count = 0  # 해당 고객 처리 횟수
_only_all_done = False  # 모든 해당 고객 처리 완료 여부

# 에러/체크포인트 파일 경로
ERROR_FILE = os.path.join(CAPTURE_DIR, u"errors.json")
CHECKPOINT_FILE = os.path.join(CAPTURE_DIR, u"checkpoint.json")

# 재개 위치 정보 (--resume 모드에서 사용)
_resume_info = None
_skip_until_row = -1  # 이 행까지 스킵 (해당 행 포함)


def load_checkpoint():
    """checkpoint.json에서 마지막 위치 로드"""
    if not os.path.exists(CHECKPOINT_FILE):
        return None
    try:
        with codecs.open(CHECKPOINT_FILE, "r", "utf-8") as f:
            return json.load(f)
    except Exception as e:
        log(u"[ERROR] 체크포인트 로드 실패: %s" % str(e))
        return None


def save_error(customer_name, error_msg, chosung, nav_page, scroll_page, row_in_page):
    """오류 발생 고객을 errors.json에 기록 (위치 정보 포함)"""
    try:
        errors = []
        if os.path.exists(ERROR_FILE):
            with codecs.open(ERROR_FILE, "r", "utf-8") as f:
                errors = json.load(f)

        import datetime
        errors.append({
            u"고객명": customer_name,
            u"초성": chosung,
            u"네비페이지": nav_page,
            u"스크롤페이지": scroll_page,
            u"행": row_in_page,
            u"오류": error_msg,
            u"시간": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        })

        with codecs.open(ERROR_FILE, "w", "utf-8") as f:
            json.dump(errors, f, ensure_ascii=False, indent=2)

        log(u"    [ERROR_LOG] 오류 기록됨: %s (N%d-S%d-R%d)" % (customer_name, nav_page, scroll_page, row_in_page))
    except Exception as e:
        log(u"    [ERROR_LOG] 오류 기록 실패: %s" % str(e))


def save_checkpoint(customer_name, chosung, nav_page, scroll_page, row_in_page):
    """마지막 성공 고객을 checkpoint.json에 기록 (위치 정보 포함)"""
    try:
        import datetime
        checkpoint = {
            u"마지막고객": customer_name,
            u"초성": chosung,
            u"네비페이지": nav_page,
            u"스크롤페이지": scroll_page,
            u"행": row_in_page,
            u"시간": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }

        with codecs.open(CHECKPOINT_FILE, "w", "utf-8") as f:
            json.dump(checkpoint, f, ensure_ascii=False, indent=2)
    except Exception as e:
        log(u"    [CHECKPOINT] 저장 실패: %s" % str(e))


# ★ 초성별 고객통합뷰 처리 결과 수집용
_chosung_customer_results = []


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
    CHOSUNG_BUTTONS = [(name, img) for name, img in ALL_CHOSUNG_BUTTONS if name == SELECTED_CHOSUNG]
    if not CHOSUNG_BUTTONS:
        raise ValueError(u"잘못된 초성: %s (가능: ㄱ,ㄴ,ㄷ,ㄹ,ㅁ,ㅂ,ㅅ,ㅇ,ㅈ,ㅊ,ㅋ,ㅌ,ㅍ,ㅎ,기타)" % SELECTED_CHOSUNG)
else:
    SELECTED_CHOSUNG = u""
    CHOSUNG_BUTTONS = ALL_CHOSUNG_BUTTONS

log("=" * 60)
log(u"MetLife 고객목록조회 - Upstage Enhanced OCR 연동")
log(u"로그 파일: %s" % os.path.basename(LOG_FILE))
if SELECTED_CHOSUNG:
    log(u"선택 초성: %s" % SELECTED_CHOSUNG)
else:
    log(u"선택 초성: 전체 (%d개)" % len(CHOSUNG_BUTTONS))
log(u"고객 클릭: %s" % (u"활성화" if CLICK_ENABLED else u"비활성화 (--no-click)"))
log(u"통합뷰/리포트: %s" % (u"활성화 (--integrated-view)" if INTEGRATED_VIEW_ENABLED else u"비활성화"))
if ONLY_MODE:
    log(u"특정 고객만: '%s' (--only 모드)" % ONLY_CUSTOMER)
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
    sleep(WAIT_TIME)

    log(u"  [1-2] 고객관리 클릭...")
    click("img/1769598228284.png")  # 고객관리 [100% 줌]
    sleep(5)  # 서브메뉴 열릴 시간 확보

    log(u"  [1-3] 고객등록 클릭...")
    click("img/1769598252586.png")  # 고객등록 [100% 줌]
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

            # 1. 스크롤 전 테이블 전체 캡처 (마지막 페이지 감지용)
            prev_capture = capture_table_region()
            log(u"    [CAPTURE] 스크롤 전 테이블 전체 캡처 완료")

            # 2. OCR 수행 (화면 캡처 포함)
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
                            log(u"    [LAST] 이전 페이지 16번째 행 추가: %s (%s)" % (name, birth))
                            total_rows += 1

                            # 16번째 행 고객 클릭 처리 (CLICK_ENABLED일 때만)
                            if CLICK_ENABLED:
                                # 16번째 행 클릭 전 헤더 위치 재측정
                                try:
                                    header = find(IMG_CUSTNAME)
                                    new_base_y = header.getCenter().getY()
                                    if new_base_y != base_y:
                                        log(u"        [RECALIBRATE] 16번째 행: base_y %d → %d" % (base_y, new_base_y))
                                        base_y = new_base_y
                                except:
                                    pass

                                log(u"        [LAST] %s 클릭..." % name)
                                try:
                                    row_y = get_row_y(base_y, ROWS_PER_PAGE, is_scrolled=(scroll_page > 1))
                                    click(Location(fixed_x, row_y))
                                    sleep(5)
                                    dismiss_alert_if_exists()
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

            # OCR 결과 표 출력 (15행만 - 16번째는 마지막 페이지용으로 보관)
            print_customer_table(customers[:ROWS_PER_PAGE], chosung_name, global_page)

            # 3. 행수 카운트 (스크롤 중복만 제외 - 순서 비교 방식)
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

            # 무한루프 방지: 연속 신규 행 0건 감지
            if page_rows <= 0 and len(current_rows) > 0:
                zero_new_rows_count += 1
                log(u"    [STUCK] 신규 행 0건 (연속 %d회)" % zero_new_rows_count)
                if zero_new_rows_count >= 3:
                    log(u"\n    *** 스크롤 진행 불가! 신규 행 0건 3회 연속 → 스크롤 끝 판정 ***")
                    break
            else:
                zero_new_rows_count = 0

            # 다음 페이지를 위해 현재 페이지 행 저장
            prev_page_rows = current_rows

            # 페이지 처리 완료 요약
            if scroll_dups > 0:
                log(u"    [%s] %d행 (스크롤중복 %d행 제외)" % (page_label, page_rows, scroll_dups))
            else:
                log(u"    [%s] %d행" % (page_label, page_rows))

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

            # 5. 스크롤 (Page Down 키)
            log(u"    [SCROLL] Page Down 스크롤...")
            scroll_page_down()

            # 6. 스크롤 끝 감지 (스크롤 전후 테이블 전체 비교)
            if is_last_page(prev_capture):
                log(u"\n    *** 스크롤 끝 도달! (스크롤 전후 동일) ***")

                # 마지막 페이지: 16번째 행이 있으면 처리
                if len(customers) > ROWS_PER_PAGE:
                    extra_customer = customers[ROWS_PER_PAGE]
                    name = extra_customer.get(u"고객명", "") or ""
                    birth = extra_customer.get(u"생년월일", "") or ""
                    if name:
                        log(u"    [LAST] 16번째 행 추가: %s (%s)" % (name, birth))
                        total_rows += 1

                        # 16번째 행 고객 클릭 처리 (CLICK_ENABLED일 때만)
                        if CLICK_ENABLED:
                            # 16번째 행 클릭 전 헤더 위치 재측정
                            try:
                                header = find(IMG_CUSTNAME)
                                new_base_y = header.getCenter().getY()
                                if new_base_y != base_y:
                                    log(u"        [RECALIBRATE] 16번째 행: base_y %d → %d" % (base_y, new_base_y))
                                    base_y = new_base_y
                            except:
                                pass

                            log(u"        [LAST] %s 클릭..." % name)
                            try:
                                row_y = get_row_y(base_y, ROWS_PER_PAGE, is_scrolled=(scroll_page > 1))  # 16번째 행
                                click(Location(fixed_x, row_y))
                                sleep(5)
                                dismiss_alert_if_exists()
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
log(u"초성 버튼 테스트 완료!")
log(u"소요 시간: %d분 %d초" % (minutes, seconds))
log(u"총 행수: %d행, 오류: %d명" % (all_total_rows, len(all_error_customers)))
log(u"캡처/OCR 결과: %s" % CAPTURE_DIR)
log(u"로그 파일: %s" % LOG_FILE)

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

# 로그 파일 닫기
_close_log_file()

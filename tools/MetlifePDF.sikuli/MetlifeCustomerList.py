# -*- coding: utf-8 -*-
# MetLife PDF 자동 다운로드 (고객목록조회 - OCR 연동 버전)
# 고객 클릭 → 고객등록/조회 → 종료(x) 테스트
# Upstage Enhanced OCR로 고객명 인식

import os
import time
import subprocess
import json
import codecs
import traceback

# SikuliX 설정
Settings.ActionLogs = False  # [log] CLICK 메시지 숨김
setFindFailedResponse(ABORT)  # 이미지 못 찾으면 즉시 중단

# 경로 설정 (SikuliX/Jython에서는 __file__ 사용 불가)
SCRIPT_DIR = r"D:\aims\tools\MetlifePDF.sikuli"
CAPTURE_DIR = os.environ.get("METLIFE_CAPTURE_DIR", r"D:\captures\metlife_ocr")
OCR_SCRIPT = SCRIPT_DIR + r"\ocr\upstage_ocr_api.py"

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
    """콘솔과 파일에 동시 로그 출력"""
    print(msg)
    f = _open_log_file()
    if isinstance(msg, unicode):
        f.write(msg + u"\n")
    else:
        f.write(unicode(msg, "utf-8") + u"\n")
    f.flush()

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
    화면 캡처 후 Upstage Enhanced OCR 호출 (캐시 지원)

    Returns:
        list: 고객 데이터 리스트 (15행)
        str: JSON 파일 경로
    """
    # 캐시 파일 경로 (고정 - 타임스탬프 없음)
    cache_json = os.path.join(CAPTURE_DIR, u"cache_%s_P%d.json" % (chosung_name, page_num))

    # 캐시 확인 - 있으면 바로 반환
    if os.path.exists(cache_json):
        log(u"  [OCR] ----------------------------------------")
        log(u"  [OCR] [CACHE HIT] %s" % os.path.basename(cache_json))
        with codecs.open(cache_json, "r", "utf-8") as f:
            customers = json.load(f)
        log(u"  [OCR] %d명 로드 (캐시 사용 - OCR 스킵)" % len(customers))
        log(u"  [OCR] ----------------------------------------")
        return customers, cache_json

    # 캐시 없음 - OCR 수행
    timestamp = int(time.time())
    capture_filename = u"page_%s_%d_%d.png" % (chosung_name, page_num, timestamp)
    capture_path = os.path.join(CAPTURE_DIR, capture_filename)
    json_path = capture_path.replace(".png", ".json")

    log(u"  [OCR] ----------------------------------------")
    log(u"  [OCR] 1/4. 화면 캡처: %s" % capture_filename)

    # SikuliX capture() 사용 - 전체 화면 캡처
    captured = capture(SCREEN)

    # 캡처된 파일을 지정 경로로 복사
    import shutil
    shutil.copy(captured, capture_path)

    # Python3로 OCR 스크립트 호출
    log(u"  [OCR] 2/4. Upstage Enhanced API 호출 (약 35초)...")

    ocr_start = time.time()
    try:
        # Jython 호환: timeout 파라미터 없이 호출
        result = subprocess.call(["python", OCR_SCRIPT, capture_path, json_path])
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

        # 캐시 파일에 저장 (다음 실행 시 재사용)
        with codecs.open(cache_json, "w", "utf-8") as f:
            json.dump(customers, f, ensure_ascii=False, indent=2)
        log(u"  [OCR] [CACHE SAVE] %s" % os.path.basename(cache_json))
        log(u"  [OCR] ----------------------------------------")
        return customers, cache_json
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


def get_row_y(header_y, row_index):
    """
    특정 행의 Y좌표 계산

    Args:
        header_y: 고객명 헤더 Y좌표
        row_index: 0-based 행 인덱스

    Returns:
        int: 행의 Y좌표
    """
    return header_y + FIRST_ROW_OFFSET + (ROW_HEIGHT * row_index)


def scroll_by_row_click(scroll_x, header_y):
    """
    16번째 행(잘린 행) 클릭 × 15회로 정확히 15행 스크롤

    Args:
        scroll_x: 스크롤 클릭 X좌표 (구분 컬럼)
        header_y: 고객명 헤더 Y좌표
    """
    scroll_clicks = ROWS_PER_PAGE  # 15
    row_16_y = get_row_y(header_y, ROWS_PER_PAGE)  # index 15 = 16번째 행

    for i in range(scroll_clicks):
        click(Location(scroll_x, row_16_y))
        sleep(0.3)

        if (i + 1) % 5 == 0:
            log(u"        -> %d번 클릭 완료" % (i + 1))

    sleep(0.5)  # 스크롤 완료 대기


def capture_first_row_region(header, header_y):
    """
    첫 번째 행 영역 캡처 (마지막 페이지 감지용)

    Args:
        header: 고객명 헤더 Match 객체
        header_y: 헤더 Y좌표

    Returns:
        str: 캡처된 이미지 경로
    """
    row_1_y = get_row_y(header_y, 0)
    capture_x = header.getCenter().getX() - 30
    capture_region = Region(int(capture_x), int(row_1_y - 12), 200, 28)
    return capture(capture_region)


def is_last_page(prev_capture):
    """
    스크롤 전후 화면 비교로 마지막 페이지 감지

    Args:
        prev_capture: 스크롤 전 첫 번째 행 캡처 이미지

    Returns:
        bool: 마지막 페이지면 True
    """
    try:
        if exists(Pattern(prev_capture).similar(0.95), 0.5):
            return True
    except:
        pass
    return False


def save_page_screenshot(chosung_name, page_num):
    """
    페이지 전체 화면 캡처 및 저장

    Args:
        chosung_name: 초성 이름
        page_num: 페이지 번호

    Returns:
        str: 저장된 파일 경로
    """
    import shutil
    timestamp = int(time.time())
    filename = u"page_%s_%03d_%d.png" % (chosung_name, page_num, timestamp)
    filepath = os.path.join(CAPTURE_DIR, filename)

    captured = capture(SCREEN)
    shutil.copy(captured, filepath)
    log(u"  [SAVE] 페이지 %d 캡처 저장: %s" % (page_num, filename))
    return filepath


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


# 설정
WAIT_TIME = 3
FIRST_ROW_OFFSET = 40  # 헤더에서 첫 번째 행까지 거리 (픽셀)
ROW_HEIGHT = 33        # 행 간 간격 (픽셀)
ROWS_PER_PAGE = 15     # 화면에 보이는 행 수 (16번째 행은 잘림)
MAX_CUSTOMERS_PER_PAGE = 15  # OCR로 인식하는 행 수

# 고객명 정렬 이미지
IMG_CUSTNAME = "img/1769233187438.png"         # 고객명 헤더 (클릭용)
IMG_ARROW_DESC = "img/1769233198595.png"       # ↓ (내림차순 화살표)
IMG_ARROW_ASC = "img/1769233207559.png"        # ↑ (오름차순 화살표)

# 고객등록/조회 페이지
IMG_CLOSE_BTN = "img/1769234950471.png"        # 종료(x) 버튼
IMG_ALERT_OK = "img/1769251121685.png"         # 알림 팝업 "확인" 버튼

# 초성 버튼 이미지 (전체)
ALL_CHOSUNG_BUTTONS = [
    (u"ㄱ", "img/1769222878862.png"),
    (u"ㄴ", "img/1769222888632.png"),
    (u"ㄷ", "img/1769222898000.png"),
    (u"ㄹ", "img/1769222904295.png"),
    (u"ㅁ", "img/1769222910966.png"),
    (u"ㅂ", "img/1769222917685.png"),
    (u"ㅅ", "img/1769222927091.png"),
    (u"ㅇ", "img/1769222937404.png"),
    (u"ㅈ", "img/1769222945758.png"),
    (u"ㅊ", "img/1769222954865.png"),
    (u"ㅋ", "img/1769222967149.png"),
    (u"ㅌ", "img/1769222983005.png"),
    (u"ㅍ", "img/1769222990533.png"),
    (u"ㅎ", "img/1769222997942.png"),
    (u"기타", "img/1769223008588.png"),
]

# 초성 선택: 명령줄 인자 > 환경변수 > 전체
# 사용법: java -jar sikulixide.jar -r MetlifeCustomerList.py -- ㄱ
#        java -jar sikulixide.jar -r MetlifeCustomerList.py -- --chosung ㄱ
import sys

def parse_chosung_arg():
    """명령줄 인자에서 초성 파싱"""
    # sys.argv 예시: ['MetlifeCustomerList.py', '--', 'ㄱ'] 또는 ['...', '--', '--chosung', 'ㄱ']
    args = sys.argv[1:] if len(sys.argv) > 1 else []

    # '--' 이후의 인자만 처리 (SikuliX 방식)
    if '--' in args:
        args = args[args.index('--') + 1:]

    # --chosung 옵션 처리
    if '--chosung' in args:
        idx = args.index('--chosung')
        if idx + 1 < len(args):
            return args[idx + 1]

    # 단순 위치 인자 (첫 번째 인자가 초성)
    if args and not args[0].startswith('-'):
        return args[0]

    return None

_arg_chosung = parse_chosung_arg()
_env_chosung = os.environ.get("METLIFE_CHOSUNG", "")

# 우선순위: 명령줄 > 환경변수
_raw_chosung = _arg_chosung or _env_chosung

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
log("=" * 60)

start_time = time.time()

###########################################
# 1단계: 고객목록조회 메뉴 진입
###########################################
log(u"\n[1단계] 고객목록조회 진입")

log(u"  [1-1] 메인 화면으로 이동...")
click("img/1769018868271.png")
sleep(WAIT_TIME)

log(u"  [1-2] 고객관리 클릭...")
click("img/1769012299692.png")
sleep(5)  # 서브메뉴 열릴 시간 확보

log(u"  [1-3] 고객등록 클릭...")
click("img/1769219913324.png")
sleep(3)

log(u"  [1-4] 고객목록조회 클릭...")
click("img/1769220000076.png")
sleep(5)

log(u"[1단계 완료]")

###########################################
# 2단계: 초성 버튼 클릭 및 고객 처리
###########################################
log(u"\n[2단계] 초성 버튼 및 고객 처리")

# 전체 통계 (모든 초성 합산)
all_total_processed = 0
all_error_customers = []

for chosung_name, chosung_img in CHOSUNG_BUTTONS:
    log(u"\n  === [%s] 초성 처리 시작 ===" % chosung_name)
    log(u"  [%s] 버튼 클릭..." % chosung_name)
    click(chosung_img)
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
        click(IMG_CUSTNAME)
        sleep(3)
    else:
        log(u"[ERROR] 내림차순 정렬 실패!")
        exit(1)

    # 스크롤을 맨 위로 (정렬 후 스크롤이 중간에 있을 수 있음)
    log(u"  [SCROLL] 스크롤을 맨 위로 이동...")
    header = find(IMG_CUSTNAME)
    click(header.right(500).below(200))  # 목록 영역 클릭 (포커스)
    sleep(0.5)
    type(Key.HOME, KeyModifier.CTRL)     # Ctrl+Home: 문서 맨 위로
    sleep(1)
    log(u"  [SCROLL] 스크롤 맨 위 완료")

    ###########################################
    # 스크롤 루프: 모든 페이지 OCR 및 고객 처리
    # (RowClickScrollTest.py 방식 적용)
    ###########################################
    page_num = 1
    total_processed = 0
    total_errors = 0
    error_customers = []           # 이번 초성의 오류 발생 고객 목록

    # 좌표 설정 (한 번만 측정)
    header = find(IMG_CUSTNAME)
    fixed_x = header.getCenter().getX()       # 고객명 클릭용 X좌표
    base_y = header.getCenter().getY()
    scroll_x = fixed_x + 100                  # 스크롤 클릭용 X좌표 (구분 컬럼)
    log(u"  [INIT] 고객명 클릭: x=%d, 스크롤 클릭: x=%d, 기준 y=%d" % (fixed_x, scroll_x, base_y))

    while True:
        log(u"\n  " + "=" * 40)
        log(u"  [PAGE %d] 처리 시작" % page_num)
        log(u"  " + "=" * 40)

        # 화면 안정화 대기
        sleep(2)

        # 1. 페이지 스크린샷 저장
        save_page_screenshot(chosung_name, page_num)

        # 2. 스크롤 전 첫 번째 행 캡처 (마지막 페이지 감지용)
        prev_capture = capture_first_row_region(header, base_y)
        log(u"  [CAPTURE] 스크롤 전 첫 번째 행 캡처 완료")

        # 3. OCR 수행
        customers, json_path = capture_and_ocr(chosung_name, page_num)

        if not customers:
            log(u"  [WARN] OCR 결과 없음 → 루프 종료")
            break

        # OCR 결과 표 출력
        print_customer_table(customers, chosung_name, page_num)

        # 4. 고객 처리 (전체 15명)
        page_processed = len(customers)
        total_processed += page_processed
        log(u"  [PAGE %d] 고객 %d명 처리" % (page_num, page_processed))

        # === 고객 클릭 코드 주석처리 시작 ===
        # for row in range(len(customers)):
        #     customer_name = get_customer_name(customers, row)
        #     customer_data = customers[row] if row < len(customers) else {}
        #     row_y = get_row_y(base_y, row)
        #
        #     log(u"        -> [P%d R%d] %s 클릭 (x=%d, y=%d)..." % (
        #         page_num, row + 1, customer_name, fixed_x, row_y
        #     ))
        #
        #     try:
        #         click(Location(fixed_x, row_y))
        #         sleep(3)  # 고객등록/조회 페이지 로딩 대기
        #
        #         # 알림 팝업 처리
        #         dismiss_alert_if_exists()
        #         sleep(2)
        #
        #         # 종료(x) 버튼 클릭
        #         log(u"        -> %s: 종료(x) 클릭..." % customer_name)
        #         try:
        #             click(IMG_CLOSE_BTN)
        #         except:
        #             if dismiss_alert_if_exists():
        #                 sleep(1)
        #                 click(IMG_CLOSE_BTN)
        #         sleep(3)  # 고객목록조회 페이지 복귀 대기
        #
        #         log(u"        -> %s 처리 완료" % customer_name)
        #
        #     except Exception as e:
        #         error_msg = str(e)
        #         error_trace = traceback.format_exc()
        #         log(u"        -> [ERROR] %s 처리 실패: %s" % (customer_name, error_msg))
        #         error_customers.append({
        #             u"초성": chosung_name,
        #             u"페이지": page_num,
        #             u"행": row + 1,
        #             u"고객명": customer_name,
        #             u"오류": error_msg
        #         })
        #         total_errors += 1
        #         continue
        # === 고객 클릭 코드 주석처리 끝 ===

        # 페이지 처리 완료 요약
        log(u"  [PAGE %d] 완료 - %d명 (누적: %d)" % (page_num, page_processed, total_processed))

        # 5. 스크롤 (16번째 행 클릭 × 15회)
        log(u"  [SCROLL] 16번째 행 클릭 × %d회 시작..." % ROWS_PER_PAGE)
        scroll_by_row_click(scroll_x, base_y)

        # 6. 마지막 페이지 감지 (화면 캡처 비교)
        if is_last_page(prev_capture):
            log(u"\n  *** 마지막 페이지 도달! (스크롤 전후 동일) ***")
            log(u"  *** [%s] 총 %d 페이지 ***" % (chosung_name, page_num))
            break

        log(u"\n  *** %d페이지 → %d페이지 이동 완료 ***" % (page_num, page_num + 1))
        page_num += 1
        sleep(1)  # 다음 페이지 전 대기

    log(u"\n  [%s] 총 %d명 처리 완료, 오류 %d명 (페이지: %d)" % (
        chosung_name, total_processed, total_errors, page_num))

    # 전체 통계에 합산
    all_total_processed += total_processed
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
log(u"총 처리: %d명, 오류: %d명" % (all_total_processed, len(all_error_customers)))
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

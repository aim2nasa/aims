# -*- coding: utf-8 -*-
# MetLife PDF 자동 다운로드 (고객목록조회 - OCR 연동 버전)
# 고객 클릭 → 고객등록/조회 → 종료(x) 테스트
# Upstage Enhanced OCR로 고객명 인식

import os
import time
import subprocess
import json
import codecs

# SikuliX 설정
Settings.ActionLogs = False  # [log] CLICK 메시지 숨김
setFindFailedResponse(ABORT)  # 이미지 못 찾으면 즉시 중단

# 경로 설정 (SikuliX/Jython에서는 __file__ 사용 불가)
SCRIPT_DIR = r"D:\aims\tools\MetlifePDF.sikuli"
CAPTURE_DIR = os.environ.get("METLIFE_CAPTURE_DIR", r"D:\captures\metlife_ocr")
OCR_SCRIPT = SCRIPT_DIR + r"\upstage_ocr_api.py"

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
    화면 캡처 후 Upstage Enhanced OCR 호출

    Returns:
        list: 고객 데이터 리스트 (15행)
        str: JSON 파일 경로
    """
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


def scroll_down(steps):
    """스크롤바 영역 클릭 후 휠 스크롤"""
    header = find(IMG_CUSTNAME)
    # 스크롤바 영역 (오른쪽 끝) 클릭 - 데이터 행 클릭 방지
    scrollbar_area = header.right(1300).below(300)
    log(u"  [SCROLL] 스크롤바 영역 클릭 (포커스)...")
    click(scrollbar_area)
    sleep(0.5)
    # 휠 스크롤
    log(u"  [SCROLL] 휠 스크롤 %d steps..." % steps)
    wheel(scrollbar_area, WHEEL_DOWN, steps)
    sleep(1)


def customer_matches(c1, c2):
    """
    두 고객이 동일한지 비교 (고객명 + 생년월일 + 휴대폰)

    Args:
        c1, c2: 고객 딕셔너리
    Returns:
        bool: 동일하면 True
    """
    if not c1 or not c2:
        return False
    return (c1.get(u"고객명", "") == c2.get(u"고객명", "") and
            c1.get(u"생년월일", "") == c2.get(u"생년월일", "") and
            c1.get(u"휴대폰", "") == c2.get(u"휴대폰", ""))


def find_start_index(customers, prev_last_customer):
    """
    현재 페이지에서 이전 마지막 고객 위치를 찾아 시작 인덱스 반환

    Args:
        customers: 현재 페이지 고객 리스트
        prev_last_customer: 이전 페이지의 마지막 고객

    Returns:
        int: 처리 시작 인덱스 (중복 이후)
    """
    if not prev_last_customer:
        return 0

    for i, c in enumerate(customers):
        if customer_matches(c, prev_last_customer):
            log(u"  [DUP] 이전 마지막 고객 '%s' 발견 at Row %d → Row %d부터 처리" % (
                prev_last_customer.get(u"고객명", "?"), i, i + 1))
            return i + 1

    # 매칭 없음 = 정상 스크롤 (중복 없음)
    return 0


def is_same_page(customers, prev_first_customer):
    """
    현재 페이지가 이전 페이지와 동일한지 확인 (무한 루프 방지)

    Args:
        customers: 현재 페이지 고객 리스트
        prev_first_customer: 이전 페이지의 첫 번째 고객

    Returns:
        bool: 동일하면 True (스크롤 안 됨)
    """
    if not prev_first_customer or not customers:
        return False
    return customer_matches(customers[0], prev_first_customer)


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
MAX_CUSTOMERS_PER_PAGE = 15  # OCR로 인식하는 행 수 (마지막 행 잘림으로 15행)
SCROLL_CLICKS = 5      # 15행 스크롤에 필요한 휠 클릭 수

# 고객명 정렬 이미지
IMG_CUSTNAME = "1769233187438.png"         # 고객명 헤더 (클릭용)
IMG_ARROW_DESC = "1769233198595.png"       # ↓ (내림차순 화살표)
IMG_ARROW_ASC = "1769233207559.png"        # ↑ (오름차순 화살표)

# 고객등록/조회 페이지
IMG_CLOSE_BTN = "1769234950471.png"        # 종료(x) 버튼
IMG_ALERT_OK = "1769251121685.png"         # 알림 팝업 "확인" 버튼

# 초성 버튼 이미지 (테스트: ㄱ만)
CHOSUNG_BUTTONS = [
    (u"ㄱ", "1769222878862.png"),
    # (u"ㄴ", "1769222888632.png"),
    # (u"ㄷ", "1769222898000.png"),
    # (u"ㄹ", "1769222904295.png"),
    # (u"ㅁ", "1769222910966.png"),
    # (u"ㅂ", "1769222917685.png"),
    # (u"ㅅ", "1769222927091.png"),
    # (u"ㅇ", "1769222937404.png"),
    # (u"ㅈ", "1769222945758.png"),
    # (u"ㅊ", "1769222954865.png"),
    # (u"ㅋ", "1769222967149.png"),
    # (u"ㅌ", "1769222983005.png"),
    # (u"ㅍ", "1769222990533.png"),
    # (u"ㅎ", "1769222997942.png"),
    # (u"기타", "1769223008588.png"),
]

log("=" * 60)
log(u"MetLife 고객목록조회 - Upstage Enhanced OCR 연동")
log(u"로그 파일: %s" % os.path.basename(LOG_FILE))
log("=" * 60)

start_time = time.time()

###########################################
# 1단계: 고객목록조회 메뉴 진입
###########################################
log(u"\n[1단계] 고객목록조회 진입")

log(u"  [1-1] 메인 화면으로 이동...")
click("1769018868271.png")
sleep(WAIT_TIME)

log(u"  [1-2] 고객관리 클릭...")
click("1769012299692.png")
sleep(5)  # 서브메뉴 열릴 시간 확보

log(u"  [1-3] 고객등록 클릭...")
click("1769219913324.png")
sleep(3)

log(u"  [1-4] 고객목록조회 클릭...")
click("1769220000076.png")
sleep(5)

log(u"[1단계 완료]")

###########################################
# 2단계: 초성 버튼 클릭 및 고객 처리
###########################################
log(u"\n[2단계] 초성 버튼 및 고객 처리")

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

    ###########################################
    # 스크롤 루프: 모든 페이지 OCR 및 고객 처리
    ###########################################
    page_num = 1
    total_processed = 0
    prev_last_customer = None      # 이전 페이지 마지막 고객 (중복 감지용)
    prev_first_customer = None     # 이전 페이지 첫 고객 (무한 루프 방지용)

    while True:
        log(u"\n  [PAGE %d] 캡처 및 OCR 시작..." % page_num)

        # 1. OCR 수행
        customers, json_path = capture_and_ocr(chosung_name, page_num)

        if not customers:
            log(u"  [WARN] OCR 결과 없음 → 루프 종료")
            break

        # 2. 무한 루프 감지: 첫 번째 고객이 이전과 동일하면 스크롤 안 됨
        if is_same_page(customers, prev_first_customer):
            log(u"  [END] 이전 페이지와 동일 (스크롤 끝) → 루프 종료")
            break

        # OCR 결과 표 출력
        print_customer_table(customers, chosung_name, page_num)

        # 3. 중복 감지: 이전 마지막 고객 위치 찾기
        start_index = find_start_index(customers, prev_last_customer)

        # 4. start_index부터 고객 처리
        page_processed = 0
        for row in range(start_index, len(customers)):
            customer_name = get_customer_name(customers, row)
            offset_y = FIRST_ROW_OFFSET + (ROW_HEIGHT * row)

            log(u"        -> [P%d R%d] %s 클릭 (offset: %dpx)..." % (
                page_num, row + 1, customer_name, offset_y
            ))

            click(Pattern(IMG_CUSTNAME).targetOffset(0, offset_y))
            sleep(3)  # 고객등록/조회 페이지 로딩 대기

            # 알림 팝업 처리
            dismiss_alert_if_exists()
            sleep(2)

            # 종료(x) 버튼 클릭
            log(u"        -> %s: 종료(x) 클릭..." % customer_name)
            try:
                click(IMG_CLOSE_BTN)
            except:
                # 종료 버튼 못 찾으면 알림 팝업 재확인
                if dismiss_alert_if_exists():
                    sleep(1)
                    click(IMG_CLOSE_BTN)
            sleep(3)  # 고객목록조회 페이지 복귀 대기

            log(u"        -> %s 처리 완료" % customer_name)
            page_processed += 1
            total_processed += 1

        log(u"  [PAGE %d] %d명 처리 (스킵: %d, 누적: %d)" % (
            page_num, page_processed, start_index, total_processed))

        # 5. 마지막 페이지 감지: 15명 미만이면 종료
        if len(customers) < MAX_CUSTOMERS_PER_PAGE:
            log(u"  [END] 마지막 페이지 (%d < %d) → 루프 종료" % (
                len(customers), MAX_CUSTOMERS_PER_PAGE))
            break

        # 6. 다음 페이지 준비
        prev_first_customer = customers[0]   # 무한 루프 감지용
        prev_last_customer = customers[-1]   # 중복 감지용

        # 7. 스크롤
        scroll_down(SCROLL_CLICKS)
        page_num += 1

    log(u"\n  [%s] 총 %d명 처리 완료 (페이지: %d)" % (chosung_name, total_processed, page_num))

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
log(u"캡처/OCR 결과: %s" % CAPTURE_DIR)
log(u"로그 파일: %s" % LOG_FILE)
log("=" * 60)

# 로그 파일 닫기
_close_log_file()

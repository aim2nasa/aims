# -*- coding: utf-8 -*-
# 행 클릭 방식 스크롤 테스트
# 핵심: 스크롤 대신 마지막 행 클릭 → 해당 행이 상단으로 → 정확한 페이지 이동
# 목표: 한 명도 빠뜨리지 않는 정확한 스크롤

import os
import time
import codecs

# SikuliX 설정
Settings.ActionLogs = False  # [log] CLICK 메시지 숨김
setFindFailedResponse(ABORT)  # 이미지 못 찾으면 즉시 중단

# 경로 설정
SCRIPT_DIR = r"D:\aims\tools\MetlifePDF.sikuli"
LOG_DIR = r"D:\captures\metlife_ocr"

# 로그 디렉토리 생성
if not os.path.exists(LOG_DIR):
    os.makedirs(LOG_DIR)

# 로그 파일 설정
import datetime
_now = datetime.datetime.now()
_date_str = _now.strftime("%Y%m%d_%H%M%S")
LOG_FILE = os.path.join(LOG_DIR, u"scroll_test_%s.log" % _date_str)
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


###########################################
# 설정값 (측정 필요 - 실제 화면에서 조정)
###########################################
WAIT_TIME = 3

# 행 위치 설정 (정밀 측정 필요)
# 기존: FIRST_ROW_OFFSET = 40, ROW_HEIGHT = 33
# 새로 측정된 값 사용
FIRST_ROW_OFFSET = 40   # 헤더에서 첫 번째 행까지 거리 (픽셀)
ROW_HEIGHT = 33         # 행 간 간격 (픽셀)
ROWS_PER_PAGE = 15      # 화면에 보이는 행 수

# 테스트 설정
MAX_PAGES = 999         # 최대 페이지 수 (마지막 페이지 자동 감지로 종료)

# 스크롤 방식 선택:
# "row_click"     - 마지막 행 클릭 방식 (새로운 방식)
# "page_down"     - Page Down 키 방식 (기존 방식)
# "keyboard_down" - Down 키 반복 방식
SCROLL_METHOD = "row_click"

# 이미지 경로
IMG_CUSTNAME = "img/1769233187438.png"         # 고객명 헤더
IMG_ARROW_DESC = "img/1769233198595.png"       # ↓ (내림차순 화살표)
IMG_ARROW_ASC = "img/1769233207559.png"        # ↑ (오름차순 화살표)


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


def click_row(header_x, header_y, row_index):
    """
    특정 행 클릭

    Args:
        header_x: 고객명 헤더 X좌표
        header_y: 고객명 헤더 Y좌표
        row_index: 0-based 행 인덱스

    Returns:
        (x, y): 클릭한 좌표
    """
    y = get_row_y(header_y, row_index)
    click(Location(header_x, y))
    return (header_x, y)


def scroll_row_click(header_x, header_y):
    """
    [방식 1] 잘린 행 클릭 + Down 키로 페이지 이동

    1. 16번째 행(잘린 행) 클릭 → 해당 행이 완전히 보이게 됨 (선택됨)
    2. Down 키 14회 → 14행 아래로 이동 (30번째 행 선택, 화면 스크롤)
    결과: 정확히 14행씩 페이지 이동
    """
    # 1. 16번째 행 클릭 (0-based index = 15, 잘려 보이는 행)
    next_page_row = ROWS_PER_PAGE  # 15 (16번째 행)
    y = get_row_y(header_y, next_page_row)

    log(u"  [SCROLL] Step 1: 잘린 행(Row %d) 클릭 (y=%d)" % (next_page_row + 1, y))
    click(Location(header_x, y))
    sleep(0.5)

    # 2. Down 키 14회 → 14행 아래로 이동
    down_count = ROWS_PER_PAGE - 1  # 14
    log(u"  [SCROLL] Step 2: Down 키 %d회 → %d행 아래로 이동" % (down_count, down_count))
    for i in range(down_count):
        type(Key.DOWN)
        sleep(0.05)

    sleep(1)  # 스크롤 완료 대기


def scroll_page_down(header_x, header_y):
    """
    [방식 2] Page Down 키로 스크롤 (기존 방식)
    """
    y = get_row_y(header_y, 7)  # 중간 행 클릭으로 포커스
    click(Location(header_x, y))
    sleep(0.3)

    log(u"  [SCROLL] Page Down 키")
    type(Key.PAGE_DOWN)
    sleep(1)


def scroll_keyboard_down(header_x, header_y):
    """
    [방식 3] Down 키 반복으로 스크롤

    첫 번째 행 클릭 후 Down 키를 ROWS_PER_PAGE 번 누름
    """
    y = get_row_y(header_y, 0)  # 첫 번째 행 클릭
    click(Location(header_x, y))
    sleep(0.3)

    log(u"  [SCROLL] Down 키 %d회" % ROWS_PER_PAGE)
    for i in range(ROWS_PER_PAGE):
        type(Key.DOWN)
        sleep(0.1)

    sleep(1)


def do_scroll(header_x, header_y):
    """스크롤 방식 선택 실행"""
    if SCROLL_METHOD == "row_click":
        scroll_row_click(header_x, header_y)
    elif SCROLL_METHOD == "page_down":
        scroll_page_down(header_x, header_y)
    elif SCROLL_METHOD == "keyboard_down":
        scroll_keyboard_down(header_x, header_y)
    else:
        log(u"  [ERROR] 알 수 없는 스크롤 방식: %s" % SCROLL_METHOD)


###########################################
# 메인 테스트 시작
###########################################
log("=" * 60)
log(u"행 클릭 방식 스크롤 테스트")
log(u"로그 파일: %s" % os.path.basename(LOG_FILE))
log(u"")
log(u"테스트 설정:")
log(u"  - SCROLL_METHOD: %s" % SCROLL_METHOD)
log(u"  - FIRST_ROW_OFFSET: %d px" % FIRST_ROW_OFFSET)
log(u"  - ROW_HEIGHT: %d px" % ROW_HEIGHT)
log(u"  - ROWS_PER_PAGE: %d" % ROWS_PER_PAGE)
log(u"  - MAX_PAGES: %d" % MAX_PAGES)
log("=" * 60)

start_time = time.time()

###########################################
# 스크롤 테스트 (정렬은 수동으로 완료된 상태)
###########################################
log(u"\n[스크롤 테스트 시작] (방식: %s)" % SCROLL_METHOD)
log(u"※ 고객목록조회 화면에서 정렬 완료 후 실행하세요")

# 헤더 위치 고정 (기준점)
# 고객명 클릭 시 상세 화면으로 이동하므로, "구분" 컬럼 클릭 (고객명 바로 오른쪽)
header = find(IMG_CUSTNAME)
base_y = header.getCenter().getY()

# 고객명 헤더에서 오른쪽으로 100px 이동 (구분 컬럼)
# 이 영역은 클릭해도 상세 화면으로 이동하지 않음
fixed_x = header.getCenter().getX() + 100
log(u"  [INIT] 클릭 위치: x=%d (구분 컬럼), 기준 y=%d" % (fixed_x, base_y))

# 계산된 행 위치 출력
log(u"\n  [INFO] 계산된 행 Y좌표:")
for row in range(ROWS_PER_PAGE):
    y = get_row_y(base_y, row)
    log(u"        Row %2d: y=%d" % (row + 1, y))

# 행 클릭 방식 스크롤 테스트 (마지막 페이지 자동 감지)
# 16번째 행(잘린 행) 클릭 → 1행 스크롤 → 15번 반복 = 15행 이동

def capture_first_row_region():
    """첫 번째 행 영역 캡처 (마지막 페이지 감지용)"""
    row_1_y = get_row_y(base_y, 0)
    # 첫 번째 행의 고객명~구분 영역 캡처 (x: 고객명 헤더 위치, 너비 200px, 높이 30px)
    capture_x = header.getCenter().getX() - 30
    capture_region = Region(int(capture_x), int(row_1_y - 12), 200, 28)
    return capture(capture_region)

page = 1
while page <= MAX_PAGES:
    log(u"\n  " + "=" * 40)
    log(u"  [PAGE %d] 스크롤 테스트" % page)
    log(u"  " + "=" * 40)

    # 스크롤 전 첫 번째 행 캡처 (마지막 페이지 감지용)
    prev_capture = capture_first_row_region()
    log(u"  [CAPTURE] 스크롤 전 첫 번째 행 캡처 완료")

    # 16번째 행(잘린 행)을 15번 클릭 → 15행 이동
    scroll_clicks = ROWS_PER_PAGE  # 15
    log(u"  [SCROLL] 16번째 행(잘린 행) %d번 클릭 시작..." % scroll_clicks)

    for i in range(scroll_clicks):
        # 항상 화면의 16번째 행 위치 클릭 (잘린 행)
        row_16_y = get_row_y(base_y, ROWS_PER_PAGE)  # index 15 = 16번째
        click(Location(fixed_x, row_16_y))
        sleep(0.3)  # 클릭 후 스크롤 대기

        if (i + 1) % 5 == 0:
            log(u"        -> %d번 클릭 완료" % (i + 1))

    sleep(0.5)  # 스크롤 완료 대기

    # 스크롤 후 첫 번째 행 캡처
    curr_capture = capture_first_row_region()
    log(u"  [CAPTURE] 스크롤 후 첫 번째 행 캡처 완료")

    # 이미지 비교 - 동일하면 마지막 페이지
    # SikuliX에서는 exists()로 이미지 매칭 확인
    try:
        # 스크롤 전 캡처 이미지가 현재 화면에서 발견되면 스크롤 안 됨 = 마지막 페이지
        if exists(Pattern(prev_capture).similar(0.95), 0.5):
            log(u"\n  *** 마지막 페이지 도달! (스크롤 전후 동일) ***")
            log(u"  *** 총 %d 페이지 ***" % page)
            break
    except:
        pass  # 매칭 실패 = 스크롤됨 = 계속 진행

    log(u"\n  *** %d페이지 → %d페이지 이동 완료 ***" % (page, page + 1))
    page += 1
    sleep(1)  # 다음 페이지 전 대기

log(u"\n[3단계 완료]")

###########################################
# 결과 요약
###########################################
elapsed_time = time.time() - start_time
minutes = int(elapsed_time // 60)
seconds = int(elapsed_time % 60)

log(u"\n" + "=" * 60)
log(u"행 클릭 스크롤 테스트 완료!")
log(u"")
log(u"결과:")
log(u"  - 스크롤 방식: %s" % SCROLL_METHOD)
log(u"  - 테스트 페이지: %d" % MAX_PAGES)
log(u"  - 페이지당 행: %d" % ROWS_PER_PAGE)
log(u"  - 총 클릭 행: %d" % (MAX_PAGES * ROWS_PER_PAGE))
log(u"  - 소요 시간: %d분 %d초" % (minutes, seconds))
log(u"")
log(u"다음 단계:")
log(u"  1. 로그 파일에서 각 행의 Y좌표 확인")
log(u"  2. 실제 화면과 비교하여 FIRST_ROW_OFFSET, ROW_HEIGHT 조정")
log(u"  3. 스크롤 후 첫 번째 행이 이전 페이지의 마지막+1인지 확인")
log(u"")
log(u"로그 파일: %s" % LOG_FILE)
log("=" * 60)

_close_log_file()

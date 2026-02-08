# -*- coding: utf-8 -*-
"""
고객명 칼럼 정렬 기능 테스트
- 초기 정렬 상태(정렬안됨, 내림차순, 오름차순) 확인
- 최종적으로 내림차순 정렬 완료 확인
"""

from sikuli import *
import os
import time

# 이미지 경로 [100% 줌]
IMG_METLIFE_LOGO = "img/1769598099792.png"
IMG_CUST_MGMT = "img/1769598228284.png"
IMG_CUST_REG = "img/1769598252586.png"
IMG_CUST_LIST = "img/1769598272319.png"
IMG_CUSTNAME = "img/1769598852427.png"
IMG_ARROW_DESC = "img/1769598882979.png"  # ↓ 내림차순
IMG_ARROW_ASC = "img/1769598893800.png"   # ↑ 오름차순
IMG_CHOSUNG_N = "img/1769598473156.png"   # ㄴ 초성

# 캡처 저장 경로
CAPTURE_DIR = r"D:\captures\metlife_ocr\sort_test"
if not os.path.exists(CAPTURE_DIR):
    os.makedirs(CAPTURE_DIR)

# 로그 파일
LOG_FILE = os.path.join(CAPTURE_DIR, "sort_test_%s.log" % time.strftime("%Y%m%d_%H%M%S"))
log_file_handle = None

def log(msg):
    """로그 출력 및 파일 저장"""
    global log_file_handle
    import codecs
    if log_file_handle is None:
        log_file_handle = codecs.open(LOG_FILE, 'a', 'utf-8')

    timestamp = time.strftime("%H:%M:%S")
    line = u"[%s] %s" % (timestamp, msg)
    print(line)
    log_file_handle.write(line + u"\n")
    log_file_handle.flush()

def capture_screen(name):
    """화면 캡처 저장"""
    filepath = os.path.join(CAPTURE_DIR, "%s_%s.png" % (name, time.strftime("%H%M%S")))
    img = capture(SCREEN)
    import shutil
    shutil.copy(img, filepath)
    log(u"[CAPTURE] %s 저장됨" % os.path.basename(filepath))
    return filepath

def detect_sort_state():
    """
    현재 정렬 상태 감지
    Returns: 'desc' (내림차순), 'asc' (오름차순), 'none' (정렬안됨)
    """
    desc_found = exists(IMG_ARROW_DESC, 2)
    asc_found = exists(IMG_ARROW_ASC, 2)

    if desc_found:
        return 'desc'
    elif asc_found:
        return 'asc'
    else:
        return 'none'

def sort_state_to_korean(state):
    """정렬 상태를 한글로 변환"""
    if state == 'desc':
        return u"내림차순 ↓"
    elif state == 'asc':
        return u"오름차순 ↑"
    else:
        return u"정렬안됨"

# ========================================
# 테스트 시작
# ========================================
log(u"=" * 60)
log(u"고객명 칼럼 정렬 기능 테스트")
log(u"=" * 60)

# 1. 고객목록조회 페이지 진입
log(u"\n[1단계] 고객목록조회 진입")

log(u"  [1-1] 메인 화면으로 이동...")
click(IMG_METLIFE_LOGO)
sleep(3)

log(u"  [1-2] 고객관리 클릭...")
click(IMG_CUST_MGMT)
sleep(5)

log(u"  [1-3] 고객등록 클릭...")
click(IMG_CUST_REG)
sleep(3)

log(u"  [1-4] 고객목록조회 클릭...")
click(IMG_CUST_LIST)
sleep(5)

log(u"[1단계 완료]")

# 2. 초성 ㄴ 클릭 (데이터 로딩)
log(u"\n[2단계] 초성 ㄴ 클릭")
click(IMG_CHOSUNG_N)
sleep(5)
log(u"[2단계 완료]")

# 3. 초기 상태 캡처 및 정렬 상태 확인
log(u"\n[3단계] 초기 정렬 상태 확인")
capture_screen("01_initial")
initial_state = detect_sort_state()
log(u"  초기 정렬 상태: %s" % sort_state_to_korean(initial_state))

# 4. 내림차순 정렬 시도
log(u"\n[4단계] 내림차순 정렬 시도")

if initial_state == 'desc':
    log(u"  이미 내림차순 정렬됨 - 추가 작업 불필요")
else:
    for attempt in range(3):
        log(u"  [시도 %d] 고객명 헤더 클릭..." % (attempt + 1))
        click(IMG_CUSTNAME)
        sleep(3)

        current_state = detect_sort_state()
        log(u"  현재 정렬 상태: %s" % sort_state_to_korean(current_state))

        if current_state == 'desc':
            log(u"  [OK] 내림차순 정렬 성공!")
            break
    else:
        log(u"  [FAIL] 내림차순 정렬 실패! (3회 시도 후에도 실패)")

# 5. 최종 상태 캡처 및 확인
log(u"\n[5단계] 최종 정렬 상태 확인")
capture_screen("02_final")
final_state = detect_sort_state()
log(u"  최종 정렬 상태: %s" % sort_state_to_korean(final_state))

# 6. 테스트 결과
log(u"\n" + "=" * 60)
if final_state == 'desc':
    log(u"[OK] 테스트 성공: 내림차순 정렬 완료")
    log(u"  초기: %s → 최종: %s" % (sort_state_to_korean(initial_state), sort_state_to_korean(final_state)))
else:
    log(u"[FAIL] 테스트 실패: 내림차순 정렬 안됨")
    log(u"  초기: %s → 최종: %s" % (sort_state_to_korean(initial_state), sort_state_to_korean(final_state)))
log(u"=" * 60)

log(u"\n캡처/로그 저장 위치: %s" % CAPTURE_DIR)
log(u"로그 파일: %s" % os.path.basename(LOG_FILE))

# 로그 파일 닫기
if log_file_handle:
    log_file_handle.close()

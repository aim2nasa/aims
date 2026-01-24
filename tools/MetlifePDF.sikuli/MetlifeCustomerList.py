# -*- coding: utf-8 -*-
# MetLife PDF 자동 다운로드 (고객목록조회 - 테스트 버전)
# 고객 클릭 → 고객등록/조회 → 종료(x) 테스트

import os
import time

# SikuliX 설정
Settings.ActionLogs = False  # [log] CLICK 메시지 숨김
setFindFailedResponse(ABORT)  # 이미지 못 찾으면 즉시 중단

# 헬퍼 함수
def find_any(*imgs):
    """여러 이미지 중 하나라도 있으면 해당 이미지 반환. 모두 없으면 종료."""
    for img in imgs:
        if exists(img):
            return img
    print("[ERROR] 다음 이미지 중 하나도 찾을 수 없음: " + str(imgs))
    exit(1)

# 설정
WAIT_TIME = 3
FIRST_ROW_OFFSET = 40  # 헤더에서 첫 번째 행까지 거리 (픽셀)
ROW_HEIGHT = 32        # 행 간 간격 (픽셀)

# 고객명 정렬 이미지
IMG_CUSTNAME = "1769233187438.png"         # 고객명 헤더 (클릭용)
IMG_ARROW_DESC = "1769233198595.png"       # ↓ (내림차순 화살표)
IMG_ARROW_ASC = "1769233207559.png"        # ↑ (오름차순 화살표)

# 고객등록/조회 페이지
IMG_CLOSE_BTN = "1769234950471.png"        # 종료(x) 버튼

# 초성 버튼 이미지 (테스트: ㄱ만)
CHOSUNG_BUTTONS = [
    ("ㄱ", "1769222878862.png"),
    # ("ㄴ", "1769222888632.png"),
    # ("ㄷ", "1769222898000.png"),
    # ("ㄹ", "1769222904295.png"),
    # ("ㅁ", "1769222910966.png"),
    # ("ㅂ", "1769222917685.png"),
    # ("ㅅ", "1769222927091.png"),
    # ("ㅇ", "1769222937404.png"),
    # ("ㅈ", "1769222945758.png"),
    # ("ㅊ", "1769222954865.png"),
    # ("ㅋ", "1769222967149.png"),
    # ("ㅌ", "1769222983005.png"),
    # ("ㅍ", "1769222990533.png"),
    # ("ㅎ", "1769222997942.png"),
    # ("기타", "1769223008588.png"),
]

print("=" * 50)
print("MetLife 고객목록조회 - 초성 버튼 테스트")
print("=" * 50)

start_time = time.time()

###########################################
# 1단계: 고객목록조회 메뉴 진입
###########################################
print("\n[1단계] 고객목록조회 진입")

print("  [1-1] 메인 화면으로 이동...")
click("1769018868271.png")
sleep(WAIT_TIME)

print("  [1-2] 고객관리 클릭...")
click("1769012299692.png")
sleep(5)  # 서브메뉴 열릴 시간 확보

print("  [1-3] 고객등록 클릭...")
click("1769219913324.png")
sleep(3)

print("  [1-4] 고객목록조회 클릭...")
click("1769220000076.png")
sleep(5)

print("[1단계 완료]")

###########################################
# 2단계: 초성 버튼 클릭 및 고객 처리
###########################################
print("\n[2단계] 초성 버튼 및 고객 처리")

for chosung_name, chosung_img in CHOSUNG_BUTTONS:
    print("  [%s] 버튼 클릭..." % chosung_name)
    click(chosung_img)
    sleep(5)  # 목록 로딩 대기

    # 고객명 내림차순 정렬 - ↓ 화살표가 나타날 때까지 클릭
    for attempt in range(3):
        desc_found = exists(IMG_ARROW_DESC, 2)
        asc_found = exists(IMG_ARROW_ASC, 2)
        print("        -> 감지: ↓=%s, ↑=%s" % (desc_found is not None, asc_found is not None))
        if desc_found:
            print("        -> 내림차순 확인됨")
            break
        print("        -> 고객명 클릭 (%d차)" % (attempt + 1))
        click(IMG_CUSTNAME)
        sleep(3)
    else:
        print("[ERROR] 내림차순 정렬 실패!")
        exit(1)

    # 고객 처리 (화면에 보이는 고객들 - 스크롤 없음)
    print("  [%s] 고객 처리 시작..." % chosung_name)

    MAX_CUSTOMERS = 16  # 한 페이지에 보이는 고객 수
    for row in range(MAX_CUSTOMERS):
        offset_y = FIRST_ROW_OFFSET + (ROW_HEIGHT * row)  # 첫 행 + 행간격
        print("        -> 고객 %d 클릭 (offset: %dpx)..." % (row + 1, offset_y))
        click(Pattern(IMG_CUSTNAME).targetOffset(0, offset_y))
        sleep(5)  # 고객등록/조회 페이지 로딩 대기

        # 종료(x) 버튼 클릭
        print("        -> 종료(x) 버튼 클릭...")
        click(IMG_CLOSE_BTN)
        sleep(3)  # 고객목록조회 페이지 복귀 대기

        print("        -> 고객 %d 처리 완료" % (row + 1))

    print("  [%s] 총 %d명 처리 완료" % (chosung_name, MAX_CUSTOMERS))

print("[2단계 완료]")

###########################################
# 완료
###########################################
elapsed_time = time.time() - start_time
minutes = int(elapsed_time // 60)
seconds = int(elapsed_time % 60)

print("\n" + "=" * 50)
print("초성 버튼 테스트 완료!")
print("소요 시간: %d분 %d초" % (minutes, seconds))
print("=" * 50)

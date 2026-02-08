# -*- coding: utf-8 -*-
"""
알림 팝업 처리 테스트
대상: 고재효, 고채윤(2명), 고하늘, 고하리
"""

import time

# SikuliX 설정
Settings.ActionLogs = False
setFindFailedResponse(ABORT)

# 이미지
IMG_CUSTNAME = "1769233187438.png"         # 고객명 헤더
IMG_CLOSE_BTN = "1769234950471.png"        # 종료(x) 버튼
IMG_ALERT_OK = "1769251121685.png"         # 알림 팝업 "확인" 버튼

# 설정
FIRST_ROW_OFFSET = 40
ROW_HEIGHT = 33

# 테스트 대상 (P2 R11~R15, 0-indexed: 10~14)
TEST_CUSTOMERS = [
    (10, u"고재효"),
    (11, u"고채윤"),
    (12, u"고채윤"),
    (13, u"고하늘"),
    (14, u"고하리"),
]


def dismiss_alert_if_exists():
    """알림 팝업이 있으면 확인 클릭"""
    try:
        if exists(IMG_ALERT_OK, 1):  # 1초 대기
            print(u"  [ALERT] 알림 팝업 감지! 확인 클릭...")
            click(IMG_ALERT_OK)
            sleep(1)
            return True
    except:
        pass
    return False


def process_customer(row, name):
    """고객 처리 (알림 팝업 처리 포함)"""
    offset_y = FIRST_ROW_OFFSET + (ROW_HEIGHT * row)

    print(u"  [%d] %s 클릭 (offset: %dpx)..." % (row + 1, name, offset_y))
    click(Pattern(IMG_CUSTNAME).targetOffset(0, offset_y))
    sleep(3)

    # 알림 팝업 처리
    if dismiss_alert_if_exists():
        print(u"  [%d] %s: 알림 팝업 닫음" % (row + 1, name))

    # 고객등록/조회 페이지 로딩 대기
    sleep(2)

    # 종료(x) 버튼 클릭
    print(u"  [%d] %s: 종료(x) 클릭..." % (row + 1, name))
    try:
        click(IMG_CLOSE_BTN)
    except:
        # 종료 버튼 못 찾으면 알림 팝업 재확인
        if dismiss_alert_if_exists():
            print(u"  [%d] %s: 알림 팝업 재감지, 다시 종료 시도..." % (row + 1, name))
            sleep(1)
            click(IMG_CLOSE_BTN)

    sleep(2)
    print(u"  [%d] %s 처리 완료" % (row + 1, name))


print("=" * 50)
print(u"알림 팝업 처리 테스트")
print(u"대상: 고재효, 고채윤(2), 고하늘, 고하리")
print("=" * 50)
print(u"")
print(u"3초 후 시작...")
sleep(3)

for row, name in TEST_CUSTOMERS:
    process_customer(row, name)
    print(u"")

print("=" * 50)
print(u"테스트 완료!")
print("=" * 50)

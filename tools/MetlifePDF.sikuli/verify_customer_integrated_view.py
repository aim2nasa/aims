# -*- coding: utf-8 -*-
"""
고객통합뷰 진입/종료 검증 스크립트

사전 조건:
  - 고객이 선택되어 고객등록/조회 페이지가 표시된 상태

동작:
  1. 고객등록/조회 페이지에서 "고객통합뷰" 버튼 클릭
  2. 고객통합뷰 화면에서 X 버튼 클릭하여 종료

이미지 캡처 필요:
  - IMG_CUSTOMER_INTEGRATED_VIEW_BTN: 고객통합뷰 버튼 (파란색)
  - IMG_INTEGRATED_VIEW_CLOSE_BTN: 고객통합뷰 화면의 X 버튼

사용법:
  java -jar sikulixide.jar -r verify_customer_integrated_view.py
"""

import os
import sys
import time
from java.awt import Robot
from java.awt.event import KeyEvent

# Java Robot 인스턴스 (Page Up 키 입력용)
_robot = Robot()

# SikuliX 설정
Settings.ActionLogs = True  # 디버깅용 로그 활성화
setFindFailedResponse(ABORT)

# 경로 설정
SCRIPT_DIR = r"D:\aims\tools\MetlifePDF.sikuli"

# 이미지 경로 설정
IMG_CUSTOMER_INTEGRATED_VIEW_BTN = "img/1769481281041.png"  # 고객통합뷰 버튼
IMG_INTEGRATED_VIEW_CLOSE_BTN = "img/1769481289302.png"  # 고객통합뷰 X 버튼
IMG_VARIABLE_INSURANCE_REPORT_BTN = "img/1769483651370.png"  # 변액보험리포트 버튼
IMG_ALERT_CONFIRM_BTN = "img/1769483666560.png"  # 알림 팝업 확인 버튼

# 기존 이미지 (고객등록/조회 페이지)
IMG_CLOSE_BTN = "img/1769234950471.png"  # 고객등록/조회 종료(x) 버튼

# 대기 시간 설정
WAIT_SHORT = 1
WAIT_MEDIUM = 3
WAIT_LONG = 5


def log(msg):
    """로그 출력"""
    print(msg)


def scroll_to_top(scroll_count=20):
    """
    마우스 휠로 스크롤을 맨 위로 이동

    Args:
        scroll_count: 휠 스크롤 횟수
    """
    # 콘텐츠 영역 클릭하여 포커스 확보
    screen = Screen()
    center_x = screen.getW() / 2
    center_y = screen.getH() / 2
    click(Location(center_x, center_y))
    log(u"    포커스 클릭: (%d, %d)" % (center_x, center_y))
    sleep(0.3)

    # 마우스 휠 UP으로 맨 위로 이동
    log(u"    마우스 휠 UP x %d..." % scroll_count)
    for i in range(scroll_count):
        wheel(WHEEL_UP, 3)  # 3 notches per scroll
        sleep(0.1)
    sleep(0.5)


def wait_and_click(img, description, wait_time=10):
    """
    이미지를 찾아서 클릭

    Args:
        img: 이미지 경로
        description: 설명 (로그용)
        wait_time: 대기 시간 (초)

    Returns:
        bool: 성공 여부
    """
    log(u"    [%s] 찾는 중..." % description)
    try:
        if exists(img, wait_time):
            click(img)
            log(u"    [%s] 클릭 완료" % description)
            return True
        else:
            log(u"    [ERROR] %s 찾을 수 없음!" % description)
            return False
    except Exception as e:
        log(u"    [ERROR] %s 클릭 실패: %s" % (description, str(e)))
        return False


def verify_customer_integrated_view():
    """
    고객통합뷰 진입/종료 검증

    Returns:
        bool: 검증 성공 여부
    """
    log(u"")
    log(u"=" * 60)
    log(u"고객통합뷰 진입/종료 검증 시작")
    log(u"=" * 60)

    # 1단계: 고객등록/조회 페이지 확인
    log(u"")
    log(u"[1단계] 현재 화면 확인")
    log(u"    고객등록/조회 페이지가 표시되어 있어야 합니다.")

    # 2단계: 고객통합뷰 버튼 클릭
    log(u"")
    log(u"[2단계] 고객통합뷰 버튼 클릭")
    if not wait_and_click(IMG_CUSTOMER_INTEGRATED_VIEW_BTN, u"고객통합뷰 버튼"):
        log(u"    [FAIL] 고객통합뷰 버튼을 찾을 수 없습니다.")
        log(u"        - 고객등록/조회 페이지가 표시되어 있는지 확인하세요.")
        log(u"        - 이미지가 올바르게 캡처되었는지 확인하세요.")
        return False

    sleep(WAIT_LONG)  # 고객통합뷰 로딩 대기

    # 3단계: 스크롤 맨 위로 이동
    log(u"")
    log(u"[3단계] 스크롤 맨 위로 이동")
    log(u"    마우스 휠로 스크롤...")
    scroll_to_top()
    log(u"    스크롤 완료")

    # 4단계: 변액보험리포트 클릭
    log(u"")
    log(u"[4단계] 변액보험리포트 클릭")
    if not wait_and_click(IMG_VARIABLE_INSURANCE_REPORT_BTN, u"변액보험리포트 버튼"):
        log(u"    [FAIL] 변액보험리포트 버튼을 찾을 수 없습니다.")
        return False
    sleep(WAIT_MEDIUM)

    # 5단계: 변액계약 없음 알림 확인
    log(u"")
    log(u"[5단계] 변액계약 존재 여부 확인")
    if exists(IMG_ALERT_CONFIRM_BTN, 3):
        log(u"    변액계약이 존재하지 않습니다 - 확인 클릭")
        click(IMG_ALERT_CONFIRM_BTN)
        sleep(WAIT_SHORT)
    else:
        log(u"    변액계약이 존재합니다 (또는 알림 없음)")

    # 6단계: X 버튼 클릭하여 종료
    log(u"")
    log(u"[6단계] X 버튼 클릭하여 종료")
    if not wait_and_click(IMG_INTEGRATED_VIEW_CLOSE_BTN, u"X 버튼"):
        log(u"    [FAIL] X 버튼을 찾을 수 없습니다.")
        log(u"        - 고객통합뷰 화면이 표시되어 있는지 확인하세요.")
        log(u"        - 이미지가 올바르게 캡처되었는지 확인하세요.")
        return False
    sleep(WAIT_MEDIUM)  # 화면 전환 대기

    # 7단계: 완료
    log(u"")
    log(u"=" * 60)
    log(u"[SUCCESS] 고객통합뷰 검증 완료!")
    log(u"=" * 60)

    return True


# 메인 실행
if __name__ == "__main__":
    success = verify_customer_integrated_view()
    sys.exit(0 if success else 1)

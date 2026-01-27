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
import shutil
from java.awt import Robot, Color, BasicStroke
from java.awt.event import KeyEvent
from java.awt.image import BufferedImage
from javax.imageio import ImageIO
from java.io import File

# Java Robot 인스턴스 (Page Up 키 입력용)
_robot = Robot()

# SikuliX 설정
Settings.ActionLogs = True  # 디버깅용 로그 활성화
setFindFailedResponse(ABORT)

# 경로 설정
SCRIPT_DIR = r"D:\aims\tools\MetlifePDF.sikuli"

# 이미지 경로 설정
IMG_CUSTOMER_INTEGRATED_VIEW_BTN = "img/1769492134172.png"  # 고객통합뷰 버튼
IMG_INTEGRATED_VIEW_CLOSE_BTN = "img/1769492160505.png"  # 고객통합뷰 X 버튼
IMG_VARIABLE_INSURANCE_REPORT_BTN = "img/1769492311473.png"  # 변액보험리포트 버튼
IMG_VARIABLE_REPORT_CLOSE_BTN = "img/1769493031653.png"  # 변액보험리포트 팝업 X 버튼
IMG_ALERT_CONFIRM_BTN = "img/1769483666560.png"  # 알림 팝업 확인 버튼

# 변액보험리포트 행 클릭 테스트용 이미지
IMG_REPORT_HEADER = "img/1769494674991.png"  # 증권번호 헤더
IMG_SELECT_BTN = "img/1769013332392.png"  # 선택 버튼

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


def draw_crosshair(image_path, x, y, output_path):
    """
    이미지에 빨간색 + 표시를 그려서 저장

    Args:
        image_path: 원본 이미지 경로
        x, y: + 표시할 좌표
        output_path: 저장할 경로
    """
    # 이미지 로드
    img = ImageIO.read(File(image_path))

    # Graphics2D로 그리기
    g2d = img.createGraphics()
    g2d.setColor(Color.RED)
    g2d.setStroke(BasicStroke(3))  # 선 두께 3px

    # + 표시 그리기 (크기 40px)
    cross_size = 20
    g2d.drawLine(x - cross_size, y, x + cross_size, y)  # 가로선
    g2d.drawLine(x, y - cross_size, x, y + cross_size)  # 세로선

    # 원 그리기 (더 눈에 띄게)
    g2d.drawOval(x - 15, y - 15, 30, 30)

    g2d.dispose()

    # 저장
    ImageIO.write(img, "png", File(output_path))


def test_row_clicks():
    """
    행 클릭 테스트 - 맨 위부터 맨 아래까지 모든 행을 하나씩 클릭
    오프셋이 제대로 지켜지는지 확인
    """
    ROW_HEIGHT = 28
    VISIBLE_ROWS = 6
    MAX_ROWS = 100

    # 증권번호 헤더를 기준점으로 사용
    if not exists(IMG_REPORT_HEADER, 5):
        log(u"    [ERROR] 증권번호 헤더를 찾을 수 없습니다.")
        return

    header_match = find(IMG_REPORT_HEADER)
    header_x = header_match.getCenter().getX()
    header_y = header_match.getCenter().getY()
    # 체크박스는 증권번호 헤더 왼쪽 약 54px
    base_x = header_x - 54
    # 첫 번째 행은 헤더 아래 약 33px
    first_row_y = header_y + 33
    log(u"    [기준점] 헤더 위치: (%d, %d), 체크박스 X: %d, 첫 행 Y: %d" % (header_x, header_y, base_x, first_row_y))
    log(u"    [설정] ROW_HEIGHT=%d, VISIBLE_ROWS=%d" % (ROW_HEIGHT, VISIBLE_ROWS))

    # 첫 번째 행만 클릭
    click_y = first_row_y
    log(u"    [행 1] 클릭 위치: (%d, %d)" % (base_x, click_y))

    # 스크린샷 캡처
    temp_path = r"D:\aims\tools\MetlifePDF.sikuli\temp_capture.png"
    screenshot_path = r"D:\aims\tools\MetlifePDF.sikuli\click_row_1.png"
    img = Screen().capture()
    shutil.move(img.getFile(), temp_path)

    # 빨간색 + 표시 그려서 저장
    draw_crosshair(temp_path, int(base_x), int(click_y), screenshot_path)
    os.remove(temp_path)
    log(u"    스크린샷 저장: %s" % screenshot_path)

    click(Location(base_x, click_y))
    log(u"    클릭 완료")


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
        log(u"    변액계약이 존재합니다 - 행 클릭 테스트 시작")
        test_row_clicks()

    # 6단계: 변액보험리포트 팝업 X 버튼 클릭
    log(u"")
    log(u"[6단계] 변액보험리포트 팝업 X 버튼 클릭")
    if not wait_and_click(IMG_VARIABLE_REPORT_CLOSE_BTN, u"변액보험리포트 X 버튼"):
        log(u"    [FAIL] 변액보험리포트 X 버튼을 찾을 수 없습니다.")
        return False
    sleep(WAIT_SHORT)

    # 7단계: 고객통합뷰 X 버튼 클릭하여 종료
    log(u"")
    log(u"[7단계] 고객통합뷰 X 버튼 클릭하여 종료")
    if not wait_and_click(IMG_INTEGRATED_VIEW_CLOSE_BTN, u"고객통합뷰 X 버튼"):
        log(u"    [FAIL] 고객통합뷰 X 버튼을 찾을 수 없습니다.")
        log(u"        - 고객통합뷰 화면이 표시되어 있는지 확인하세요.")
        log(u"        - 이미지가 올바르게 캡처되었는지 확인하세요.")
        return False
    sleep(WAIT_MEDIUM)  # 화면 전환 대기

    # 8단계: 완료
    log(u"")
    log(u"=" * 60)
    log(u"[SUCCESS] 고객통합뷰 검증 완료!")
    log(u"=" * 60)

    return True


# 메인 실행
if __name__ == "__main__":
    success = verify_customer_integrated_view()
    sys.exit(0 if success else 1)

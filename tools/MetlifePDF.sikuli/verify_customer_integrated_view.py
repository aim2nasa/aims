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

# 변액보험리포트 행 클릭용 이미지
IMG_REPORT_HEADER = "img/1769494674991.png"  # 증권번호 헤더
IMG_SELECT_BTN = "img/1769013332392.png"  # 선택 버튼
IMG_CHECKBOX_UNCHECKED = "img/1769504923688.png"  # 체크 안 된 체크박스
IMG_CHECKBOX_CHECKED = "img/1769506230936.png"  # 체크된 체크박스 (선택됨)

# 행 클릭 오프셋 설정 (보정 완료)
ROW_HEIGHT = 37  # 행 간격
VISIBLE_ROWS = 7  # 스크롤 없을 때 보이는 최대 행 수 (모달에 7개 표시)
HEADER_TO_CHECKBOX_X = -54  # 증권번호 헤더에서 체크박스까지 X 오프셋
HEADER_TO_FIRST_ROW_Y = 33  # 증권번호 헤더에서 첫 번째 행까지 Y 오프셋

# 기존 이미지 (고객등록/조회 페이지)
IMG_CLOSE_BTN = "img/1769234950471.png"  # 고객등록/조회 종료(x) 버튼

# 대기 시간 설정
WAIT_SHORT = 1
WAIT_MEDIUM = 3
WAIT_LONG = 5


LOG_FILE = os.path.join(SCRIPT_DIR, "debug_log.txt")

import codecs

def log(msg):
    """로그 출력 및 파일 저장"""
    # 콘솔 출력 (그대로)
    print(msg)
    # 파일 저장 (유니코드 변환 후)
    if isinstance(msg, str):
        msg = msg.decode("utf-8", errors="replace")
    with codecs.open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(msg + u"\n")


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


def get_row_click_positions():
    """
    행 클릭에 필요한 기준 좌표를 계산

    Returns:
        tuple: (base_x, first_row_y, header_match) 또는 실패 시 (None, None, None)
    """
    if not exists(IMG_REPORT_HEADER, 5):
        log(u"    [ERROR] 증권번호 헤더를 찾을 수 없습니다.")
        return None, None, None

    header_match = find(IMG_REPORT_HEADER)
    header_x = header_match.getCenter().getX()
    header_y = header_match.getCenter().getY()

    base_x = header_x + HEADER_TO_CHECKBOX_X
    first_row_y = header_y + HEADER_TO_FIRST_ROW_Y

    log(u"    [기준점] 헤더: (%d, %d), 체크박스 X: %d, 첫 행 Y: %d" % (header_x, header_y, base_x, first_row_y))

    return base_x, first_row_y, header_match


def click_all_rows_no_scroll():
    """
    스크롤 없는 경우 - 보이는 행만 클릭 (최대 6개)

    Returns:
        int: 클릭한 행 개수
    """
    log(u"    [스크롤 없음] 보이는 행만 클릭")

    base_x, first_row_y, _ = get_row_click_positions()
    if base_x is None:
        return 0

    clicked_count = 0

    for i in range(VISIBLE_ROWS):
        click_y = first_row_y + (i * ROW_HEIGHT)

        log(u"    [행 %d] 클릭 Y=%d" % (i + 1, click_y))
        click(Location(base_x, click_y))
        sleep(0.5)
        clicked_count += 1

    log(u"    [완료] %d개 행 클릭" % clicked_count)
    return clicked_count


def capture_first_row_region(base_x, first_row_y):
    """
    첫 번째 행 영역을 캡처하여 비교용 이미지 반환

    Args:
        base_x: 체크박스 X 좌표
        first_row_y: 첫 번째 행 Y 좌표

    Returns:
        Region: 캡처된 영역
    """
    # 첫 번째 행 영역 (체크박스 ~ 증권번호 부분)
    region_x = int(base_x)
    region_y = int(first_row_y - ROW_HEIGHT / 2)
    region_w = 200  # 충분한 너비
    region_h = ROW_HEIGHT

    return Region(region_x, region_y, region_w, region_h)


def is_row_checked(base_x, row_y, debug_dir=None, debug_idx=None):
    """
    행의 체크박스가 체크되어 있는지 확인 (파란색 체크마크 감지)

    Args:
        base_x: 체크박스 X 좌표
        row_y: 행 Y 좌표
        debug_dir: 디버그 스크린샷 저장 폴더 (선택)
        debug_idx: 디버그 인덱스 (선택)

    Returns:
        bool: 체크되어 있으면 True
    """
    # 체크박스 영역 (체크마크는 파란색)
    check_region = Region(int(base_x - 15), int(row_y - 12), 30, 24)

    # 파란색 픽셀 확인 (체크마크 색상)
    try:
        capture = Screen().capture(check_region)
        img_file = capture.getFile()
        img = ImageIO.read(File(img_file))

        blue_pixels = 0
        for x in range(img.getWidth()):
            for y in range(img.getHeight()):
                rgb = img.getRGB(x, y)
                r = (rgb >> 16) & 0xFF
                g = (rgb >> 8) & 0xFF
                b = rgb & 0xFF
                # 파란색 체크마크: R < 100, B > 150
                if r < 100 and b > 150:
                    blue_pixels += 1

        # 일정 수 이상의 파란 픽셀이 있으면 체크됨
        is_checked = blue_pixels > 20

        # 디버그: 체크박스 이미지 저장
        if debug_dir and debug_idx is not None:
            status = "checked" if is_checked else "unchecked"
            shutil.copy(img_file,
                        os.path.join(debug_dir, "chk_%03d_%s_blue%d.png" % (debug_idx, status, blue_pixels)))

        return is_checked
    except:
        return False


def find_highlight_y(table_region):
    """
    테이블에서 선택된 행(파란색 하이라이트)의 Y좌표를 찾음

    Returns:
        int: 하이라이트 중앙 Y좌표 (못 찾으면 -1)
    """
    try:
        capture = Screen().capture(table_region)
        img = ImageIO.read(File(capture.getFile()))

        # 각 Y좌표별 파란 픽셀 수 계산
        blue_counts = {}
        for y in range(img.getHeight()):
            blue_count = 0
            for x in range(img.getWidth()):
                rgb = img.getRGB(x, y)
                r = (rgb >> 16) & 0xFF
                g = (rgb >> 8) & 0xFF
                b = rgb & 0xFF
                # 하이라이트 파란색: B가 R보다 크고, 밝은 색
                # (다양한 파란색 하이라이트 색상 포함)
                if b > r + 30 and b > 150 and g > 150:
                    blue_count += 1
            if blue_count > 30:  # 파란 픽셀이 충분히 있는 행
                blue_counts[y] = blue_count

        if blue_counts:
            max_y = max(blue_counts, key=blue_counts.get)
            return table_region.y + max_y
        return -1
    except:
        return -1


def capture_click_position(debug_dir, step, click_x, click_y, row_idx, total_clicked):
    """
    클릭 위치를 + 표시하여 스크린샷 저장

    Args:
        debug_dir: 저장 폴더
        step: 스텝 번호
        click_x, click_y: 클릭 좌표
        row_idx: 행 인덱스
        total_clicked: 총 클릭 수
    """
    # 클릭 위치 주변 영역 캡처
    region = Region(int(click_x - 100), int(click_y - 50), 300, 100)
    capture = Screen().capture(region)
    img_file = capture.getFile()

    # 이미지에 + 표시 그리기
    img = ImageIO.read(File(img_file))
    g2d = img.createGraphics()
    g2d.setColor(Color.RED)
    g2d.setStroke(BasicStroke(2))

    # + 표시 (캡처 영역 내 상대 좌표)
    rel_x = 100  # click_x - (click_x - 100) = 100
    rel_y = 50   # click_y - (click_y - 50) = 50
    cross_size = 15
    g2d.drawLine(rel_x - cross_size, rel_y, rel_x + cross_size, rel_y)
    g2d.drawLine(rel_x, rel_y - cross_size, rel_x, rel_y + cross_size)
    g2d.drawOval(rel_x - 10, rel_y - 10, 20, 20)
    g2d.dispose()

    # 저장
    output_path = os.path.join(debug_dir, "%03d_click%02d_row%d_x%d_y%d.png" % (step, total_clicked, row_idx, click_x, click_y))
    ImageIO.write(img, "png", File(output_path))


def capture_checkbox_template(base_x, first_row_y, debug_dir):
    """
    첫 번째 체크박스를 캡처하여 템플릿으로 저장

    Args:
        base_x: 체크박스 X 좌표
        first_row_y: 첫 번째 행 Y 좌표
        debug_dir: 디버그 폴더

    Returns:
        str: 캡처된 이미지 파일 경로 (실패 시 None)
    """
    # 첫 번째 체크박스 영역 캡처 (30x24 픽셀)
    chk_region = Region(int(base_x - 15), int(first_row_y - 12), 30, 24)
    capture = Screen().capture(chk_region)
    template_path = os.path.join(debug_dir, "checkbox_template.png")
    shutil.copy(capture.getFile(), template_path)
    log(u"    [체크박스 템플릿] 캡처 완료: %s" % template_path)
    return template_path


def find_selected_row_y(table_region):
    """
    테이블에서 현재 선택된 행(파란색 하이라이트)의 Y좌표를 찾음

    Args:
        table_region: 테이블 영역

    Returns:
        int: 선택된 행의 중앙 Y좌표 (못 찾으면 -1)
    """
    try:
        capture = Screen().capture(table_region)
        img = ImageIO.read(File(capture.getFile()))

        # 각 Y좌표별 파란 픽셀 수 계산
        blue_rows = []
        for y in range(img.getHeight()):
            blue_count = 0
            for x in range(img.getWidth()):
                rgb = img.getRGB(x, y)
                r = (rgb >> 16) & 0xFF
                g = (rgb >> 8) & 0xFF
                b = rgb & 0xFF
                # 선택된 행의 파란색 하이라이트 감지
                if b > r + 20 and b > 180 and g > 180:
                    blue_count += 1
            if blue_count > 50:  # 충분한 파란 픽셀
                blue_rows.append((y, blue_count))

        if blue_rows:
            # 가장 파란 픽셀이 많은 Y 찾기
            max_y = max(blue_rows, key=lambda x: x[1])[0]
            return table_region.y + max_y
        return -1
    except:
        return -1


def click_all_rows_with_scroll():
    """
    오프셋 기반 + 스크롤 시 reference 보정 방식

    핵심:
    - 스크롤 전: 마지막 클릭한 행 영역 캡처 (reference)
    - 스크롤 후: reference 이미지로 위치 찾기 → 그 다음 행부터 클릭
    - **절대 Y좌표**로 추적하여 중복/누락 방지

    Returns:
        int: 선택한 행 개수
    """
    log(u"")
    log(u"    === 변액보험리포트 순차 클릭 시작 (reference 보정 방식) ===")

    # 헤더 찾기
    if not exists(IMG_REPORT_HEADER, 5):
        log(u"    [ERROR] 증권번호 헤더를 찾을 수 없습니다.")
        return 0

    header_match = find(IMG_REPORT_HEADER)
    header_x = header_match.getCenter().getX()
    header_y = header_match.getCenter().getY()
    log(u"    [기준점] 헤더 위치: (%d, %d)" % (header_x, header_y))

    # 체크박스 X좌표, 첫 행 Y좌표
    base_x = header_x + HEADER_TO_CHECKBOX_X
    first_row_y = header_y + HEADER_TO_FIRST_ROW_Y

    # 화면 하단 경계 (이 Y를 넘으면 스크롤 필요)
    visible_bottom_y = first_row_y + (VISIBLE_ROWS - 1) * ROW_HEIGHT

    log(u"    [설정] base_x=%d, first_row_y=%d, visible_bottom=%d" % (base_x, first_row_y, visible_bottom_y))

    total_clicked = 0
    MAX_REPORTS = 50  # 안전장치
    unchecked_pattern = Pattern(IMG_CHECKBOX_UNCHECKED).similar(0.7)

    # 절대 Y좌표로 추적
    current_y = first_row_y
    prev_ref_y = None  # 스크롤 전후 비교용 (checked 위치)

    while total_clicked < MAX_REPORTS:
        # 현재 위치에 unchecked가 있는지 확인
        check_region = Region(int(base_x - 20), int(current_y - 20), 50, 40)

        if check_region.exists(unchecked_pattern, 0.3):
            # 클릭
            total_clicked += 1
            log(u"    [%d] 클릭 Y=%d" % (total_clicked, current_y))
            click(Location(base_x, current_y))
            sleep(0.3)

            # 다음 행으로 이동
            current_y += ROW_HEIGHT

        elif current_y <= visible_bottom_y:
            # 화면 내인데 unchecked 없음 = 마지막 행 도달
            log(u"    Y=%d에 unchecked 없음 = 마지막!" % current_y)
            break

        else:
            # 화면 밖 = 스크롤 필요
            log(u"    Y=%d > %d, 스크롤 필요!" % (current_y, visible_bottom_y))
            saved_current_y = current_y  # 스크롤 전 Y 저장

            # 스크롤 전 화면 상태 로그
            log(u"    [스크롤 전] 화면에 보이는 unchecked:")
            try:
                before_scroll = list(findAll(unchecked_pattern))
                for m in sorted(before_scroll, key=lambda x: x.getY()):
                    log(u"        Y=%d" % m.getY())
            except:
                log(u"        (findAll 실패)")

            # 테이블 영역에서 마우스 휠 스크롤
            wheel_location = Location(base_x + 100, first_row_y + 100)
            click(wheel_location)
            sleep(0.2)
            wheel(wheel_location, WHEEL_DOWN, 5)  # 5 notches 스크롤
            sleep(0.5)

            # 스크롤 후 화면 상태 로그
            log(u"    [스크롤 후] 화면에 보이는 unchecked:")
            try:
                after_scroll = list(findAll(unchecked_pattern))
                for m in sorted(after_scroll, key=lambda x: x.getY()):
                    log(u"        Y=%d" % m.getY())
            except:
                log(u"        (findAll 실패)")

            # 헤더 재탐색
            if exists(IMG_REPORT_HEADER, 3):
                header_match = find(IMG_REPORT_HEADER)
                header_y = header_match.getCenter().getY()
                first_row_y = header_y + HEADER_TO_FIRST_ROW_Y
                visible_bottom_y = first_row_y + (VISIBLE_ROWS - 1) * ROW_HEIGHT
                log(u"    스크롤 후: first_row_y=%d, visible_bottom=%d" % (first_row_y, visible_bottom_y))

            # ========================================
            # Checked 이미지로 현재 선택 행 찾아서 다음 Y 계산
            # (라디오 버튼이므로 checked는 항상 1개)
            # ========================================
            checked_pattern = Pattern(IMG_CHECKBOX_CHECKED).similar(0.8)
            if exists(checked_pattern, 2):
                checked_match = getLastMatch()
                ref_y = checked_match.getCenter().getY()
                log(u"    [CHECKED] 현재 선택 행 Y=%d" % ref_y)

                # 스크롤 전후 checked 위치가 같으면 = 스크롤 안 됨 = 끝 도달
                if prev_ref_y is not None and abs(ref_y - prev_ref_y) < 10:
                    log(u"    [CHECKED] 스크롤 안 됨 - 남은 행 확인 (ref_y=%d)..." % ref_y)
                    # 화면에 남은 unchecked 행 클릭 (checked 아래)
                    try:
                        remaining = list(findAll(unchecked_pattern))
                        log(u"    [DEBUG] findAll 결과: %d개" % len(remaining))
                        remaining_sorted = sorted(remaining, key=lambda m: m.getY())
                        for match in remaining_sorted:
                            match_y = match.getY()
                            log(u"    [DEBUG] unchecked Y=%d (ref_y+10=%d)" % (match_y, ref_y + 10))
                            if match_y > ref_y + 10:  # checked 아래에 있는 것만
                                total_clicked += 1
                                log(u"    [%d] 남은 행 클릭 Y=%d" % (total_clicked, match_y))
                                click(match)
                                sleep(0.3)
                    except Exception as e:
                        log(u"    [ERROR] findAll 실패: %s" % str(e))
                    break

                prev_ref_y = ref_y
                # checked 행의 Y좌표 + ROW_HEIGHT = 다음 클릭 Y
                current_y = ref_y + ROW_HEIGHT
                log(u"    [CHECKED] 다음 클릭 Y=%d" % current_y)
            else:
                # checked 못 찾음 = 화면 밖으로 스크롤됨 → 첫 unchecked 직접 클릭
                log(u"    [CHECKED] 못 찾음 → 첫 unchecked 직접 클릭")
                try:
                    first_unchecked = list(findAll(unchecked_pattern))
                    if first_unchecked:
                        first_unchecked_sorted = sorted(first_unchecked, key=lambda m: m.getY())
                        first_match = first_unchecked_sorted[0]
                        match_y = first_match.getCenter().getY()
                        total_clicked += 1
                        log(u"    [%d] 첫 unchecked 클릭 Y=%d" % (total_clicked, match_y))
                        click(first_match)
                        sleep(0.3)
                        current_y = match_y + ROW_HEIGHT
                    else:
                        log(u"    [CHECKED] unchecked 없음 = 끝!")
                        break
                except:
                    log(u"    [CHECKED] findAll 실패 → 저장된 Y 사용")
                    current_y = saved_current_y

    log(u"")
    log(u"    === 총 %d개 리포트 클릭 완료 ===" % total_clicked)
    return total_clicked


def click_all_report_rows():
    """
    변액보험리포트 모든 행 클릭 (통합 함수)

    Returns:
        int: 클릭한 행 개수
    """
    log(u"")
    log(u"    === 변액보험리포트 행 클릭 시작 ===")

    # 스크롤 유무와 관계없이 동일하게 처리
    # (스크롤 없으면 첫 반복에서 종료됨)
    count = click_all_rows_with_scroll()

    log(u"    === 행 클릭 완료: %d개 ===" % count)
    return count


def test_row_clicks():
    """
    행 클릭 테스트 (기존 함수 - 호환성 유지)
    """
    click_all_report_rows()


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
    # 로그 파일 초기화
    with codecs.open(LOG_FILE, "w", encoding="utf-8") as f:
        f.write(u"=== 실행 시작: %s ===\n" % time.strftime("%Y-%m-%d %H:%M:%S"))

    success = verify_customer_integrated_view()

    log(u"=== 실행 종료 ===")
    sys.exit(0 if success else 1)

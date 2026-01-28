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
from java.awt import Robot, Color, BasicStroke, Font
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
SCREENSHOT_DIR = os.path.join(SCRIPT_DIR, "screenshots")

# 스크린샷 폴더 생성
if not os.path.exists(SCREENSHOT_DIR):
    os.makedirs(SCREENSHOT_DIR)

# 이미지 경로 설정
IMG_CUSTOMER_INTEGRATED_VIEW_BTN = "img/1769492134172.png"  # 고객통합뷰 버튼
IMG_INTEGRATED_VIEW_CLOSE_BTN = "img/1769492160505.png"  # 고객통합뷰 X 버튼
IMG_VARIABLE_INSURANCE_REPORT_BTN = "img/1769492311473.png"  # 변액보험리포트 버튼
IMG_VARIABLE_REPORT_CLOSE_BTN = "img/1769493031653.png"  # 변액보험리포트 팝업 X 버튼
IMG_ALERT_CONFIRM_BTN = "img/1769516264265.png"  # 알림 팝업 확인 버튼
IMG_ALERT_MESSAGE = "img/1769516255683.png"  # 알림 메시지 "한개의 증번만 선택이 가능합니다"
IMG_PREVIEW_BTN = "img/1769561871974.png"  # 보고서인쇄 창 미리보기 버튼

# 변액보험리포트 행 클릭용 이미지
IMG_REPORT_HEADER = "img/1769494674991.png"  # 증권번호 헤더
IMG_SELECT_BTN = "img/1769515056052.png"  # 선택 버튼
IMG_CHECKBOX_UNCHECKED = "img/1769504923688.png"  # 체크 안 된 체크박스
IMG_CHECKBOX_CHECKED = "img/1769506230936.png"  # 체크된 체크박스 (선택됨)
IMG_PRINT_REPORT_CLOSE_BTN = "img/1769515114596.png"  # 보고서인쇄 창 X 버튼

# 행 클릭 오프셋 설정 (보정 완료)
ROW_HEIGHT = 37  # 행 간격
VISIBLE_ROWS = 7  # 스크롤 없을 때 보이는 최대 행 수 (모달에 7개 표시)
HEADER_TO_CHECKBOX_X = -54  # 증권번호 헤더에서 체크박스까지 X 오프셋
HEADER_TO_FIRST_ROW_Y = 33  # 증권번호 헤더에서 첫 번째 행까지 Y 오프셋

# 보고서인쇄 창 X 버튼 오프셋 (미리보기 버튼 기준)
PREVIEW_TO_CLOSE_X = 15   # 미리보기 버튼에서 X 버튼까지 X 오프셋
PREVIEW_TO_CLOSE_Y = -48  # 미리보기 버튼에서 X 버튼까지 Y 오프셋

# 기존 이미지 (고객등록/조회 페이지)
IMG_CLOSE_BTN = "img/1769234950471.png"  # 고객등록/조회 종료(x) 버튼

# 대기 시간 설정
WAIT_SHORT = 1
WAIT_MEDIUM = 3
WAIT_LONG = 5


LOG_FILE = os.path.join(SCRIPT_DIR, "debug_log.txt")

import codecs
import subprocess

# Windows 콘솔 코드페이지를 UTF-8로 설정
try:
    subprocess.call("chcp 65001", shell=True)
except:
    pass

def log(msg):
    """로그 출력 및 파일 저장 (Windows 한글 인코딩 대응)"""
    # 유니코드로 통일
    if isinstance(msg, str):
        msg_unicode = msg.decode("utf-8", errors="replace")
    else:
        msg_unicode = msg

    # 콘솔 출력 (UTF-8 인코딩)
    try:
        print(msg_unicode.encode("utf-8"))
    except:
        print(msg_unicode)

    # 파일 저장
    with codecs.open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(msg_unicode + u"\n")


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


def capture_modal_with_row_marker(header_match, row_region, output_path):
    """
    모달창 전체를 캡처하고 행 캡처 영역을 빨간 박스로 표시

    Args:
        header_match: 헤더 매치 객체 (모달 위치 기준점)
        row_region: 행 캡처 영역 Region(x, y, w, h)
        output_path: 저장 경로
    """
    try:
        # 모달창 전체 영역 계산 (헤더 기준으로 확장)
        header_x = header_match.getCenter().getX()
        header_y = header_match.getCenter().getY()

        # 모달창 추정 영역 (헤더 위로 60px, 아래로 340px, 좌우 여유)
        modal_x = int(header_x - 80)
        modal_y = int(header_y - 60)
        modal_w = 520
        modal_h = 400

        modal_region = Region(modal_x, modal_y, modal_w, modal_h)
        capture = Screen().capture(modal_region)
        img = ImageIO.read(File(capture.getFile()))

        # 행 캡처 영역을 빨간 박스로 표시 (모달 좌표계로 변환)
        g2d = img.createGraphics()
        g2d.setColor(Color.RED)
        g2d.setStroke(BasicStroke(2))

        # 상대 좌표 계산
        rel_x = row_region.x - modal_x
        rel_y = row_region.y - modal_y
        rel_w = row_region.w
        rel_h = row_region.h

        # 빨간 박스 그리기
        g2d.drawRect(rel_x, rel_y, rel_w, rel_h)

        # 행 번호 텍스트 (파일명에서 추출)
        g2d.setFont(Font("Arial", Font.BOLD, 14))
        g2d.drawString("CAPTURE", rel_x + 5, rel_y - 5)

        g2d.dispose()

        # 저장
        ImageIO.write(img, "png", File(output_path))
        return True
    except Exception as e:
        log(u"    [ERROR] 모달 캡처 실패: %s" % str(e))
        return False


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


def is_y_already_clicked(y, clicked_set, tolerance=15):
    """
    주어진 Y좌표가 이미 클릭된 Y와 가까운지 확인

    Args:
        y: 확인할 Y좌표
        clicked_set: 이미 클릭한 Y좌표 집합
        tolerance: 허용 오차 (픽셀)

    Returns:
        bool: 이미 클릭된 Y와 가까우면 True
    """
    for clicked_y in clicked_set:
        if abs(y - clicked_y) < tolerance:
            return True
    return False


def click_all_rows_with_scroll():
    """
    변액보험리포트 모든 행 클릭 (중복 방지 버전)

    핵심:
    - 클릭한 Y좌표를 Set으로 추적하여 중복 클릭 방지
    - 라디오 버튼 특성 고려 (클릭 시 이전 선택 해제됨)
    - 스크롤 후 새 행만 클릭

    Returns:
        int: 선택한 행 개수
    """
    log(u"")
    log(u"    === 변액보험리포트 순차 클릭 시작 (중복 방지 버전) ===")

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
    unchecked_pattern = Pattern(IMG_CHECKBOX_UNCHECKED).similar(0.6)

    # ★ 클릭한 Y좌표 추적 (중복 방지 핵심)
    clicked_y_set = set()

    # 연속 스크롤 실패 카운터
    scroll_fail_count = 0
    MAX_SCROLL_FAILS = 3

    # 절대 Y좌표로 추적
    current_y = first_row_y

    # 연속 빈 행 카운터 (종료 조건)
    empty_row_count = 0
    MAX_EMPTY_ROWS = VISIBLE_ROWS  # 7회 연속 빈 행이면 종료

    while total_clicked < MAX_REPORTS:
        # ★ 화면 경계 먼저 체크 - visible 영역을 벗어나면 스크롤 필요
        if current_y > visible_bottom_y:
            log(u"    Y=%d > %d, 스크롤 필요!" % (current_y, visible_bottom_y))

            # 스크롤 전 첫 행 영역 캡처 (스크롤 효과 비교용)
            first_row_region = Region(int(base_x + 50), int(first_row_y - 15), 400, 30)
            scroll_before_img = None
            try:
                scroll_before_capture = Screen().capture(first_row_region)
                scroll_before_img = scroll_before_capture.getFile()
                scroll_before_path = os.path.join(SCREENSHOT_DIR, "scroll_before_%02d.png" % total_clicked)
                shutil.copy(scroll_before_img, scroll_before_path)
                log(u"    [DEBUG] 스크롤 전 첫 행: %s" % scroll_before_path)
            except:
                pass

            # 휠 스크롤 (테이블 중앙에서 스크롤)
            table_center_x = base_x + 200
            table_center_y = (first_row_y + visible_bottom_y) / 2
            log(u"    [스크롤] 테이블 중앙 (%d, %d)에서 휠 스크롤..." % (table_center_x, table_center_y))
            click(Location(table_center_x, table_center_y))
            sleep(0.5)
            wheel(WHEEL_DOWN, 20)
            sleep(2.0)

            # 스크롤 후 첫 행 영역 캡처 (비교용)
            scroll_after_img = None
            try:
                scroll_after_capture = Screen().capture(first_row_region)
                scroll_after_img = scroll_after_capture.getFile()
                scroll_after_path = os.path.join(SCREENSHOT_DIR, "scroll_after_%02d.png" % total_clicked)
                shutil.copy(scroll_after_img, scroll_after_path)
                log(u"    [DEBUG] 스크롤 후 첫 행: %s" % scroll_after_path)
            except:
                pass

            # ★ 스크롤 효과 검증: 전후 이미지 비교
            if scroll_before_img and scroll_after_img:
                try:
                    before = ImageIO.read(File(scroll_before_img))
                    after = ImageIO.read(File(scroll_after_img))

                    # 픽셀 차이 계산
                    diff_count = 0
                    total_pixels = before.getWidth() * before.getHeight()
                    for x in range(min(before.getWidth(), after.getWidth())):
                        for y in range(min(before.getHeight(), after.getHeight())):
                            if before.getRGB(x, y) != after.getRGB(x, y):
                                diff_count += 1

                    diff_percent = (diff_count * 100.0) / total_pixels
                    log(u"    [스크롤 효과] 픽셀 차이: %.1f%%" % diff_percent)

                    # 5% 미만 차이 = 스크롤 효과 없음 = 끝에 도달
                    if diff_percent < 5.0:
                        log(u"    [END] 스크롤 효과 없음 (차이 %.1f%%) - 리스트 끝 도달" % diff_percent)
                        log(u"    === 총 %d개 리포트 클릭 완료 ===" % total_clicked)
                        break
                except Exception as e:
                    log(u"    [WARN] 이미지 비교 실패: %s" % str(e))

            # 스크롤 후 헤더 재탐색 및 base_x 재계산
            if exists(IMG_REPORT_HEADER, 3):
                header_match = find(IMG_REPORT_HEADER)
                header_x = header_match.getCenter().getX()
                header_y = header_match.getCenter().getY()
                base_x = header_x + HEADER_TO_CHECKBOX_X  # ★ base_x 재계산
                first_row_y = header_y + HEADER_TO_FIRST_ROW_Y
                visible_bottom_y = first_row_y + (VISIBLE_ROWS - 1) * ROW_HEIGHT
                log(u"    스크롤 후: base_x=%d, first_row_y=%d, visible_bottom=%d" % (base_x, first_row_y, visible_bottom_y))

            # ★ findAll에 의존하지 않고, first_row_y부터 순차 클릭 시도
            # 스크롤 후에는 같은 Y 좌표에 새 행이 표시되므로 clicked_y_set 클리어
            clicked_y_set.clear()
            current_y = first_row_y
            empty_row_count = 0  # 스크롤 후 카운터 리셋
            log(u"    [SCROLL] current_y=%d로 이동 (순차 클릭 시작, clicked_y_set 초기화)" % current_y)
            continue

        # ★ 새 전략: 패턴 인식 없이 무조건 클릭 후 "선택 버튼" 존재 여부로 판단
        # 이미 클릭한 Y인지 확인
        if is_y_already_clicked(current_y, clicked_y_set):
            log(u"    Y=%d 이미 클릭됨 - 스킵" % current_y)
            current_y += ROW_HEIGHT
            continue

        # 1. 행 위치 클릭 (체크박스 선택 시도)
        log(u"    [시도] Y=%d 클릭 중..." % current_y)
        click(Location(base_x, current_y))
        sleep(0.8)

        # 2. 선택 버튼이 나타나는지 확인 (성공 여부 판단)
        select_btn_pattern = Pattern(IMG_SELECT_BTN).similar(0.7)
        if exists(select_btn_pattern, 2):
            # 성공: 행이 있고 클릭됨
            total_clicked += 1
            clicked_y_set.add(current_y)
            log(u"    [%d] 행 클릭 성공 Y=%d" % (total_clicked, current_y))

            # 스크린샷 저장 (행 + 모달 전체)
            try:
                row_region = Region(int(base_x - 50), int(current_y - 15), 600, 30)
                capture = Screen().capture(row_region)
                screenshot_path = os.path.join(SCREENSHOT_DIR, "row_%02d.png" % total_clicked)
                shutil.copy(capture.getFile(), screenshot_path)
                log(u"        -> 행 스크린샷: %s" % screenshot_path)

                # 모달 전체 + 캡처 영역 마커 저장
                modal_path = os.path.join(SCREENSHOT_DIR, "modal_%02d.png" % total_clicked)
                if capture_modal_with_row_marker(header_match, row_region, modal_path):
                    log(u"        -> 모달 스크린샷: %s" % modal_path)
            except Exception as e:
                log(u"        [WARN] 스크린샷 저장 실패: %s" % str(e))

            # 선택 버튼 클릭
            click(select_btn_pattern)
            log(u"        -> 선택 버튼 클릭")

            # 보고서인쇄 창이 뜰 때까지 대기 (최대 15초, 시스템 느릴 수 있음)
            sleep(WAIT_MEDIUM)  # 창이 완전히 로드될 때까지 대기

            # X 버튼 클릭 (새 함수 사용)
            if click_print_report_close_btn():
                log(u"        -> 보고서인쇄 X 클릭 성공")

                # 변액보험리포트 창이 다시 나타날 때까지 대기 (최대 15초)
                if exists(IMG_REPORT_HEADER, 15):
                    log(u"        -> 변액보험리포트 창 복귀 확인")
                else:
                    log(u"        [WARN] 변액보험리포트 창 복귀 지연")
                    sleep(WAIT_MEDIUM)  # fallback

                # 알림 팝업이 떴는지 확인 ("미리보기 목록이 없습니다" 등)
                if exists(IMG_ALERT_CONFIRM_BTN, 1):
                    click(IMG_ALERT_CONFIRM_BTN)
                    log(u"        [WARN] 알림 팝업 닫음 - 미리보기 버튼 오클릭?")
                    sleep(WAIT_SHORT)
                    # X 버튼 다시 클릭
                    if click_print_report_close_btn():
                        log(u"        -> 보고서인쇄 X 재클릭 성공")
                        # 변액보험리포트 창 복귀 대기
                        if not exists(IMG_REPORT_HEADER, 15):
                            sleep(WAIT_MEDIUM)
            else:
                log(u"        [ERROR] 보고서인쇄 X 버튼 못 찾음")
                break

            # 다음 행으로
            current_y += ROW_HEIGHT
            empty_row_count = 0

        else:
            # 실패: 빈 행이거나 클릭 안됨
            empty_row_count += 1
            log(u"    Y=%d 빈 행 (연속 %d회)" % (current_y, empty_row_count))

            if empty_row_count >= MAX_EMPTY_ROWS:
                log(u"    [END] 연속 %d회 빈 행 - 총 %d개 클릭 완료" % (empty_row_count, total_clicked))
                break

            current_y += ROW_HEIGHT

    log(u"")
    log(u"    === 총 %d개 리포트 클릭 완료 (클릭된 Y: %d개) ===" % (total_clicked, len(clicked_y_set)))
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


def click_print_report_close_btn():
    """
    보고서인쇄 창의 X 버튼 클릭 (미리보기 버튼 기준 상대 좌표 방식)

    방법 1: 미리보기 버튼을 찾아서 상대 좌표로 X 버튼 클릭 (가장 정확)
    방법 2: ESC 키로 창 닫기 (fallback)
    방법 3: X 버튼 이미지 매칭 (최후 수단)

    Returns:
        bool: 클릭 성공 여부
    """
    # 방법 1: 미리보기 버튼 기준 상대 좌표로 X 버튼 클릭
    preview_pattern = Pattern(IMG_PREVIEW_BTN).similar(0.8)
    if exists(preview_pattern, 2):
        preview_match = find(preview_pattern)
        preview_x = preview_match.getCenter().getX()
        preview_y = preview_match.getCenter().getY()

        # X 버튼 위치 계산 (미리보기 버튼에서 오른쪽 위)
        close_x = preview_x + PREVIEW_TO_CLOSE_X
        close_y = preview_y + PREVIEW_TO_CLOSE_Y

        log(u"        [X버튼] 미리보기 기준: (%d, %d) -> X버튼: (%d, %d)" % (preview_x, preview_y, close_x, close_y))
        click(Location(close_x, close_y))
        return True

    # 방법 2: ESC 키로 창 닫기 시도
    log(u"        [X버튼] 미리보기 버튼 못 찾음 - ESC 키 시도")
    type(Key.ESC)
    sleep(0.5)

    # ESC로 닫혔는지 확인 (변액보험리포트 헤더가 보이면 성공)
    if exists(IMG_REPORT_HEADER, 3):
        log(u"        [X버튼] ESC 키로 창 닫기 성공")
        return True

    # 방법 3: 기존 X 버튼 이미지 매칭 (최후 수단)
    log(u"        [X버튼] ESC 실패 - 이미지 매칭 시도")
    print_close_pattern = Pattern(IMG_PRINT_REPORT_CLOSE_BTN).similar(0.85)
    if exists(print_close_pattern, 3):
        click(print_close_pattern)
        log(u"        [X버튼] 이미지 매칭으로 클릭")
        return True

    log(u"        [X버튼] 모든 방법 실패")
    return False


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

    # 변액보험리포트 창이 뜰 때까지 대기 (최대 20초, 시스템 느릴 수 있음)
    log(u"    변액보험리포트 창 대기 중...")
    if exists(IMG_REPORT_HEADER, 20):
        log(u"    변액보험리포트 창 표시됨")
    else:
        log(u"    [WARN] 변액보험리포트 창 로딩 지연 - 추가 대기")
        sleep(WAIT_LONG)

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

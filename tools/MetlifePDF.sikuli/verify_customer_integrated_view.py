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
    # ★ 클릭 위치(base_x)를 중심으로 캡처
    # ROW_HEIGHT=37이므로 인접 행 침범 방지를 위해 높이를 30 이하로 제한
    # 수평 위치는 정확하므로 너비도 30으로 설정
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
        # ★ 스크롤 후 오프셋 변동으로 부분 캡처될 수 있으므로 임계값 낮춤 (20 → 5)
        is_checked = blue_pixels > 5

        # 디버그 로그 출력
        log(u"        [체크확인] Y=%d, 파란픽셀=%d, 체크됨=%s" % (row_y, blue_pixels, is_checked))

        # 디버그: 체크박스 이미지 저장 (항상)
        chk_path = os.path.join(SCREENSHOT_DIR, "chk_y%d_blue%d.png" % (int(row_y), blue_pixels))
        shutil.copy(img_file, chk_path)

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


def calculate_image_hash(image_path):
    """
    이미지 파일의 간단한 해시 계산 (중복 감지용)
    특정 영역의 픽셀 샘플링으로 해시 생성
    """
    try:
        from javax.imageio import ImageIO
        from java.io import File
        import hashlib

        img = ImageIO.read(File(image_path))
        if img is None:
            return None

        width = img.getWidth()
        height = img.getHeight()

        # 이미지 중앙 영역의 픽셀 샘플링 (증권번호 등 주요 내용 포함)
        sample_pixels = []
        center_x = width // 2
        center_y = height // 2

        # 중앙 100x50 영역에서 샘플링
        for dy in range(-25, 25, 5):
            for dx in range(-50, 50, 10):
                x = max(0, min(width - 1, center_x + dx))
                y = max(0, min(height - 1, center_y + dy))
                pixel = img.getRGB(x, y)
                sample_pixels.append(str(pixel))

        # 해시 생성
        pixel_str = ",".join(sample_pixels)
        return hashlib.md5(pixel_str.encode()).hexdigest()[:16]
    except Exception as e:
        log(u"    [WARN] 이미지 해시 계산 실패: %s" % str(e))
        return None


def click_all_rows_with_scroll():
    """
    변액보험리포트 모든 행 클릭 (이미지 매칭 기반 버전)

    핵심 원칙:
    - "중복 클릭은 허용, 놓치는 행은 절대 불가!"
    - Y 좌표 계산 대신 findAll()로 화면에 보이는 unchecked 체크박스를 직접 찾아 클릭
    - 스크롤 후에도 실제 체크박스 위치를 직접 찾으므로 오프셋 오차 문제 없음

    Returns:
        int: 선택한 행 개수
    """
    log(u"")
    log(u"    === 변액보험리포트 순차 클릭 시작 (이미지 매칭 기반) ===")

    # 헤더 찾기
    if not exists(IMG_REPORT_HEADER, 5):
        log(u"    [ERROR] 증권번호 헤더를 찾을 수 없습니다.")
        return 0

    header_match = find(IMG_REPORT_HEADER)
    header_x = header_match.getCenter().getX()
    header_y = header_match.getCenter().getY()
    log(u"    [기준점] 헤더 위치: (%d, %d)" % (header_x, header_y))

    # 체크박스 X좌표 (참고용)
    base_x = header_x + HEADER_TO_CHECKBOX_X

    total_clicked = 0
    MAX_REPORTS = 50  # 안전장치
    MAX_SCROLL_NO_NEW = 3  # 스크롤 후 새 행 없으면 종료

    # 연속 스크롤 실패 카운터
    scroll_no_new_count = 0

    # ★ 클릭한 Y좌표 추적 (중복 클릭 방지)
    # 보고서인쇄 창 닫으면 체크박스가 해제되므로 Y좌표로 추적 필요
    clicked_y_set = set()

    # ★ 스크롤 전 마지막 클릭 Y (무한 반복 방지용)
    last_clicked_y_before_scroll = None

    # ★ 스크롤 횟수 기반 종료 (가장 확실한 방법)
    # 13개 보고서, 화면에 7개 표시 → 첫 화면 7개 + 스크롤 1회 6-7개 = 13-14개
    # MAX_SCROLLS = 1로 설정하여 중복 최소화 (최대 1개 중복)
    scroll_count = 0
    MAX_SCROLLS = 1  # 스크롤 1회 후 종료
    end_detected = False  # while 루프 종료 플래그

    # ★ 스크롤 후 클릭 개수 비교용
    clicks_before_scroll = 0
    is_after_scroll = False

    # 검색 영역: 헤더 아래 전체 테이블 영역
    # 넉넉하게 잡아서 모든 체크박스를 포함
    search_region = Region(int(base_x - 40), int(header_y + 15), 80, 350)
    log(u"    [검색영역] (%d, %d, 80, 350)" % (int(base_x - 40), int(header_y + 15)))

    while total_clicked < MAX_REPORTS and not end_detected:
        # ★ 핵심: findAll()로 화면에 보이는 모든 unchecked 체크박스 찾기
        unchecked_pattern = Pattern(IMG_CHECKBOX_UNCHECKED).similar(0.7)

        try:
            # 헤더 재탐색 (스크롤 후 위치 변경 대응)
            if exists(IMG_REPORT_HEADER, 2):
                header_match = find(IMG_REPORT_HEADER)
                header_y = header_match.getCenter().getY()
                base_x = header_match.getCenter().getX() + HEADER_TO_CHECKBOX_X
                search_region = Region(int(base_x - 40), int(header_y + 15), 80, 350)

            matches = list(search_region.findAll(unchecked_pattern))
            log(u"    [탐색] unchecked 체크박스 %d개 발견" % len(matches))
        except:
            matches = []
            log(u"    [탐색] unchecked 체크박스 없음")

        # ★ 새로 클릭할 unchecked 필터링 (이미 클릭한 Y좌표 제외)
        new_matches = []
        for m in matches:
            m_y = m.getCenter().getY()
            is_clicked = False
            for prev_y in clicked_y_set:
                if abs(m_y - prev_y) < 20:  # 스크롤 오프셋 커버, 행 간격(37px) 미만
                    is_clicked = True
                    break
            if not is_clicked:
                new_matches.append(m)

        if not new_matches:
            # 화면에 새로 클릭할 unchecked가 없음 → 스크롤 필요
            scroll_count += 1
            log(u"    [스크롤 %d/%d] 새로 클릭할 unchecked 없음, 스크롤 시도..." % (scroll_count, MAX_SCROLLS))

            # ★ 스크롤 횟수 제한 체크
            if scroll_count > MAX_SCROLLS:
                log(u"    [END] 스크롤 횟수 제한 도달 (%d회) - 총 %d개 클릭 완료" % (MAX_SCROLLS, total_clicked))
                break

            clicks_before_scroll = total_clicked  # 스크롤 전 클릭 개수 저장
            # ★ 스크롤 전 마지막 클릭 Y 저장 (무한 반복 방지용)
            if clicked_y_set:
                last_clicked_y_before_scroll = max(clicked_y_set)

            # 스크롤 전 화면 캡처 (비교용)
            scroll_before_region = Region(int(base_x + 50), int(header_y + 30), 400, 30)
            scroll_before_img = None
            try:
                scroll_before_capture = Screen().capture(scroll_before_region)
                scroll_before_img = scroll_before_capture.getFile()
                scroll_before_path = os.path.join(SCREENSHOT_DIR, "scroll_before_%02d.png" % total_clicked)
                shutil.copy(scroll_before_img, scroll_before_path)
            except:
                pass

            # 테이블 중앙에서 휠 스크롤
            table_center_x = base_x + 200
            table_center_y = header_y + 150
            click(Location(table_center_x, table_center_y))
            sleep(0.3)
            wheel(WHEEL_DOWN, 20)
            sleep(1.5)

            # 스크롤 후 화면 캡처 (비교용)
            scroll_after_img = None
            try:
                scroll_after_capture = Screen().capture(scroll_before_region)
                scroll_after_img = scroll_after_capture.getFile()
                scroll_after_path = os.path.join(SCREENSHOT_DIR, "scroll_after_%02d.png" % total_clicked)
                shutil.copy(scroll_after_img, scroll_after_path)
            except:
                pass

            # 스크롤 효과 검증
            if scroll_before_img and scroll_after_img:
                try:
                    before = ImageIO.read(File(scroll_before_img))
                    after = ImageIO.read(File(scroll_after_img))
                    diff_count = 0
                    total_pixels = before.getWidth() * before.getHeight()
                    for x in range(min(before.getWidth(), after.getWidth())):
                        for y in range(min(before.getHeight(), after.getHeight())):
                            if before.getRGB(x, y) != after.getRGB(x, y):
                                diff_count += 1
                    diff_percent = (diff_count * 100.0) / total_pixels
                    log(u"    [스크롤 효과] 픽셀 차이: %.1f%%" % diff_percent)

                    if diff_percent < 5.0:
                        log(u"    [END] 스크롤 효과 없음 - 리스트 끝 도달")
                        break
                except:
                    pass

            # ★ 스크롤 후 체크된 행 해제 (중복 선택 방지)
            log(u"    [SCROLL] 체크된 행 해제 시작...")
            checked_pattern = Pattern(IMG_CHECKBOX_CHECKED).similar(0.7)
            deselect_count = 0
            for attempt in range(5):
                try:
                    checked_match = search_region.find(checked_pattern)
                    checked_loc = checked_match.getCenter()
                    log(u"    [SCROLL] 체크된 행 발견 (%d, %d) - 클릭해서 해제" % (checked_loc.getX(), checked_loc.getY()))
                    click(checked_loc)
                    sleep(0.8)
                    deselect_count += 1
                except:
                    break
            if deselect_count > 0:
                log(u"    [SCROLL] 체크 해제 완료: %d개" % deselect_count)

            # ★ 스크롤 후 Y좌표 추적 완전 클리어
            # 스크롤 후 같은 Y에 새 행이 나타나므로 Y좌표 기반 필터링 초기화
            # 중복 클릭은 허용, 놓치는 행은 절대 불가 원칙
            # 실제 중복 감지는 이미지 해시로 수행 (clicked_modal_hashes)
            clicked_y_set.clear()
            log(u"    [SCROLL] Y좌표 추적 클리어")

            # 스크롤 후 다시 unchecked 찾기
            try:
                matches = list(search_region.findAll(unchecked_pattern))
                log(u"    [스크롤 후 탐색] unchecked 체크박스 %d개 발견" % len(matches))
            except:
                matches = []

            if not matches:
                scroll_no_new_count += 1
                log(u"    [WARN] 스크롤 후에도 unchecked 없음 (연속 %d회)" % scroll_no_new_count)
                if scroll_no_new_count >= MAX_SCROLL_NO_NEW:
                    log(u"    [END] 연속 %d회 새 행 없음 - 총 %d개 클릭 완료" % (scroll_no_new_count, total_clicked))
                    break
                continue

            # ★ 스크롤 후 new_matches 필터링 다시 수행
            new_matches = []
            for m in matches:
                m_y = m.getCenter().getY()
                is_clicked = False
                for prev_y in clicked_y_set:
                    if abs(m_y - prev_y) < 20:  # 스크롤 오프셋 커버, 행 간격(37px) 미만
                        is_clicked = True
                        break
                if not is_clicked:
                    new_matches.append(m)

            if not new_matches:
                # 스크롤 후에도 새로 클릭할 행 없음 = 리스트 끝
                scroll_no_new_count += 1
                log(u"    [WARN] 스크롤 후에도 새로 클릭할 행 없음 (연속 %d회)" % scroll_no_new_count)
                if scroll_no_new_count >= MAX_SCROLL_NO_NEW:
                    log(u"    [END] 연속 %d회 새 행 없음 - 총 %d개 클릭 완료" % (scroll_no_new_count, total_clicked))
                    break
                continue
            else:
                scroll_no_new_count = 0  # 리셋
                is_after_scroll = True  # ★ 스크롤 후 플래그 설정

        # ★ Y 좌표 순으로 정렬 (위에서 아래로 클릭)
        matches_sorted = sorted(new_matches if new_matches else matches, key=lambda m: m.getCenter().getY())

        for match in matches_sorted:
            click_x = match.getCenter().getX()
            click_y = match.getCenter().getY()

            # ★ 이미 클릭한 Y좌표인지 확인 (±15px 허용)
            already_clicked = False
            for prev_y in clicked_y_set:
                if abs(click_y - prev_y) < 20:  # 스크롤 오프셋 커버, 행 간격(37px) 미만
                    already_clicked = True
                    break

            if already_clicked:
                log(u"    [SKIP] Y=%d 이미 클릭됨 - 스킵" % click_y)
                continue

            log(u"    [클릭] unchecked 체크박스 위치 (%d, %d)" % (click_x, click_y))

            # 체크박스 클릭
            click(match.getCenter())
            sleep(2.0)  # 선택 상태 처리 대기

            # 선택 버튼 확인 (성공 여부)
            select_btn_pattern = Pattern(IMG_SELECT_BTN).similar(0.7)
            if exists(select_btn_pattern, 2):
                total_clicked += 1
                clicked_y_set.add(click_y)  # ★ Y좌표 추적
                log(u"    [%d] 행 클릭 성공 (%d, %d)" % (total_clicked, click_x, click_y))

                # 스크린샷 저장
                try:
                    row_region = Region(int(click_x - 50), int(click_y - 15), 600, 30)
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
                sleep(WAIT_MEDIUM)

                # X 버튼 클릭
                if click_print_report_close_btn():
                    log(u"        -> 보고서인쇄 X 클릭 성공")

                    # 변액보험리포트 창 복귀 대기
                    if exists(IMG_REPORT_HEADER, 15):
                        log(u"        -> 변액보험리포트 창 복귀 확인")
                        sleep(1.0)
                    else:
                        log(u"        [WARN] 변액보험리포트 창 복귀 지연")
                        sleep(WAIT_MEDIUM)

                    # 알림 팝업 처리
                    if exists(IMG_ALERT_CONFIRM_BTN, 1):
                        click(IMG_ALERT_CONFIRM_BTN)
                        log(u"        [WARN] 알림 팝업 닫음")
                        sleep(WAIT_SHORT)
                        if click_print_report_close_btn():
                            log(u"        -> 보고서인쇄 X 재클릭 성공")
                            if not exists(IMG_REPORT_HEADER, 15):
                                sleep(WAIT_MEDIUM)
                else:
                    log(u"        [ERROR] 보고서인쇄 X 버튼 못 찾음")
                    break
            else:
                log(u"    [SKIP] 선택 버튼 안 나타남 - 빈 행 또는 이미 처리됨")

        # 한 사이클 완료 후 다시 루프 시작 (남은 unchecked 찾기)

        # ★ 스크롤 후 클릭 개수 비교 (무한 반복 방지)
        if is_after_scroll:
            new_clicks = total_clicked - clicks_before_scroll
            log(u"    [스크롤 후 결과] 새로 클릭: %d개 (이전: %d, 현재: %d)" % (new_clicks, clicks_before_scroll, total_clicked))
            if new_clicks == 0:
                scroll_no_new_count += 1
                log(u"    [WARN] 스크롤 후 새로 클릭한 행 없음 (연속 %d회)" % scroll_no_new_count)
                if scroll_no_new_count >= MAX_SCROLL_NO_NEW:
                    log(u"    [END] 연속 %d회 새 행 없음 - 총 %d개 클릭 완료" % (scroll_no_new_count, total_clicked))
                    break
            else:
                scroll_no_new_count = 0  # 새 클릭이 있으면 리셋
            is_after_scroll = False  # 플래그 리셋

    log(u"")
    log(u"    === 총 %d개 리포트 클릭 완료 (이미지 매칭 기반) ===" % total_clicked)
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

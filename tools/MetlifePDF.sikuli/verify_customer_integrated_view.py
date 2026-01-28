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
ERROR_DIR = os.path.join(SCRIPT_DIR, "errors")  # 오류 전용 폴더
ERROR_LOG_FILE = os.path.join(ERROR_DIR, "error_log.txt")  # 오류 로그 파일

# 스크린샷 폴더 생성
if not os.path.exists(SCREENSHOT_DIR):
    os.makedirs(SCREENSHOT_DIR)

# 오류 전용 폴더 생성
if not os.path.exists(ERROR_DIR):
    os.makedirs(ERROR_DIR)

# 이미지 경로 설정
IMG_CUSTOMER_INTEGRATED_VIEW_BTN = "img/1769492134172.png"  # 고객통합뷰 버튼
IMG_INTEGRATED_VIEW_CLOSE_BTN = "img/1769492160505.png"  # 고객통합뷰 X 버튼
IMG_VARIABLE_INSURANCE_REPORT_BTN = "img/1769492311473.png"  # 변액보험리포트 버튼
IMG_VARIABLE_REPORT_CLOSE_BTN = "img/1769493031653.png"  # 변액보험리포트 팝업 X 버튼
IMG_ALERT_CONFIRM_BTN = "img/1769516264265.png"  # 알림 팝업 확인 버튼
IMG_ALERT_MESSAGE = "img/1769516255683.png"  # 알림 메시지 "한개의 증번만 선택이 가능합니다"
# 변액보험 없음 관련 이미지
IMG_NO_VARIABLE_CONTRACT_ALERT = "img/1769593341011.png"  # "변액계약이 존재하지 않습니다" 메시지
IMG_NO_VARIABLE_CONTRACT_CONFIRM = "img/1769593349127.png"  # 알림창 확인 버튼
IMG_PREVIEW_BTN = "img/1769561871974.png"  # 보고서인쇄 창 미리보기 버튼

# 변액보험리포트 행 클릭용 이미지
IMG_REPORT_HEADER = "img/1769494674991.png"  # 증권번호 헤더
IMG_SELECT_BTN = "img/1769515056052.png"  # 선택 버튼
IMG_CHECKBOX_UNCHECKED = "img/1769504923688.png"  # 체크 안 된 체크박스
IMG_CHECKBOX_CHECKED = "img/1769506230936.png"  # 체크된 체크박스 (선택됨)
IMG_PRINT_REPORT_CLOSE_BTN = "img/1769515114596.png"  # 보고서인쇄 창 X 버튼

# PDF 저장 관련 이미지 (새로 캡처)
IMG_CONTRACT_INFO_CHECK = "img/1769584392130.png"    # 계약사항및 기타 체크박스 (새 캡처)
IMG_FUND_HISTORY_CHECK = "img/1769584404928.png"     # 펀드이력관리 체크박스 (새 캡처)
IMG_ARROW_RIGHT_BTN = "img/1769013422226.png"        # > 버튼
IMG_PREVIEW_PDF_BTN = "img/1769575452172.png"        # 미리보기 버튼 (새로 캡처)
IMG_PDF_SAVE_BTN = "img/1769013494879.png"           # PDF 저장 아이콘
IMG_SAVE_S_BTN = "img/1769013531968.png"             # 저장(S) 버튼
IMG_NO_BTN = "img/1769099551754.png"                 # 아니요(N) 버튼
IMG_CANCEL_BTN = "img/1769099662780.png"             # 취소 버튼
IMG_YES_BTN = "img/1769013568800.png"                # 예(Y) 버튼
IMG_REPORT_PRINT_X_BTN = "img/1769013600633.png"     # 보고서인쇄 X 버튼 (MetlifePDF용)

# 행 클릭 오프셋 설정 (보정 완료)
ROW_HEIGHT = 37  # 행 간격
VISIBLE_ROWS = 7  # 스크롤 없을 때 보이는 최대 행 수 (모달에 7개 표시)
HEADER_TO_CHECKBOX_X = -54  # 증권번호 헤더에서 체크박스까지 X 오프셋
HEADER_TO_FIRST_ROW_Y = 33  # 증권번호 헤더에서 첫 번째 행까지 Y 오프셋

# 보고서인쇄 창 X 버튼 오프셋 (미리보기 버튼 기준)
PREVIEW_TO_CLOSE_X = 15   # 미리보기 버튼에서 X 버튼까지 X 오프셋
PREVIEW_TO_CLOSE_Y = -48  # 미리보기 버튼에서 X 버튼까지 Y 오프셋

# 보고서인쇄 창 상대 좌표 오프셋 (> 버튼 기준)
# 스크린샷 분석 결과: > 버튼 Y=586 기준
# - 전체선택/취소: Y=550 (오프셋 -36) ← 이전에 잘못 클릭됨
# - 계약사항및 기타: Y≈564 (오프셋 -22) ← 수정됨
# - 펀드이력관리: Y=577 (오프셋 -9)
ARROW_TO_CONTRACT_CHECK_X = -276   # > 버튼 → 계약사항및기타 체크박스
ARROW_TO_CONTRACT_CHECK_Y = -22    # 수정: -36 → -22 (전체선택/취소 대신 계약사항및기타 클릭)
ARROW_TO_FUND_CHECK_X = -276       # > 버튼 → 펀드이력관리 체크박스
ARROW_TO_FUND_CHECK_Y = -9
ARROW_TO_PREVIEW_BTN_X = 237       # > 버튼 → 미리보기 버튼
ARROW_TO_PREVIEW_BTN_Y = -155
ARROW_TO_CLOSE_BTN_X = 18          # > 버튼 → X 버튼 (스크린샷 기준 재계산)
ARROW_TO_CLOSE_BTN_Y = -344

# 기존 이미지 (고객등록/조회 페이지)
IMG_CLOSE_BTN = "img/1769234950471.png"  # 고객등록/조회 종료(x) 버튼

# 대기 시간 설정
WAIT_SHORT = 1
WAIT_MEDIUM = 3
WAIT_LONG = 5

# PDF 저장 결과 추적 (전역)
save_results = []  # [{'report_num': 1, 'saved': True, 'duplicate': False, 'error': None}, ...]

# 스크린샷 전역 순서 카운터 (처음부터 끝까지 연속 번호)
global_screenshot_counter = 0


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


def log_error(report_number, error_msg):
    """
    오류 발생 시 별도 로그 파일에 기록

    Args:
        report_number: 보고서 번호
        error_msg: 오류 메시지
    """
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    error_line = u"[%s] 보고서 #%d: %s" % (timestamp, report_number, error_msg)

    # 유니코드 처리
    if isinstance(error_line, str):
        error_line = error_line.decode("utf-8", errors="replace")

    with codecs.open(ERROR_LOG_FILE, "a", encoding="utf-8") as f:
        f.write(error_line + u"\n")

    log(u"    [ERROR LOG] 오류 로그 저장: %s" % ERROR_LOG_FILE)


def capture_error_screenshot(report_number, step_name):
    """
    오류 발생 시 별도 폴더에 스크린샷 저장 (전역 순서 번호 포함)

    Args:
        report_number: 보고서 번호
        step_name: 단계 이름

    Returns:
        str: 저장된 파일 경로

    파일명 형식: 015_ERROR_report01_timeout.png (전역순서_ERROR_보고서번호_단계명)
    - 오류 스크린샷도 전역 순서에 포함되어 문제 발생 시점을 바로 확인 가능
    """
    global global_screenshot_counter

    try:
        # 전역 순서 카운터 증가
        global_screenshot_counter += 1
        seq_num = global_screenshot_counter

        screen = Screen()
        capture = screen.capture(screen.getBounds())
        # 파일명 형식: 015_ERROR_report01_timeout.png
        filename = "%03d_ERROR_report%02d_%s.png" % (seq_num, report_number, step_name)
        screenshot_path = os.path.join(ERROR_DIR, filename)
        shutil.copy(capture.getFile(), screenshot_path)
        log(u"    [ERROR SCREENSHOT #%03d] %s" % (seq_num, filename))
        return screenshot_path
    except Exception as e:
        log(u"    [WARN] 오류 스크린샷 저장 실패: %s" % str(e))
        return None


def copy_report_screenshots_to_error_folder(report_number):
    """
    오류 발생 시 해당 보고서의 모든 스크린샷을 오류 폴더로 복사

    Args:
        report_number: 보고서 번호

    파일명 패턴: XXX_report01_*.png (전역순서_report보고서번호_단계명)
    """
    try:
        # 해당 보고서의 스크린샷 패턴: *_report%02d_*.png
        pattern = "_report%02d_" % report_number
        copied_count = 0

        for filename in os.listdir(SCREENSHOT_DIR):
            if pattern in filename and filename.endswith('.png'):
                src_path = os.path.join(SCREENSHOT_DIR, filename)
                dst_path = os.path.join(ERROR_DIR, filename)
                shutil.copy(src_path, dst_path)
                copied_count += 1

        if copied_count > 0:
            log(u"    [ERROR] 보고서 #%d의 스크린샷 %d개를 오류 폴더로 복사 완료" % (report_number, copied_count))
            log(u"    [ERROR] 오류 폴더 위치: %s" % ERROR_DIR)
    except Exception as e:
        log(u"    [WARN] 스크린샷 복사 실패: %s" % str(e))


def capture_and_exit(reason):
    """
    예상치 못한 상황 발생 시 화면 캡처 후 종료 (전역 순서 번호 포함)

    Args:
        reason: 종료 사유
    """
    global global_screenshot_counter

    log(u"")
    log(u"=" * 60)
    log(u"[ABORT] 예상치 못한 상황 발생!")
    log(u"    사유: %s" % reason)
    log(u"=" * 60)

    # 전체 화면 캡처 (전역 순서 번호 포함)
    try:
        global_screenshot_counter += 1
        seq_num = global_screenshot_counter

        screen = Screen()
        capture = screen.capture(screen.getBounds())
        # 파일명 형식: 001_ABORT_reason.png
        filename = "%03d_ABORT.png" % seq_num
        screenshot_path = os.path.join(SCREENSHOT_DIR, filename)
        shutil.copy(capture.getFile(), screenshot_path)
        log(u"    [스크린샷 #%03d] %s" % (seq_num, filename))
    except Exception as e:
        log(u"    [WARN] 스크린샷 저장 실패: %s" % str(e))

    log(u"")
    log(u"=== 테스트 강제 종료 ===")
    sys.exit(1)


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
        wheel(WHEEL_UP, 3)
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

            # 스크롤 전 화면 캡처 (전역 순서 + 전체 화면)
            scroll_before_region = Region(int(base_x + 50), int(header_y + 30), 400, 30)
            scroll_before_img = None
            try:
                global global_screenshot_counter
                global_screenshot_counter += 1
                seq_num = global_screenshot_counter

                # 전체 화면 캡처 (전역 순서용)
                screen = Screen()
                full_capture = screen.capture(screen.getBounds())
                full_filename = "%03d_scroll_before.png" % seq_num
                full_path = os.path.join(SCREENSHOT_DIR, full_filename)
                shutil.copy(full_capture.getFile(), full_path)
                log(u"    [스크린샷 #%03d] %s" % (seq_num, full_filename))

                # 비교용 부분 캡처 (별도 저장)
                scroll_before_capture = Screen().capture(scroll_before_region)
                scroll_before_img = scroll_before_capture.getFile()
            except:
                pass

            # 테이블 영역 클릭 후 마우스 휠로 스크롤
            table_center_x = base_x + 200
            table_center_y = header_y + 150
            click(Location(table_center_x, table_center_y))
            sleep(0.3)
            # 마우스 휠로 스크롤
            wheel(WHEEL_DOWN, 5)
            sleep(1.0)

            # 스크롤 후 화면 캡처 (전역 순서 + 전체 화면)
            scroll_after_img = None
            try:
                global_screenshot_counter += 1
                seq_num = global_screenshot_counter

                # 전체 화면 캡처 (전역 순서용)
                screen = Screen()
                full_capture = screen.capture(screen.getBounds())
                full_filename = "%03d_scroll_after.png" % seq_num
                full_path = os.path.join(SCREENSHOT_DIR, full_filename)
                shutil.copy(full_capture.getFile(), full_path)
                log(u"    [스크린샷 #%03d] %s" % (seq_num, full_filename))

                # 비교용 부분 캡처 (별도 저장)
                scroll_after_capture = Screen().capture(scroll_before_region)
                scroll_after_img = scroll_after_capture.getFile()
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

                # 스크린샷 저장 (전역 순서 번호 + 전체 화면)
                try:
                    global global_screenshot_counter

                    # 전체 화면 스크린샷 (전역 순서용)
                    global_screenshot_counter += 1
                    seq_num = global_screenshot_counter
                    screen = Screen()
                    full_capture = screen.capture(screen.getBounds())
                    full_filename = "%03d_row_click_report%02d.png" % (seq_num, total_clicked)
                    screenshot_path = os.path.join(SCREENSHOT_DIR, full_filename)
                    shutil.copy(full_capture.getFile(), screenshot_path)
                    log(u"        [스크린샷 #%03d] %s" % (seq_num, full_filename))
                except Exception as e:
                    log(u"        [WARN] 스크린샷 저장 실패: %s" % str(e))

                # 선택 버튼 클릭
                click(select_btn_pattern)
                log(u"        -> 선택 버튼 클릭")
                sleep(WAIT_MEDIUM)

                # [NEW] PDF 저장 수행
                pdf_result = save_report_pdf(total_clicked)
                save_results.append(pdf_result)

                if pdf_result['success']:
                    if pdf_result['saved']:
                        log(u"        -> PDF 저장 성공")
                    elif pdf_result['duplicate']:
                        log(u"        -> 중복 파일 스킵")
                else:
                    log(u"        [ERROR] PDF 저장 실패: %s" % pdf_result.get('error', 'unknown'))

                # 변액보험리포트 창 복귀 대기
                if exists(IMG_REPORT_HEADER, 15):
                    log(u"        -> 변액보험리포트 창 복귀 확인")
                    sleep(1.0)
                else:
                    log(u"        [WARN] 변액보험리포트 창 복귀 지연")
                    sleep(WAIT_MEDIUM)

                # 알림 팝업 처리 (메트라이프 버그: 두 번 클릭 필요)
                if exists(IMG_ALERT_CONFIRM_BTN, 1):
                    click(IMG_ALERT_CONFIRM_BTN)
                    log(u"        [WARN] 알림 팝업 첫 번째 클릭")
                    sleep(1)
                    if exists(IMG_ALERT_CONFIRM_BTN, 1):
                        click(IMG_ALERT_CONFIRM_BTN)
                        log(u"        [WARN] 알림 팝업 두 번째 클릭")
                        sleep(1)
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


def capture_step_screenshot(report_num, step_name):
    """
    단계별 스크린샷 캡처 (전역 순서 번호 포함)

    Args:
        report_num: 보고서 번호
        step_name: 단계 이름 (예: checkbox1, preview, save_dialog)

    Returns:
        str: 저장된 파일 경로

    파일명 형식: 001_report01_before_checkbox1.png (전역순서_보고서번호_단계명)
    - 전역 순서: 처음부터 끝까지 연속 번호 (001, 002, 003...)
    - 파일 탐색기에서 이름순 정렬 시 처리 순서대로 표시됨
    """
    global global_screenshot_counter

    try:
        # 전역 순서 카운터 증가
        global_screenshot_counter += 1
        seq_num = global_screenshot_counter

        screen = Screen()
        capture = screen.capture(screen.getBounds())
        # 파일명 형식: 001_report01_before_checkbox1.png (전역순서_보고서번호_단계명)
        filename = "%03d_report%02d_%s.png" % (seq_num, report_num, step_name)
        filepath = os.path.join(SCREENSHOT_DIR, filename)
        shutil.copy(capture.getFile(), filepath)
        log(u"        [스크린샷 #%03d] %s" % (seq_num, filename))
        return filepath
    except Exception as e:
        log(u"        [WARN] 스크린샷 실패: %s" % str(e))
        return None


def take_screenshot(step_name):
    """
    단계별 스크린샷 캡처 (report_num=0 버전)
    5단계 초기 확인 등 보고서 번호가 없는 단계에서 사용

    Args:
        step_name: 단계 이름

    Returns:
        str: 저장된 파일 경로
    """
    return capture_step_screenshot(0, step_name)


def recover_to_report_list(report_number):
    """
    오류 발생 시 변액보험리포트 팝업(목록 화면)으로 복구

    복구 순서:
    1. ESC 키로 저장 다이얼로그 닫기 시도
    2. Alt+F4로 PDF 뷰어 닫기 시도 (예(Y) 확인 클릭)
    3. 보고서인쇄 창 X 버튼 클릭

    Returns:
        bool: 복구 성공 여부
    """
    log(u"")
    log(u"    [복구 시작] 변액보험리포트 목록으로 복귀 중...")
    capture_error_screenshot(report_number, "recovery_start")

    # Step 1: ESC로 저장 다이얼로그 닫기 시도 (열려있을 수 있음)
    log(u"        [복구 1/3] ESC로 다이얼로그 닫기...")
    type(Key.ESC)
    sleep(1)
    type(Key.ESC)  # 한 번 더 (중첩 다이얼로그 대비)
    sleep(1)

    # Step 2: PDF 뷰어 닫기 (Alt+F4) - PDF 뷰어가 열려있을 경우
    log(u"        [복구 2/3] PDF 뷰어 닫기 시도 (Alt+F4)...")
    # PDF 저장 아이콘이 보이면 PDF 뷰어가 열려있는 것
    if exists(IMG_PDF_SAVE_BTN, 2):
        log(u"        -> PDF 뷰어 열려있음 - Alt+F4로 닫기")
        type(Key.F4, Key.ALT)
        sleep(2)

        # "예(Y)" 확인 버튼 클릭 (저장하지 않고 닫기)
        if exists(IMG_YES_BTN, 3):
            click(IMG_YES_BTN)
            log(u"        -> 예(Y) 버튼 클릭")
            sleep(2)
        else:
            # 예 버튼 못 찾으면 Enter 키로 시도
            type(Key.ENTER)
            log(u"        -> Enter 키로 확인")
            sleep(1)
    else:
        log(u"        -> PDF 뷰어 열려있지 않음")

    # Step 3: 보고서인쇄 창 X 버튼 클릭
    log(u"        [복구 3/3] 보고서인쇄 창 닫기...")
    capture_error_screenshot(report_number, "before_close_print")

    # 방법 1: 보고서인쇄 창 X 버튼 이미지 매칭
    if exists(IMG_PRINT_REPORT_CLOSE_BTN, 3):
        click(IMG_PRINT_REPORT_CLOSE_BTN)
        log(u"        -> 보고서인쇄 X 버튼 클릭")
        sleep(2)
    elif exists(IMG_REPORT_PRINT_X_BTN, 3):
        click(IMG_REPORT_PRINT_X_BTN)
        log(u"        -> 보고서인쇄 X 버튼 클릭 (대체)")
        sleep(2)
    else:
        # 방법 2: 미리보기 버튼 기준 상대 좌표로 X 버튼 클릭
        preview_pattern = Pattern(IMG_PREVIEW_BTN).similar(0.8)
        if exists(preview_pattern, 2):
            preview_match = find(preview_pattern)
            close_x = preview_match.getCenter().getX() + PREVIEW_TO_CLOSE_X
            close_y = preview_match.getCenter().getY() + PREVIEW_TO_CLOSE_Y
            click(Location(close_x, close_y))
            log(u"        -> 상대좌표로 X 버튼 클릭: (%d, %d)" % (close_x, close_y))
            sleep(2)
        else:
            # 방법 3: ESC 키로 닫기 시도
            type(Key.ESC)
            log(u"        -> ESC 키로 닫기 시도")
            sleep(1)

    capture_error_screenshot(report_number, "recovery_complete")

    # 복구 성공 확인: 변액보험리포트 헤더가 보이면 성공
    if exists(IMG_REPORT_HEADER, 3):
        log(u"    [복구 완료] 변액보험리포트 목록으로 복귀 성공")
        return True
    else:
        log(u"    [복구 실패] 변액보험리포트 목록 확인 안됨 - 수동 확인 필요")
        return False


def save_report_pdf(report_number):
    """
    보고서인쇄 창에서 PDF 저장 수행

    Args:
        report_number: 현재 보고서 번호 (로그/스크린샷용)

    Returns:
        dict: {
            'report_num': int,
            'success': bool,
            'saved': bool,      # 실제 저장 성공
            'duplicate': bool,  # 중복 파일로 스킵
            'error': str        # 에러 메시지 (있으면)
        }
    """
    global save_results

    result = {
        'report_num': report_number,
        'success': False,
        'saved': False,
        'duplicate': False,
        'error': None
    }

    log(u"")
    log(u"    ===== PDF 저장 시작 [보고서 #%d] =====" % report_number)

    try:
        # Step 0: > 버튼 찾기 (기준점)
        log(u"    [0/11] > 버튼 찾기 (기준점)...")
        if not exists(IMG_ARROW_RIGHT_BTN, 5):
            result['error'] = u"> 버튼 못 찾음"
            log(u"        [ERROR] %s" % result['error'])
            capture_error_screenshot(report_number, "arrow_btn_not_found")
            log_error(report_number, result['error'])
            # Stack rewinding: 보고서인쇄 창만 열린 상태 → 닫기
            recover_to_report_list(report_number)
            return result
        arrow_match = find(IMG_ARROW_RIGHT_BTN)
        arrow_x = arrow_match.getCenter().getX()
        arrow_y = arrow_match.getCenter().getY()
        log(u"        > 버튼 위치: (%d, %d)" % (arrow_x, arrow_y))

        # Step 1: 계약사항및 기타 체크박스 클릭 (이미지 매칭 방식 - MetlifePDF.py 참고)
        log(u"    [1/11] 계약사항및 기타 체크박스 클릭...")
        sleep(2.0)  # UI 안정화 대기

        # 클릭 전 전체 화면 캡처
        capture_step_screenshot(report_number, "before_checkbox1")

        # 이미지 매칭으로 체크박스 찾아서 클릭 (유사도 0.7로 낮춤)
        contract_pattern = Pattern(IMG_CONTRACT_INFO_CHECK).similar(0.7)
        if exists(contract_pattern, 3):
            contract_match = find(contract_pattern)
            log(u"        [이미지매칭] 계약사항및기타 발견: (%d, %d)" % (
                contract_match.getCenter().getX(), contract_match.getCenter().getY()))
            click(contract_match)
        else:
            log(u"        [WARN] 계약사항및기타 이미지 못 찾음 - 좌표 방식으로 대체")
            contract_x = arrow_x + ARROW_TO_CONTRACT_CHECK_X
            contract_y = arrow_y + ARROW_TO_CONTRACT_CHECK_Y
            click(Location(contract_x, contract_y))
        sleep(2.0)  # 체크박스 반응 대기 (증가)
        capture_step_screenshot(report_number, "after_checkbox1")

        # Step 2: 펀드이력관리 체크박스 클릭 (이미지 매칭 방식)
        log(u"    [2/11] 펀드이력관리 체크박스 클릭...")
        capture_step_screenshot(report_number, "before_checkbox2")

        # 이미지 매칭으로 체크박스 찾아서 클릭 (유사도 0.7로 낮춤)
        fund_pattern = Pattern(IMG_FUND_HISTORY_CHECK).similar(0.7)
        if exists(fund_pattern, 3):
            fund_match = find(fund_pattern)
            log(u"        [이미지매칭] 펀드이력관리 발견: (%d, %d)" % (
                fund_match.getCenter().getX(), fund_match.getCenter().getY()))
            click(fund_match)
        else:
            log(u"        [WARN] 펀드이력관리 이미지 못 찾음 - 좌표 방식으로 대체")
            fund_x = arrow_x + ARROW_TO_FUND_CHECK_X
            fund_y = arrow_y + ARROW_TO_FUND_CHECK_Y
            click(Location(fund_x, fund_y))
        sleep(2.0)  # 체크박스 반응 대기 (증가)
        capture_step_screenshot(report_number, "after_checkbox2")

        # Step 3: > 버튼 클릭
        log(u"    [3/11] > 버튼 클릭...")
        capture_step_screenshot(report_number, "before_arrow")
        log(u"        [좌표] > 버튼 클릭: (%d, %d)" % (arrow_x, arrow_y))
        click(arrow_match)
        sleep(1.0)
        capture_step_screenshot(report_number, "after_arrow")

        # Step 4: 미리보기 버튼 클릭 (이미지 매칭)
        log(u"    [4/11] 미리보기 버튼 클릭...")
        capture_step_screenshot(report_number, "before_preview")
        preview_pattern = Pattern(IMG_PREVIEW_PDF_BTN).similar(0.8)
        if not exists(preview_pattern, 5):
            result['error'] = u"미리보기 버튼 못 찾음"
            log(u"        [ERROR] %s" % result['error'])
            capture_error_screenshot(report_number, "preview_btn_not_found")
            log_error(report_number, result['error'])
            # Stack rewinding: 보고서인쇄 창만 열린 상태 → 닫기
            recover_to_report_list(report_number)
            return result
        preview_match = find(preview_pattern)
        preview_x = preview_match.getCenter().getX()
        preview_y = preview_match.getCenter().getY()
        log(u"        [좌표] 미리보기 버튼 클릭: (%d, %d)" % (preview_x, preview_y))
        click(preview_match)
        log(u"        -> PDF 로딩 대기 (최대 60초)...")

        # Step 5: PDF 로딩 대기 (30초 타임아웃)
        try:
            wait(IMG_PDF_SAVE_BTN, 30)
            log(u"        -> PDF 로딩 완료")
            capture_step_screenshot(report_number, "preview")
        except:
            result['error'] = u"PDF 로딩 타임아웃 (30초) - 처리중 오류 발생"
            log(u"")
            log(u"    !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
            log(u"    [ERROR] 보고서 #%d 처리 오류 발생!" % report_number)
            log(u"    [ERROR] %s" % result['error'])
            log(u"    !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")

            # 일반 스크린샷 폴더에도 저장
            capture_step_screenshot(report_number, "timeout_error")

            # ★★★ 오류 전용 폴더에 별도 저장 ★★★
            capture_error_screenshot(report_number, "processing_error")
            log_error(report_number, result['error'])

            # "처리중 오류가 발생 하였습니다" 또는 "미리보기 목록이 없습니다" 모달 처리
            # 이 오류는 프로그램 종료 사유가 아님! 확인 버튼 누르고 다음 보고서로 진행
            log(u"        -> 오류 모달 처리 시작 (프로그램 종료 아님!)...")

            # 오류 모달 상태 스크린샷 (오류 폴더에 저장)
            capture_error_screenshot(report_number, "error_modal")

            # 확인 버튼 클릭 (메트라이프 사이트 문제로 두 번 클릭 필요!)
            alert_confirm_pattern = Pattern(IMG_ALERT_CONFIRM_BTN).similar(0.7)
            if exists(alert_confirm_pattern, 3):
                # 첫 번째 클릭
                click(alert_confirm_pattern)
                log(u"        -> 확인 버튼 첫 번째 클릭")
                sleep(1)
                # 두 번째 클릭 (메트라이프 사이트 버그 대응)
                if exists(alert_confirm_pattern, 2):
                    click(alert_confirm_pattern)
                    log(u"        -> 확인 버튼 두 번째 클릭 (메트라이프 버그 대응)")
                    sleep(1)
            else:
                # 이미지 못 찾으면 Enter 키 두 번 시도
                type(Key.ENTER)
                log(u"        -> Enter 키 첫 번째")
                sleep(1)
                type(Key.ENTER)
                log(u"        -> Enter 키 두 번째 (메트라이프 버그 대응)")
                sleep(1)

            # 확인 후 스크린샷
            capture_error_screenshot(report_number, "after_confirm")

            # ★★★ 해당 보고서의 모든 스크린샷을 오류 폴더로 복사 ★★★
            copy_report_screenshots_to_error_folder(report_number)

            # Stack rewinding: 보고서인쇄 창만 닫고 변액보험리포트 목록으로 복구
            # 주의: X 버튼을 여기서 직접 클릭하지 않음! recover_to_report_list()가 처리
            log(u"        -> Stack rewinding 시작 (변액보험리포트 목록으로 복구)...")
            recover_to_report_list(report_number)

            log(u"    [INFO] 보고서 #%d 스킵 - 다음 보고서로 진행" % report_number)
            return result

        # Step 6: PDF 저장 아이콘 클릭
        log(u"    [6/11] PDF 저장 아이콘 클릭...")
        capture_step_screenshot(report_number, "before_save_icon")
        save_btn_match = find(IMG_PDF_SAVE_BTN)
        log(u"        [좌표] 저장 아이콘 클릭: (%d, %d)" % (save_btn_match.getCenter().getX(), save_btn_match.getCenter().getY()))
        click(save_btn_match)
        sleep(2)
        capture_step_screenshot(report_number, "after_save_icon")

        # Step 7: 저장(S) 버튼 클릭
        log(u"    [7/11] 저장(S) 버튼 클릭...")
        capture_step_screenshot(report_number, "before_save_btn")
        if not exists(IMG_SAVE_S_BTN, 5):
            result['error'] = u"저장(S) 버튼 못 찾음"
            log(u"        [ERROR] %s" % result['error'])
            capture_error_screenshot(report_number, "save_btn_not_found")
            log_error(report_number, result['error'])
            # Stack rewinding: 열린 창들을 역순으로 닫아서 변액보험리포트 목록으로 복구
            recover_to_report_list(report_number)
            return result
        save_s_match = find(IMG_SAVE_S_BTN)
        log(u"        [좌표] 저장(S) 버튼 클릭: (%d, %d)" % (save_s_match.getCenter().getX(), save_s_match.getCenter().getY()))
        click(save_s_match)
        sleep(3)
        capture_step_screenshot(report_number, "after_save_btn")

        # Step 8: 중복 파일 확인
        log(u"    [8/11] 중복 파일 확인...")
        if exists(IMG_NO_BTN, 3):
            log(u"        -> 동일 파일 존재! 스킵 처리...")
            capture_step_screenshot(report_number, "duplicate")
            click(IMG_NO_BTN)  # 아니요(N) 클릭
            sleep(WAIT_MEDIUM)
            if exists(IMG_CANCEL_BTN, 3):
                click(IMG_CANCEL_BTN)  # 취소 버튼 클릭
                sleep(WAIT_MEDIUM)
            result['duplicate'] = True
            result['success'] = True
            log(u"        -> 중복 파일 스킵 완료")
        else:
            result['saved'] = True
            result['success'] = True
            log(u"        -> 저장 성공")
            capture_step_screenshot(report_number, "saved")

        # Step 9: PDF 뷰어 종료 (Alt+F4)
        log(u"    [9/11] PDF 뷰어 종료 (Alt+F4)...")
        type(Key.F4, Key.ALT)
        sleep(2)

        # Step 10: 예(Y) 확인 클릭
        log(u"    [10/11] 예(Y) 확인 클릭...")
        if exists(IMG_YES_BTN, 5):
            click(IMG_YES_BTN)
            sleep(2)
            capture_step_screenshot(report_number, "yes_confirm")
        else:
            log(u"        [WARN] 예(Y) 버튼 못 찾음 - 이미 닫힘?")

        # Step 11: 보고서인쇄 창 X 버튼 클릭
        log(u"    [11/11] 보고서인쇄 창 X 버튼 클릭...")
        capture_step_screenshot(report_number, "before_close_x")

        # 이미지 매칭 우선 시도
        x_btn_clicked = False
        if exists(IMG_PRINT_REPORT_CLOSE_BTN, 3):
            x_match = find(IMG_PRINT_REPORT_CLOSE_BTN)
            log(u"        -> 이미지 매칭으로 X 버튼 찾음: (%d, %d)" % (x_match.getCenter().getX(), x_match.getCenter().getY()))
            click(x_match)
            x_btn_clicked = True
            sleep(2)
            capture_step_screenshot(report_number, "after_close_x")
        elif exists(IMG_REPORT_PRINT_X_BTN, 3):
            x_match2 = find(IMG_REPORT_PRINT_X_BTN)
            log(u"        -> 대체 이미지로 X 버튼 찾음: (%d, %d)" % (x_match2.getCenter().getX(), x_match2.getCenter().getY()))
            click(x_match2)
            x_btn_clicked = True
            sleep(2)
            capture_step_screenshot(report_number, "after_close_x")

        # 이미지 매칭 실패 시 상대 좌표로 시도
        if not x_btn_clicked and exists(IMG_ARROW_RIGHT_BTN, 3):
            arrow_match2 = find(IMG_ARROW_RIGHT_BTN)
            close_x = arrow_match2.getCenter().getX() + ARROW_TO_CLOSE_BTN_X
            close_y = arrow_match2.getCenter().getY() + ARROW_TO_CLOSE_BTN_Y
            log(u"        -> 상대 좌표로 X 버튼 클릭: (%d, %d)" % (close_x, close_y))
            click(Location(close_x, close_y))
            x_btn_clicked = True
            sleep(2)
            capture_step_screenshot(report_number, "after_close_x")

        if not x_btn_clicked:
            # fallback: ESC 키로 닫기 시도
            log(u"        [WARN] X 버튼 못 찾음 - ESC 시도")
            type(Key.ESC)
            sleep(1)

        log(u"    ===== PDF 저장 완료 [보고서 #%d] =====" % report_number)
        return result

    except Exception as e:
        result['error'] = str(e)
        log(u"    [ERROR] PDF 저장 예외: %s" % str(e))
        capture_error_screenshot(report_number, "exception")
        log_error(report_number, str(e))
        # Stack rewinding: 예외 발생 시 열린 창들 모두 닫기
        recover_to_report_list(report_number)
        return result


def print_final_report():
    """최종 저장 결과를 테이블로 출력"""
    global save_results

    log(u"")
    log(u"=" * 70)
    log(u"                    PDF 저장 결과 리포트")
    log(u"=" * 70)

    saved_count = 0
    dup_count = 0
    no_variable_count = 0  # 변액계약 미존재 카운트
    error_count = 0
    error_reports = []  # 오류 발생 보고서 목록

    # 1차: 성공/중복/변액없음 보고서 출력
    log(u"")
    log(u"[정상 처리된 보고서]")
    log(u"| No  | 상태       | 비고                                      |")
    log(u"|" + "-" * 68 + "|")

    for r in save_results:
        if r.get('no_variable_contract'):
            status = u"변액없음"
            no_variable_count += 1
            note = u"변액계약이 존재하지 않습니다"
            log(u"| %3s | %-10s | %-40s |" % (
                u"-", status, note[:40]
            ))
        elif r.get('saved'):
            status = u"저장완료"
            saved_count += 1
            note = u""
            log(u"| %3d | %-10s | %-40s |" % (
                r.get('report_num', 0), status, note[:40]
            ))
        elif r.get('duplicate'):
            status = u"중복스킵"
            dup_count += 1
            note = u"기존 파일 유지"
            log(u"| %3d | %-10s | %-40s |" % (
                r.get('report_num', 0), status, note[:40]
            ))
        else:
            error_count += 1
            error_reports.append(r)

    if saved_count + dup_count + no_variable_count == 0:
        log(u"| (없음)                                                          |")

    # 2차: 오류 발생 보고서 별도 출력 (눈에 띄게)
    if error_reports:
        log(u"")
        log(u"!" * 70)
        log(u"!!!!!!!!!!!! [처리 오류 발생 보고서 - 수동 확인 필요] !!!!!!!!!!!!")
        log(u"!" * 70)
        log(u"| No  | 오류 내용                                                  |")
        log(u"|" + "-" * 68 + "|")

        for r in error_reports:
            error_msg = r.get('error', u'알 수 없는 오류')
            log(u"| %3d | %-60s |" % (r.get('report_num', 0), error_msg[:60]))
            log(u"|     | 스크린샷: screenshots/*_%02d_*.png 파일 확인             |" % r.get('report_num', 0))

        log(u"!" * 70)
        log(u"")
        log(u"[중요] 위 보고서들은 PDF 저장에 실패했습니다.")
        log(u"       screenshots/ 폴더의 해당 보고서 스크린샷을 확인하세요.")
        log(u"       파일명 패턴: *_ERROR_*.png 또는 *_timeout_error.png")

    log(u"")
    log(u"=" * 70)
    log(u"총계: 저장완료=%d, 중복스킵=%d, 변액없음=%d, 실패=%d / 전체=%d" % (
        saved_count, dup_count, no_variable_count, error_count, len(save_results)
    ))
    log(u"=" * 70)

    # 성공 여부 판정
    if error_count == 0:
        log(u"")
        log(u"[SUCCESS] 모든 보고서 처리 완료 - 실패 없음!")
    else:
        log(u"")
        log(u"[WARNING] %d개 보고서 저장 실패 - 위 목록 확인 필요" % error_count)

    return error_count == 0


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
        capture_and_exit(u"고객통합뷰 버튼을 찾을 수 없음 - 예상치 못한 화면 상태")

    sleep(WAIT_LONG + 3)  # 고객통합뷰 로딩 대기 (충분히)

    # 3단계: 스크롤 맨 위로 이동
    log(u"")
    log(u"[3단계] 스크롤 맨 위로 이동")
    log(u"    키보드로 스크롤...")
    scroll_to_top()
    sleep(2)  # 스크롤 후 안정화 대기
    log(u"    스크롤 완료")

    # 4단계: 변액보험리포트 클릭
    log(u"")
    log(u"[4단계] 변액보험리포트 클릭")
    if not wait_and_click(IMG_VARIABLE_INSURANCE_REPORT_BTN, u"변액보험리포트 버튼", 15):
        capture_and_exit(u"변액보험리포트 버튼을 찾을 수 없음 - 예상치 못한 화면 상태")

    # 짧은 대기 후 알림창 먼저 확인 (변액보험 없음 알림은 빠르게 나타남)
    sleep(WAIT_MEDIUM)

    # 5단계: 변액계약 존재 여부 확인 (알림창 먼저 체크)
    log(u"")
    log(u"[5단계] 변액계약 존재 여부 확인")

    # save_results 초기화
    global save_results
    save_results = []

    # 변액보험 존재 여부 플래그 (6단계에서 사용)
    variable_insurance_exists = False

    # 스크린샷 캡처 - 현재 상태 기록
    take_screenshot(u"step5_check_variable_insurance")

    # 알림창 확인 (변액계약 미존재)
    # "변액계약이 존재하지 않습니다" 메시지를 명시적으로 인식
    if exists(IMG_NO_VARIABLE_CONTRACT_ALERT, 5):
        log(u"    [INFO] '변액계약이 존재하지 않습니다' 메시지 감지")
        take_screenshot(u"step5_no_variable_contract_alert")
        variable_insurance_exists = False  # 명시적으로 False 설정

        # 결과 기록 (별도 카운트: 변액없음)
        save_results.append({
            'report_num': 0,
            'saved': False,
            'duplicate': False,
            'no_variable_contract': True,
            'error': None
        })

        # 확인 버튼 클릭
        log(u"    변액계약이 존재하지 않습니다 - 확인 버튼 클릭")
        if exists(IMG_NO_VARIABLE_CONTRACT_CONFIRM, 3):
            click(IMG_NO_VARIABLE_CONTRACT_CONFIRM)
            sleep(0.5)
            # 더블클릭 대응: 알림창이 아직 있으면 한 번 더 클릭
            if exists(IMG_NO_VARIABLE_CONTRACT_CONFIRM, 1):
                click(IMG_NO_VARIABLE_CONTRACT_CONFIRM)
        sleep(WAIT_SHORT)

        log(u"    -> 변액계약 미존재로 스킵, 다음 단계로 진행")
    else:
        # 변액보험리포트 창이 뜰 때까지 대기 (최대 15초 추가 대기)
        log(u"    알림창 없음 - 변액보험리포트 창 대기 중...")
        if exists(IMG_REPORT_HEADER, 15):
            log(u"    변액보험리포트 창 표시됨")
            take_screenshot(u"step5_variable_report_popup")
            variable_insurance_exists = True  # 변액보험 존재

            log(u"    변액계약이 존재합니다 - 행 클릭 및 PDF 저장 시작")
            test_row_clicks()

            # 최종 결과 리포트 출력
            log(u"")
            log(u"[5-1단계] PDF 저장 결과 리포트")
            print_final_report()
        else:
            # 변액보험리포트 창도 안 나타남 - 예외 상황
            log(u"    [WARN] 변액보험리포트 창도 안 나타남 - 알림창 재확인")
            take_screenshot(u"step5_unexpected_state")
            variable_insurance_exists = False  # 알 수 없는 상태, 안전하게 False

            # 혹시 늦게 나타난 알림창 재확인
            if exists(IMG_ALERT_CONFIRM_BTN, 3):
                log(u"    -> 늦게 나타난 알림창 감지 - 확인 클릭")
                click(IMG_ALERT_CONFIRM_BTN)
                sleep(0.3)
                click(IMG_ALERT_CONFIRM_BTN)  # 더블클릭
                sleep(WAIT_SHORT)
            else:
                log(u"    [ERROR] 예상치 못한 화면 상태 - 스크린샷 확인 필요")
                take_screenshot(u"step5_ERROR_unknown_state")

    # 6단계: 변액보험리포트 팝업 X 버튼 클릭 (변액보험이 있는 경우에만)
    log(u"")
    log(u"[6단계] 변액보험리포트 팝업 X 버튼 클릭")
    if not variable_insurance_exists:
        log(u"    -> 변액보험이 없어 팝업이 없음, 스킵")
    else:
        if not wait_and_click(IMG_VARIABLE_REPORT_CLOSE_BTN, u"변액보험리포트 X 버튼"):
            capture_and_exit(u"변액보험리포트 X 버튼을 찾을 수 없음 - 예상치 못한 화면 상태")
        sleep(WAIT_SHORT)

    # 7단계: 고객통합뷰 X 버튼 클릭하여 종료
    log(u"")
    log(u"[7단계] 고객통합뷰 X 버튼 클릭하여 종료")
    if not wait_and_click(IMG_INTEGRATED_VIEW_CLOSE_BTN, u"고객통합뷰 X 버튼"):
        capture_and_exit(u"고객통합뷰 X 버튼을 찾을 수 없음 - 예상치 못한 화면 상태")
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

    # 스크린샷 폴더 비우기
    if os.path.exists(SCREENSHOT_DIR):
        for filename in os.listdir(SCREENSHOT_DIR):
            filepath = os.path.join(SCREENSHOT_DIR, filename)
            if os.path.isfile(filepath) and filename.endswith('.png'):
                os.remove(filepath)
        print("[INFO] 스크린샷 폴더 초기화 완료")

    # 오류 폴더 비우기
    if os.path.exists(ERROR_DIR):
        for filename in os.listdir(ERROR_DIR):
            filepath = os.path.join(ERROR_DIR, filename)
            if os.path.isfile(filepath):
                os.remove(filepath)
        print("[INFO] 오류 폴더 초기화 완료")

    success = verify_customer_integrated_view()

    log(u"=== 실행 종료 ===")
    sys.exit(0 if success else 1)

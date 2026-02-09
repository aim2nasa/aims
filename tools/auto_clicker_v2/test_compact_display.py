#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""파서 + 상태 + 컴팩트 표시 검증 테스트

팽재남 고객 데이터 (인라인):
- 변액계약: 없음
- Annual Report: 저장 완료
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from log_parser import parse_line
from app_state import AppState

# debug_log.txt 내용 (팽재남 고객 - 실제 SikuliX 출력)
DEBUG_LOG = """
============================================================
고객통합뷰 진입/종료 검증 시작
고객명: 팽재남
PDF 저장 경로: D:\\aims\\tools\\auto_clicker_v2\\output\\ㅍ\\pdf
============================================================

[1단계] 현재 화면 확인 + 화면 상태 복구
    고객등록/조회 페이지가 표시되어 있어야 합니다.
        [스크린샷 #001] 001_report00_step1_initial_state.png
    포커스 클릭: (300, 250) - 페이지 좌상단
    마우스 휠 UP x 20...
    [복구 완료] 화면 상태 정리됨
        [스크린샷 #002] 002_report00_step1_cleanup_done.png

[2단계] 고객통합뷰 버튼 클릭 + 스크롤 + 검증
    [시도 1/3] 고객통합뷰 버튼 클릭...
    [고객통합뷰 버튼] 찾는 중 (최대 10초)...
    [고객통합뷰 버튼] 이미지 매칭 성공: (1781, 246) [이미지: img/1769492134172.png]
    [고객통합뷰 버튼] 클릭 완료: (1781, 246)
        [CLICK MARKER #003] 고객통합뷰 버튼 at (1781, 246)
    [스크롤] 페이지 맨 위로 이동...
    포커스 클릭: (300, 250) - 페이지 좌상단
    마우스 휠 UP x 20...
    [스크롤] 완료
    [검증 성공] 고객통합뷰 열림 확인 (변액보험리포트 버튼 감지)
        [스크린샷 #004] 004_report00_step2_verified_open.png

[3단계] 스크롤 확인 (2단계에서 완료)
    스크롤 이미 완료됨

[4단계] 변액보험리포트 클릭
    [변액보험리포트 버튼] 찾는 중 (최대 25초)...
    [변액보험리포트 버튼] 이미지 매칭 성공: (1621, 325) [이미지: img/1769492311473.png]
    [변액보험리포트 버튼] 클릭 완료: (1621, 325)
        [CLICK MARKER #005] 변액보험리포트 버튼 at (1621, 325)

[5단계] 변액계약 존재 여부 확인
        [스크린샷 #006] 006_report00_step5_check_variable_insurance.png
    [INFO] '변액계약이 존재하지 않습니다' 메시지 감지
        [스크린샷 #007] 007_report00_step5_no_variable_contract_alert.png
    변액계약이 존재하지 않습니다 - 확인 버튼 클릭
    [확인 버튼] 클릭: (1066, 623)
        [CLICK MARKER #008] no_variable_confirm at (1066, 623)
    -> 변액계약 미존재로 스킵, 다음 단계로 진행

[6단계] 변액보험리포트 팝업 X 버튼 클릭
    -> 변액보험이 없어 팝업이 없음, 스킵

    [포커스 안정화] 페이지 좌상단 클릭 + 스크롤 위로...
    [포커스 안정화] 클릭: (300, 250)
        [CLICK MARKER #009] focus_stabilize at (300, 250)

[7단계] Annual Report 다운로드
    [Annual Report 버튼] 찾는 중... [시도 1/3]
        [스크린샷 #010] 010_report00_step7_before_annual_report_btn.png
    [Annual Report 버튼] 이미지 매칭 성공: (1740, 325) [이미지: img/1769595503860.png]
    [Annual Report 버튼] 클릭 완료: (1740, 325)
        [CLICK MARKER #011] annual_report_btn at (1740, 325)
        [스크린샷 #012] 012_report00_step7_after_ar_click.png
    AR 결과 대기 (PDF 아이콘 또는 알림 폴링)... [시도 1/3]
    [감지] PDF 저장 아이콘 발견 → AR PDF 로딩 완료
        [스크린샷 #013] 013_report00_step7_annual_report_loaded.png
    PDF 로딩 완료
    PDF 저장 버튼 클릭...
        [스크린샷 #014] 014_report00_step7_before_save_icon.png
        [좌표] PDF 저장 아이콘 클릭: (377, 113)
        [CLICK MARKER #015] pdf_save_icon at (377, 113)
    저장(S) 버튼 클릭...
        [스크린샷 #016] 016_report00_step7_before_save_s_btn.png
        [경로 설정] D:\\aims\\tools\\auto_clicker_v2\\output\\ㅍ\\pdf
        [좌표] 저장(S) 버튼 클릭: (1262, 681)
        [CLICK MARKER #017] save_s_btn at (1262, 681)
    PDF 저장 중...
        [스크린샷 #018] 018_report00_step7_annual_report_saved.png
    [VERIFIED] Annual Report 저장 완료 확인 (저장 다이얼로그 정상 닫힘)
    PDF 닫기 (Alt+F4)... [시도 1/3]
    예(Y) 클릭...
        [좌표] 예(Y) 버튼 클릭: (977, 585)
        [CLICK MARKER #019] yes_btn at (977, 585)
    [검증 성공] PDF 뷰어 닫힘 확인
    Annual Report 다운로드 완료

[8단계] 고객통합뷰 X 버튼 클릭하여 종료
    [시도 1/3] 고객통합뷰 X 버튼 클릭...
    [고객통합뷰 X 버튼] 찾는 중 (최대 10초)...
    [고객통합뷰 X 버튼] 이미지 매칭 성공: (1893, 209) [이미지: img/1769492160505.png]
    [고객통합뷰 X 버튼] 클릭 완료: (1893, 209)
        [CLICK MARKER #020] 고객통합뷰 X 버튼 at (1893, 209)
        [스크린샷 #021] 021_report00_step8_after_x_click_1.png
    [검증 성공] 고객등록/조회 페이지 복귀 확인 (고객통합뷰 버튼 감지)
        [스크린샷 #022] 022_report00_step8_verified_closed.png

============================================================
[SUCCESS] 고객통합뷰 검증 완료!
============================================================
"""


def generate_compact_text(state):
    """AppState -> compact panel text (GUI 없이 검증용)"""
    parts = []

    # 1) 고객 수
    count = state.total_customers_done or state.processed_count
    parts.append(f"{count}명")

    # 2) 고객 상태
    name = state.current_customer_name
    if name:
        vs = state._cur_variable_status
        if vs == "없음":
            var_text = "변액:없음"
        elif vs:
            var_text = f"변액:{vs}"
        else:
            var_text = "변액:..."

        ars = state._cur_ar_status
        if ars:
            ar_text = f"AR:{ars}"
        else:
            ar_text = "AR:..."

        parts.append(f"{name}: {var_text} {ar_text}")
    else:
        parts.append("대기 중")

    # 3) 활동
    if state.current_activity:
        parts.append(state.current_activity)

    return " | ".join(parts)


def test_pangjaeman():
    """팽재남 고객 테스트 (변액 없음, AR 저장)"""
    state = AppState()
    events_found = []

    for line_no, line in enumerate(DEBUG_LOG.split("\n"), 1):
        event = parse_line(line, line_no)
        if event:
            if event.type != "raw_line":
                events_found.append(event.type)
            state.process_event(event)

    # === 검증 ===
    errors = []

    if state.current_customer_name != "팽재남":
        errors.append(
            f"current_customer_name: '{state.current_customer_name}' != '팽재남'"
        )

    if state._cur_variable_status != "없음":
        errors.append(
            f"_cur_variable_status: '{state._cur_variable_status}' != '없음'"
        )

    if state._cur_ar_status != "저장":
        errors.append(
            f"_cur_ar_status: '{state._cur_ar_status}' != '저장'"
        )

    if state.ar_saved != 1:
        errors.append(f"ar_saved: {state.ar_saved} != 1")

    if state.total_customers_done != 1:
        errors.append(
            f"total_customers_done: {state.total_customers_done} != 1"
        )

    if state.current_phase != 8:
        errors.append(f"current_phase: {state.current_phase} != 8")

    if not state.current_activity:
        errors.append("current_activity is empty")

    compact_text = generate_compact_text(state)

    if "팽재남" not in compact_text:
        errors.append(f"compact missing '팽재남'")
    if "변액:없음" not in compact_text:
        errors.append(f"compact missing '변액:없음'")
    if "AR:저장" not in compact_text:
        errors.append(f"compact missing 'AR:저장'")
    if "1명" not in compact_text:
        errors.append(f"compact missing '1명'")

    # === 중간 상태 변화 추적 (이벤트별) ===
    print("=== 이벤트 흐름 ===")
    state2 = AppState()
    for line_no, line in enumerate(DEBUG_LOG.split("\n"), 1):
        event = parse_line(line, line_no)
        if event and event.type != "raw_line":
            state2.process_event(event)
            ct = generate_compact_text(state2)
            print(f"  [{event.type}] -> {ct}")
        elif event:
            state2.process_event(event)

    # === 결과 ===
    print(f"\n=== 파싱된 이벤트 종류 ===")
    unique = list(dict.fromkeys(events_found))
    print(f"  {', '.join(unique)}")

    print(f"\n=== 최종 상태 ===")
    print(f"  current_customer_name: {state.current_customer_name}")
    print(f"  _cur_variable_status: {state._cur_variable_status}")
    print(f"  _cur_ar_status: {state._cur_ar_status}")
    print(f"  ar_saved: {state.ar_saved}")
    print(f"  pdf_saved: {state.pdf_saved}")
    print(f"  total_customers_done: {state.total_customers_done}")
    print(f"  current_phase: {state.current_phase}")
    print(f"  current_activity: {state.current_activity}")

    print(f"\n=== 컴팩트 표시 ===")
    print(f"  {compact_text}")

    if errors:
        print(f"\n!!! FAIL: {len(errors)} errors !!!")
        for e in errors:
            print(f"  - {e}")
        return False
    else:
        print(f"\n*** PASS ***")
        return True


if __name__ == "__main__":
    success = test_pangjaeman()
    sys.exit(0 if success else 1)

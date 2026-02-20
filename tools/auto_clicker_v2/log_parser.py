# -*- coding: utf-8 -*-
"""
로그 파서: 텍스트 로그 → 구조화된 이벤트 객체
"""
import re
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class LogEvent:
    type: str
    line_no: int
    raw: str
    data: dict = field(default_factory=dict)


# 정규식 패턴
_PATTERNS = {
    # 헤더
    "header_ocr_mode": re.compile(r"^MetLife 고객목록조회 - (.+)$"),
    "header_log_file": re.compile(r"^로그 파일: (.+)$"),
    "header_chosung": re.compile(r"^선택 초성: (.+)$"),
    "header_click": re.compile(r"^고객 클릭: (.+)$"),
    "header_integrated": re.compile(r"^통합뷰/리포트: (.+)$"),
    "header_only": re.compile(r"^특정 고객만: '(.+)' \(--only 모드\)$"),

    # 단계
    "phase_start": re.compile(r"^\[(\d)단계\] (.+)$"),
    "phase_end": re.compile(r"^\[(\d)단계 완료\]$"),
    "substep": re.compile(r"^\s+\[(\d)-(\d)\] (.+)$"),

    # 초성
    "chosung_start": re.compile(r"^\s+=== \[(.)\] 초성 처리 시작 ===$"),
    "chosung_button": re.compile(r"^\s+\[(.)\] 버튼 클릭"),

    # 네비/스크롤 페이지
    "navi_start": re.compile(r"^\s+\[네비 (\d+)\] 시작$"),
    "scroll_page": re.compile(r"^\s+\[N(\d+)-S(\d+)\] 스크롤 페이지 (\d+) \(전체 (\d+)\)$"),

    # OCR
    "ocr_capture": re.compile(r"^\s+\[OCR\] 1/4\. 화면 캡처$"),
    "ocr_api_call": re.compile(r"^\s+\[OCR\] 2/4\. (.+)$"),
    "ocr_response": re.compile(r"^\s+\[OCR\] 3/4\. API 응답 \((.+?)초\)$"),
    "ocr_result": re.compile(r"^\s+\[OCR\] 4/4\. (\d+)명 인식 완료$"),
    "ocr_table_row": re.compile(
        r"^\s+\[OCR\]\s+(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)$"
    ),

    # 고객통합뷰 (customer_done보다 먼저 매칭되어야 함)
    "integrated_view_enter": re.compile(r"^\s+-> 고객통합뷰 진입"),
    "integrated_view_done": re.compile(r"^\s+-> 고객통합뷰 처리 완료$"),

    # 고객통합뷰 검증 (verify_customer_integrated_view.py 출력)
    "verify_customer": re.compile(r"^고객명: (.+)$"),
    "variable_not_exist": re.compile(r"^\s+\[INFO\] '변액계약이 존재하지 않습니다'"),
    "verify_success": re.compile(r"^\[SUCCESS\] 고객통합뷰 검증 완료"),

    # 고객 처리
    "customer_process_start": re.compile(
        r"^\s+\[고객처리\] (\d+)명 처리 시작 \(중복 (\d+)행 스킵"
    ),
    "customer_click": re.compile(r"^\s+\[(\d+)/(\d+)\] (\S+) 클릭"),
    "customer_skip": re.compile(r"^\s+\[(\d+)/(\d+)\] (\S+) 스킵"),
    "customer_done": re.compile(r"^\s+-> (\S+) 처리 완료$"),
    "customer_process_end": re.compile(r"^\s+\[고객처리\] (\d+)명 처리 완료$"),

    # PDF (변액리포트) - 실시간 이벤트
    "pdf_save_start": re.compile(r"^\s+===== PDF 저장 시작 \[보고서 #(\d+)\] =====$"),
    "pdf_save_done": re.compile(r"^\s+\[VERIFIED\] 변액리포트 #(\d+) 저장 완료"),
    "pdf_duplicate": re.compile(r"^\s+\[VERIFIED\] 변액리포트 #(\d+) 중복 파일"),

    # Annual Report - 실시간 이벤트
    "ar_not_found": re.compile(r"^\s+\[감지\] AR 미존재"),
    "ar_found": re.compile(r"^\s+\[VERIFIED\] Annual Report 저장 완료"),
    "ar_duplicate": re.compile(r"^\s+\[VERIFIED\] Annual Report 중복 파일"),

    # 스크롤 비교
    "compare": re.compile(
        r"^\s+\[COMPARE\] 테이블 전체 비교: ([\d.]+)% 동일"
    ),
    "compare_last_page": re.compile(r"^\s+\[COMPARE\] → 마지막 페이지"),
    "scroll_end": re.compile(r"^\s+\*\*\* 스크롤 끝 도달"),
    "no_next_button": re.compile(r"^\s+#\s+\[다음\] 버튼 없음"),

    # Summary
    "summary_header": re.compile(r"^\s+\[(.)\] 초성 처리 결과 Summary$"),
    "summary_total": re.compile(
        r"^\s+총 행수: (\d+)행 \| 오류: (\d+)건 \| 소요: (.+)$"
    ),
    "summary_navi": re.compile(
        r"^\s+네비 페이지: (\d+)회 \| 스크롤 페이지: (\d+)개$"
    ),
    "summary_integrated": re.compile(r"^\s+고객통합뷰 처리: (\d+)명$"),
    "summary_variable": re.compile(
        r"^\s+변액보험 존재: (\d+)명 \| 미존재: (\d+)명$"
    ),
    "summary_pdf": re.compile(
        r"^\s+PDF 저장: (\d+)건 \| 중복스킵: (\d+)건 \| MetLife 오류 스킵: (\d+)건$"
    ),
    "summary_ar": re.compile(
        r"^\s+존재\+저장: (\d+)건 \| 미존재: (\d+)건 \| 버튼없음: (\d+)건$"
    ),

    # FATAL 크래시 (MetlifeCustomerList.py 출력)
    "fatal_crash": re.compile(r"^\s+\[FATAL\] 검증 실패 - 프로그램 종료$"),
    "fatal_customer": re.compile(r"^\s+고객명: (.+)$"),
    "fatal_reason": re.compile(r"^\s+원인: (.+)$"),
    "fatal_position": re.compile(r"^\s+위치: (.+)$"),
    "fatal_resume": re.compile(r"^\s+→ 문제 분석 후 --start-from '(.+)' 옵션으로 재개하세요\.$"),

    # 완료
    "complete_time": re.compile(r"^소요 시간: (.+)$"),
    "complete_total": re.compile(r"^총 행수: (\d+)행, 오류: (\d+)"),
    "complete_ok": re.compile(r"^\[OK\] 오류 없이 완료!$"),
}


def parse_line(line: str, line_no: int) -> Optional[LogEvent]:
    """한 줄의 로그를 파싱하여 LogEvent 반환. 매칭 안 되면 None."""
    stripped = line.rstrip()
    if not stripped:
        return None

    for event_type, pattern in _PATTERNS.items():
        m = pattern.match(stripped)
        if m:
            return LogEvent(
                type=event_type,
                line_no=line_no,
                raw=stripped,
                data=_extract_data(event_type, m),
            )

    # 매칭되지 않은 줄은 raw_line 이벤트로
    return LogEvent(type="raw_line", line_no=line_no, raw=stripped)


def _extract_data(event_type: str, m: re.Match) -> dict:
    """정규식 매치에서 이벤트별 데이터 추출"""
    groups = m.groups()

    if event_type == "header_ocr_mode":
        return {"mode": groups[0]}
    elif event_type == "header_chosung":
        return {"chosung": groups[0]}
    elif event_type == "header_only":
        return {"customer": groups[0]}
    elif event_type == "phase_start":
        return {"phase": int(groups[0]), "desc": groups[1]}
    elif event_type == "phase_end":
        return {"phase": int(groups[0])}
    elif event_type == "substep":
        return {"phase": int(groups[0]), "step": int(groups[1]), "desc": groups[2]}
    elif event_type == "chosung_start":
        return {"chosung": groups[0]}
    elif event_type == "navi_start":
        return {"navi": int(groups[0])}
    elif event_type == "scroll_page":
        return {
            "navi": int(groups[0]),
            "scroll": int(groups[1]),
            "scroll_page": int(groups[2]),
            "total_page": int(groups[3]),
        }
    elif event_type == "ocr_api_call":
        return {"engine": groups[0]}
    elif event_type == "ocr_response":
        return {"elapsed": float(groups[0])}
    elif event_type == "ocr_result":
        return {"count": int(groups[0])}
    elif event_type == "ocr_table_row":
        return {
            "no": int(groups[0]),
            "name": groups[1],
            "type": groups[2] if groups[2] != "-" else "",
            "birth": groups[3] if groups[3] != "-" else "",
            "age": groups[4] if groups[4] != "-" else "",
            "gender": groups[5] if groups[5] != "-" else "",
            "phone": groups[6] if groups[6] != "-" else "",
        }
    elif event_type == "customer_process_start":
        return {"count": int(groups[0]), "dup_skip": int(groups[1])}
    elif event_type in ("customer_click", "customer_skip"):
        return {"index": int(groups[0]), "total": int(groups[1]), "name": groups[2]}
    elif event_type == "customer_done":
        return {"name": groups[0]}
    elif event_type == "customer_process_end":
        return {"count": int(groups[0])}
    elif event_type == "pdf_save_start":
        return {"report_no": int(groups[0])}
    elif event_type == "pdf_save_done":
        return {"report_no": int(groups[0])}
    elif event_type == "pdf_duplicate":
        return {"report_no": int(groups[0])}
    elif event_type == "compare":
        return {"similarity": float(groups[0])}
    elif event_type == "summary_header":
        return {"chosung": groups[0]}
    elif event_type == "summary_total":
        return {"rows": int(groups[0]), "errors": int(groups[1]), "elapsed": groups[2]}
    elif event_type == "summary_navi":
        return {"navi_pages": int(groups[0]), "scroll_pages": int(groups[1])}
    elif event_type == "summary_integrated":
        return {"count": int(groups[0])}
    elif event_type == "summary_variable":
        return {"exists": int(groups[0]), "not_exists": int(groups[1])}
    elif event_type == "summary_pdf":
        return {
            "saved": int(groups[0]),
            "duplicates": int(groups[1]),
            "errors": int(groups[2]),
        }
    elif event_type == "summary_ar":
        return {
            "saved": int(groups[0]),
            "not_found": int(groups[1]),
            "no_button": int(groups[2]),
        }
    elif event_type == "complete_time":
        return {"elapsed": groups[0]}
    elif event_type == "complete_total":
        return {"rows": int(groups[0]), "errors": int(groups[1])}
    elif event_type == "verify_customer":
        return {"name": groups[0]}
    elif event_type == "fatal_customer":
        return {"name": groups[0]}
    elif event_type == "fatal_reason":
        return {"reason": groups[0]}
    elif event_type == "fatal_position":
        return {"position": groups[0]}
    elif event_type == "fatal_resume":
        return {"customer": groups[0]}

    return {}


def parse_file(filepath: str) -> list[LogEvent]:
    """로그 파일 전체를 파싱하여 이벤트 리스트 반환"""
    events = []
    with open(filepath, "r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, 1):
            event = parse_line(line, line_no)
            if event:
                events.append(event)
    return events

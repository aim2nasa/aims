# -*- coding: utf-8 -*-
"""
앱 상태 관리: LogEvent를 수신하여 GUI에 필요한 상태를 업데이트
"""
from dataclasses import dataclass, field
from typing import Optional
from log_parser import LogEvent


@dataclass
class CustomerRow:
    no: int
    name: str
    type: str = ""
    phone: str = ""
    status: str = "pending"  # pending, processing, done, skipped, error


@dataclass
class AppState:
    # 헤더 정보
    ocr_mode: str = ""
    chosung: str = ""
    only_customer: str = ""
    is_integrated_view: bool = False

    # 진행 상황
    current_phase: int = 0
    current_phase_desc: str = ""
    current_chosung: str = ""
    current_navi: int = 0
    current_scroll: int = 0
    total_scroll: int = 0

    # OCR
    ocr_elapsed: float = 0.0
    ocr_count: int = 0

    # 고객 테이블
    customers: list[CustomerRow] = field(default_factory=list)
    current_customer_index: int = 0  # 1-based (로그 형식)
    total_customers: int = 0
    processed_count: int = 0  # 실제 처리 (done)
    skipped_count: int = 0    # 스킵

    # PDF 결과
    pdf_saved: int = 0
    pdf_duplicates: int = 0
    pdf_errors: int = 0
    ar_saved: int = 0
    ar_not_found: int = 0

    # Summary
    total_rows: int = 0
    total_errors: int = 0
    elapsed_time: str = ""

    # 로그 라인 버퍼
    log_lines: list[str] = field(default_factory=list)

    # 완료 여부
    is_complete: bool = False

    # 현재 고객 상세 (고객통합뷰 처리)
    current_customer_name: str = ""
    current_activity: str = ""
    total_customers_done: int = 0
    _cur_variable_status: str = field(default="", repr=False)  # "" / "없음" / "N건"
    _cur_ar_status: str = field(default="", repr=False)        # "" / "저장" / "미존재"
    _cur_pdf_count: int = field(default=0, repr=False)

    # 내부 추적
    _processing_customer: Optional[str] = field(default=None, repr=False)
    _status_map: dict = field(default_factory=dict, repr=False)  # (row_no, name) -> status

    def process_event(self, event: LogEvent) -> None:
        """이벤트를 수신하여 상태 업데이트"""
        # 모든 이벤트의 raw 텍스트를 로그에 추가
        if event.raw and event.type != "raw_line":
            self.log_lines.append(event.raw)
        elif event.type == "raw_line":
            # 구분선(===, ---, ###)과 [log] 라인은 제외
            r = event.raw.strip()
            if r and not r.startswith("=") and not r.startswith("-") and not r.startswith("#") and not r.startswith("[log]"):
                self.log_lines.append(event.raw)

        handler = _HANDLERS.get(event.type)
        if handler:
            handler(self, event)


def _handle_header_ocr_mode(state: AppState, event: LogEvent):
    state.ocr_mode = event.data["mode"]

def _handle_header_chosung(state: AppState, event: LogEvent):
    state.chosung = event.data["chosung"]

def _handle_header_only(state: AppState, event: LogEvent):
    state.only_customer = event.data["customer"]

def _handle_header_integrated(state: AppState, event: LogEvent):
    state.is_integrated_view = "활성화" in event.raw

def _handle_phase_start(state: AppState, event: LogEvent):
    state.current_phase = event.data["phase"]
    state.current_phase_desc = event.data["desc"]
    state.current_activity = event.data["desc"]

def _handle_chosung_start(state: AppState, event: LogEvent):
    state.current_chosung = event.data["chosung"]
    # 초성 변경 시 고객 테이블 초기화
    state.customers.clear()
    state.processed_count = 0
    state.skipped_count = 0
    state.current_customer_index = 0

def _handle_navi_start(state: AppState, event: LogEvent):
    state.current_navi = event.data["navi"]

def _handle_scroll_page(state: AppState, event: LogEvent):
    state.current_scroll = event.data["scroll_page"]
    state.total_scroll = event.data["total_page"]

def _handle_ocr_response(state: AppState, event: LogEvent):
    state.ocr_elapsed = event.data["elapsed"]

def _handle_ocr_result(state: AppState, event: LogEvent):
    state.ocr_count = event.data["count"]
    # 기존 상태를 보존한 뒤 테이블 교체 준비 (스크롤 페이지 간 상태 복원)
    state._status_map = {}
    for c in state.customers:
        if c.status != "pending":
            state._status_map[(c.no, c.name)] = c.status
    state.customers.clear()

def _handle_ocr_table_row(state: AppState, event: LogEvent):
    d = event.data
    no = d["no"]
    name = d["name"]
    # 이전 OCR 스캔에서의 상태 복원 (동일 위치+이름이면 상태 유지)
    restored_status = state._status_map.get((no, name), "pending")
    state.customers.append(CustomerRow(
        no=no,
        name=name,
        type=d["type"],
        phone=d["phone"],
        status=restored_status,
    ))

def _handle_customer_process_start(state: AppState, event: LogEvent):
    state.total_customers = event.data["count"]

def _handle_customer_click(state: AppState, event: LogEvent):
    state.current_customer_index = event.data["index"]
    name = event.data["name"]
    state._processing_customer = name
    state.current_customer_name = name
    # 고객별 상태 초기화
    state._cur_variable_status = ""
    state._cur_ar_status = ""
    state._cur_pdf_count = 0
    state.current_activity = f"{name} 클릭"
    # 테이블에서 해당 고객 상태 업데이트
    for c in state.customers:
        if c.name == name and c.status == "pending":
            c.status = "processing"
            break

def _handle_customer_skip(state: AppState, event: LogEvent):
    name = event.data["name"]
    state.skipped_count += 1
    for c in state.customers:
        if c.name == name and c.status == "pending":
            c.status = "skipped"
            break

def _handle_customer_done(state: AppState, event: LogEvent):
    name = event.data["name"]
    state.processed_count += 1
    for c in state.customers:
        if c.name == name and c.status == "processing":
            c.status = "done"
            break
    state._processing_customer = None

def _handle_pdf_save_done(state: AppState, event: LogEvent):
    state.pdf_saved += 1
    state._cur_pdf_count += 1
    state._cur_variable_status = f"{state._cur_pdf_count}건"
    state.current_activity = f"변액리포트 #{state._cur_pdf_count} 저장"

def _handle_pdf_duplicate(state: AppState, event: LogEvent):
    state.pdf_duplicates += 1

def _handle_ar_not_found(state: AppState, event: LogEvent):
    state.ar_not_found += 1
    state._cur_ar_status = "미존재"
    state.current_activity = "AR 미존재"

def _handle_ar_found(state: AppState, event: LogEvent):
    state.ar_saved += 1
    state._cur_ar_status = "저장"
    state.current_activity = "AR 저장 완료"

def _handle_summary_total(state: AppState, event: LogEvent):
    state.total_rows = event.data["rows"]
    state.total_errors = event.data["errors"]
    state.elapsed_time = event.data["elapsed"]

def _handle_summary_pdf(state: AppState, event: LogEvent):
    state.pdf_saved = event.data["saved"]
    state.pdf_duplicates = event.data["duplicates"]
    state.pdf_errors = event.data["errors"]

def _handle_summary_ar(state: AppState, event: LogEvent):
    state.ar_saved = event.data["saved"]
    state.ar_not_found = event.data["not_found"]

def _handle_verify_customer(state: AppState, event: LogEvent):
    name = event.data["name"]
    state.current_customer_name = name
    state._cur_variable_status = ""
    state._cur_ar_status = ""
    state._cur_pdf_count = 0
    state.current_activity = f"{name} 고객통합뷰 진입"

def _handle_variable_not_exist(state: AppState, event: LogEvent):
    state._cur_variable_status = "없음"
    state.current_activity = "변액계약 없음"

def _handle_verify_success(state: AppState, event: LogEvent):
    state.total_customers_done += 1
    state.current_activity = f"{state.current_customer_name} 완료"

def _handle_complete_time(state: AppState, event: LogEvent):
    state.elapsed_time = event.data["elapsed"]

def _handle_complete_ok(state: AppState, event: LogEvent):
    state.is_complete = True


_HANDLERS = {
    "header_ocr_mode": _handle_header_ocr_mode,
    "header_chosung": _handle_header_chosung,
    "header_only": _handle_header_only,
    "header_integrated": _handle_header_integrated,
    "phase_start": _handle_phase_start,
    "chosung_start": _handle_chosung_start,
    "navi_start": _handle_navi_start,
    "scroll_page": _handle_scroll_page,
    "ocr_response": _handle_ocr_response,
    "ocr_result": _handle_ocr_result,
    "ocr_table_row": _handle_ocr_table_row,
    "customer_process_start": _handle_customer_process_start,
    "customer_click": _handle_customer_click,
    "customer_skip": _handle_customer_skip,
    "customer_done": _handle_customer_done,
    "pdf_save_done": _handle_pdf_save_done,
    "pdf_duplicate": _handle_pdf_duplicate,
    "ar_not_found": _handle_ar_not_found,
    "ar_found": _handle_ar_found,
    "ar_duplicate": _handle_ar_found,  # AR 중복도 저장 카운트에 포함
    "verify_customer": _handle_verify_customer,
    "variable_not_exist": _handle_variable_not_exist,
    "verify_success": _handle_verify_success,
    "summary_total": _handle_summary_total,
    "summary_pdf": _handle_summary_pdf,
    "summary_ar": _handle_summary_ar,
    "complete_time": _handle_complete_time,
    "complete_ok": _handle_complete_ok,
}

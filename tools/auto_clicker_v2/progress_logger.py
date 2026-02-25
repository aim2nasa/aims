# -*- coding: utf-8 -*-
"""프로덕션 진행 로그: 산출물 위주 간결한 기록

로그 형식:
  2026-02-25 11:30:00 [시작] 초성=ㄱ 모드=normal
  2026-02-25 11:30:15 [고객] 강동수: CRS 3건 AR:저장 → 완료
  2026-02-25 11:30:20 [고객] 강태규: CRS 없음 AR:미존재 → 완료
  2026-02-25 11:31:05 [에러] 강희원: PDF 저장 다이얼로그 열기 실패
  2026-02-25 11:35:00 [완료] 처리 10명 스킵 2명 에러 1명 | CRS 25건 AR 8건 | 5:00

저장 위치: {save_dir}/progress.log (append 모드)
"""
from datetime import datetime

from log_parser import LogEvent


class ProgressLogger:
    """산출물 중심 프로덕션 로그"""

    def __init__(self, log_path: str, chosung: str = "", mode: str = "normal"):
        self._path = log_path
        self._file = open(log_path, "a", encoding="utf-8")

        # 고객별 추적
        self._cur_name = ""
        self._cur_crs_saved = 0
        self._cur_crs_dup = 0
        self._cur_ar = ""       # "" / "저장" / "미존재" / "기저장"
        self._cur_var = ""      # "" / "없음"

        # 전체 통계
        self._total_done = 0
        self._total_skip = 0
        self._total_error = 0
        self._total_crs = 0
        self._total_ar = 0

        self._write(f"[시작] 초성={chosung or '전체'} 모드={mode}")

    def process_event(self, event: LogEvent) -> None:
        """이벤트를 수신하여 주요 산출물만 기록"""
        handler = _HANDLERS.get(event.type)
        if handler:
            handler(self, event)

    def write_summary(self, elapsed: str = "") -> None:
        """최종 요약 기록"""
        parts = [
            f"처리 {self._total_done}명",
            f"스킵 {self._total_skip}명",
        ]
        if self._total_error:
            parts.append(f"에러 {self._total_error}명")
        parts.append(f"| CRS {self._total_crs}건 AR {self._total_ar}건")
        if elapsed:
            parts.append(f"| {elapsed}")
        self._write(f"[완료] {' '.join(parts)}")

    def close(self) -> None:
        """로그 파일 닫기"""
        try:
            self._file.close()
        except Exception:
            pass

    def _write(self, msg: str) -> None:
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        try:
            self._file.write(f"{ts} {msg}\n")
            self._file.flush()
        except Exception:
            pass

    def _flush_customer(self) -> None:
        """현재 고객의 산출물 요약을 기록"""
        if not self._cur_name:
            return

        parts = []

        # CRS
        if self._cur_var == "없음":
            parts.append("CRS 없음")
        elif self._cur_crs_saved > 0:
            s = f"CRS {self._cur_crs_saved}건"
            if self._cur_crs_dup:
                s += f"(+기저장 {self._cur_crs_dup}건)"
            parts.append(s)
        elif self._cur_crs_dup > 0:
            parts.append(f"CRS 기저장 {self._cur_crs_dup}건")
        else:
            parts.append("CRS 없음")

        # AR
        if self._cur_ar:
            parts.append(f"AR:{self._cur_ar}")
        else:
            parts.append("AR:—")

        self._total_done += 1
        self._total_crs += self._cur_crs_saved
        if self._cur_ar == "저장":
            self._total_ar += 1

        self._write(f"[고객] {self._cur_name}: {' '.join(parts)} → 완료")
        self._reset_customer()

    def _reset_customer(self) -> None:
        self._cur_name = ""
        self._cur_crs_saved = 0
        self._cur_crs_dup = 0
        self._cur_ar = ""
        self._cur_var = ""


# ── 이벤트 핸들러 ──

def _on_verify_customer(logger: ProgressLogger, event: LogEvent):
    # 이전 고객 데이터가 남아있으면 flush (비정상 종료 대비)
    if logger._cur_name:
        logger._flush_customer()
    logger._cur_name = event.data["name"]


def _on_variable_not_exist(logger: ProgressLogger, event: LogEvent):
    logger._cur_var = "없음"


def _on_pdf_save_done(logger: ProgressLogger, event: LogEvent):
    logger._cur_crs_saved += 1


def _on_pdf_duplicate(logger: ProgressLogger, event: LogEvent):
    logger._cur_crs_dup += 1


def _on_ar_found(logger: ProgressLogger, event: LogEvent):
    logger._cur_ar = "저장"


def _on_ar_not_found(logger: ProgressLogger, event: LogEvent):
    logger._cur_ar = "미존재"


def _on_ar_duplicate(logger: ProgressLogger, event: LogEvent):
    logger._cur_ar = "기저장"


def _on_verify_success(logger: ProgressLogger, event: LogEvent):
    logger._flush_customer()


def _on_customer_skip(logger: ProgressLogger, event: LogEvent):
    logger._total_skip += 1
    logger._write(f"[스킵] {event.data['name']}")


def _on_fatal_crash(logger: ProgressLogger, event: LogEvent):
    logger._total_error += 1


def _on_fatal_customer(logger: ProgressLogger, event: LogEvent):
    name = event.data["name"]
    logger._write(f"[에러] {name}")


def _on_fatal_reason(logger: ProgressLogger, event: LogEvent):
    logger._write(f"  원인: {event.data['reason']}")


def _on_complete_time(logger: ProgressLogger, event: LogEvent):
    logger.write_summary(event.data["elapsed"])


def _on_complete_ok(logger: ProgressLogger, event: LogEvent):
    # complete_time이 먼저 오지 않은 경우 대비
    pass


def _on_chosung_start(logger: ProgressLogger, event: LogEvent):
    logger._write(f"[초성] {event.data['chosung']}")


_HANDLERS = {
    "verify_customer": _on_verify_customer,
    "variable_not_exist": _on_variable_not_exist,
    "pdf_save_done": _on_pdf_save_done,
    "pdf_duplicate": _on_pdf_duplicate,
    "ar_found": _on_ar_found,
    "ar_not_found": _on_ar_not_found,
    "ar_duplicate": _on_ar_duplicate,
    "verify_success": _on_verify_success,
    "customer_skip": _on_customer_skip,
    "fatal_crash": _on_fatal_crash,
    "fatal_customer": _on_fatal_customer,
    "fatal_reason": _on_fatal_reason,
    "complete_time": _on_complete_time,
    "complete_ok": _on_complete_ok,
    "chosung_start": _on_chosung_start,
}

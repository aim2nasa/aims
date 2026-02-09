# -*- coding: utf-8 -*-
"""GUI 자동 실행 테스트: 컴팩트 모드 상태를 파일로 로깅

1. GUI 생성
2. 초성 ㅍ 설정
3. 1초 후 자동 실행 (_start)
4. 2초마다 컴팩트 패널 상태를 파일에 기록
5. 완료 시 최종 상태 + 요구사항 검증 결과 기록
"""
import sys
import os
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from gui_main import AutoClickerApp

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATE_LOG = os.path.join(_BASE_DIR, "test_gui_state_log.txt")


class AutoTestApp(AutoClickerApp):
    def __init__(self):
        super().__init__()
        self._state_log = open(STATE_LOG, "w", encoding="utf-8")
        self._log_count = 0

        # 초성 ㅍ 자동 설정
        self._chosung_var.set("ㅍ")

        # 1초 후 자동 실행
        self.after(1000, self._auto_start)

    def _auto_start(self):
        self._state_log.write(f"[{self._ts()}] === AUTO START (chosung=ㅍ) ===\n")
        self._state_log.flush()
        self._start()
        # 상태 로깅 시작
        self.after(2000, self._log_state)

    def _ts(self):
        return time.strftime("%H:%M:%S")

    def _log_state(self):
        self._log_count += 1
        s = self._state

        # 컴팩트 패널과 동일한 형식으로 상태 구성
        count = s.total_customers_done or s.processed_count
        parts = [f"{count}명"]

        name = s.current_customer_name
        if name:
            vs = s._cur_variable_status
            if vs == "없음":
                var_text = "변액:없음"
            elif vs:
                var_text = f"변액:{vs}"
            else:
                var_text = "변액:..."

            ars = s._cur_ar_status
            if ars:
                ar_text = f"AR:{ars}"
            else:
                ar_text = "AR:..."

            parts.append(f"{name}: {var_text} {ar_text}")
        else:
            parts.append("대기 중")

        if s.current_activity:
            parts.append(s.current_activity)

        if s.elapsed_time:
            parts.append(s.elapsed_time)

        compact = " | ".join(parts)

        line = f"[{self._ts()}] #{self._log_count:03d} COMPACT: {compact}\n"
        self._state_log.write(line)
        self._state_log.flush()

        # stdout에도 출력 (cp949 안전)
        try:
            print(line.strip())
        except UnicodeEncodeError:
            safe = compact.encode("cp949", errors="replace").decode("cp949")
            print(f"[{self._ts()}] #{self._log_count:03d} COMPACT: {safe}")

        # 완료 확인
        if s.is_complete or (self._source and not self._source.is_running()):
            self._write_final_report()
        else:
            self.after(2000, self._log_state)

    def _write_final_report(self):
        s = self._state
        self._state_log.write(f"\n{'='*60}\n")
        self._state_log.write(f"[{self._ts()}] === FINAL STATE ===\n")
        self._state_log.write(f"  customer_name: {s.current_customer_name}\n")
        self._state_log.write(f"  variable_status: {s._cur_variable_status}\n")
        self._state_log.write(f"  ar_status: {s._cur_ar_status}\n")
        self._state_log.write(f"  total_done: {s.total_customers_done}\n")
        self._state_log.write(f"  processed_count: {s.processed_count}\n")
        self._state_log.write(f"  current_activity: {s.current_activity}\n")
        self._state_log.write(f"  current_phase: {s.current_phase}\n")
        self._state_log.write(f"  pdf_saved: {s.pdf_saved}\n")
        self._state_log.write(f"  ar_saved: {s.ar_saved}\n")
        self._state_log.write(f"  ar_not_found: {s.ar_not_found}\n")
        self._state_log.write(f"  is_complete: {s.is_complete}\n")
        self._state_log.write(f"  elapsed_time: {s.elapsed_time}\n")

        # 요구사항 검증
        self._state_log.write(f"\n{'='*60}\n")
        self._state_log.write(f"=== REQUIREMENTS CHECK ===\n")
        errors = []

        # 1. 고객명 표시
        if not s.current_customer_name:
            errors.append("FAIL: current_customer_name 비어있음")
        else:
            self._state_log.write(f"  [OK] 고객명: {s.current_customer_name}\n")

        # 2. 변액 상태 표시
        if not s._cur_variable_status:
            errors.append("FAIL: variable_status 비어있음")
        else:
            self._state_log.write(f"  [OK] 변액: {s._cur_variable_status}\n")

        # 3. AR 상태 표시
        if not s._cur_ar_status:
            errors.append("FAIL: ar_status 비어있음")
        else:
            self._state_log.write(f"  [OK] AR: {s._cur_ar_status}\n")

        # 4. 고객 수 표시
        count = s.total_customers_done or s.processed_count
        if count < 1:
            errors.append("FAIL: 처리 완료 고객 0명")
        else:
            self._state_log.write(f"  [OK] 완료 고객: {count}명\n")

        # 5. 활동 로그
        if not s.current_activity:
            errors.append("FAIL: current_activity 비어있음")
        else:
            self._state_log.write(f"  [OK] 활동: {s.current_activity}\n")

        if errors:
            self._state_log.write(f"\n!!! {len(errors)} FAILURES !!!\n")
            for e in errors:
                self._state_log.write(f"  - {e}\n")
        else:
            self._state_log.write(f"\n*** ALL PASS ***\n")

        self._state_log.close()
        print(f"\n=== TEST COMPLETE (log: {STATE_LOG}) ===")


if __name__ == "__main__":
    app = AutoTestApp()
    app.mainloop()

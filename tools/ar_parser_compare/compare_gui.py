"""
AR 파서 비교 GUI 도구

3가지 파서(OpenAI, pdfplumber, Upstage)를 비교 테스트하는 GUI 도구
"""

import sys
import os
import json
import time
import threading
import tkinter as tk
from tkinter import ttk, filedialog, messagebox, scrolledtext
from pathlib import Path

# 프로젝트 루트 경로 추가
PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "backend" / "api" / "annual_report_api"))

# 환경 변수 로드
from dotenv import load_dotenv
load_dotenv(PROJECT_ROOT / "backend" / "api" / "annual_report_api" / ".env")


class ParserCompareGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("AR 파서 비교 도구")
        self.root.geometry("1400x900")

        # 결과 저장
        self.results = {}
        self.current_file = None

        self.setup_ui()

    def setup_ui(self):
        # 상단 프레임 - 파일 선택
        top_frame = ttk.Frame(self.root, padding=10)
        top_frame.pack(fill=tk.X)

        ttk.Label(top_frame, text="PDF 파일:").pack(side=tk.LEFT)

        self.file_path_var = tk.StringVar()
        self.file_entry = ttk.Entry(top_frame, textvariable=self.file_path_var, width=80)
        self.file_entry.pack(side=tk.LEFT, padx=5)

        ttk.Button(top_frame, text="찾아보기", command=self.browse_file).pack(side=tk.LEFT, padx=5)
        ttk.Button(top_frame, text="전체 파싱 실행", command=self.run_all_parsers).pack(side=tk.LEFT, padx=5)

        # 진행 상태
        self.status_var = tk.StringVar(value="대기 중...")
        ttk.Label(top_frame, textvariable=self.status_var).pack(side=tk.RIGHT)

        # 중앙 프레임 - 3개 파서 결과
        center_frame = ttk.Frame(self.root, padding=10)
        center_frame.pack(fill=tk.BOTH, expand=True)

        # 3개 열로 분할
        self.parser_frames = {}
        parsers = [
            ("openai", "OpenAI (기본)", "#e3f2fd"),
            ("pdfplumber", "pdfplumber (빠름)", "#e8f5e9"),
            ("upstage", "Upstage (한국어)", "#fff3e0")
        ]

        for i, (parser_id, parser_name, bg_color) in enumerate(parsers):
            frame = ttk.LabelFrame(center_frame, text=parser_name, padding=5)
            frame.grid(row=0, column=i, sticky="nsew", padx=5)
            center_frame.columnconfigure(i, weight=1)
            center_frame.rowconfigure(0, weight=1)

            # 개별 파싱 버튼
            btn_frame = ttk.Frame(frame)
            btn_frame.pack(fill=tk.X)

            ttk.Button(btn_frame, text=f"{parser_name} 실행",
                      command=lambda p=parser_id: self.run_single_parser(p)).pack(side=tk.LEFT)

            # 시간 표시
            time_var = tk.StringVar(value="시간: -")
            ttk.Label(btn_frame, textvariable=time_var).pack(side=tk.RIGHT)

            # 결과 텍스트
            result_text = scrolledtext.ScrolledText(frame, width=45, height=40, wrap=tk.WORD)
            result_text.pack(fill=tk.BOTH, expand=True, pady=5)

            self.parser_frames[parser_id] = {
                "frame": frame,
                "time_var": time_var,
                "result_text": result_text
            }

        # 하단 프레임 - 비교 결과
        bottom_frame = ttk.LabelFrame(self.root, text="비교 결과", padding=10)
        bottom_frame.pack(fill=tk.X, padx=10, pady=5)

        self.compare_text = scrolledtext.ScrolledText(bottom_frame, height=8, wrap=tk.WORD)
        self.compare_text.pack(fill=tk.X)

    def browse_file(self):
        file_path = filedialog.askopenfilename(
            title="AR PDF 파일 선택",
            filetypes=[("PDF files", "*.pdf"), ("All files", "*.*")],
            initialdir="D:/AR"
        )
        if file_path:
            self.file_path_var.set(file_path)
            self.current_file = file_path

    def run_single_parser(self, parser_id):
        if not self.file_path_var.get():
            messagebox.showwarning("경고", "PDF 파일을 선택하세요.")
            return

        self.status_var.set(f"{parser_id} 파싱 중...")
        self.root.update()

        # 백그라운드 스레드에서 실행
        thread = threading.Thread(target=self._parse_with_parser, args=(parser_id,))
        thread.start()

    def _parse_with_parser(self, parser_id):
        file_path = self.file_path_var.get()
        frame_data = self.parser_frames[parser_id]

        try:
            start_time = time.time()

            if parser_id == "openai":
                from services.parser import parse_annual_report
            elif parser_id == "pdfplumber":
                from services.parser_pdfplumber import parse_annual_report
            elif parser_id == "upstage":
                from services.parser_upstage import parse_annual_report

            result = parse_annual_report(file_path)
            elapsed = time.time() - start_time

            self.results[parser_id] = result

            # UI 업데이트 (메인 스레드에서)
            self.root.after(0, lambda: self._update_result(parser_id, result, elapsed))

        except Exception as e:
            error_result = {"error": str(e)}
            self.root.after(0, lambda: self._update_result(parser_id, error_result, 0))

    def _update_result(self, parser_id, result, elapsed):
        frame_data = self.parser_frames[parser_id]

        # 시간 업데이트
        frame_data["time_var"].set(f"시간: {elapsed:.2f}초")

        # 결과 텍스트 업데이트
        text_widget = frame_data["result_text"]
        text_widget.delete(1.0, tk.END)

        if "error" in result:
            text_widget.insert(tk.END, f"오류: {result['error']}\n")
            if "raw_output" in result:
                text_widget.insert(tk.END, f"\n원본:\n{result['raw_output'][:500]}")
        else:
            # 총 월보험료
            total = result.get("총_월보험료")
            text_widget.insert(tk.END, f"총 월보험료: {total:,}원\n\n" if total else "총 월보험료: 추출실패\n\n")

            # 보유계약 현황
            contracts = result.get("보유계약 현황", [])
            text_widget.insert(tk.END, f"=== 보유계약 ({len(contracts)}건) ===\n")
            for i, c in enumerate(contracts, 1):
                text_widget.insert(tk.END, f"\n[{i}] {c.get('보험상품', 'N/A')}\n")
                text_widget.insert(tk.END, f"    증권번호: {c.get('증권번호', 'N/A')}\n")
                text_widget.insert(tk.END, f"    계약자: {c.get('계약자', 'N/A')}\n")
                text_widget.insert(tk.END, f"    피보험자: {c.get('피보험자', 'N/A')}\n")
                text_widget.insert(tk.END, f"    계약일: {c.get('계약일', 'N/A')}\n")
                text_widget.insert(tk.END, f"    계약상태: {c.get('계약상태', 'N/A')}\n")
                text_widget.insert(tk.END, f"    보험료: {c.get('보험료(원)', 'N/A'):,}원\n" if isinstance(c.get('보험료(원)'), int) else f"    보험료: {c.get('보험료(원)', 'N/A')}\n")

            # 부활가능 실효계약
            lapsed = result.get("부활가능 실효계약", [])
            if lapsed:
                text_widget.insert(tk.END, f"\n=== 부활가능 실효계약 ({len(lapsed)}건) ===\n")
                for i, c in enumerate(lapsed, 1):
                    text_widget.insert(tk.END, f"\n[{i}] {c.get('보험상품', 'N/A')}\n")

        self.status_var.set("완료")
        self._update_comparison()

    def run_all_parsers(self):
        if not self.file_path_var.get():
            messagebox.showwarning("경고", "PDF 파일을 선택하세요.")
            return

        self.results = {}
        self.status_var.set("전체 파싱 중...")

        # 순차 실행 (API 충돌 방지)
        thread = threading.Thread(target=self._run_all_sequential)
        thread.start()

    def _run_all_sequential(self):
        parsers = ["pdfplumber", "upstage", "openai"]  # 빠른 것부터

        for parser_id in parsers:
            self.root.after(0, lambda p=parser_id: self.status_var.set(f"{p} 파싱 중..."))
            self._parse_with_parser(parser_id)
            time.sleep(0.5)  # 약간의 딜레이

        self.root.after(0, lambda: self.status_var.set("전체 완료"))

    def _update_comparison(self):
        """3개 파서 결과 비교"""
        self.compare_text.delete(1.0, tk.END)

        if len(self.results) < 2:
            self.compare_text.insert(tk.END, "2개 이상의 파서 결과가 필요합니다.\n")
            return

        # 비교 항목
        comparison = []

        # 총 월보험료 비교
        premiums = {}
        for parser_id, result in self.results.items():
            if "error" not in result:
                premiums[parser_id] = result.get("총_월보험료")

        if premiums:
            unique_premiums = set(v for v in premiums.values() if v)
            if len(unique_premiums) == 1:
                comparison.append(f"✅ 총 월보험료: 일치 ({list(unique_premiums)[0]:,}원)")
            else:
                comparison.append(f"❌ 총 월보험료: 불일치 {premiums}")

        # 계약 건수 비교
        counts = {}
        for parser_id, result in self.results.items():
            if "error" not in result:
                counts[parser_id] = len(result.get("보유계약 현황", []))

        if counts:
            unique_counts = set(counts.values())
            if len(unique_counts) == 1:
                comparison.append(f"✅ 계약 건수: 일치 ({list(unique_counts)[0]}건)")
            else:
                comparison.append(f"❌ 계약 건수: 불일치 {counts}")

        # 증권번호 비교
        policy_numbers = {}
        for parser_id, result in self.results.items():
            if "error" not in result:
                contracts = result.get("보유계약 현황", [])
                policy_numbers[parser_id] = sorted([c.get("증권번호", "") for c in contracts])

        if policy_numbers:
            first_parser = list(policy_numbers.keys())[0]
            first_policies = policy_numbers[first_parser]
            all_match = all(policy_numbers[p] == first_policies for p in policy_numbers)

            if all_match:
                comparison.append(f"✅ 증권번호: 일치")
            else:
                comparison.append(f"❌ 증권번호: 불일치")
                for p, policies in policy_numbers.items():
                    comparison.append(f"   {p}: {policies[:3]}...")

        self.compare_text.insert(tk.END, "\n".join(comparison))


def main():
    root = tk.Tk()
    app = ParserCompareGUI(root)
    root.mainloop()


if __name__ == "__main__":
    main()

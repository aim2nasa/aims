"""
AR 파서 비교 GUI 도구

3가지 파서(OpenAI, pdfplumber, Upstage)를 비교 테스트하는 GUI 도구

사용법:
    python compare_gui.py                    # GUI 모드
    python compare_gui.py --parser pdfplumber --file "D:/AR/test.pdf"  # CLI 모드
"""

import sys
import os
import json
import time
import threading
import argparse
import tkinter as tk
from tkinter import ttk, filedialog, messagebox, scrolledtext
from pathlib import Path

# 프로젝트 루트 경로 추가
PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "backend" / "api" / "annual_report_api"))

# 환경 변수 로드
try:
    from dotenv import load_dotenv
    load_dotenv(PROJECT_ROOT / "backend" / "api" / "annual_report_api" / ".env")
except ImportError:
    env_file = PROJECT_ROOT / "backend" / "api" / "annual_report_api" / ".env"
    if env_file.exists():
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    os.environ[key.strip()] = value.strip()


class ParserCompareGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("AR 파서 비교 도구")
        self.root.geometry("1300x850")

        self.results = {}
        self.current_file = None

        self.setup_ui()

    def setup_ui(self):
        # 상단: 파일 선택
        top_frame = ttk.Frame(self.root, padding=5)
        top_frame.pack(fill=tk.X)

        ttk.Label(top_frame, text="PDF:").pack(side=tk.LEFT)
        self.file_path_var = tk.StringVar()
        ttk.Entry(top_frame, textvariable=self.file_path_var, width=70).pack(side=tk.LEFT, padx=3)
        ttk.Button(top_frame, text="찾아보기", command=self.browse_file).pack(side=tk.LEFT, padx=2)
        ttk.Button(top_frame, text="3개 비교 실행", command=self.run_all_parsers).pack(side=tk.LEFT, padx=10)

        self.status_var = tk.StringVar(value="대기 중")
        ttk.Label(top_frame, textvariable=self.status_var).pack(side=tk.RIGHT)

        # 비교 요약 테이블
        summary_frame = ttk.LabelFrame(self.root, text="비교 요약", padding=3)
        summary_frame.pack(fill=tk.X, padx=5, pady=3)

        columns = ("파서", "소요시간", "총 월보험료", "보유계약", "부활가능", "상태")
        self.summary_tree = ttk.Treeview(summary_frame, columns=columns, show="headings", height=3)
        for col in columns:
            self.summary_tree.heading(col, text=col)
            self.summary_tree.column(col, width=150, anchor=tk.CENTER)
        self.summary_tree.pack(fill=tk.X)

        # 메인 노트북 (비교뷰 / 상세뷰)
        self.main_notebook = ttk.Notebook(self.root)
        self.main_notebook.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        # === 비교 뷰 탭 ===
        compare_frame = ttk.Frame(self.main_notebook)
        self.main_notebook.add(compare_frame, text="📊 비교 뷰 (3개)")

        self.parser_widgets = {}
        parsers = [
            ("pdfplumber", "pdfplumber (빠름)"),
            ("openai", "OpenAI (기본)"),
            ("upstage", "Upstage (한국어)")
        ]

        for i, (pid, pname) in enumerate(parsers):
            frame = ttk.LabelFrame(compare_frame, text=pname, padding=3)
            frame.grid(row=0, column=i, sticky="nsew", padx=2)
            compare_frame.columnconfigure(i, weight=1)
            compare_frame.rowconfigure(0, weight=1)

            btn_frame = ttk.Frame(frame)
            btn_frame.pack(fill=tk.X)
            ttk.Button(btn_frame, text="실행", command=lambda p=pid: self.run_single_parser(p)).pack(side=tk.LEFT)
            time_var = tk.StringVar(value="")
            ttk.Label(btn_frame, textvariable=time_var).pack(side=tk.RIGHT)

            text = scrolledtext.ScrolledText(frame, width=38, height=28, wrap=tk.WORD, font=("Consolas", 9))
            text.pack(fill=tk.BOTH, expand=True)

            self.parser_widgets[pid] = {"time_var": time_var, "text": text}

        # === 상세 뷰 탭 ===
        detail_frame = ttk.Frame(self.main_notebook)
        self.main_notebook.add(detail_frame, text="🔍 상세 뷰 (1개)")

        # 파서 선택
        select_frame = ttk.Frame(detail_frame, padding=5)
        select_frame.pack(fill=tk.X)

        ttk.Label(select_frame, text="파서 선택:").pack(side=tk.LEFT)
        self.detail_parser_var = tk.StringVar(value="pdfplumber")
        for pname, pid in [("pdfplumber", "pdfplumber"), ("OpenAI", "openai"), ("Upstage", "upstage")]:
            ttk.Radiobutton(select_frame, text=pname, variable=self.detail_parser_var, value=pid,
                           command=self.update_detail_view).pack(side=tk.LEFT, padx=5)
        ttk.Button(select_frame, text="실행", command=self.run_detail_parser).pack(side=tk.LEFT, padx=20)

        # 상세 결과 - 2열 (요약 + JSON)
        detail_content = ttk.Frame(detail_frame)
        detail_content.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        # 왼쪽: 요약
        left_frame = ttk.LabelFrame(detail_content, text="파싱 결과", padding=5)
        left_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=2)

        self.detail_text = scrolledtext.ScrolledText(left_frame, wrap=tk.WORD, font=("Consolas", 10))
        self.detail_text.pack(fill=tk.BOTH, expand=True)

        # 오른쪽: JSON
        right_frame = ttk.LabelFrame(detail_content, text="JSON 원본", padding=5)
        right_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=2)

        self.json_text = scrolledtext.ScrolledText(right_frame, wrap=tk.WORD, font=("Consolas", 9))
        self.json_text.pack(fill=tk.BOTH, expand=True)

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
        thread = threading.Thread(target=self._parse, args=(parser_id,))
        thread.start()

    def run_detail_parser(self):
        pid = self.detail_parser_var.get()
        self.run_single_parser(pid)

    def run_all_parsers(self):
        if not self.file_path_var.get():
            messagebox.showwarning("경고", "PDF 파일을 선택하세요.")
            return
        self.results = {}
        for item in self.summary_tree.get_children():
            self.summary_tree.delete(item)
        self.status_var.set("3개 파서 순차 실행 중...")
        thread = threading.Thread(target=self._run_all_sequential)
        thread.start()

    def _run_all_sequential(self):
        for pid in ["pdfplumber", "openai", "upstage"]:
            self.root.after(0, lambda p=pid: self.status_var.set(f"{p} 파싱 중..."))
            self._parse(pid)
            time.sleep(0.3)
        self.root.after(0, lambda: self.status_var.set("완료"))

    def _parse(self, parser_id):
        file_path = self.file_path_var.get()
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
            self.results[parser_id] = {"result": result, "time": elapsed}
            self.root.after(0, lambda: self._update_ui(parser_id, result, elapsed))
        except Exception as e:
            error_result = {"error": str(e)}
            self.root.after(0, lambda: self._update_ui(parser_id, error_result, 0))

    def _update_ui(self, parser_id, result, elapsed):
        # 비교 뷰 업데이트
        widgets = self.parser_widgets[parser_id]
        widgets["time_var"].set(f"{elapsed:.2f}초")
        text = widgets["text"]
        text.delete(1.0, tk.END)

        if "error" in result:
            text.insert(tk.END, f"오류: {result['error']}\n")
            status, total_str, contract_count, lapsed_count = "오류", "-", "-", "-"
        else:
            total = result.get("총_월보험료")
            contracts = result.get("보유계약 현황", [])
            lapsed = result.get("부활가능 실효계약", [])
            total_str = f"{total:,}원" if total is not None else "추출실패"
            contract_count, lapsed_count, status = len(contracts), len(lapsed), "성공"

            text.insert(tk.END, f"총 월보험료: {total_str}\n")
            text.insert(tk.END, f"보유계약: {contract_count}건 | 부활가능: {lapsed_count}건\n")
            text.insert(tk.END, "─" * 30 + "\n")

            for i, c in enumerate(contracts, 1):
                premium = c.get("보험료(원)", 0)
                p_str = f"{premium:,}" if isinstance(premium, int) else str(premium)
                text.insert(tk.END, f"[{i}] {c.get('증권번호', '')}\n")
                text.insert(tk.END, f"    {c.get('보험상품', '')[:18]}\n")
                text.insert(tk.END, f"    {c.get('계약자', '')} | {p_str}원\n")

            if lapsed:
                text.insert(tk.END, "\n【부활가능】\n")
                for i, c in enumerate(lapsed, 1):
                    text.insert(tk.END, f"[{i}] {c.get('증권번호', '')} - {c.get('보험상품', '')[:12]}\n")

        # 요약 테이블 업데이트
        for item in self.summary_tree.get_children():
            if self.summary_tree.item(item)["values"][0] == parser_id:
                self.summary_tree.delete(item)
                break
        self.summary_tree.insert("", tk.END, values=(parser_id, f"{elapsed:.2f}초", total_str, contract_count, lapsed_count, status))

        # 상세 뷰 업데이트
        if parser_id == self.detail_parser_var.get():
            self.update_detail_view()

        self._update_comparison()

    def update_detail_view(self):
        """상세 뷰 탭 업데이트"""
        pid = self.detail_parser_var.get()
        if pid not in self.results:
            self.detail_text.delete(1.0, tk.END)
            self.detail_text.insert(tk.END, "실행 버튼을 눌러 파싱하세요.\n")
            self.json_text.delete(1.0, tk.END)
            return

        data = self.results[pid]
        result = data["result"]
        elapsed = data["time"]

        self.detail_text.delete(1.0, tk.END)
        self.json_text.delete(1.0, tk.END)

        if "error" in result:
            self.detail_text.insert(tk.END, f"오류: {result['error']}\n")
        else:
            total = result.get("총_월보험료")
            contracts = result.get("보유계약 현황", [])
            lapsed = result.get("부활가능 실효계약", [])

            self.detail_text.insert(tk.END, f"파서: {pid}\n")
            self.detail_text.insert(tk.END, f"소요시간: {elapsed:.2f}초\n")
            self.detail_text.insert(tk.END, "=" * 50 + "\n\n")
            self.detail_text.insert(tk.END, f"총 월보험료: {total:,}원\n" if total is not None else "총 월보험료: 추출실패\n")
            self.detail_text.insert(tk.END, f"보유계약: {len(contracts)}건\n")
            self.detail_text.insert(tk.END, f"부활가능 실효계약: {len(lapsed)}건\n")
            self.detail_text.insert(tk.END, "\n" + "=" * 50 + "\n")
            self.detail_text.insert(tk.END, "【 보유계약 상세 】\n\n")

            for i, c in enumerate(contracts, 1):
                premium = c.get("보험료(원)", 0)
                p_str = f"{premium:,}원" if isinstance(premium, int) else str(premium)
                self.detail_text.insert(tk.END, f"[{i}] 증권번호: {c.get('증권번호', '')}\n")
                self.detail_text.insert(tk.END, f"    보험상품: {c.get('보험상품', '')}\n")
                self.detail_text.insert(tk.END, f"    계약자: {c.get('계약자', '')} | 피보험자: {c.get('피보험자', '')}\n")
                self.detail_text.insert(tk.END, f"    계약일: {c.get('계약일', '')} | 상태: {c.get('계약상태', '')}\n")
                self.detail_text.insert(tk.END, f"    보험료: {p_str}\n\n")

            if lapsed:
                self.detail_text.insert(tk.END, "=" * 50 + "\n")
                self.detail_text.insert(tk.END, "【 부활가능 실효계약 】\n\n")
                for i, c in enumerate(lapsed, 1):
                    self.detail_text.insert(tk.END, f"[{i}] {c.get('증권번호', '')} - {c.get('보험상품', '')}\n")

        self.json_text.insert(tk.END, json.dumps(result, ensure_ascii=False, indent=2))

    def _update_comparison(self):
        if len(self.results) < 2:
            return
        counts = {}
        for pid, data in self.results.items():
            r = data["result"]
            if "error" not in r:
                counts[pid] = len(r.get("보유계약 현황", []))
        if counts:
            unique = set(counts.values())
            if len(unique) == 1:
                self.status_var.set(f"완료 - 계약수 일치 ({list(unique)[0]}건)")
            else:
                self.status_var.set(f"완료 - 계약수 불일치! {counts}")


def run_single_parser_cli(parser_id: str, file_path: str, output_json: bool = False):
    if not os.path.exists(file_path):
        print(f"오류: 파일을 찾을 수 없습니다: {file_path}")
        sys.exit(1)

    print(f"파서: {parser_id}")
    print(f"파일: {file_path}")
    print("-" * 50)

    try:
        start_time = time.time()
        if parser_id == "openai":
            from services.parser import parse_annual_report
        elif parser_id == "pdfplumber":
            from services.parser_pdfplumber import parse_annual_report
        elif parser_id == "upstage":
            from services.parser_upstage import parse_annual_report
        else:
            print(f"오류: 알 수 없는 파서: {parser_id}")
            sys.exit(1)

        result = parse_annual_report(file_path)
        elapsed = time.time() - start_time

        if output_json:
            print(json.dumps(result, ensure_ascii=False, indent=2))
        else:
            if "error" in result:
                print(f"오류: {result['error']}")
            else:
                total = result.get("총_월보험료")
                print(f"총 월보험료: {total:,}원" if total is not None else "총 월보험료: 추출실패")
                contracts = result.get("보유계약 현황", [])
                print(f"보유계약: {len(contracts)}건")
                for i, c in enumerate(contracts, 1):
                    premium = c.get('보험료(원)', 0)
                    p_str = f"{premium:,}원" if isinstance(premium, int) else str(premium)
                    print(f"  [{i}] {c.get('증권번호', '')} - {c.get('보험상품', '')[:20]} ({p_str})")
                lapsed = result.get("부활가능 실효계약", [])
                if lapsed:
                    print(f"부활가능 실효계약: {len(lapsed)}건")
        print("-" * 50)
        print(f"소요시간: {elapsed:.2f}초")
    except Exception as e:
        print(f"오류: {e}")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="AR 파서 비교 도구")
    parser.add_argument("--parser", "-p", choices=["openai", "pdfplumber", "upstage"])
    parser.add_argument("--file", "-f", help="PDF 파일 경로")
    parser.add_argument("--json", "-j", action="store_true")

    args = parser.parse_args()

    if args.parser:
        if not args.file:
            print("오류: --file 옵션이 필요합니다.")
            sys.exit(1)
        run_single_parser_cli(args.parser, args.file, args.json)
    else:
        root = tk.Tk()
        app = ParserCompareGUI(root)
        root.mainloop()


if __name__ == "__main__":
    main()

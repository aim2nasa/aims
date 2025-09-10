#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# 요구: pip install pdfminer.six
# GUI: Tkinter(표준 내장) + 한글 폰트 강제 지정

import re
import shutil
from pathlib import Path
from datetime import datetime
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import tkinter.font as tkfont

# pdfminer
try:
    from pdfminer_high_level import extract_text  # 타입오류 방지용 별칭
except Exception:
    from pdfminer.high_level import extract_text

ILLEGAL = r'\/:*?"<>|'

def sanitize_filename(name: str) -> str:
    for ch in ILLEGAL:
        name = name.replace(ch, "")
    name = re.sub(r"\s+", " ", name).strip()
    reserved = {
        "CON","PRN","AUX","NUL","COM1","COM2","COM3","COM4","COM5","COM6","COM7","COM8","COM9",
        "LPT1","LPT2","LPT3","LPT4","LPT5","LPT6","LPT7","LPT8","LPT9"
    }
    parts = [p if p.upper() not in reserved else f"_{p}" for p in name.split()]
    return " ".join(parts)

def normalize_date(raw: str) -> str:
    raw = raw.strip()
    m = re.search(r"(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일", raw)
    if m:
        y, mo, d = map(int, m.groups())
        return f"{y:04d}-{mo:02d}-{d:02d}"
    m = re.search(r"(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})", raw)
    if m:
        y, mo, d = map(int, m.groups())
        return f"{y:04d}-{mo:02d}-{d:02d}"
    return datetime.now().strftime("%Y-%m-%d")

def normalize_product(raw: str) -> str:
    s = raw
    s = re.sub(r"^\s*무\)\s*", "", s)        # "무)" 제거
    s = re.sub(r"V(?=보험)", "", s)          # "V보험" -> "보험"
    m = re.search(r"(.+?보험(?:\([^)]*\))?)", s)
    if m:
        s = m.group(1)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def extract_first_page_text(pdf_path: Path) -> str:
    return extract_text(str(pdf_path), page_numbers=[0]) or ""

def find_customer(text: str) -> str:
    m = re.search(r"계약자\s*[:：]\s*([^\s\n]+)", text)
    if m:
        return m.group(1)
    m = re.search(r"([^\s\n]+)\s*고객님", text)
    if m:
        return m.group(1)
    return "고객"

def find_product(text: str) -> str:
    for ln in [ln.strip() for ln in text.splitlines() if ln.strip()]:
        if "변액유니버셜" in ln or ("보험" in ln and "월납" in ln):
            return normalize_product(ln)
    m = re.search(r"상품명\s*[:：]?\s*(.+)", text)
    if m:
        return normalize_product(m.group(1))
    return "상품"

def find_issue_date(text: str) -> str:
    m = re.search(r"발행\(기준\)일\s*[:：]\s*([^\n]+)", text)
    if m:
        return normalize_date(m.group(1))
    m = re.search(r"\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일", text)
    if m:
        return normalize_date(m.group(0))
    m = re.search(r"\d{4}[.\-\/]\d{1,2}[.\-\/]\d{1,2}", text)
    if m:
        return normalize_date(m.group(0))
    return datetime.now().strftime("%Y-%m-%d")

def build_filename(customer: str, product: str, date_yyyy_mm_dd: str) -> str:
    base = f"{customer}_CRS_{product}_{date_yyyy_mm_dd}.pdf"
    return sanitize_filename(base)

def unique_path(dest: Path) -> Path:
    if not dest.exists():
        return dest
    stem, suf = dest.stem, dest.suffix
    i = 2
    while True:
        cand = dest.with_name(f"{stem}({i}){suf}")
        if not cand.exists():
            return cand
        i += 1

def process_one(pdf_in: Path, outdir: Path) -> Path:
    text = extract_first_page_text(pdf_in)
    customer = find_customer(text)
    product  = find_product(text)
    issue_dt = find_issue_date(text)
    new_name = build_filename(customer, product, issue_dt)
    outdir.mkdir(parents=True, exist_ok=True)
    target = unique_path(outdir / new_name)
    shutil.copy2(pdf_in, target)
    return target

# ---------- GUI ----------

FONT_CANDIDATES = [
    "NanumGothic",        # Ubuntu: fonts-nanum
    "Noto Sans CJK KR",   # Noto CJK
    "Noto Sans KR",
    "Malgun Gothic",      # Windows
    "맑은 고딕",            # Windows(한글명)
    "Apple SD Gothic Neo",
    "Arial Unicode MS",
    "DejaVu Sans"         # 최후 보루
]

def set_korean_fonts(root: tk.Tk):
    # 설치된 폰트 목록
    installed = set(f for f in tkfont.families(root))
    # 후보 중 첫 가용 폰트 선택
    chosen = next((f for f in FONT_CANDIDATES if f in installed), None)

    # 기본 폰트 세트에 적용
    for name in ("TkDefaultFont", "TkTextFont", "TkMenuFont", "TkHeadingFont", "TkFixedFont"):
        try:
            f = tkfont.nametofont(name)
            if chosen:
                f.configure(family=chosen)
            else:
                # 폰트가 하나도 없으면, DejaVu Sans 시도(보통 존재)
                f.configure(family="DejaVu Sans")
        except Exception:
            pass
    return chosen or "DejaVu Sans"

class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("CRS PDF 리네임 도구")
        self.geometry("760x560")

        chosen = set_korean_fonts(self)  # ← 한글 폰트 강제 지정
        self.selected_files = []
        self.outdir = None

        frm = ttk.Frame(self, padding=12)
        frm.pack(fill="both", expand=True)

        # 상단 버튼
        btns = ttk.Frame(frm)
        btns.pack(fill="x", pady=(0,8))
        ttk.Button(btns, text="PDF 선택(복수)", command=self.choose_files).pack(side="left")
        ttk.Button(btns, text="출력 폴더 선택(선택)", command=self.choose_outdir).pack(side="left", padx=6)
        ttk.Button(btns, text="실행", command=self.run).pack(side="right")

        # 폰트 정보
        ttk.Label(frm, text=f"사용 폰트: {chosen}").pack(anchor="w", pady=(0,6))

        # 파일 리스트
        ttk.Label(frm, text="선택된 파일:").pack(anchor="w")
        self.listbox = tk.Listbox(frm, height=10)
        self.listbox.pack(fill="both", expand=False, pady=4)

        # 진행률
        self.pbar = ttk.Progressbar(frm, mode="determinate")
        self.pbar.pack(fill="x", pady=(4,8))

        # 로그
        ttk.Label(frm, text="로그:").pack(anchor="w")
        self.log = tk.Text(frm, height=12, wrap="word")   # wrap 단어 단위
        self.log.pack(fill="both", expand=True)
        self.log.config(state="disabled")

        # 도움말
        help_txt = ("사용법: 'PDF 선택(복수)' → 필요시 '출력 폴더 선택' → '실행'\n"
                    "출력 폴더 미선택 시 각 원본 파일과 동일 폴더에 저장.\n"
                    "의존성: pdfminer.six  / 폰트 미설치시 'sudo apt install fonts-nanum' 권장.")
        ttk.Label(frm, text=help_txt).pack(anchor="w", pady=(8,0))

    def choose_files(self):
        files = filedialog.askopenfilenames(
            title="PDF 파일 선택",
            filetypes=[("PDF files","*.pdf"), ("All files","*.*")]
        )
        if not files:
            return
        self.selected_files = list(files)
        self.listbox.delete(0, tk.END)
        for f in self.selected_files:
            self.listbox.insert(tk.END, f)

    def choose_outdir(self):
        d = filedialog.askdirectory(title="출력 폴더 선택")
        if d:
            self.outdir = Path(d)
            self._log(f"[출력폴더] {self.outdir}")

    def run(self):
        # pdfminer 설치 체크
        try:
            _ = extract_text
        except Exception:
            messagebox.showerror("오류", "pdfminer.six가 설치되어 있지 않습니다.\nvenv 진입 후 'pip install pdfminer.six' 실행.")
            return

        if not self.selected_files:
            messagebox.showwarning("안내", "PDF 파일을 먼저 선택하세요.")
            return

        total = len(self.selected_files)
        self.pbar.configure(maximum=total, value=0)
        ok, fail = 0, 0

        for idx, f in enumerate(self.selected_files, start=1):
            try:
                src = Path(f)
                outdir = self.outdir if self.outdir else src.parent
                target = process_one(src, outdir)
                ok += 1
                self._log(f"[OK] {src.name} → {target.name}")
            except Exception as e:
                fail += 1
                self._log(f"[FAIL] {Path(f).name} → {e}")
            finally:
                self.pbar.configure(value=idx)
                self.update_idletasks()

        messagebox.showinfo("완료", f"처리 완료: 성공 {ok} / 실패 {fail}")

    def _log(self, msg: str):
        self.log.config(state="normal")
        self.log.insert("end", msg + "\n")
        self.log.see("end")
        self.log.config(state="disabled")

if __name__ == "__main__":
    app = App()
    app.mainloop()

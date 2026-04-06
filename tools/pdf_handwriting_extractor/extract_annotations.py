"""
PDF Annotation(손글씨) 레이어 추출 GUI v0.1.1

PDF에서 Annotation 레이어만 분리 추출하는 실험 도구.
- Annotation 포함/제외 렌더링 → numpy diff → Annotation만 분리
- 이진화(흑백) 버전 생성
- 페이지별 추출 및 저장
- 추출된 Annotation 이미지를 Upstage OCR로 텍스트 변환

필요 라이브러리:
    pip install PyMuPDF Pillow numpy requests python-dotenv
"""

import os
import threading
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
from io import BytesIO
from pathlib import Path

import fitz  # PyMuPDF
import numpy as np
import requests
from PIL import Image, ImageTk
from dotenv import dotenv_values

try:
    from tkinterdnd2 import TkinterDnD, DND_FILES
    HAS_DND = True
except ImportError:
    HAS_DND = False

VERSION = "0.1.3"
DIFF_THRESHOLD = 10  # 렌더링 미세 차이 무시 임계값

# ── API 키 로드 (.env 파일들 + 환경변수) ──
try:
    _aims_root = Path(__file__).resolve().parents[2]  # aims/
except NameError:
    _aims_root = Path.cwd()

_env_files = [
    _aims_root / "backend" / "api" / "document_pipeline" / ".env",
    _aims_root / "backend" / "api" / "aims_api" / ".env",
    _aims_root / "backend" / "api" / "annual_report_api" / ".env",
    _aims_root / ".env.shared",  # 최우선 (마지막 로드 = 덮어쓰기)
]
_env = {}
for _ef in _env_files:
    if _ef.exists():
        _env.update(dotenv_values(_ef))


def _get_key(name):
    return _env.get(name, os.environ.get(name, ""))


UPSTAGE_API_KEY = _get_key("UPSTAGE_API_KEY")
ANTHROPIC_API_KEY = _get_key("ANTHROPIC_API_KEY")
OPENAI_API_KEY = _get_key("OPENAI_API_KEY")
GEMINI_API_KEY = _get_key("GEMINI_API_KEY") or _get_key("GOOGLE_API_KEY")

# ── 모델 옵션 ──
VISION_MODELS = {
    "upstage-ocr": "Upstage OCR",
    "claude-sonnet": "Claude Sonnet 4",
    "gpt-4o": "GPT-4o",
    "gemini-2.5-flash": "Gemini 2.5 Flash",
    "gemini-2.5-pro": "Gemini 2.5 Pro",
    "gemini-2.5-flash-lite": "Gemini 2.5 Flash-Lite",
}

HANDWRITING_PROMPT = "이 이미지에 손글씨로 쓰여진 텍스트를 정확히 읽어주세요. 텍스트만 출력하세요."


def ocr_image(image_bytes: bytes, filename: str = "annotation.png",
              model: str = "upstage-ocr") -> dict:
    """이미지에서 손글씨 텍스트 추출

    Returns:
        {"error": bool, "text": str, "confidence": float|None, "message": str, "model": str}
    """
    if model == "upstage-ocr":
        return _ocr_upstage(image_bytes, filename)
    elif model == "claude-sonnet":
        return _ocr_claude(image_bytes)
    elif model == "gpt-4o":
        return _ocr_openai(image_bytes)
    elif model.startswith("gemini"):
        return _ocr_gemini(image_bytes, model)
    else:
        return {"error": True, "text": "", "confidence": None,
                "message": f"알 수 없는 모델: {model}", "model": model}


def _ocr_upstage(image_bytes, filename):
    if not UPSTAGE_API_KEY:
        return {"error": True, "text": "", "confidence": None,
                "message": "UPSTAGE_API_KEY 미설정", "model": "upstage-ocr"}
    try:
        resp = requests.post(
            "https://api.upstage.ai/v1/document-digitization",
            headers={"Authorization": f"Bearer {UPSTAGE_API_KEY}"},
            files={"document": (filename, image_bytes)},
            data={"model": "ocr"},
            timeout=120,
        )
        if resp.status_code != 200:
            return {"error": True, "text": "", "confidence": None,
                    "message": f"HTTP {resp.status_code}: {resp.text[:200]}",
                    "model": "upstage-ocr"}
        data = resp.json()
        return {"error": False, "text": data.get("text", ""),
                "confidence": data.get("confidence"),
                "message": "성공", "model": "upstage-ocr"}
    except Exception as e:
        return {"error": True, "text": "", "confidence": None,
                "message": str(e), "model": "upstage-ocr"}


def _ocr_claude(image_bytes):
    if not ANTHROPIC_API_KEY:
        return {"error": True, "text": "", "confidence": None,
                "message": "ANTHROPIC_API_KEY 미설정", "model": "claude-sonnet"}
    import base64
    b64 = base64.b64encode(image_bytes).decode()
    try:
        resp = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 1024,
                "messages": [{"role": "user", "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": b64}},
                    {"type": "text", "text": HANDWRITING_PROMPT},
                ]}],
            },
            timeout=60,
        )
        if resp.status_code != 200:
            return {"error": True, "text": "", "confidence": None,
                    "message": f"HTTP {resp.status_code}: {resp.text[:200]}",
                    "model": "claude-sonnet"}
        data = resp.json()
        text = data.get("content", [{}])[0].get("text", "")
        return {"error": False, "text": text, "confidence": None,
                "message": "성공", "model": "claude-sonnet"}
    except Exception as e:
        return {"error": True, "text": "", "confidence": None,
                "message": str(e), "model": "claude-sonnet"}


def _ocr_openai(image_bytes):
    if not OPENAI_API_KEY:
        return {"error": True, "text": "", "confidence": None,
                "message": "OPENAI_API_KEY 미설정", "model": "gpt-4o"}
    import base64
    b64 = base64.b64encode(image_bytes).decode()
    try:
        resp = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "gpt-4o",
                "max_tokens": 1024,
                "messages": [{"role": "user", "content": [
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
                    {"type": "text", "text": HANDWRITING_PROMPT},
                ]}],
            },
            timeout=60,
        )
        if resp.status_code != 200:
            return {"error": True, "text": "", "confidence": None,
                    "message": f"HTTP {resp.status_code}: {resp.text[:200]}",
                    "model": "gpt-4o"}
        data = resp.json()
        text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        return {"error": False, "text": text, "confidence": None,
                "message": "성공", "model": "gpt-4o"}
    except Exception as e:
        return {"error": True, "text": "", "confidence": None,
                "message": str(e), "model": "gpt-4o"}


def _ocr_gemini(image_bytes, model_name):
    if not GEMINI_API_KEY:
        return {"error": True, "text": "", "confidence": None,
                "message": "GEMINI_API_KEY 미설정", "model": model_name}
    import base64
    b64 = base64.b64encode(image_bytes).decode()
    try:
        resp = requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={GEMINI_API_KEY}",
            headers={"Content-Type": "application/json"},
            json={
                "contents": [{"parts": [
                    {"inline_data": {"mime_type": "image/png", "data": b64}},
                    {"text": HANDWRITING_PROMPT},
                ]}],
            },
            timeout=60,
        )
        if resp.status_code != 200:
            return {"error": True, "text": "", "confidence": None,
                    "message": f"HTTP {resp.status_code}: {resp.text[:200]}",
                    "model": model_name}
        data = resp.json()
        text = (data.get("candidates", [{}])[0]
                .get("content", {}).get("parts", [{}])[0].get("text", ""))
        return {"error": False, "text": text, "confidence": None,
                "message": "성공", "model": model_name}
    except Exception as e:
        return {"error": True, "text": "", "confidence": None,
                "message": str(e), "model": model_name}


def render_page(page, scale=1.0, clip=None, annots=True):
    """페이지를 numpy 배열로 렌더링"""
    mat = fitz.Matrix(scale, scale)
    kwargs = {"matrix": mat, "alpha": False}
    if clip:
        kwargs["clip"] = clip
    kwargs["annots"] = annots
    pix = page.get_pixmap(**kwargs)
    arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3)
    return arr.copy()  # fitz 버퍼에서 분리


def extract_annotation_diff(img_with, img_without):
    """두 렌더링의 차이에서 Annotation만 추출

    Returns:
        (annot_only, binary) — 둘 다 numpy uint8 배열
    """
    diff = np.abs(img_with.astype(int) - img_without.astype(int))
    mask = np.any(diff > DIFF_THRESHOLD, axis=2)

    # 흰 배경 + Annotation 원색
    annot_only = np.ones_like(img_with) * 255
    annot_only[mask] = img_with[mask]

    # 이진화: 차이 있는 픽셀 → 검정
    binary = np.ones_like(img_with) * 255
    binary[mask] = 0

    return annot_only.astype(np.uint8), binary.astype(np.uint8)


def numpy_to_pil(arr):
    return Image.fromarray(arr)


class App:
    def __init__(self, root):
        self.root = root
        self.root.title(f"PDF Annotation 추출 v{VERSION}")
        self.root.geometry("1100x750")
        self.root.minsize(900, 600)

        self.pdf_path = None
        self.doc = None
        self.current_page = 0
        self.page_annot_info = []  # [(page_idx, annot_count, types_dict), ...]
        self._photo = None  # PhotoImage 참조 유지
        self._render_scale = 2.0
        self._doc_lock = threading.Lock()  # fitz.Document 스레드 안전 접근
        self._busy = False  # 작업 중 플래그 (중첩 방지)

        self._build_ui()
        self._setup_dnd()

    # ────────────────────────── UI ──────────────────────────

    def _build_ui(self):
        # 상단: 파일 + 페이지 네비
        top = ttk.Frame(self.root, padding=8)
        top.pack(fill=tk.X)

        self.path_var = tk.StringVar(value="PDF 파일을 선택하거나 드래그하세요")
        ttk.Entry(top, textvariable=self.path_var, state="readonly").pack(
            side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 5)
        )
        ttk.Button(top, text="파일 선택", command=self._select_file).pack(side=tk.LEFT, padx=(0, 10))

        ttk.Button(top, text="<", width=3, command=self._prev_page).pack(side=tk.LEFT)
        self.page_var = tk.StringVar(value="- / -")
        ttk.Label(top, textvariable=self.page_var, width=12, anchor=tk.CENTER).pack(side=tk.LEFT)
        ttk.Button(top, text=">", width=3, command=self._next_page).pack(side=tk.LEFT, padx=(0, 10))

        ttk.Label(top, text="배율:").pack(side=tk.LEFT)
        self.scale_var = tk.StringVar(value="2")
        scale_combo = ttk.Combobox(top, textvariable=self.scale_var, values=["1", "2", "3", "4"], width=3, state="readonly")
        scale_combo.pack(side=tk.LEFT, padx=(0, 10))
        scale_combo.bind("<<ComboboxSelected>>", lambda e: self._on_scale_change())

        # 중단: 보기 모드 + 액션
        mid = ttk.Frame(self.root, padding=(8, 0, 8, 4))
        mid.pack(fill=tk.X)

        ttk.Label(mid, text="보기:").pack(side=tk.LEFT)
        self.view_var = tk.StringVar(value="annot_only")
        views = [
            ("Annotation만", "annot_only"),
            ("이진화", "binary"),
            ("원본 (Annotation 제거)", "original"),
            ("Annotation 포함", "with_annot"),
        ]
        for label, val in views:
            ttk.Radiobutton(mid, text=label, variable=self.view_var, value=val,
                            command=self._refresh_view).pack(side=tk.LEFT, padx=4)

        ttk.Separator(mid, orient=tk.VERTICAL).pack(side=tk.LEFT, fill=tk.Y, padx=8)
        ttk.Button(mid, text="현재 페이지 저장", command=self._save_current).pack(side=tk.LEFT, padx=(0, 5))
        ttk.Button(mid, text="전체 페이지 추출", command=self._extract_all).pack(side=tk.LEFT, padx=(0, 5))
        ttk.Separator(mid, orient=tk.VERTICAL).pack(side=tk.LEFT, fill=tk.Y, padx=8)
        ttk.Label(mid, text="모델:").pack(side=tk.LEFT)
        self.ocr_model_var = tk.StringVar(value="claude-sonnet")
        model_combo = ttk.Combobox(mid, textvariable=self.ocr_model_var,
                                    values=list(VISION_MODELS.keys()), width=15, state="readonly")
        model_combo.pack(side=tk.LEFT, padx=(2, 5))
        ttk.Button(mid, text="OCR 텍스트 추출", command=self._ocr_all_annot_pages).pack(side=tk.LEFT)

        # 상태바
        self.status_var = tk.StringVar(value="대기 중")
        ttk.Label(self.root, textvariable=self.status_var, relief=tk.SUNKEN, padding=3).pack(
            fill=tk.X, side=tk.BOTTOM
        )

        # 프로그레스바
        self.progress = ttk.Progressbar(self.root, mode="indeterminate")
        self.progress.pack(fill=tk.X, padx=8, side=tk.BOTTOM, pady=(0, 2))

        # 메인: place로 비율 기반 절대 배치
        # 좌측 20% | 중앙 40% | 우측 40%
        main = ttk.Frame(self.root)
        main.pack(fill=tk.BOTH, expand=True, padx=8, pady=4)

        # 좌측: 페이지별 Annotation 정보 (20%)
        left_lf = tk.LabelFrame(main, text="Annotation 정보", padx=5, pady=5)
        left_lf.place(relx=0, rely=0, relwidth=0.2, relheight=1.0)

        self.info_tree = ttk.Treeview(left_lf, columns=("page", "count", "types"), show="headings",
                                       selectmode="browse")
        self.info_tree.heading("page", text="페이지")
        self.info_tree.heading("count", text="개수")
        self.info_tree.heading("types", text="타입")
        self.info_tree.column("page", width=50, anchor=tk.CENTER)
        self.info_tree.column("count", width=45, anchor=tk.CENTER)
        self.info_tree.column("types", width=120)
        self.info_tree.pack(fill=tk.BOTH, expand=True)
        self.info_tree.bind("<<TreeviewSelect>>", self._on_page_select)

        # 중앙: 이미지 캔버스 (40%)
        center_lf = tk.LabelFrame(main, text="미리보기", padx=5, pady=5)
        center_lf.place(relx=0.2, rely=0, relwidth=0.4, relheight=1.0)

        self.canvas = tk.Canvas(center_lf, bg="#e8e8e8")
        self.canvas.pack(fill=tk.BOTH, expand=True)

        # 우측: OCR 입력/출력 (40%) — 상단 이미지 + 하단 텍스트
        right_frame = tk.Frame(main)
        right_frame.place(relx=0.6, rely=0, relwidth=0.4, relheight=1.0)

        # 상단: OCR 입력 이미지
        ocr_input_lf = tk.LabelFrame(right_frame, text="OCR 입력 이미지", padx=5, pady=5)
        ocr_input_lf.place(relx=0, rely=0, relwidth=1.0, relheight=0.5)

        self.ocr_canvas = tk.Canvas(ocr_input_lf, bg="#f5f5f5")
        self.ocr_canvas.pack(fill=tk.BOTH, expand=True)
        self._ocr_photo = None

        # 하단: OCR 출력 텍스트
        ocr_output_lf = tk.LabelFrame(right_frame, text="OCR 출력 텍스트", padx=5, pady=5)
        ocr_output_lf.place(relx=0, rely=0.5, relwidth=1.0, relheight=0.5)

        from tkinter import scrolledtext
        self.result_text = scrolledtext.ScrolledText(ocr_output_lf, wrap=tk.WORD, font=("Consolas", 10))
        self.result_text.pack(fill=tk.BOTH, expand=True)

    # ────────────────────────── 드래그앤드롭 ──────────────────────────

    def _setup_dnd(self):
        if not HAS_DND:
            return
        self.root.drop_target_register(DND_FILES)
        self.root.dnd_bind("<<Drop>>", self._on_drop)

    def _on_drop(self, event):
        raw = event.data.strip()
        # tkdnd: 공백 포함 경로는 {path}로, 다중 파일은 공백 구분
        # {/a/b c.pdf} {/d/e.pdf} 또는 /a/b.pdf /c/d.pdf
        paths = []
        i = 0
        while i < len(raw):
            if raw[i] == "{":
                end = raw.find("}", i)
                if end == -1:
                    break
                paths.append(raw[i + 1:end])
                i = end + 2  # } 뒤 공백 건너뜀
            else:
                end = raw.find(" ", i)
                if end == -1:
                    end = len(raw)
                paths.append(raw[i:end])
                i = end + 1
        # 첫 번째 .pdf 파일만 사용
        for path in paths:
            if path.lower().endswith(".pdf"):
                self._open_pdf(path)
                break

    # ────────────────────────── 파일/페이지 ──────────────────────────

    def _open_pdf(self, path):
        self.pdf_path = path
        self.path_var.set(path)
        self._analyze()

    def _select_file(self):
        path = filedialog.askopenfilename(filetypes=[("PDF", "*.pdf"), ("모든 파일", "*.*")])
        if path:
            self._open_pdf(path)

    def _analyze(self):
        if self._busy:
            return
        self._busy = True
        self.progress.start()
        self.status_var.set("분석 중...")
        threading.Thread(target=self._analyze_worker, daemon=True).start()

    def _analyze_worker(self):
        try:
            with self._doc_lock:
                if self.doc:
                    self.doc.close()
                self.doc = fitz.open(self.pdf_path)
                self.page_annot_info = []

                for i in range(len(self.doc)):
                    page = self.doc[i]
                    annots = list(page.annots()) if page.annots() else []
                    types = {}
                    for a in annots:
                        t = a.type[1]
                        types[t] = types.get(t, 0) + 1
                    self.page_annot_info.append((i, len(annots), types))

            self.current_page = 0
            total_annots = sum(info[1] for info in self.page_annot_info)
            pages_with = sum(1 for info in self.page_annot_info if info[1] > 0)

            self.root.after(0, self._show_analysis, total_annots, pages_with)
        except Exception as e:
            self.root.after(0, self._show_error, str(e))
        finally:
            self._busy = False
            self.root.after(0, self.progress.stop)

    def _show_analysis(self, total_annots, pages_with):
        self.progress.stop()

        # 트리 갱신
        for item in self.info_tree.get_children():
            self.info_tree.delete(item)

        for page_idx, count, types in self.page_annot_info:
            if count > 0:
                types_str = ", ".join(f"{t}:{c}" for t, c in types.items())
                tag = "has_annot"
            else:
                types_str = "-"
                tag = "no_annot"
            self.info_tree.insert("", tk.END,
                                   values=(page_idx + 1, count, types_str),
                                   tags=(tag,))

        self.info_tree.tag_configure("has_annot", foreground="#D04000")
        self.info_tree.tag_configure("no_annot", foreground="#999999")

        self.page_var.set(f"{self.current_page + 1} / {len(self.doc)}")

        if total_annots == 0:
            self.status_var.set("Annotation 없음 — 평탄화(Flatten)되었거나 원본 PDF")
        else:
            self.status_var.set(f"Annotation {total_annots}개 ({pages_with}개 페이지)")

        self._render_current_page()

    def _on_page_select(self, event):
        sel = self.info_tree.selection()
        if not sel:
            return
        idx = self.info_tree.index(sel[0])
        # info_tree에는 모든 페이지가 들어있음
        self.current_page = self.page_annot_info[idx][0]
        self.page_var.set(f"{self.current_page + 1} / {len(self.doc)}")
        self._render_current_page()

    def _prev_page(self):
        if not self.doc:
            return
        if self.current_page > 0:
            self.current_page -= 1
            self.page_var.set(f"{self.current_page + 1} / {len(self.doc)}")
            self._render_current_page()

    def _next_page(self):
        if not self.doc:
            return
        if self.current_page < len(self.doc) - 1:
            self.current_page += 1
            self.page_var.set(f"{self.current_page + 1} / {len(self.doc)}")
            self._render_current_page()

    def _on_scale_change(self):
        self._render_scale = float(self.scale_var.get())
        if self.doc:
            self._render_current_page()

    def _refresh_view(self):
        if self.doc:
            self._render_current_page()

    # ────────────────────────── 렌더링 ──────────────────────────

    def _render_current_page(self):
        self.progress.start()
        self.status_var.set(f"페이지 {self.current_page + 1} 렌더링 중...")
        threading.Thread(target=self._render_worker, daemon=True).start()

    def _render_worker(self):
        try:
            with self._doc_lock:
                page = self.doc[self.current_page]
                scale = self._render_scale
                view = self.view_var.get()

                img_with = render_page(page, scale=scale, annots=True)
                img_without = render_page(page, scale=scale, annots=False)

            annot_only, binary = extract_annotation_diff(img_with, img_without)

            if view == "annot_only":
                result = annot_only
            elif view == "binary":
                result = binary
            elif view == "original":
                result = img_without
            elif view == "with_annot":
                result = img_with
            else:
                result = annot_only

            pil_img = numpy_to_pil(result)
            self.root.after(0, self._show_image, pil_img)
        except Exception as e:
            self.root.after(0, self._show_error, str(e))
        finally:
            self.root.after(0, self.progress.stop)

    def _show_image(self, pil_img):
        self.progress.stop()
        self.canvas.update_idletasks()
        cw = self.canvas.winfo_width() or 400
        ch = self.canvas.winfo_height() or 500
        iw, ih = pil_img.size

        # 캔버스에 fit (축소만, 확대 안 함)
        scale = min(cw / iw, ch / ih, 1.0)
        if scale < 1.0:
            pil_img = pil_img.resize((int(iw * scale), int(ih * scale)), Image.LANCZOS)

        self._photo = ImageTk.PhotoImage(pil_img)
        self.canvas.delete("all")
        self.canvas.create_image(cw // 2, ch // 2, image=self._photo, anchor=tk.CENTER)

        annot_count = self.page_annot_info[self.current_page][1] if self.current_page < len(self.page_annot_info) else 0
        view_label = {
            "annot_only": "Annotation만",
            "binary": "이진화",
            "original": "원본",
            "with_annot": "Annotation 포함",
        }.get(self.view_var.get(), "")
        self.status_var.set(
            f"페이지 {self.current_page + 1} — {view_label} — "
            f"Annotation {annot_count}개 — {iw}x{ih}px"
        )

    # ────────────────────────── 저장 ──────────────────────────

    def _save_current(self):
        if not self.doc:
            messagebox.showwarning("경고", "먼저 PDF를 열어주세요.")
            return
        path = filedialog.asksaveasfilename(
            defaultextension=".png",
            initialfile=f"page{self.current_page + 1}_{self.view_var.get()}.png",
            filetypes=[("PNG", "*.png"), ("모든 파일", "*.*")],
        )
        if not path:
            return

        self.progress.start()
        self.status_var.set("저장 중...")
        threading.Thread(target=self._save_current_worker, args=(path,), daemon=True).start()

    def _save_current_worker(self, path):
        try:
            with self._doc_lock:
                page = self.doc[self.current_page]
                scale = self._render_scale
                view = self.view_var.get()

                img_with = render_page(page, scale=scale, annots=True)
                img_without = render_page(page, scale=scale, annots=False)

            annot_only, binary = extract_annotation_diff(img_with, img_without)
            targets = {"annot_only": annot_only, "binary": binary,
                       "original": img_without, "with_annot": img_with}
            numpy_to_pil(targets[view]).save(path)

            self.root.after(0, lambda: self._done(f"저장 완료: {path}"))
        except Exception as e:
            self.root.after(0, self._show_error, str(e))
        finally:
            self.root.after(0, self.progress.stop)

    def _extract_all(self):
        if not self.doc:
            messagebox.showwarning("경고", "먼저 PDF를 열어주세요.")
            return

        pages_with = [info for info in self.page_annot_info if info[1] > 0]
        if not pages_with:
            messagebox.showinfo("알림", "Annotation이 있는 페이지가 없습니다.")
            return

        output_dir = filedialog.askdirectory(title="저장 폴더 선택")
        if not output_dir:
            return

        self.progress.start()
        self.status_var.set(f"전체 추출 중... ({len(pages_with)}개 페이지)")
        threading.Thread(target=self._extract_all_worker,
                         args=(pages_with, output_dir), daemon=True).start()

    def _extract_all_worker(self, pages_with, output_dir):
        try:
            scale = self._render_scale
            saved = []

            for page_idx, count, types in pages_with:
                with self._doc_lock:
                    page = self.doc[page_idx]
                    img_with = render_page(page, scale=scale, annots=True)
                    img_without = render_page(page, scale=scale, annots=False)
                annot_only, binary = extract_annotation_diff(img_with, img_without)

                prefix = f"page{page_idx + 1}"
                numpy_to_pil(annot_only).save(os.path.join(output_dir, f"{prefix}_annot.png"))
                numpy_to_pil(binary).save(os.path.join(output_dir, f"{prefix}_binary.png"))
                numpy_to_pil(img_without).save(os.path.join(output_dir, f"{prefix}_original.png"))
                numpy_to_pil(img_with).save(os.path.join(output_dir, f"{prefix}_with_annot.png"))
                saved.append(f"페이지 {page_idx + 1}: Annotation {count}개 → 4개 이미지")

            msg = f"추출 완료!\n\n저장 경로: {output_dir}\n\n" + "\n".join(saved)
            self.root.after(0, lambda: self._done_msg(msg, output_dir))
        except Exception as e:
            self.root.after(0, self._show_error, str(e))
        finally:
            self.root.after(0, self.progress.stop)

    # ────────────────────────── OCR ──────────────────────────

    def _ocr_all_annot_pages(self):
        if not self.doc:
            messagebox.showwarning("경고", "먼저 PDF를 열어주세요.")
            return
        if self._busy:
            return

        pages_with = [info for info in self.page_annot_info if info[1] > 0]
        if not pages_with:
            messagebox.showinfo("알림", "Annotation이 있는 페이지가 없습니다.")
            return

        self._busy = True
        self.progress.start()
        model = self.ocr_model_var.get()
        model_label = VISION_MODELS.get(model, model)
        self.status_var.set(f"OCR 추출 중... ({len(pages_with)}개 페이지, {model_label})")
        threading.Thread(target=self._ocr_worker, args=(pages_with, model), daemon=True).start()

    def _ocr_worker(self, pages_with, model):
        try:
            scale = 4  # OCR용은 항상 고해상도 (화면 배율과 무관)
            results = []

            for i, (page_idx, count, types) in enumerate(pages_with):
                self.root.after(0, self.status_var.set,
                                f"OCR 추출 중... 페이지 {page_idx + 1} ({i + 1}/{len(pages_with)})")

                # Annotation 영역의 bounding box 계산 → 해당 영역만 crop해서 OCR
                with self._doc_lock:
                    page = self.doc[page_idx]
                    annots = list(page.annots()) if page.annots() else []
                    if annots:
                        # 전체 Annotation의 bounding box (여백 포함)
                        padding = 10
                        min_x = min(a.rect.x0 for a in annots) - padding
                        min_y = min(a.rect.y0 for a in annots) - padding
                        max_x = max(a.rect.x1 for a in annots) + padding
                        max_y = max(a.rect.y1 for a in annots) + padding
                        clip = fitz.Rect(max(0, min_x), max(0, min_y), max_x, max_y)
                    else:
                        clip = None

                    # clip 영역만 고해상도 렌더링
                    img_with = render_page(page, scale=scale, clip=clip, annots=True)
                    img_without = render_page(page, scale=scale, clip=clip, annots=False)
                annot_only, _ = extract_annotation_diff(img_with, img_without)

                # PNG 바이트로 변환
                pil_img = numpy_to_pil(annot_only)
                buf = BytesIO()
                pil_img.save(buf, format="PNG")
                image_bytes = buf.getvalue()

                # Upstage OCR 호출
                ocr_result = ocr_image(image_bytes, f"page{page_idx + 1}_annot.png",
                                               model=model)

                page_result = {
                    "page": page_idx + 1,
                    "annot_count": count,
                    "error": ocr_result["error"],
                    "text": ocr_result["text"],
                    "confidence": ocr_result["confidence"],
                    "message": ocr_result["message"],
                    "model": ocr_result.get("model", model),
                    "input_image": pil_img,
                    "image_size": (pil_img.width, pil_img.height),
                }
                results.append(page_result)

                # 실패 시에도 계속 진행 (페이지별 독립)

            self.root.after(0, self._show_ocr_results, results)
        except Exception as e:
            self.root.after(0, self._show_error, str(e))
        finally:
            self._busy = False
            self.root.after(0, self.progress.stop)

    def _show_ocr_results(self, results):
        self.progress.stop()

        # 상단: OCR 입력 이미지 표시 (첫 번째 결과의 이미지)
        first_img = None
        for r in results:
            if r.get("input_image"):
                first_img = r["input_image"]
                break

        if first_img:
            self.ocr_canvas.update_idletasks()
            cw = self.ocr_canvas.winfo_width() or 300
            ch = self.ocr_canvas.winfo_height() or 300
            iw, ih = first_img.size
            scale = min(cw / iw, ch / ih, 1.0)
            if scale < 1.0:
                display_img = first_img.resize((int(iw * scale), int(ih * scale)), Image.LANCZOS)
            else:
                display_img = first_img
            self._ocr_photo = ImageTk.PhotoImage(display_img)
            self.ocr_canvas.delete("all")
            self.ocr_canvas.create_image(cw // 2, ch // 2, image=self._ocr_photo, anchor=tk.CENTER)

        # 하단: OCR 출력 텍스트
        lines = []
        success_count = sum(1 for r in results if not r["error"])

        for r in results:
            lines.append(f"--- 페이지 {r['page']} (Annotation {r['annot_count']}개) ---")
            w, h = r.get("image_size", (0, 0))
            lines.append(f"  입력 이미지: {w}x{h}px | 모델: {r.get('model', '?')}")
            if r["error"]:
                lines.append(f"  [오류] {r['message']}")
            else:
                conf = f"confidence: {r['confidence']:.2f}" if r["confidence"] else ""
                lines.append(f"  [성공] {conf}")
                text = r["text"].strip()
                if text:
                    lines.append("")
                    lines.append(text)
                else:
                    lines.append("  (추출된 텍스트 없음)")
            lines.append("")

        self.result_text.delete("1.0", tk.END)
        self.result_text.insert("1.0", "\n".join(lines))
        self.status_var.set(f"OCR 완료 — {success_count}/{len(results)}개 성공")

    # ────────────────────────── 유틸 ──────────────────────────

    def _done(self, msg):
        self.progress.stop()
        self.status_var.set(msg)

    def _done_msg(self, msg, output_dir):
        self.progress.stop()
        self.status_var.set(f"추출 완료 — {output_dir}")
        messagebox.showinfo("완료", msg)

    def _show_error(self, msg):
        self.progress.stop()
        self.status_var.set("오류 발생")
        messagebox.showerror("오류", msg)

    def _on_close(self):
        with self._doc_lock:
            if self.doc:
                self.doc.close()
                self.doc = None
        self.root.destroy()


if __name__ == "__main__":
    root = TkinterDnD.Tk() if HAS_DND else tk.Tk()
    app = App(root)
    root.protocol("WM_DELETE_WINDOW", app._on_close)
    root.mainloop()

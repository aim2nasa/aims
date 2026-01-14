"""
AR Generator - AIMS Annual Report PDF 생성 도구
Python GUI 버전 (exe 패키징용)
"""

import tkinter as tk
from tkinter import ttk, messagebox, filedialog
from datetime import datetime
import os
import sys
from typing import List, Dict, Any
import random

# PDF 생성
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import Color

# PDF 미리보기
import tempfile
import subprocess

# PDF 렌더링
try:
    import fitz  # PyMuPDF
    from PIL import Image, ImageTk
    HAS_PREVIEW = True
except ImportError:
    HAS_PREVIEW = False
    print("Warning: PyMuPDF or Pillow not installed. Preview disabled.")


class Contract:
    """계약 데이터 클래스"""
    def __init__(self,
                 순번: int = 1,
                 증권번호: str = "",
                 보험상품: str = "",
                 계약자: str = "",
                 피보험자: str = "",
                 계약일: str = "",
                 계약상태: str = "정상",
                 가입금액: int = 0,
                 보험기간: str = "종신",
                 납입기간: str = "20년",
                 보험료: int = 0):
        self.순번 = 순번
        self.증권번호 = 증권번호
        self.보험상품 = 보험상품
        self.계약자 = 계약자
        self.피보험자 = 피보험자
        self.계약일 = 계약일
        self.계약상태 = 계약상태
        self.가입금액 = 가입금액
        self.보험기간 = 보험기간
        self.납입기간 = 납입기간
        self.보험료 = 보험료


# 샘플 데이터
SAMPLE_PRODUCTS = [
    '무배당 미리받는GI종신보험(저해지환급금형)',
    '무배당 백만인을위한달러종신보험(저해지환급금형)',
    '무배당 변액유니버셜 오늘의 종신보험 Plus',
    '무배당 모두의 종신보험(저해약환급금형)',
    '무배당 새희망 정기보험',
    '무배당 암보험(갱신형)',
    '무배당 실손의료비보험(갱신형)',
    '무배당 어린이보험(자녀사랑)',
]

SAMPLE_NAMES = ['김철수', '이영희', '박민수', '최지영', '정대호', '강수진', '조현우']


def generate_policy_number() -> str:
    """증권번호 생성"""
    return f"001{random.randint(1000000, 9999999)}"


def random_date(years_back: int = 5) -> str:
    """랜덤 날짜 생성"""
    year = datetime.now().year - random.randint(0, years_back)
    month = random.randint(1, 12)
    day = random.randint(1, 28)
    return f"{year}-{month:02d}-{day:02d}"


def get_preset_data(preset_id: str) -> Dict[str, Any]:
    """프리셋 데이터 반환"""
    today = datetime.now().strftime("%Y-%m-%d")

    presets = {
        'basic': {
            'customerName': random.choice(SAMPLE_NAMES),
            'contracts': [
                Contract(i+1, generate_policy_number(), random.choice(SAMPLE_PRODUCTS),
                        "", "", random_date(), "정상", random.randint(1000, 10000),
                        "종신", "20년", random.randint(100000, 500000))
                for i in range(random.randint(3, 5))
            ]
        },
        'single': {
            'customerName': random.choice(SAMPLE_NAMES),
            'contracts': [
                Contract(1, generate_policy_number(), random.choice(SAMPLE_PRODUCTS),
                        "", "", random_date(), "정상", random.randint(1000, 10000),
                        "종신", "20년", random.randint(100000, 500000))
            ]
        },
        'many': {
            'customerName': random.choice(SAMPLE_NAMES),
            'contracts': [
                Contract(i+1, generate_policy_number(), random.choice(SAMPLE_PRODUCTS),
                        "", "", random_date(), "정상", random.randint(1000, 10000),
                        "종신", "20년", random.randint(100000, 500000))
                for i in range(random.randint(10, 15))
            ]
        },
        'hong': {
            'customerName': '홍길동',
            'fsrName': '송유미',
            'contracts': [
                Contract(1, '0013017050', '무배당 미리받는GI종신보험(저해지환급금형)',
                        '홍길동', '홍길동', '2021-05-09', '정상', 3000, '종신', '60세', 219380),
                Contract(2, '0013107410', '무배당 백만인을위한달러종신보험(저해지환급금형)',
                        '홍길동', '홍길동', '2021-10-31', '정상', 4728, '종신', '5년', 590050),
                Contract(3, '0013262131', '무배당 변액유니버셜 오늘의 종신보험 Plus',
                        '홍길동', '홍길동', '2022-10-17', '정상', 2000, '종신', '10년', 105200),
                Contract(4, '0013526523', '무배당 모두의 종신보험(저해약환급금형)',
                        '홍길동', '홍길동', '2024-06-05', '정상', 9300, '종신', '20년', 200996),
            ]
        },
        'empty': {
            'customerName': random.choice(SAMPLE_NAMES),
            'contracts': []
        },
    }

    return presets.get(preset_id, presets['basic'])


class ARGenerator:
    """AR PDF 생성기"""

    def __init__(self):
        # 한글 폰트 등록
        self.setup_fonts()

    def setup_fonts(self):
        """폰트 설정"""
        # Windows 기본 폰트 경로
        font_paths = [
            "C:/Windows/Fonts/malgun.ttf",
            "C:/Windows/Fonts/NanumGothic.ttf",
            "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
        ]

        for path in font_paths:
            if os.path.exists(path):
                try:
                    pdfmetrics.registerFont(TTFont('Korean', path))
                    return
                except:
                    continue

        # 폰트를 찾지 못한 경우 기본 폰트 사용
        print("Warning: Korean font not found, using default font")

    def generate(self, customer_name: str, issue_date: str, fsr_name: str,
                 contracts: List[Contract], output_path: str) -> str:
        """AR PDF 생성"""

        c = canvas.Canvas(output_path, pagesize=A4)
        width, height = A4

        # 페이지 1: 표지
        self._draw_cover(c, width, height, customer_name, issue_date, fsr_name)
        c.showPage()

        # 페이지 2: 계약 목록
        self._draw_contracts(c, width, height, customer_name, contracts)
        c.showPage()

        c.save()
        return output_path

    def _draw_cover(self, c: canvas.Canvas, width: float, height: float,
                    customer_name: str, issue_date: str, fsr_name: str):
        """표지 그리기"""
        try:
            font_name = 'Korean'
            c.setFont(font_name, 12)
        except:
            font_name = 'Helvetica'
            c.setFont(font_name, 12)

        # MetLife 로고 영역
        c.setFillColor(Color(0, 0.4, 0.2))  # 녹색
        c.setFont(font_name, 24)
        c.drawString(50, height - 80, "MetLife")

        # AR 인식용 키워드 (연한 회색으로)
        c.setFillColor(Color(0.9, 0.9, 0.9))
        c.setFont(font_name, 6)
        c.drawString(width - 100, height - 20, "Annual Review Report")

        # 제목
        c.setFillColor(Color(0, 0, 0))
        c.setFont(font_name, 18)
        c.drawString(50, height - 150, f"{customer_name} 고객님을 위한")

        c.setFillColor(Color(0, 0.3, 0.6))  # 파란색
        c.setFont(font_name, 32)
        c.drawString(50, height - 190, "Annual")
        c.drawString(50, height - 230, "Review Report")

        # 발행일
        c.setFillColor(Color(0.3, 0.3, 0.3))
        c.setFont(font_name, 12)
        c.drawString(50, height - 280, f"발행기준일: {issue_date}")

        # FSR 정보
        if fsr_name:
            c.drawString(50, height - 300, f"담당 FSR: {fsr_name}")

    def _draw_contracts(self, c: canvas.Canvas, width: float, height: float,
                        customer_name: str, contracts: List[Contract]):
        """계약 목록 그리기"""
        try:
            font_name = 'Korean'
            c.setFont(font_name, 12)
        except:
            font_name = 'Helvetica'
            c.setFont(font_name, 12)

        # 제목
        c.setFont(font_name, 16)
        c.drawString(50, height - 50, f"{customer_name} 고객님의 보유계약 현황")

        if not contracts:
            c.setFont(font_name, 12)
            c.drawString(50, height - 100, "등록된 계약이 없습니다.")
            return

        # 테이블 헤더
        y = height - 90
        c.setFont(font_name, 10)
        c.setFillColor(Color(0.9, 0.9, 0.9))
        c.rect(40, y - 5, width - 80, 20, fill=True, stroke=False)

        c.setFillColor(Color(0, 0, 0))
        headers = ['No', '증권번호', '보험상품', '상태', '가입금액', '보험료']
        x_positions = [50, 80, 150, 350, 420, 500]

        for header, x in zip(headers, x_positions):
            c.drawString(x, y, header)

        # 테이블 데이터
        y -= 25
        c.setFont(font_name, 9)

        for contract in contracts:
            if y < 50:  # 페이지 넘침 방지
                break

            c.drawString(50, y, str(contract.순번))
            c.drawString(80, y, contract.증권번호[:10])

            # 상품명 자르기
            product = contract.보험상품
            if len(product) > 25:
                product = product[:25] + "..."
            c.drawString(150, y, product)

            c.drawString(350, y, contract.계약상태)
            c.drawString(420, y, f"{contract.가입금액:,}만원")
            c.drawString(500, y, f"{contract.보험료:,}원")

            y -= 20

        # 합계
        y -= 10
        c.setFont(font_name, 10)
        total_premium = sum(ct.보험료 for ct in contracts)
        c.drawString(400, y, f"총 보험료: {total_premium:,}원")


class ARGeneratorApp:
    """AR Generator GUI 애플리케이션"""

    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("AR Generator - AIMS 테스트 PDF 생성 도구")
        self.root.geometry("1400x750")
        self.root.configure(bg='#f5f5f7')

        self.contracts: List[Contract] = []
        self.generator = ARGenerator()
        self.last_pdf_path: str = None

        # 프리뷰 관련
        self.preview_images: List[Any] = []  # ImageTk 참조 유지
        self.preview_pages: List[Any] = []   # PIL 이미지
        self.current_page: int = 0
        self.total_pages: int = 0

        self.setup_ui()

    def setup_ui(self):
        """UI 구성"""
        # 메인 프레임
        main_frame = ttk.Frame(self.root, padding="10")
        main_frame.pack(fill=tk.BOTH, expand=True)

        # 왼쪽 패널 (입력)
        left_frame = ttk.LabelFrame(main_frame, text="기본 정보", padding="10")
        left_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0, 5))

        # 프리셋 버튼
        preset_frame = ttk.Frame(left_frame)
        preset_frame.pack(fill=tk.X, pady=(0, 10))

        ttk.Label(preset_frame, text="프리셋:").pack(side=tk.LEFT)

        presets = [('기본', 'basic'), ('단일', 'single'), ('다수', 'many'),
                   ('홍길동', 'hong'), ('빈계약', 'empty')]

        for name, preset_id in presets:
            btn = ttk.Button(preset_frame, text=name, width=8,
                           command=lambda p=preset_id: self.load_preset(p))
            btn.pack(side=tk.LEFT, padx=2)

        # 입력 필드
        input_frame = ttk.Frame(left_frame)
        input_frame.pack(fill=tk.X, pady=5)

        # 고객명
        ttk.Label(input_frame, text="고객명 *").grid(row=0, column=0, sticky=tk.W)
        self.customer_name_var = tk.StringVar()
        ttk.Entry(input_frame, textvariable=self.customer_name_var, width=20).grid(row=0, column=1, padx=5)

        # 발행일
        ttk.Label(input_frame, text="발행기준일 *").grid(row=0, column=2, sticky=tk.W)
        self.issue_date_var = tk.StringVar(value=datetime.now().strftime("%Y-%m-%d"))
        ttk.Entry(input_frame, textvariable=self.issue_date_var, width=15).grid(row=0, column=3, padx=5)

        # FSR
        ttk.Label(input_frame, text="FSR").grid(row=0, column=4, sticky=tk.W)
        self.fsr_name_var = tk.StringVar(value="송유미")
        ttk.Entry(input_frame, textvariable=self.fsr_name_var, width=15).grid(row=0, column=5, padx=5)

        # 계약 목록
        contracts_frame = ttk.LabelFrame(left_frame, text="보유계약 목록", padding="5")
        contracts_frame.pack(fill=tk.BOTH, expand=True, pady=10)

        # 트리뷰
        columns = ('no', 'policy', 'product', 'status', 'amount', 'premium')
        self.tree = ttk.Treeview(contracts_frame, columns=columns, show='headings', height=12)

        self.tree.heading('no', text='#')
        self.tree.heading('policy', text='증권번호')
        self.tree.heading('product', text='보험상품')
        self.tree.heading('status', text='상태')
        self.tree.heading('amount', text='가입금액')
        self.tree.heading('premium', text='보험료')

        self.tree.column('no', width=30)
        self.tree.column('policy', width=100)
        self.tree.column('product', width=250)
        self.tree.column('status', width=60)
        self.tree.column('amount', width=80)
        self.tree.column('premium', width=80)

        scrollbar = ttk.Scrollbar(contracts_frame, orient=tk.VERTICAL, command=self.tree.yview)
        self.tree.configure(yscrollcommand=scrollbar.set)

        self.tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

        # 계약 버튼
        btn_frame = ttk.Frame(left_frame)
        btn_frame.pack(fill=tk.X, pady=5)

        ttk.Button(btn_frame, text="+ 계약 추가", command=self.add_contract).pack(side=tk.LEFT, padx=2)
        ttk.Button(btn_frame, text="선택 삭제", command=self.remove_contract).pack(side=tk.LEFT, padx=2)
        ttk.Button(btn_frame, text="전체 삭제", command=self.clear_contracts).pack(side=tk.LEFT, padx=2)

        # 요약
        self.summary_var = tk.StringVar(value="총 0건, 보험료 합계: 0원")
        ttk.Label(left_frame, textvariable=self.summary_var).pack(pady=5)

        # 중앙 패널 (버튼)
        center_frame = ttk.LabelFrame(main_frame, text="PDF 생성", padding="10")
        center_frame.pack(side=tk.LEFT, fill=tk.Y, padx=5)

        ttk.Button(center_frame, text="프리뷰", command=self.show_preview, width=18).pack(pady=5)
        ttk.Button(center_frame, text="PDF 생성", command=self.generate_pdf, width=18).pack(pady=5)
        ttk.Button(center_frame, text="PDF 생성 및 저장", command=self.generate_and_save, width=18).pack(pady=5)
        ttk.Button(center_frame, text="마지막 PDF 열기", command=self.open_last_pdf, width=18).pack(pady=5)

        ttk.Separator(center_frame, orient=tk.HORIZONTAL).pack(fill=tk.X, pady=10)

        # 상태 표시
        self.status_var = tk.StringVar(value="준비됨")
        ttk.Label(center_frame, textvariable=self.status_var, wraplength=140).pack(pady=5)

        # 오른쪽 패널 (프리뷰)
        right_frame = ttk.LabelFrame(main_frame, text="PDF 프리뷰", padding="10")
        right_frame.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True, padx=(5, 0))

        # 프리뷰 캔버스
        preview_container = ttk.Frame(right_frame)
        preview_container.pack(fill=tk.BOTH, expand=True)

        self.preview_canvas = tk.Canvas(preview_container, bg='#e0e0e0', width=400, height=550)
        self.preview_canvas.pack(fill=tk.BOTH, expand=True)

        # 페이지 네비게이션
        nav_frame = ttk.Frame(right_frame)
        nav_frame.pack(fill=tk.X, pady=(10, 0))

        self.prev_btn = ttk.Button(nav_frame, text="◀ 이전", command=self.prev_page, width=10)
        self.prev_btn.pack(side=tk.LEFT, padx=5)

        self.page_var = tk.StringVar(value="- / -")
        ttk.Label(nav_frame, textvariable=self.page_var).pack(side=tk.LEFT, expand=True)

        self.next_btn = ttk.Button(nav_frame, text="다음 ▶", command=self.next_page, width=10)
        self.next_btn.pack(side=tk.RIGHT, padx=5)

        # 초기 상태
        self.update_nav_buttons()

    def load_preset(self, preset_id: str):
        """프리셋 로드"""
        data = get_preset_data(preset_id)

        self.customer_name_var.set(data.get('customerName', ''))
        self.fsr_name_var.set(data.get('fsrName', '송유미'))

        self.contracts = data.get('contracts', [])

        # 계약자/피보험자 이름 설정
        customer_name = self.customer_name_var.get()
        for c in self.contracts:
            if not c.계약자:
                c.계약자 = customer_name
            if not c.피보험자:
                c.피보험자 = customer_name

        self.update_tree()
        self.update_summary()

    def add_contract(self):
        """계약 추가"""
        customer_name = self.customer_name_var.get() or "홍길동"

        contract = Contract(
            순번=len(self.contracts) + 1,
            증권번호=generate_policy_number(),
            보험상품=random.choice(SAMPLE_PRODUCTS),
            계약자=customer_name,
            피보험자=customer_name,
            계약일=random_date(),
            계약상태="정상",
            가입금액=random.randint(1000, 10000),
            보험기간="종신",
            납입기간="20년",
            보험료=random.randint(100000, 500000)
        )

        self.contracts.append(contract)
        self.update_tree()
        self.update_summary()

    def remove_contract(self):
        """선택된 계약 삭제"""
        selected = self.tree.selection()
        if not selected:
            return

        indices = [self.tree.index(item) for item in selected]
        indices.sort(reverse=True)

        for idx in indices:
            del self.contracts[idx]

        # 순번 재정렬
        for i, c in enumerate(self.contracts):
            c.순번 = i + 1

        self.update_tree()
        self.update_summary()

    def clear_contracts(self):
        """전체 계약 삭제"""
        self.contracts = []
        self.update_tree()
        self.update_summary()

    def update_tree(self):
        """트리뷰 업데이트"""
        for item in self.tree.get_children():
            self.tree.delete(item)

        for c in self.contracts:
            product = c.보험상품
            if len(product) > 30:
                product = product[:30] + "..."

            self.tree.insert('', tk.END, values=(
                c.순번,
                c.증권번호,
                product,
                c.계약상태,
                f"{c.가입금액:,}만원",
                f"{c.보험료:,}원"
            ))

    def update_summary(self):
        """요약 업데이트"""
        total = len(self.contracts)
        premium = sum(c.보험료 for c in self.contracts)
        self.summary_var.set(f"총 {total}건, 보험료 합계: {premium:,}원")

    def generate_pdf(self):
        """PDF 생성 (임시 파일)"""
        if not self.validate_input():
            return

        try:
            with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as f:
                output_path = f.name

            self.generator.generate(
                self.customer_name_var.get(),
                self.issue_date_var.get(),
                self.fsr_name_var.get(),
                self.contracts,
                output_path
            )

            self.last_pdf_path = output_path
            self.status_var.set(f"PDF 생성 완료!\n{os.path.basename(output_path)}")

            # PDF 열기
            self.open_pdf(output_path)

        except Exception as e:
            messagebox.showerror("오류", f"PDF 생성 실패:\n{str(e)}")

    def generate_and_save(self):
        """PDF 생성 및 저장"""
        if not self.validate_input():
            return

        customer_name = self.customer_name_var.get()
        issue_date = self.issue_date_var.get().replace("-", "")

        default_name = f"AR_{customer_name}_{issue_date}.pdf"

        file_path = filedialog.asksaveasfilename(
            defaultextension=".pdf",
            filetypes=[("PDF files", "*.pdf")],
            initialfile=default_name
        )

        if not file_path:
            return

        try:
            self.generator.generate(
                self.customer_name_var.get(),
                self.issue_date_var.get(),
                self.fsr_name_var.get(),
                self.contracts,
                file_path
            )

            self.last_pdf_path = file_path
            self.status_var.set(f"저장 완료!\n{os.path.basename(file_path)}")

            messagebox.showinfo("완료", f"PDF가 저장되었습니다:\n{file_path}")

        except Exception as e:
            messagebox.showerror("오류", f"PDF 저장 실패:\n{str(e)}")

    def open_last_pdf(self):
        """마지막 PDF 열기"""
        if self.last_pdf_path and os.path.exists(self.last_pdf_path):
            self.open_pdf(self.last_pdf_path)
        else:
            messagebox.showinfo("알림", "열 PDF가 없습니다. 먼저 PDF를 생성해주세요.")

    def open_pdf(self, path: str):
        """PDF 파일 열기"""
        if sys.platform == 'win32':
            os.startfile(path)
        elif sys.platform == 'darwin':
            subprocess.run(['open', path])
        else:
            subprocess.run(['xdg-open', path])

    def validate_input(self) -> bool:
        """입력 유효성 검사"""
        if not self.customer_name_var.get().strip():
            messagebox.showwarning("입력 오류", "고객명을 입력해주세요.")
            return False

        if not self.issue_date_var.get().strip():
            messagebox.showwarning("입력 오류", "발행기준일을 입력해주세요.")
            return False

        return True

    def show_preview(self):
        """PDF 프리뷰 표시"""
        if not HAS_PREVIEW:
            messagebox.showwarning("프리뷰 불가", "PyMuPDF 또는 Pillow가 설치되지 않았습니다.\npip install PyMuPDF Pillow")
            return

        if not self.validate_input():
            return

        try:
            # 임시 PDF 생성
            with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as f:
                temp_path = f.name

            self.generator.generate(
                self.customer_name_var.get(),
                self.issue_date_var.get(),
                self.fsr_name_var.get(),
                self.contracts,
                temp_path
            )

            # PDF를 이미지로 변환
            self.render_pdf_pages(temp_path)

            # 첫 페이지 표시
            self.current_page = 0
            self.display_page()

            self.status_var.set("프리뷰 생성 완료")

            # 임시 파일 삭제
            try:
                os.unlink(temp_path)
            except:
                pass

        except Exception as e:
            messagebox.showerror("오류", f"프리뷰 생성 실패:\n{str(e)}")

    def render_pdf_pages(self, pdf_path: str):
        """PDF 페이지를 이미지로 렌더링"""
        self.preview_pages = []
        self.preview_images = []

        doc = fitz.open(pdf_path)
        self.total_pages = len(doc)

        # 캔버스 크기 가져오기
        canvas_width = self.preview_canvas.winfo_width()
        canvas_height = self.preview_canvas.winfo_height()

        if canvas_width < 100:
            canvas_width = 400
        if canvas_height < 100:
            canvas_height = 550

        for page_num in range(len(doc)):
            page = doc.load_page(page_num)

            # A4 비율 유지하면서 캔버스에 맞게 조정
            a4_ratio = 297 / 210  # height / width
            target_width = canvas_width - 20
            target_height = int(target_width * a4_ratio)

            if target_height > canvas_height - 20:
                target_height = canvas_height - 20
                target_width = int(target_height / a4_ratio)

            # 스케일 계산
            zoom = target_width / page.rect.width
            mat = fitz.Matrix(zoom, zoom)

            # 페이지를 픽스맵으로 렌더링
            pix = page.get_pixmap(matrix=mat)

            # PIL 이미지로 변환
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            self.preview_pages.append(img)

        doc.close()

    def display_page(self):
        """현재 페이지 표시"""
        if not self.preview_pages:
            return

        if self.current_page < 0:
            self.current_page = 0
        if self.current_page >= len(self.preview_pages):
            self.current_page = len(self.preview_pages) - 1

        # 이미지 가져오기
        img = self.preview_pages[self.current_page]

        # ImageTk로 변환
        photo = ImageTk.PhotoImage(img)
        self.preview_images = [photo]  # 참조 유지

        # 캔버스 크기
        canvas_width = self.preview_canvas.winfo_width()
        canvas_height = self.preview_canvas.winfo_height()

        # 캔버스 중앙에 표시
        self.preview_canvas.delete("all")
        x = canvas_width // 2
        y = canvas_height // 2
        self.preview_canvas.create_image(x, y, image=photo, anchor=tk.CENTER)

        # 페이지 번호 업데이트
        self.page_var.set(f"{self.current_page + 1} / {self.total_pages}")
        self.update_nav_buttons()

    def prev_page(self):
        """이전 페이지"""
        if self.current_page > 0:
            self.current_page -= 1
            self.display_page()

    def next_page(self):
        """다음 페이지"""
        if self.current_page < self.total_pages - 1:
            self.current_page += 1
            self.display_page()

    def update_nav_buttons(self):
        """네비게이션 버튼 상태 업데이트"""
        if self.total_pages <= 0:
            self.prev_btn.state(['disabled'])
            self.next_btn.state(['disabled'])
        else:
            if self.current_page <= 0:
                self.prev_btn.state(['disabled'])
            else:
                self.prev_btn.state(['!disabled'])

            if self.current_page >= self.total_pages - 1:
                self.next_btn.state(['disabled'])
            else:
                self.next_btn.state(['!disabled'])


def main():
    root = tk.Tk()

    # 스타일 설정
    style = ttk.Style()
    style.theme_use('clam')  # 'clam', 'alt', 'default', 'classic'

    app = ARGeneratorApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()

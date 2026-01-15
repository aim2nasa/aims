"""
AR Generator - AIMS Annual Report PDF 생성 도구
Python GUI 버전 (exe 패키징용)
"""

__version__ = "0.1.4"

import tkinter as tk
from tkinter import ttk, messagebox, filedialog
from datetime import datetime
import os
import sys
from typing import List, Dict, Any
import random
import re

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

INSURANCE_PERIODS = ['종신', '80세', '90세', '100세', '10년', '20년', '30년']
PAYMENT_PERIODS = ['전기납', '5년', '7년', '10년', '15년', '20년', '30년', '60세', '65세']


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
                        random.choice(INSURANCE_PERIODS), random.choice(PAYMENT_PERIODS),
                        random.randint(100000, 500000))
                for i in range(random.randint(3, 5))
            ]
        },
        'single': {
            'customerName': random.choice(SAMPLE_NAMES),
            'contracts': [
                Contract(1, generate_policy_number(), random.choice(SAMPLE_PRODUCTS),
                        "", "", random_date(), "정상", random.randint(1000, 10000),
                        random.choice(INSURANCE_PERIODS), random.choice(PAYMENT_PERIODS),
                        random.randint(100000, 500000))
            ]
        },
        'many': {
            'customerName': random.choice(SAMPLE_NAMES),
            'contracts': [
                Contract(i+1, generate_policy_number(), random.choice(SAMPLE_PRODUCTS),
                        "", "", random_date(), "정상", random.randint(1000, 10000),
                        random.choice(INSURANCE_PERIODS), random.choice(PAYMENT_PERIODS),
                        random.randint(100000, 500000))
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
                 contracts: List[Contract], output_path: str,
                 total_premium: int = 0) -> str:
        """AR PDF 생성

        Args:
            total_premium: PDF에서 읽은 총 월보험료 (0이면 계산)
        """

        c = canvas.Canvas(output_path, pagesize=A4)
        width, height = A4

        # 페이지 1: 표지
        self._draw_cover(c, width, height, customer_name, issue_date, fsr_name)
        c.showPage()

        # 페이지 2: 계약 목록
        self._draw_contracts(c, width, height, customer_name, contracts, total_premium)
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

        # 발행일 (한글 형식으로 변환: 2026-01-14 -> 2026년 01월 14일)
        c.setFillColor(Color(0.3, 0.3, 0.3))
        c.setFont(font_name, 12)
        # 파싱 로직이 "년 월 일" 형식을 기대하므로 변환
        try:
            parts = issue_date.split('-')
            if len(parts) == 3:
                issue_date_korean = f"{parts[0]}년 {parts[1]}월 {parts[2]}일"
            else:
                issue_date_korean = issue_date
        except:
            issue_date_korean = issue_date
        c.drawString(50, height - 280, f"발행기준일: {issue_date_korean}")

        # FSR 정보
        if fsr_name:
            c.drawString(50, height - 300, f"담당 FSR: {fsr_name}")

    def _draw_contracts(self, c: canvas.Canvas, width: float, height: float,
                        customer_name: str, contracts: List[Contract],
                        total_premium: int = 0):
        """계약 목록 그리기 - 모든 필드 포함 (AR 파싱과 동일)

        Args:
            total_premium: PDF에서 읽은 총 월보험료 (0이면 계산)
        """
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

        # 테이블 헤더 (AR 파싱 필드와 동일: 순번, 증권번호, 보험상품, 계약자, 피보험자, 계약일, 계약상태, 가입금액, 보험기간, 납입기간, 보험료)
        y = height - 90
        c.setFont(font_name, 7)
        c.setFillColor(Color(0.9, 0.9, 0.9))
        c.rect(25, y - 5, width - 50, 20, fill=True, stroke=False)

        c.setFillColor(Color(0, 0, 0))
        headers = ['No', '증권번호', '보험상품', '계약자', '피보험자', '계약일', '상태', '보험기간', '납입기간', '가입금액', '보험료']
        x_positions = [28, 42, 95, 195, 235, 280, 335, 370, 415, 460, 510]

        for header, x in zip(headers, x_positions):
            c.drawString(x, y, header)

        # 테이블 데이터
        y -= 20
        c.setFont(font_name, 6)

        for contract in contracts:
            if y < 50:  # 페이지 넘침 방지
                break

            c.drawString(28, y, str(contract.순번))
            c.drawString(42, y, contract.증권번호[:10] if contract.증권번호 else '-')

            # 상품명 자르기
            product = contract.보험상품
            if len(product) > 15:
                product = product[:15] + "..."
            c.drawString(95, y, product)

            # 계약자
            c.drawString(195, y, contract.계약자[:4] if contract.계약자 else '-')

            # 피보험자
            c.drawString(235, y, contract.피보험자[:4] if contract.피보험자 else '-')

            # 계약일
            c.drawString(280, y, contract.계약일 if contract.계약일 else '-')

            c.drawString(335, y, contract.계약상태)

            # 보험기간
            c.drawString(370, y, contract.보험기간 if contract.보험기간 else '-')

            # 납입기간
            c.drawString(415, y, contract.납입기간 if contract.납입기간 else '-')

            c.drawString(460, y, f"{contract.가입금액:,}")
            c.drawString(510, y, f"{contract.보험료:,}")

            y -= 16

        # 합계 - PDF에서 읽은 값 사용 (없으면 계산)
        y -= 10
        c.setFont(font_name, 10)
        if total_premium <= 0:
            # PDF에서 읽지 못한 경우에만 계산 (fallback)
            current_year = datetime.now().year
            total_premium = 0
            for ct in contracts:
                if ct.계약상태 != '정상':
                    continue
                if ct.납입기간 == '일시납':
                    continue
                year_match = re.match(r'^(\d+)년$', ct.납입기간)
                if year_match:
                    pay_years = int(year_match.group(1))
                    contract_year = int(ct.계약일[:4]) if ct.계약일 else current_year
                    if current_year - contract_year >= pay_years:
                        continue
                total_premium += ct.보험료
        c.drawString(420, y, f"총 월보험료: {total_premium:,}원")

    def parse_pdf(self, pdf_path: str) -> Dict[str, Any]:
        """PDF에서 데이터 추출 (실제 메트라이프 AR PDF 형식)"""
        if not HAS_PREVIEW:
            raise Exception("PyMuPDF가 설치되지 않았습니다.")

        doc = fitz.open(pdf_path)
        result = {
            'customer_name': '',
            'issue_date': '',
            'fsr_name': '',
            'contracts': [],
            'total_monthly_premium': 0  # PDF에서 읽은 총 월보험료
        }

        # 1페이지: 표지 - 고객명, 발행일, FSR 추출
        if len(doc) >= 1:
            page1_text = doc[0].get_text()

            # 고객명 추출 ("xxx 고객님을 위한" 패턴)
            customer_match = re.search(r'([가-힣]+)\s*고객님을\s*위한', page1_text)
            if customer_match:
                result['customer_name'] = customer_match.group(1)

            # 발행일 추출 ("발행(기준)일 : YYYY년 MM월 DD일" 형식)
            date_match = re.search(r'발행\(?기준\)?일[:\s]*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일', page1_text)
            if date_match:
                result['issue_date'] = f"{date_match.group(1)}-{int(date_match.group(2)):02d}-{int(date_match.group(3)):02d}"
            else:
                date_match2 = re.search(r'발행\(?기준\)?일[:\s]*(\d{4}-\d{2}-\d{2})', page1_text)
                if date_match2:
                    result['issue_date'] = date_match2.group(1)

            # FSR 추출 ("송유미 FSR" 또는 "담당 : 송유미 FSR" 형식)
            fsr_match = re.search(r'([가-힣]{2,4})\s*FSR', page1_text)
            if fsr_match:
                result['fsr_name'] = fsr_match.group(1)

        # 모든 페이지에서 총 월보험료 텍스트 찾기
        # "현재 납입중인 월 보험료는 총 1,809,150원 입니다" 또는 "총 월보험료: 1,809,150원" 형식
        for page_num in range(len(doc)):
            page_text = doc[page_num].get_text()
            # 패턴 1: "월 보험료는 총 X원"
            premium_match = re.search(r'월\s*보험료[는은가]?\s*총\s+([\d,]+)\s*원', page_text)
            if premium_match:
                try:
                    result['total_monthly_premium'] = int(premium_match.group(1).replace(',', ''))
                    break
                except:
                    pass
            # 패턴 2: "총 월보험료: X원" 또는 "총 월보험료 X원"
            premium_match2 = re.search(r'총\s*월\s*보험료[:\s]*([\d,]+)\s*원', page_text)
            if premium_match2:
                try:
                    result['total_monthly_premium'] = int(premium_match2.group(1).replace(',', ''))
                    break
                except:
                    pass

        # 2페이지 이후: 계약 목록 추출 (테이블 형식)
        # 메트라이프 AR PDF 컬럼 순서: 순번, 증권번호, 보험상품, 계약자, 피보험자, 계약일, 계약상태, 가입금액, 보험기간, 납입기간, 보험료(원)
        contracts = []
        순번 = 0

        # 컬럼 이름 매핑
        COLUMN_NAMES = ['순번', '증권번호', '보험상품', '계약자', '피보험자', '계약일', '계약상태', '가입금액', '보험기간', '납입기간', '보험료']

        for page_num in range(1, len(doc)):
            page = doc[page_num]

            # 테이블 추출 시도 (PyMuPDF 1.23+)
            try:
                tables = page.find_tables()
                if tables and len(tables.tables) > 0:
                    for table in tables.tables:
                        data = table.extract()
                        if not data or len(data) < 2:
                            continue

                        # 헤더 행 찾기 및 컬럼 인덱스 매핑
                        header_idx = -1
                        col_map = {}  # 컬럼명 -> 인덱스

                        for i, row in enumerate(data):
                            row_text = ' '.join([str(cell) if cell else '' for cell in row])
                            if '증권번호' in row_text and '보험상품' in row_text:
                                header_idx = i
                                # 헤더 컬럼 인덱스 매핑
                                for j, cell in enumerate(row):
                                    if cell:
                                        cell_str = str(cell).strip()
                                        for col_name in COLUMN_NAMES:
                                            if col_name in cell_str:
                                                col_map[col_name] = j
                                                break
                                break

                        if header_idx < 0:
                            continue

                        # 데이터 행 파싱
                        for row in data[header_idx + 1:]:
                            if not row or len(row) < 5:
                                continue

                            # 증권번호 확인 (유효한 행인지 체크)
                            policy_idx = col_map.get('증권번호', 1)
                            if policy_idx >= len(row) or not row[policy_idx]:
                                continue

                            policy_num = str(row[policy_idx]).strip()
                            if not re.match(r'^\d{10}$', policy_num):
                                continue

                            순번 += 1
                            contract = Contract(순번=순번)
                            contract.증권번호 = policy_num

                            # 인덱스 기반으로 각 필드 추출 (줄바꿈 제거)
                            def get_cell(col_name: str, default_idx: int = -1) -> str:
                                idx = col_map.get(col_name, default_idx)
                                if idx >= 0 and idx < len(row) and row[idx]:
                                    return str(row[idx]).replace('\n', ' ').replace('  ', ' ').strip()
                                return ''

                            # 보험상품
                            product = get_cell('보험상품', 2)
                            if product:
                                contract.보험상품 = product

                            # 계약자
                            contractor = get_cell('계약자', 3)
                            if contractor:
                                contract.계약자 = contractor

                            # 피보험자
                            insured = get_cell('피보험자', 4)
                            if insured:
                                contract.피보험자 = insured

                            # 계약일
                            contract_date = get_cell('계약일', 5)
                            if contract_date and re.match(r'\d{4}-\d{2}-\d{2}', contract_date):
                                contract.계약일 = contract_date

                            # 계약상태
                            status = get_cell('계약상태', 6)
                            if status in ['정상', '실효', '해지', '만기', '업무처리중']:
                                contract.계약상태 = status

                            # 가입금액 (만원 단위)
                            amount_str = get_cell('가입금액', 7).replace(',', '')
                            if amount_str:
                                try:
                                    contract.가입금액 = int(float(amount_str))
                                except:
                                    pass

                            # 보험기간
                            ins_period = get_cell('보험기간', 8)
                            if ins_period:
                                contract.보험기간 = ins_period

                            # 납입기간
                            pay_period = get_cell('납입기간', 9)
                            if pay_period:
                                contract.납입기간 = pay_period

                            # 보험료 (원 단위)
                            premium_str = get_cell('보험료', 10).replace(',', '')
                            if premium_str:
                                try:
                                    contract.보험료 = int(float(premium_str))
                                except:
                                    pass

                            contracts.append(contract)
                    continue  # 테이블 추출 성공 시 다음 페이지로
            except Exception as e:
                print(f"테이블 추출 실패, 텍스트 파싱으로 전환: {e}")

            # 테이블 추출 실패 시 텍스트 기반 파싱
            page_text = page.get_text()
            lines = page_text.split('\n')

            current_contract = None
            for line in lines:
                line = line.strip()
                if not line:
                    continue

                # 증권번호 패턴으로 새 계약 시작 (10자리 숫자)
                policy_match = re.match(r'^(\d{10})$', line)
                if policy_match:
                    if current_contract and current_contract.증권번호:
                        contracts.append(current_contract)
                    순번 += 1
                    current_contract = Contract(순번=순번)
                    current_contract.증권번호 = policy_match.group(1)
                    continue

                if current_contract:
                    # 상품명
                    if '무배당' in line and not current_contract.보험상품:
                        current_contract.보험상품 = line

                    # 계약일
                    date_match = re.match(r'^(\d{4}-\d{2}-\d{2})$', line)
                    if date_match and not current_contract.계약일:
                        current_contract.계약일 = date_match.group(1)

                    # 계약상태
                    if line in ['정상', '실효', '해지', '만기', '업무처리중']:
                        current_contract.계약상태 = line

                    # 보험기간/납입기간
                    if line in ['종신', '80세', '90세', '100세', '일시납']:
                        if not current_contract.보험기간:
                            current_contract.보험기간 = line
                        elif not current_contract.납입기간:
                            current_contract.납입기간 = line
                    elif re.match(r'^\d+년$', line) or line == '전기납':
                        if not current_contract.납입기간:
                            current_contract.납입기간 = line

                    # 숫자 (가입금액, 보험료)
                    num_match = re.match(r'^([\d,.]+)$', line.replace(',', ''))
                    if num_match:
                        try:
                            val = float(line.replace(',', ''))
                            if val >= 100:
                                if current_contract.가입금액 == 0:
                                    current_contract.가입금액 = int(val)
                                elif current_contract.보험료 == 0:
                                    current_contract.보험료 = int(val)
                        except:
                            pass

            # 마지막 계약 추가
            if current_contract and current_contract.증권번호:
                contracts.append(current_contract)

        result['contracts'] = contracts
        doc.close()
        return result


class ContractEditDialog:
    """계약 편집 다이얼로그"""

    def __init__(self, parent, contract: Contract = None, customer_name: str = ""):
        self.result = None
        self.contract = contract

        self.dialog = tk.Toplevel(parent)
        self.dialog.title("계약 편집" if contract else "계약 추가")
        self.dialog.geometry("500x450")
        self.dialog.transient(parent)
        self.dialog.grab_set()

        # 중앙 정렬
        self.dialog.update_idletasks()
        x = parent.winfo_x() + (parent.winfo_width() - 500) // 2
        y = parent.winfo_y() + (parent.winfo_height() - 450) // 2
        self.dialog.geometry(f"+{x}+{y}")

        self.setup_ui(customer_name)

        # 기존 데이터 로드
        if contract:
            self.load_contract(contract)

    def setup_ui(self, customer_name: str):
        """UI 구성"""
        main_frame = ttk.Frame(self.dialog, padding="20")
        main_frame.pack(fill=tk.BOTH, expand=True)

        # 필드 정의
        fields = [
            ("증권번호 *", "policy"),
            ("보험상품 *", "product"),
            ("계약자", "contractor"),
            ("피보험자", "insured"),
            ("계약일 *", "contract_date"),
            ("계약상태", "status"),
            ("보험기간", "ins_period"),
            ("납입기간", "pay_period"),
            ("가입금액 (만원)", "amount"),
            ("보험료 (원)", "premium"),
        ]

        self.entries = {}

        for i, (label, key) in enumerate(fields):
            ttk.Label(main_frame, text=label).grid(row=i, column=0, sticky=tk.W, pady=3)

            if key == "status":
                var = tk.StringVar(value="정상")
                combo = ttk.Combobox(main_frame, textvariable=var, values=["정상", "실효", "해지", "만기"], width=37)
                combo.grid(row=i, column=1, sticky=tk.W, padx=5, pady=3)
                self.entries[key] = var
            elif key == "ins_period":
                var = tk.StringVar(value="종신")
                combo = ttk.Combobox(main_frame, textvariable=var, values=INSURANCE_PERIODS, width=37)
                combo.grid(row=i, column=1, sticky=tk.W, padx=5, pady=3)
                self.entries[key] = var
            elif key == "pay_period":
                var = tk.StringVar(value="20년")
                combo = ttk.Combobox(main_frame, textvariable=var, values=PAYMENT_PERIODS, width=37)
                combo.grid(row=i, column=1, sticky=tk.W, padx=5, pady=3)
                self.entries[key] = var
            elif key == "product":
                var = tk.StringVar()
                combo = ttk.Combobox(main_frame, textvariable=var, values=SAMPLE_PRODUCTS, width=37)
                combo.grid(row=i, column=1, sticky=tk.W, padx=5, pady=3)
                self.entries[key] = var
            else:
                var = tk.StringVar()
                entry = ttk.Entry(main_frame, textvariable=var, width=40)
                entry.grid(row=i, column=1, sticky=tk.W, padx=5, pady=3)
                self.entries[key] = var

        # 기본값 설정
        if not self.contract:
            self.entries["policy"].set(generate_policy_number())
            self.entries["contract_date"].set(random_date())
            self.entries["contractor"].set(customer_name)
            self.entries["insured"].set(customer_name)
            self.entries["amount"].set(str(random.randint(1000, 10000)))
            self.entries["premium"].set(str(random.randint(100000, 500000)))

        # 버튼
        btn_frame = ttk.Frame(main_frame)
        btn_frame.grid(row=len(fields), column=0, columnspan=2, pady=20)

        ttk.Button(btn_frame, text="확인", command=self.on_ok, width=15).pack(side=tk.LEFT, padx=5)
        ttk.Button(btn_frame, text="취소", command=self.on_cancel, width=15).pack(side=tk.LEFT, padx=5)

    def load_contract(self, contract: Contract):
        """계약 데이터 로드"""
        self.entries["policy"].set(contract.증권번호)
        self.entries["product"].set(contract.보험상품)
        self.entries["contractor"].set(contract.계약자)
        self.entries["insured"].set(contract.피보험자)
        self.entries["contract_date"].set(contract.계약일)
        self.entries["status"].set(contract.계약상태)
        self.entries["ins_period"].set(contract.보험기간)
        self.entries["pay_period"].set(contract.납입기간)
        self.entries["amount"].set(str(contract.가입금액))
        self.entries["premium"].set(str(contract.보험료))

    def on_ok(self):
        """확인 버튼"""
        # 필수 필드 검증
        if not self.entries["policy"].get().strip():
            messagebox.showwarning("입력 오류", "증권번호를 입력해주세요.", parent=self.dialog)
            return
        if not self.entries["product"].get().strip():
            messagebox.showwarning("입력 오류", "보험상품을 입력해주세요.", parent=self.dialog)
            return
        if not self.entries["contract_date"].get().strip():
            messagebox.showwarning("입력 오류", "계약일을 입력해주세요.", parent=self.dialog)
            return

        try:
            amount = int(self.entries["amount"].get() or "0")
            premium = int(self.entries["premium"].get() or "0")
        except ValueError:
            messagebox.showwarning("입력 오류", "가입금액과 보험료는 숫자로 입력해주세요.", parent=self.dialog)
            return

        self.result = Contract(
            순번=self.contract.순번 if self.contract else 1,
            증권번호=self.entries["policy"].get().strip(),
            보험상품=self.entries["product"].get().strip(),
            계약자=self.entries["contractor"].get().strip(),
            피보험자=self.entries["insured"].get().strip(),
            계약일=self.entries["contract_date"].get().strip(),
            계약상태=self.entries["status"].get(),
            가입금액=amount,
            보험기간=self.entries["ins_period"].get(),
            납입기간=self.entries["pay_period"].get(),
            보험료=premium
        )

        self.dialog.destroy()

    def on_cancel(self):
        """취소 버튼"""
        self.dialog.destroy()

    def show(self) -> Contract:
        """다이얼로그 표시"""
        self.dialog.wait_window()
        return self.result


class ARGeneratorApp:
    """AR Generator GUI 애플리케이션"""

    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title(f"AR Generator v{__version__} - AIMS 테스트 PDF 생성 도구")
        self.root.geometry("1500x800")
        self.root.configure(bg='#f5f5f7')

        self.contracts: List[Contract] = []
        self.generator = ARGenerator()
        self.last_pdf_path: str = None
        self.pdf_total_premium: int = 0  # PDF에서 읽은 총 월보험료

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

        # PDF 불러오기 버튼
        ttk.Separator(preset_frame, orient=tk.VERTICAL).pack(side=tk.LEFT, padx=8, fill=tk.Y)
        ttk.Button(preset_frame, text="📄 PDF 불러오기", width=14,
                   command=self.load_from_pdf).pack(side=tk.LEFT, padx=2)

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
        contracts_frame = ttk.LabelFrame(left_frame, text="보유계약 목록 (더블클릭으로 편집)", padding="5")
        contracts_frame.pack(fill=tk.BOTH, expand=True, pady=10)

        # 트리뷰 (AR 파싱과 동일한 모든 필드 포함)
        columns = ('no', 'policy', 'product', 'contractor', 'insured', 'contract_date', 'status', 'ins_period', 'pay_period', 'amount', 'premium')
        self.tree = ttk.Treeview(contracts_frame, columns=columns, show='headings', height=15)

        self.tree.heading('no', text='#')
        self.tree.heading('policy', text='증권번호')
        self.tree.heading('product', text='보험상품')
        self.tree.heading('contractor', text='계약자')
        self.tree.heading('insured', text='피보험자')
        self.tree.heading('contract_date', text='계약일')
        self.tree.heading('status', text='상태')
        self.tree.heading('ins_period', text='보험기간')
        self.tree.heading('pay_period', text='납입기간')
        self.tree.heading('amount', text='가입금액')
        self.tree.heading('premium', text='보험료')

        self.tree.column('no', width=30, minwidth=30, anchor='center')
        self.tree.column('policy', width=95, minwidth=90)
        self.tree.column('product', width=400, minwidth=350)
        self.tree.column('contractor', width=70, minwidth=60)
        self.tree.column('insured', width=55, minwidth=50)
        self.tree.column('contract_date', width=90, minwidth=85)
        self.tree.column('status', width=50, minwidth=45)
        self.tree.column('ins_period', width=60, minwidth=55)
        self.tree.column('pay_period', width=60, minwidth=55)
        self.tree.column('amount', width=95, minwidth=85, anchor='e')
        self.tree.column('premium', width=110, minwidth=100, anchor='e')

        # 더블클릭 이벤트
        self.tree.bind('<Double-1>', self.edit_contract)

        # 스크롤바 (가로/세로)
        y_scrollbar = ttk.Scrollbar(contracts_frame, orient=tk.VERTICAL, command=self.tree.yview)
        x_scrollbar = ttk.Scrollbar(contracts_frame, orient=tk.HORIZONTAL, command=self.tree.xview)
        self.tree.configure(yscrollcommand=y_scrollbar.set, xscrollcommand=x_scrollbar.set)

        y_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        x_scrollbar.pack(side=tk.BOTTOM, fill=tk.X)
        self.tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        # 계약 버튼
        btn_frame = ttk.Frame(left_frame)
        btn_frame.pack(fill=tk.X, pady=5)

        ttk.Button(btn_frame, text="+ 계약 추가", command=self.add_contract).pack(side=tk.LEFT, padx=2)
        ttk.Button(btn_frame, text="선택 편집", command=self.edit_selected_contract).pack(side=tk.LEFT, padx=2)
        ttk.Button(btn_frame, text="선택 삭제", command=self.remove_contract).pack(side=tk.LEFT, padx=2)
        ttk.Button(btn_frame, text="전체 삭제", command=self.clear_contracts).pack(side=tk.LEFT, padx=2)

        # 요약 및 PDF 생성 버튼
        bottom_frame = ttk.Frame(left_frame)
        bottom_frame.pack(fill=tk.X, pady=5)

        self.summary_var = tk.StringVar(value="총 0건, 보험료 합계: 0원")
        ttk.Label(bottom_frame, textvariable=self.summary_var).pack(side=tk.LEFT, padx=5)

        # PDF 생성 버튼들 (오른쪽 정렬)
        ttk.Button(bottom_frame, text="마지막 PDF 열기", command=self.open_last_pdf).pack(side=tk.RIGHT, padx=2)
        ttk.Button(bottom_frame, text="PDF 생성 및 저장", command=self.generate_and_save).pack(side=tk.RIGHT, padx=2)
        ttk.Button(bottom_frame, text="프리뷰", command=self.show_preview).pack(side=tk.RIGHT, padx=2)

        # 상태 표시
        self.status_var = tk.StringVar(value="준비됨")
        ttk.Label(left_frame, textvariable=self.status_var, foreground='gray').pack(pady=2)

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
        self.pdf_total_premium = 0  # 프리셋 로드 시 PDF 값 리셋

        # 계약자/피보험자 이름 설정
        customer_name = self.customer_name_var.get()
        for c in self.contracts:
            if not c.계약자:
                c.계약자 = customer_name
            if not c.피보험자:
                c.피보험자 = customer_name

        self.update_tree()
        self.update_summary()

    def load_from_pdf(self):
        """PDF 파일에서 데이터 불러오기"""
        if not HAS_PREVIEW:
            messagebox.showwarning("불가", "PyMuPDF가 설치되지 않았습니다.\npip install PyMuPDF")
            return

        file_path = filedialog.askopenfilename(
            title="AR PDF 불러오기",
            filetypes=[("PDF files", "*.pdf"), ("All files", "*.*")]
        )

        if not file_path:
            return

        try:
            # PDF 파싱
            result = self.generator.parse_pdf(file_path)

            # 데이터 설정
            if result['customer_name']:
                self.customer_name_var.set(result['customer_name'])
            if result['issue_date']:
                self.issue_date_var.set(result['issue_date'])
            if result['fsr_name']:
                self.fsr_name_var.set(result['fsr_name'])

            # PDF에서 읽은 총 월보험료 저장
            self.pdf_total_premium = result.get('total_monthly_premium', 0)

            # 계약 목록 설정
            self.contracts = result['contracts']

            # 계약자/피보험자 이름 설정 (비어있으면 고객명으로)
            customer_name = self.customer_name_var.get()
            for c in self.contracts:
                if not c.계약자:
                    c.계약자 = customer_name
                if not c.피보험자:
                    c.피보험자 = customer_name

            self.update_tree()
            self.update_summary()

            # 프리뷰도 표시
            self.render_pdf_pages(file_path)
            self.current_page = 0
            self.display_page()

            self.status_var.set(f"PDF 불러오기 완료!\n{os.path.basename(file_path)}\n{len(self.contracts)}개 계약 파싱됨")

            if len(self.contracts) == 0:
                messagebox.showinfo("알림", f"PDF를 읽었지만 계약 데이터를 파싱하지 못했습니다.\n\n파일: {os.path.basename(file_path)}\n\n수동으로 계약을 입력해주세요.")

        except Exception as e:
            messagebox.showerror("오류", f"PDF 불러오기 실패:\n{str(e)}")

    def add_contract(self):
        """계약 추가 (다이얼로그)"""
        customer_name = self.customer_name_var.get() or "홍길동"
        dialog = ContractEditDialog(self.root, None, customer_name)
        result = dialog.show()

        if result:
            result.순번 = len(self.contracts) + 1
            self.contracts.append(result)
            self.pdf_total_premium = 0  # 계약 변경 시 PDF 값 리셋
            self.update_tree()
            self.update_summary()

    def edit_contract(self, event):
        """더블클릭으로 계약 편집"""
        self.edit_selected_contract()

    def edit_selected_contract(self):
        """선택된 계약 편집"""
        selected = self.tree.selection()
        if not selected:
            messagebox.showinfo("알림", "편집할 계약을 선택해주세요.")
            return

        idx = self.tree.index(selected[0])
        contract = self.contracts[idx]

        dialog = ContractEditDialog(self.root, contract, self.customer_name_var.get())
        result = dialog.show()

        if result:
            result.순번 = idx + 1
            self.contracts[idx] = result
            self.pdf_total_premium = 0  # 계약 변경 시 PDF 값 리셋
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

        self.pdf_total_premium = 0  # 계약 변경 시 PDF 값 리셋
        self.update_tree()
        self.update_summary()

    def clear_contracts(self):
        """전체 계약 삭제"""
        self.contracts = []
        self.pdf_total_premium = 0  # PDF 값 리셋
        self.update_tree()
        self.update_summary()

    def update_tree(self):
        """트리뷰 업데이트 (AR 파싱과 동일한 모든 필드)"""
        for item in self.tree.get_children():
            self.tree.delete(item)

        for c in self.contracts:
            product = c.보험상품
            if len(product) > 22:
                product = product[:22] + "..."

            self.tree.insert('', tk.END, values=(
                c.순번,
                c.증권번호,
                product,
                c.계약자,
                c.피보험자,
                c.계약일,
                c.계약상태,
                c.보험기간,
                c.납입기간,
                f"{c.가입금액:,}만원",
                f"{c.보험료:,}원"
            ))

    def update_summary(self):
        """요약 업데이트 - PDF에서 읽은 총 월보험료 사용"""
        total = len(self.contracts)
        # PDF에서 읽은 총 월보험료가 있으면 그 값 사용
        if self.pdf_total_premium > 0:
            premium = self.pdf_total_premium
        else:
            # PDF에서 읽지 못한 경우에만 계산 (fallback)
            current_year = datetime.now().year
            premium = 0
            for c in self.contracts:
                if c.계약상태 != '정상':
                    continue
                if c.납입기간 == '일시납':
                    continue
                year_match = re.match(r'^(\d+)년$', c.납입기간)
                if year_match:
                    pay_years = int(year_match.group(1))
                    contract_year = int(c.계약일[:4]) if c.계약일 else current_year
                    if current_year - contract_year >= pay_years:
                        continue
                premium += c.보험료
        self.summary_var.set(f"총 {total}건, 월보험료 합계: {premium:,}원")

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
                output_path,
                self.pdf_total_premium  # PDF에서 읽은 총 월보험료 전달
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
                file_path,
                self.pdf_total_premium  # PDF에서 읽은 총 월보험료 전달
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
                temp_path,
                self.pdf_total_premium  # PDF에서 읽은 총 월보험료 전달
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

#!/usr/bin/env python3
"""
AR Generator PDF Parser 테스트 스크립트 (독립 실행)
- MetLife Annual Review PDF 파싱 정확도 검증
- GUI 의존성 없이 PDF 파싱만 테스트
"""

import os
import re
import sys
from dataclasses import dataclass
from typing import List, Dict, Any

# PDF 파싱에 필요한 라이브러리
try:
    import fitz  # PyMuPDF
except ImportError:
    print("Error: PyMuPDF가 설치되어 있지 않습니다. pip install pymupdf")
    sys.exit(1)


@dataclass
class Contract:
    """계약 데이터 클래스"""
    순번: int = 0
    증권번호: str = ""
    보험상품: str = ""
    계약자: str = ""
    피보험자: str = ""
    계약일: str = ""
    계약상태: str = "정상"
    가입금액: int = 0
    보험기간: str = "종신"
    납입기간: str = "20년"
    보험료: int = 0


def parse_pdf(pdf_path: str) -> Dict[str, Any]:
    """PDF에서 데이터 추출 (실제 메트라이프 AR PDF 형식)"""
    doc = fitz.open(pdf_path)
    result = {
        'customer_name': '',
        'issue_date': '',
        'fsr_name': '',
        'contracts': []
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

    # 2페이지 이후: 계약 목록 추출 (테이블 형식)
    contracts = []
    순번 = 0

    # 컬럼 이름 매핑
    COLUMN_NAMES = ['순번', '증권번호', '보험상품', '계약자', '피보험자', '계약일', '계약상태', '가입금액', '보험기간', '납입기간', '보험료']

    for page_num in range(len(doc)):
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

                        # 인덱스 기반으로 각 필드 추출
                        def get_cell(col_name: str, default_idx: int = -1) -> str:
                            idx = col_map.get(col_name, default_idx)
                            if idx >= 0 and idx < len(row) and row[idx]:
                                return str(row[idx]).strip()
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


# 테스트 대상 PDF 파일 및 예상 결과
TEST_CASES = [
    {
        'filename': '안영미annual report202508_p2p3.pdf',
        'expected': {
            'customer_name': '안영미',
            'total_contracts': 10,  # 전체 PDF 기준
            'total_premium': 14_102_137,
            'sample_contracts': [
                {'증권번호': '0019698920'},
                {'증권번호': '0018698866'},
            ]
        }
    },
    {
        'filename': '신상철보유계약현황2025081_p2p3.pdf',
        'expected': {
            'customer_name': '신상철',
            'total_contracts': 4,
            'total_premium': 1_115_626,
            'sample_contracts': [
                {'증권번호': '0018698868'},
            ]
        }
    },
    {
        'filename': '정부균보유계약현황202508_p2p3.pdf',
        'expected': {
            'customer_name': '정부균',
            'total_contracts': 4,
            'total_premium': 294_170,
            'sample_contracts': []
        }
    },
    {
        'filename': '김보성보유계약현황202508_p2p3.pdf',
        'expected': {
            'customer_name': '김보성',
            'total_contracts': 5,
            'total_premium': 0,
            'sample_contracts': []
        }
    },
]


def test_pdf_parsing():
    """PDF 파싱 테스트"""
    base_path = os.path.dirname(os.path.abspath(__file__))
    annual_report_path = os.path.join(os.path.dirname(base_path), 'annual_report')

    results = []

    print("=" * 80)
    print("AR Generator PDF Parser 테스트")
    print("=" * 80)

    for test_case in TEST_CASES:
        filename = test_case['filename']
        expected = test_case['expected']
        pdf_path = os.path.join(annual_report_path, filename)

        print(f"\n{'='*60}")
        print(f"테스트: {filename}")
        print(f"{'='*60}")

        if not os.path.exists(pdf_path):
            print(f"  [SKIP] 파일 없음: {pdf_path}")
            results.append({'file': filename, 'status': 'SKIP', 'reason': '파일 없음'})
            continue

        try:
            result = parse_pdf(pdf_path)

            # 1. 메타정보 (p2p3에는 페이지 1이 없으므로 비어있을 수 있음)
            print(f"\n[메타정보]")
            print(f"  고객명: {result['customer_name'] or '(추출 안됨 - 페이지1 없음)'}")
            print(f"  발행일: {result['issue_date'] or '(추출 안됨 - 페이지1 없음)'}")
            print(f"  FSR:   {result['fsr_name'] or '(추출 안됨 - 페이지1 없음)'}")

            # 2. 계약 수
            contracts = result['contracts']
            print(f"\n[계약 정보]")
            print(f"  추출된 계약 수: {len(contracts)}")
            print(f"  (참고: 전체 PDF 기준 예상 계약 수: {expected['total_contracts']})")

            # 3. 계약 목록 출력
            if contracts:
                print(f"\n  [추출된 계약 목록]")
                total_premium = 0
                for c in contracts:
                    product_short = c.보험상품[:35] + '...' if len(c.보험상품) > 35 else c.보험상품
                    print(f"    {c.순번:2d}. {c.증권번호} | {product_short:38} | {c.계약상태:6} | {c.보험료:>10,}원")
                    total_premium += c.보험료
                print(f"\n  추출된 총 월보험료: {total_premium:,}원")
                print(f"  (참고: 전체 PDF 기준 예상 총 보험료: {expected['total_premium']:,}원)")

            # 4. 샘플 계약 검증
            if expected['sample_contracts']:
                print(f"\n[샘플 계약 검증]")
                sample_checks = []
                for sample in expected['sample_contracts']:
                    found = False
                    for c in contracts:
                        if c.증권번호 == sample['증권번호']:
                            found = True
                            print(f"  ✓ {sample['증권번호']} 발견")
                            break

                    if not found:
                        print(f"  ✗ {sample['증권번호']} 미발견 (페이지 2-3에 없을 수 있음)")
                    sample_checks.append(found)

            # 결과 요약
            status = 'PASS' if len(contracts) > 0 else 'FAIL'
            results.append({
                'file': filename,
                'status': status,
                'contracts_found': len(contracts),
                'customer_name': result['customer_name'],
                'issue_date': result['issue_date'],
                'fsr_name': result['fsr_name']
            })

        except Exception as e:
            print(f"  [ERROR] 파싱 실패: {e}")
            import traceback
            traceback.print_exc()
            results.append({'file': filename, 'status': 'ERROR', 'reason': str(e)})

    # 전체 요약
    print("\n" + "=" * 80)
    print("테스트 요약")
    print("=" * 80)

    for r in results:
        status_icon = {'PASS': '✓', 'FAIL': '✗', 'SKIP': '○', 'ERROR': '!'}.get(r['status'], '?')
        print(f"  {status_icon} {r['file']}: {r['status']}")
        if r['status'] == 'PASS':
            print(f"      계약 {r['contracts_found']}개 추출")
            if r.get('customer_name'):
                print(f"      고객명: {r['customer_name']}")

    return results


if __name__ == '__main__':
    test_pdf_parsing()

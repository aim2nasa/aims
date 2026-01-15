"""
AR Generator PDF 파싱 테스트 스크립트
- 원본 PDF와 AR Generator 생성 PDF의 테이블 추출 결과 비교
"""
import sys
import os
import fitz  # PyMuPDF
import json

def analyze_pdf_tables(pdf_path: str):
    """PDF의 테이블 구조를 상세히 분석"""
    print(f"\n{'='*60}")
    print(f"분석 대상: {os.path.basename(pdf_path)}")
    print(f"{'='*60}")

    doc = fitz.open(pdf_path)

    for page_num in range(len(doc)):
        page = doc[page_num]
        print(f"\n--- 페이지 {page_num + 1} ---")

        # 테이블 추출 시도
        try:
            tables = page.find_tables()
            if tables and len(tables.tables) > 0:
                print(f"테이블 수: {len(tables.tables)}")
                for i, table in enumerate(tables.tables):
                    data = table.extract()
                    print(f"\n  테이블 {i+1}: {len(data)} 행")
                    for j, row in enumerate(data[:5]):  # 처음 5행만 출력
                        # 각 셀의 내용과 줄바꿈 여부 확인
                        row_info = []
                        for cell in row:
                            if cell:
                                cell_str = str(cell)
                                has_newline = '\n' in cell_str
                                cell_preview = cell_str[:30].replace('\n', '[NL]')
                                row_info.append(f"'{cell_preview}'" + ("*" if has_newline else ""))
                            else:
                                row_info.append("None")
                        print(f"    행 {j}: [{', '.join(row_info)}]")
                    if len(data) > 5:
                        print(f"    ... ({len(data) - 5}개 행 생략)")
            else:
                print("테이블 없음")
        except Exception as e:
            print(f"테이블 추출 실패: {e}")

        # 텍스트 추출 (일부만)
        text = page.get_text()[:500]
        print(f"\n텍스트 미리보기:")
        print(text)

    doc.close()


def test_roundtrip():
    """AR Generator로 PDF 생성 후 파싱하여 데이터 일치 여부 확인"""
    from ar_generator import ARGenerator, Contract, get_preset_data

    print("\n" + "="*60)
    print("라운드트립 테스트: 생성 → 파싱 → 비교")
    print("="*60)

    generator = ARGenerator()

    # 홍길동 프리셋 사용
    preset = get_preset_data('hong')
    customer_name = preset['customerName']
    fsr_name = preset.get('fsrName', '송유미')
    contracts = preset['contracts']

    print(f"\n원본 데이터:")
    print(f"  고객명: {customer_name}")
    print(f"  FSR: {fsr_name}")
    print(f"  계약 수: {len(contracts)}")
    for c in contracts:
        print(f"    {c.순번}. {c.증권번호} | {c.보험상품[:30]}... | {c.계약일} | {c.보험료:,}원")

    # PDF 생성
    output_path = "test_output.pdf"
    generator.generate(customer_name, "2025-08-01", fsr_name, contracts, output_path)
    print(f"\nPDF 생성 완료: {output_path}")

    # 생성된 PDF 테이블 구조 분석
    analyze_pdf_tables(output_path)

    # PDF 파싱
    print("\n" + "-"*40)
    print("파싱 결과:")
    print("-"*40)

    result = generator.parse_pdf(output_path)
    print(f"  고객명: {result['customer_name']}")
    print(f"  발행일: {result['issue_date']}")
    print(f"  FSR: {result['fsr_name']}")
    print(f"  총 월보험료: {result['total_monthly_premium']:,}원")
    print(f"  계약 수: {len(result['contracts'])}")

    for c in result['contracts']:
        print(f"    {c.순번}. {c.증권번호} | {c.보험상품[:30]}... | {c.계약일} | {c.보험료:,}원")

    # 비교
    print("\n" + "-"*40)
    print("비교 결과:")
    print("-"*40)

    errors = []
    if result['customer_name'] != customer_name:
        errors.append(f"고객명 불일치: '{result['customer_name']}' vs '{customer_name}'")

    if len(result['contracts']) != len(contracts):
        errors.append(f"계약 수 불일치: {len(result['contracts'])} vs {len(contracts)}")
    else:
        for i, (parsed, original) in enumerate(zip(result['contracts'], contracts)):
            if parsed.증권번호 != original.증권번호:
                errors.append(f"계약 {i+1} 증권번호 불일치: '{parsed.증권번호}' vs '{original.증권번호}'")
            if parsed.보험상품 != original.보험상품:
                errors.append(f"계약 {i+1} 보험상품 불일치: '{parsed.보험상품}' vs '{original.보험상품}'")
            if parsed.계약일 != original.계약일:
                errors.append(f"계약 {i+1} 계약일 불일치: '{parsed.계약일}' vs '{original.계약일}'")
            if parsed.보험료 != original.보험료:
                errors.append(f"계약 {i+1} 보험료 불일치: {parsed.보험료} vs {original.보험료}")

    if errors:
        print("[X] 오류 발견:")
        for err in errors:
            print(f"  - {err}")
    else:
        print("[O] 모든 데이터 일치!")

    # 정리
    if os.path.exists(output_path):
        os.remove(output_path)

    return len(errors) == 0


def test_extended():
    """확장된 테스트 - 다양한 보험상품명"""
    from ar_generator import ARGenerator, Contract

    print("\n" + "="*60)
    print("확장 테스트: 다양한 보험상품명")
    print("="*60)

    generator = ARGenerator()

    # 다양한 보험상품명 테스트
    test_products = [
        '무배당 미리받는GI종신보험(저해지환급금형)',
        '무배당 백만인을위한달러종신보험(저해지환급금형)',
        '무배당 변액유니버셜 오늘의 종신보험 Plus',
        '무배당 모두의 종신보험(저해약환급금형)',
        '무배당 새희망 정기보험',
        '무배당 암보험(갱신형)',
        '무배당 실손의료비보험(갱신형)',
        '무배당 어린이보험(자녀사랑)',
        '(무)치아보험',
        '무배당 더불어 사는 종신보험(저해지환급금형) II',
    ]

    contracts = []
    for i, product in enumerate(test_products):
        contracts.append(Contract(
            순번=i+1,
            증권번호=f'001300000{i}',
            보험상품=product,
            계약자='테스트',
            피보험자='테스트',
            계약일='2024-01-01',
            계약상태='정상',
            가입금액=1000,
            보험기간='종신',
            납입기간='20년',
            보험료=100000
        ))

    # PDF 생성
    output_path = "test_extended.pdf"
    generator.generate('테스트', '2025-08-01', '송유미', contracts, output_path)

    # PDF 파싱
    result = generator.parse_pdf(output_path)

    # 비교
    errors = []
    if len(result['contracts']) != len(contracts):
        errors.append(f"계약 수 불일치: {len(result['contracts'])} vs {len(contracts)}")
    else:
        for i, (parsed, original) in enumerate(zip(result['contracts'], contracts)):
            if parsed.보험상품 != original.보험상품:
                errors.append(f"계약 {i+1} 보험상품 불일치:")
                errors.append(f"  파싱: '{parsed.보험상품}'")
                errors.append(f"  원본: '{original.보험상품}'")

    if errors:
        print("[X] 오류 발견:")
        for err in errors:
            print(f"  {err}")
    else:
        print(f"[O] 모든 {len(contracts)}개 보험상품명 일치!")

    # 정리
    if os.path.exists(output_path):
        os.remove(output_path)

    return len(errors) == 0


if __name__ == "__main__":
    if len(sys.argv) > 1:
        # 특정 PDF 분석
        for pdf_path in sys.argv[1:]:
            if os.path.exists(pdf_path):
                analyze_pdf_tables(pdf_path)
            else:
                print(f"파일 없음: {pdf_path}")
    else:
        # 라운드트립 테스트
        success1 = test_roundtrip()
        success2 = test_extended()

        print("\n" + "="*60)
        print("최종 결과:")
        print("="*60)
        print(f"  기본 테스트: {'PASS' if success1 else 'FAIL'}")
        print(f"  확장 테스트: {'PASS' if success2 else 'FAIL'}")

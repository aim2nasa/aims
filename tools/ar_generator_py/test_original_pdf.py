"""
원본 MetLife AR PDF 파싱 테스트
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ar_generator import ARGenerator

def test_original_pdf(pdf_path: str):
    """원본 PDF 파싱 테스트"""
    print(f"\n{'='*60}")
    print(f"원본 PDF 파싱: {os.path.basename(pdf_path)}")
    print(f"{'='*60}")

    generator = ARGenerator()
    result = generator.parse_pdf(pdf_path)

    print(f"\n파싱 결과:")
    print(f"  고객명: {result['customer_name']}")
    print(f"  발행일: {result['issue_date']}")
    print(f"  FSR: {result['fsr_name']}")
    print(f"  총 월보험료: {result['total_monthly_premium']:,}원")
    print(f"  계약 수: {len(result['contracts'])}")

    if result['contracts']:
        print(f"\n계약 목록:")
        for c in result['contracts']:
            print(f"  {c.순번:2d}. {c.증권번호} | {c.보험상품[:40]:<40} | {c.계약자:<8} | {c.계약일} | {c.보험료:>10,}원")

    # 검증
    errors = []
    if not result['customer_name']:
        errors.append("고객명 파싱 실패")
    if not result['issue_date']:
        errors.append("발행일 파싱 실패")
    if not result['fsr_name']:
        errors.append("FSR 파싱 실패")
    if result['total_monthly_premium'] == 0:
        errors.append("총 월보험료 파싱 실패")
    if len(result['contracts']) == 0:
        errors.append("계약 파싱 실패")

    # 계약 데이터 검증
    for c in result['contracts']:
        if not c.증권번호:
            errors.append(f"계약 {c.순번}: 증권번호 누락")
        if not c.보험상품:
            errors.append(f"계약 {c.순번}: 보험상품 누락")
        if not c.계약일:
            errors.append(f"계약 {c.순번}: 계약일 누락")

    print(f"\n검증 결과:")
    if errors:
        print(f"  [X] 오류 {len(errors)}건:")
        for err in errors:
            print(f"      - {err}")
        return False
    else:
        print(f"  [O] 모든 필드 파싱 성공!")
        return True


def test_roundtrip_with_original(pdf_path: str):
    """원본 PDF → 파싱 → AR Generator 생성 → 다시 파싱 → 비교"""
    print(f"\n{'='*60}")
    print(f"라운드트립 테스트: {os.path.basename(pdf_path)}")
    print(f"{'='*60}")

    generator = ARGenerator()

    # 1. 원본 PDF 파싱
    print("\n1단계: 원본 PDF 파싱")
    original_result = generator.parse_pdf(pdf_path)
    print(f"   고객명: {original_result['customer_name']}")
    print(f"   계약 수: {len(original_result['contracts'])}")
    print(f"   총 월보험료: {original_result['total_monthly_premium']:,}원")

    if len(original_result['contracts']) == 0:
        print("   [X] 원본 파싱 실패 - 테스트 중단")
        return False

    # 2. AR Generator로 새 PDF 생성
    print("\n2단계: AR Generator로 PDF 생성")
    output_path = "test_roundtrip_output.pdf"
    generator.generate(
        original_result['customer_name'],
        original_result['issue_date'],
        original_result['fsr_name'],
        original_result['contracts'],
        output_path,
        original_result['total_monthly_premium']
    )
    print(f"   생성 완료: {output_path}")

    # 3. 생성된 PDF 다시 파싱
    print("\n3단계: 생성된 PDF 파싱")
    generated_result = generator.parse_pdf(output_path)
    print(f"   고객명: {generated_result['customer_name']}")
    print(f"   계약 수: {len(generated_result['contracts'])}")
    print(f"   총 월보험료: {generated_result['total_monthly_premium']:,}원")

    # 4. 비교
    print("\n4단계: 원본 vs 생성 비교")
    errors = []

    if original_result['customer_name'] != generated_result['customer_name']:
        errors.append(f"고객명: '{original_result['customer_name']}' vs '{generated_result['customer_name']}'")

    if len(original_result['contracts']) != len(generated_result['contracts']):
        errors.append(f"계약 수: {len(original_result['contracts'])} vs {len(generated_result['contracts'])}")
    else:
        for i, (orig, gen) in enumerate(zip(original_result['contracts'], generated_result['contracts'])):
            if orig.증권번호 != gen.증권번호:
                errors.append(f"계약 {i+1} 증권번호: '{orig.증권번호}' vs '{gen.증권번호}'")
            if orig.보험상품 != gen.보험상품:
                errors.append(f"계약 {i+1} 보험상품: '{orig.보험상품}' vs '{gen.보험상품}'")
            if orig.계약일 != gen.계약일:
                errors.append(f"계약 {i+1} 계약일: '{orig.계약일}' vs '{gen.계약일}'")
            if orig.보험료 != gen.보험료:
                errors.append(f"계약 {i+1} 보험료: {orig.보험료} vs {gen.보험료}")

    # 정리
    if os.path.exists(output_path):
        os.remove(output_path)

    if errors:
        print(f"\n   [X] 불일치 {len(errors)}건:")
        for err in errors:
            print(f"       - {err}")
        return False
    else:
        print(f"\n   [O] 원본과 생성 PDF 파싱 결과 일치!")
        return True


if __name__ == "__main__":
    pdf_dir = "D:/AR"
    pdf_files = [
        "김보성보유계약현황202508.pdf",
        "신상철보유계약현황2025081.pdf",
        "안영미annual report202508.pdf",
        "정부균보유계약현황202508.pdf",
    ]

    results = {}

    for pdf_file in pdf_files:
        pdf_path = os.path.join(pdf_dir, pdf_file)
        if os.path.exists(pdf_path):
            # 원본 파싱 테스트
            success1 = test_original_pdf(pdf_path)
            # 라운드트립 테스트
            success2 = test_roundtrip_with_original(pdf_path)
            results[pdf_file] = (success1, success2)
        else:
            print(f"\n파일 없음: {pdf_path}")
            results[pdf_file] = (False, False)

    # 최종 결과
    print(f"\n{'='*60}")
    print("최종 결과")
    print(f"{'='*60}")
    for pdf_file, (parse_ok, roundtrip_ok) in results.items():
        status1 = "PASS" if parse_ok else "FAIL"
        status2 = "PASS" if roundtrip_ok else "FAIL"
        print(f"  {pdf_file[:30]:<30}: 파싱={status1}, 라운드트립={status2}")

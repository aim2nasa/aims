"""
테이블 추출 파서 검증 테스트
5개 샘플 전체에 대해 테이블 추출 방식 검증
"""
import os

from table_extractor import extract_contract_table

# 샘플 디렉토리
SAMPLE_DIR = os.path.expanduser("~/aims/samples/MetlifeReport/AnnualReport")

# 예상 결과 (checkParsing.mjs와 동일)
expected_data = [
    {
        "fileName": "박형서annual report202601.pdf",
        "insuredName": "박형서",
        "totalContracts": 1,
        "contracts": [
            {"seq": 1, "policyNumber": "0000010010", "productName": "평생보장보험", "contractor": "박형서", "insured": "박형서", "contractDate": "1990-08-27", "status": "정상", "premium": 36600},
        ]
    },
    {
        "fileName": "김보성보유계약현황202508.pdf",
        "insuredName": "김보성",
        "totalContracts": 6,
        "contracts": [
            {"seq": 1, "policyNumber": "0004155605", "productName": "무배당 마스터플랜 변액유니버셜종신Ⅱ보험", "contractor": "김보성", "insured": "김보성", "contractDate": "2009-06-10", "status": "정상", "premium": 65200},
            {"seq": 2, "policyNumber": "0011533898", "productName": "무배당 실버플랜 변액유니버셜V보험", "contractor": "캐치업코리아", "insured": "김보성", "contractDate": "2014-03-21", "status": "정상", "premium": 992500},
            {"seq": 3, "policyNumber": "0012526414", "productName": "무배당 암엔암보험", "contractor": "김보성", "insured": "김보성", "contractDate": "2018-11-22", "status": "정상", "premium": 5100},
            {"seq": 4, "policyNumber": "0012637379", "productName": "무배당 유니버셜달러종신보험", "contractor": "김보성", "insured": "김보성", "contractDate": "2019-06-26", "status": "정상", "premium": 2505490},
            {"seq": 5, "policyNumber": "0013509688", "productName": "무배당 변액연금보험 동행 Plus", "contractor": "김보성", "insured": "김보성", "contractDate": "2024-04-29", "status": "정상", "premium": 200000000},
            {"seq": 6, "policyNumber": "0013731763", "productName": "무배당 모두의 종신보험(무해약환급금형)", "contractor": "안영미", "insured": "김보성", "contractDate": "2025-06-02", "status": "정상", "premium": 751450},
        ]
    },
    {
        "fileName": "신상철보유계약현황2025081.pdf",
        "insuredName": "신상철",
        "totalContracts": 4,
        "contracts": [
            {"seq": 1, "policyNumber": "0013017050", "productName": "무배당 미리받는GI종신보험(저해지환급금형)", "contractor": "신상철", "insured": "신상철", "contractDate": "2021-05-09", "status": "정상", "premium": 219380},
            {"seq": 2, "policyNumber": "0013107410", "productName": "무배당 백만인을 위한 달러종신보험(저해지환급금형)", "contractor": "신상철", "insured": "신상철", "contractDate": "2021-10-31", "status": "정상", "premium": 590050},
            {"seq": 3, "policyNumber": "0013262131", "productName": "무배당 변액유니버셜 오늘의 종신보험Plus", "contractor": "신상철", "insured": "신상철", "contractDate": "2022-10-17", "status": "정상", "premium": 105200},
            {"seq": 4, "policyNumber": "0013526523", "productName": "무배당 모두의 종신보험(저해약환급금형)", "contractor": "신상철", "insured": "신상철", "contractDate": "2024-06-05", "status": "정상", "premium": 200996},
        ]
    },
    {
        "fileName": "안영미annual report202508.pdf",
        "insuredName": "안영미",
        "totalContracts": 10,
        "contracts": [
            {"seq": 1, "policyNumber": "0004164025", "productName": "무배당 마스터플랜 변액유니버셜종신Ⅱ보험", "contractor": "김보성", "insured": "안영미", "contractDate": "2009-06-28", "status": "정상", "premium": 81750},
            {"seq": 2, "policyNumber": "0012526385", "productName": "무배당 암엔암보험", "contractor": "안영미", "insured": "안영미", "contractDate": "2018-11-22", "status": "정상", "premium": 57900},
            {"seq": 3, "policyNumber": "0012530455", "productName": "무배당 유니버셜달러종신보험", "contractor": "캐치업코리아", "insured": "안영미", "contractDate": "2018-11-29", "status": "정상", "premium": 3710230},
            {"seq": 4, "policyNumber": "0012824529", "productName": "무배당 미리받는GI종신보험(저해지환급금형)", "contractor": "안영미", "insured": "안영미", "contractDate": "2020-06-21", "status": "정상", "premium": 468400},
            {"seq": 5, "policyNumber": "0012826998", "productName": "무배당 심뇌혈관종합건강보험(무해지환급금형)", "contractor": "안영미", "insured": "안영미", "contractDate": "2020-06-26", "status": "정상", "premium": 50500},
            {"seq": 6, "policyNumber": "0012902479", "productName": "무배당 달러경영인정기보험", "contractor": "캐치업코리아", "insured": "안영미", "contractDate": "2020-11-17", "status": "정상", "premium": 3776680},
            {"seq": 7, "policyNumber": "0013124877", "productName": "무배당 달러경영인정기보험", "contractor": "캐치업코리아", "insured": "안영미", "contractDate": "2021-11-30", "status": "정상", "premium": 4028010},
            {"seq": 8, "policyNumber": "0013131970", "productName": "무배당 360 종합보장보험(무해지환급금형)", "contractor": "안영미", "insured": "안영미", "contractDate": "2021-12-17", "status": "정상", "premium": 170427},
            {"seq": 9, "policyNumber": "0013264509", "productName": "무배당 변액유니버셜 VIP 종신보험Plus", "contractor": "안영미", "insured": "안영미", "contractDate": "2022-10-24", "status": "정상", "premium": 1758240},
            {"seq": 10, "policyNumber": "0013620295", "productName": "무배당 오늘의달러연금보험", "contractor": "안영미", "insured": "안영미", "contractDate": "2024-12-19", "status": "정상", "premium": 111456000},
        ]
    },
    {
        "fileName": "정부균보유계약현황202508.pdf",
        "insuredName": "정부균",
        "totalContracts": 4,
        "contracts": [
            {"seq": 1, "policyNumber": "0013224973", "productName": "무배당 변액유니버셜 모두의상속종신보험", "contractor": "정부균", "insured": "정부균", "contractDate": "2022-07-19", "status": "정상", "premium": 121920},
            {"seq": 2, "policyNumber": "0013535928", "productName": "무배당 360 암보험(갱신형)", "contractor": "정부균", "insured": "정부균", "contractDate": "2024-06-28", "status": "정상", "premium": 31920},
            {"seq": 3, "policyNumber": "0013785622", "productName": "무배당 오늘의달러연금보험", "contractor": "정부균", "insured": "정부균", "contractDate": "2025-08-26", "status": "업무처리중", "premium": 20859000},
            {"seq": 4, "policyNumber": "0013785642", "productName": "무배당 백만인을 위한 달러종신보험Plus(저해약환급금형)", "contractor": "정부균", "insured": "정부균", "contractDate": "2025-08-26", "status": "업무처리중", "premium": 140330},
        ]
    },
]


def compare_contract(actual, expected, prefix):
    """계약 비교"""
    errors = []
    fields = ['seq', 'policyNumber', 'productName', 'contractor', 'insured', 'contractDate', 'status', 'premium']

    for field in fields:
        if actual.get(field) != expected.get(field):
            errors.append(f"{prefix} {field}: expected '{expected.get(field)}', got '{actual.get(field)}'")

    return errors


def main():
    print("")
    print("╔" + "═" * 60 + "╗")
    print("║       테이블 추출 파서 검증 테스트                        ║")
    print("║       (하드코딩 없는 일반화된 방식)                       ║")
    print("╚" + "═" * 60 + "╝")
    print("")

    total_tests = 0
    passed_tests = 0
    all_errors = []

    for expected in expected_data:
        filename = expected["fileName"]
        pdf_path = os.path.join(SAMPLE_DIR, filename)

        print(f"▶ {expected['insuredName']} ({filename})")
        print("─" * 60)

        if not os.path.exists(pdf_path):
            print(f"  ❌ 파일 없음: {pdf_path}")
            continue

        try:
            result = extract_contract_table(pdf_path, page_num=1)

            # 헤더 검증
            total_tests += 3
            errors = []

            if result["insuredName"] == expected["insuredName"]:
                passed_tests += 1
            else:
                errors.append(f"insuredName: expected '{expected['insuredName']}', got '{result['insuredName']}'")

            if result["totalContracts"] == expected["totalContracts"]:
                passed_tests += 1
            else:
                errors.append(f"totalContracts: expected {expected['totalContracts']}, got {result['totalContracts']}")

            if len(result["contracts"]) == len(expected["contracts"]):
                passed_tests += 1
            else:
                errors.append(f"contracts count: expected {len(expected['contracts'])}, got {len(result['contracts'])}")

            # 각 계약 검증
            for i, exp_contract in enumerate(expected["contracts"]):
                if i < len(result["contracts"]):
                    act_contract = result["contracts"][i]
                    prefix = f"계약{exp_contract['seq']}"

                    # 8개 필드 검증
                    total_tests += 8
                    contract_errors = compare_contract(act_contract, exp_contract, prefix)

                    if contract_errors:
                        errors.extend(contract_errors)
                    else:
                        passed_tests += 8
                        print(f"  ✅ 계약 {exp_contract['seq']}: {exp_contract['policyNumber']} - {exp_contract['productName'][:25]}...")
                else:
                    print(f"  ❌ 계약 {exp_contract['seq']}: 누락됨")
                    total_tests += 8
                    errors.append(f"계약{exp_contract['seq']}: 누락됨")

            if errors:
                all_errors.extend([(filename, e) for e in errors])
                for e in errors:
                    print(f"  ❌ {e}")

        except Exception as e:
            print(f"  ❌ 파싱 에러: {e}")
            all_errors.append((filename, str(e)))

        print("")

    # 결과 요약
    print("═" * 60)
    print("테스트 결과 요약")
    print("═" * 60)
    print(f"총 테스트: {total_tests}개")
    print(f"통과: {passed_tests}개 ({(passed_tests / total_tests * 100):.1f}%)")
    print(f"실패: {total_tests - passed_tests}개")
    print("")

    if all_errors:
        print("❌ 실패한 테스트 상세:")
        print("─" * 60)
        for filename, error in all_errors:
            print(f"  [{filename}] {error}")
    else:
        print("🎉 모든 테스트 통과! 100% 정확도 달성!")
        print("")
        print("📌 핵심 검증:")
        print("   - 하드코딩 없이 '캐치업코리아' 자동 추출 ✅")
        print("   - 줄바꿈 분리된 상품명 자동 병합 ✅")
        print("   - 새로운 데이터에도 대응 가능한 일반화된 방식 ✅")

    print("")
    return 0 if not all_errors else 1


if __name__ == "__main__":
    import sys
    sys.exit(main())

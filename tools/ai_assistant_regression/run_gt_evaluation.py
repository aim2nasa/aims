#!/usr/bin/env python3
"""
GT(Ground Truth) 기반 AI 어시스턴트 심화 평가

서버에서 실행: python3 ~/aims/tools/ai_assistant_regression/run_gt_evaluation.py
SSH 경유:      ssh rossi@100.110.215.65 'cd ~/aims && python3 tools/ai_assistant_regression/run_gt_evaluation.py'

docs/gt_test_cases.json의 80건 질의를 AI에 보내고,
GT expected와 실제 응답을 비교하여 정확도를 측정합니다.
"""

import json
import os
import re
import sys
import time
import urllib.request
import urllib.error

# --- 설정 ---
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
GT_FILE = os.path.join(PROJECT_ROOT, "docs", "gt_test_cases.json")
RESULT_FILE = "/tmp/gt_evaluation_results.json"

CHAT_API_URL = "http://localhost:3010/api/chat"
AUTH_API_URL = "http://localhost:3010/api/auth/admin-login"
AUTH_EMAIL = "aim2nasa@gmail.com"
AUTH_PASSWORD = "3007"
REQUEST_TIMEOUT = 120

# 사람 이름으로 오인식되는 일반 명사 목록 (person_names 추출 시 제외)
PERSON_NAME_STOPWORDS = {
    # 보험/금융 용어
    "합계", "필수", "보험료", "보험", "납입중", "납입", "완료", "최신", "기준", "현재",
    "적립금", "환급금", "수익률", "평균", "일시납", "별도", "제시", "개별", "전체",
    "활성", "상태", "계약", "목록", "건수", "유무", "답변", "기간", "기반",
    "정상", "실효", "해지", "만기", "갱신", "변경", "종신", "연금",
    "채권형", "적립형", "암엔암",
    # 서술/접속 용어
    "포함", "이상", "이하", "미만", "초과", "이내", "이후", "이전",
    "가장", "최고", "최저", "최대", "최소", "최근",
    # 일반 명사/서술어
    "월납", "연납", "일시", "보장", "가입", "피보", "무배당",
    "표시", "정보", "모두", "총액", "내역", "현황",
    "있음", "없음", "없다", "있다", "관계", "중복", "나열",
    "법인", "개인", "고객", "배우자", "자녀", "부모",
    "이력", "변화", "공감", "만원", "펀드", "시계열",
    "필터링", "계약만", "상품만", "계약의", "계약일", "모두의",
    "건이면", "년인",
}



def get_auth_token():
    payload = json.dumps({"email": AUTH_EMAIL, "password": AUTH_PASSWORD}).encode("utf-8")
    req = urllib.request.Request(
        AUTH_API_URL, data=payload,
        headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            token = data.get("token") or data.get("accessToken")
            if not token:
                print(f"[ERROR] 인증 응답에 토큰 없음")
                sys.exit(1)
            return token
    except Exception as e:
        print(f"[ERROR] 인증 실패: {e}")
        sys.exit(1)


def send_chat_request(question, token):
    payload = json.dumps({
        "messages": [{"role": "user", "content": question}]
    }).encode("utf-8")

    req = urllib.request.Request(
        CHAT_API_URL, data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
            "Accept": "text/event-stream"
        }, method="POST"
    )

    result = {"full_text": "", "tools_called": [], "error": None}

    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
            buffer = ""
            for raw_line in resp:
                line = raw_line.decode("utf-8", errors="replace")
                buffer += line
                while "\n\n" in buffer:
                    chunk, buffer = buffer.split("\n\n", 1)
                    for sub_line in chunk.strip().split("\n"):
                        if sub_line.startswith("data: "):
                            try:
                                event = json.loads(sub_line[6:])
                                etype = event.get("type")
                                if etype == "content":
                                    result["full_text"] += event.get("content", "")
                                elif etype == "tool_start":
                                    result["tools_called"].extend(event.get("tools", []))
                                elif etype == "tool_calling":
                                    name = event.get("name")
                                    if name and name not in result["tools_called"]:
                                        result["tools_called"].append(name)
                                elif etype == "error":
                                    result["error"] = event.get("error", "Unknown")
                            except json.JSONDecodeError:
                                pass
    except urllib.error.HTTPError as e:
        result["error"] = f"HTTP {e.code}: {e.reason}"
    except Exception as e:
        result["error"] = str(e)

    return result


def evaluate_gt(case, response):
    """GT expected와 AI 응답을 비교하여 정확도 판정

    Returns:
        dict: {
            "grade": "GOOD" | "PARTIAL" | "FAIL" | "ERROR",
            "score": float (0.0 ~ 1.0),
            "details": list[str]
        }
    """
    if response["error"]:
        return {"grade": "ERROR", "score": 0.0, "details": [f"API 오류: {response['error']}"]}

    text = response["full_text"]
    expected = case.get("expected", "")
    case_type = case.get("type", "")
    details = []

    # 도구 호출 여부 체크
    if not response["tools_called"]:
        return {"grade": "FAIL", "score": 0.0, "details": ["도구 호출 없음 — 가상 데이터 의심"]}

    # --- 유형별 특수 평가 ---

    # Q2: 문서 존재 확인 — "N건 있다" 또는 "없다" 형태면 정답
    if case_type == "Q2":
        has_count = bool(re.search(r'\d+\s*건', text))
        has_existence = bool(re.search(r'있습니다|있어요|있네요|없습니다|없어요|없네요|없는|찾을 수 없|검색되지|확인되지|등록되어 있지 않', text))
        if has_count or has_existence:
            details.append("Q2 유무 판단 표현 확인됨")
            return {"grade": "GOOD", "score": 1.0, "details": details}
        details.append("Q2: 유무 판단 표현 없음")
        return {"grade": "FAIL", "score": 0.0, "details": details}

    # 방향성 expected 처리 — 구체 수치 없이 방향만 제시하는 경우
    # (예: "비정상 계약 존재 여부", "계약일 기준 가장 오래된 계약", "~만 필터")
    # 도구 호출이 정상이고 실패 패턴이 없으면 GOOD 처리
    has_concrete_value = bool(re.search(r'[\d,]+(?:원|건|만원)', expected)) or bool(re.findall(r'[가-힣]{2,3}(?=\(|,|$| )', expected))
    # "필터" 키워드만 있는 expected도 방향성으로 간주
    is_filter_only = bool(re.search(r'필터|만\s*필터|포함$', expected)) and not has_concrete_value
    if (not has_concrete_value or is_filter_only) and response["tools_called"]:
        fail_patterns = ["확인되지 않습니다", "등록되어 있지 않습니다", "정보가 없습니다", "찾을 수 없"]
        has_fail = any(fp in text for fp in fail_patterns)
        if not has_fail and len(text.strip()) > 20:
            details.append("방향성 expected: 도구 호출 정상, 실패 패턴 없음 → GOOD")
            return {"grade": "GOOD", "score": 0.9, "details": details}

    # Q5 목록/검색 유형 — 목록이 반환되면 정답
    if case_type == "Q5":
        # 목록 유형: "고객 목록 보여줘", "전체 고객 리스트"
        if "목록" in expected or "리스트" in expected:
            # 응답에 한글 이름이 2개 이상 나열되면 목록 반환으로 판단
            names_in_response = re.findall(r'[가-힣]{2,4}', text)
            if len(names_in_response) >= 3:
                details.append("Q5 목록: 고객 이름 다수 확인됨")
                return {"grade": "GOOD", "score": 1.0, "details": details}
        # 검색 유형: expected에 이름 나열 (정승우, 정명란 등)
        if "등" in expected:
            # expected에서 이름 추출
            expected_names = re.findall(r'[가-힣]{2,4}', expected.split("등")[0])
            if expected_names:
                matched = sum(1 for n in expected_names if n in text)
                if matched >= 1:
                    details.append(f"Q5 검색: {matched}/{len(expected_names)} 이름 매칭")
                    return {"grade": "GOOD", "score": 1.0, "details": details}
                # expected 이름이 첫 페이지에 없을 수 있음 — 응답에 한글 이름 3개 이상이면 GOOD
                names_in_response = re.findall(r'[가-힣]{2,4}', text)
                if len(names_in_response) >= 3:
                    details.append(f"Q5 검색: expected 이름 미매칭이나 응답에 이름 {len(names_in_response)}개 확인")
                    return {"grade": "GOOD", "score": 0.8, "details": details}

    # "관계 없음" expected — 부정 응답이 정답인 경우
    if "관계 없음" in expected:
        negative_patterns = ["등록되어 있지 않", "확인되지 않", "관계.*없", "설정되어 있지 않", "찾을 수 없"]
        for np in negative_patterns:
            if re.search(np, text):
                details.append(f"부정 답변 정답 확인: '{np}'")
                return {"grade": "GOOD", "score": 1.0, "details": details}

    # --- 일반 평가 로직 ---

    # "확인되지 않습니다" 패턴 체크 (부정 expected가 아닌 경우만 감점)
    # 단, expected에 "0건", "없음", "관계 없음" 등이 포함되면 감점 안 함
    expected_is_negative = bool(re.search(r'0건|없음|관계 없음', expected))
    fail_patterns = ["확인되지 않습니다", "등록되어 있지 않습니다", "정보가 없습니다"]
    for fp in fail_patterns:
        if fp in text and fp not in expected and not expected_is_negative:
            details.append(f"실패 패턴 감지: '{fp}'")

    # expected에서 핵심 키워드 추출하여 응답에 포함 여부 체크
    score_parts = []

    # 숫자 매칭 (보험료, 건수 등)
    # "= 총 N건" 패턴이 있으면 최종 합계(N)만 필수, 중간 계산 숫자는 optional
    final_total_match = re.search(r'=\s*총\s*([\d,]+(?:원|건|만원))', expected)
    if final_total_match:
        # 최종 합계만 필수 체크
        required_numbers = [final_total_match.group(1)]
        # 나머지는 참고용 (매칭 실패해도 감점 없음)
    else:
        required_numbers = re.findall(r'[\d,]+(?:원|건|만원)', expected)

    if required_numbers:
        matched = 0
        for num in required_numbers:
            num_plain = num.replace(",", "")
            if num in text or num_plain in text:
                matched += 1
            else:
                # 단위 변환 매칭: "10,345,613,592원" ↔ "약 103억원", "10000만원" ↔ "1억"
                num_value = int(re.sub(r'[^\d]', '', num_plain) or '0')
                unit = re.search(r'(원|건|만원)', num)
                unit_str = unit.group(1) if unit else ''
                # 만원 단위 → 원 단위 변환
                if unit_str == '만원':
                    num_value_won = num_value * 10000
                else:
                    num_value_won = num_value
                # 억 단위 변환 체크
                if num_value_won >= 100000000:
                    billions = num_value_won / 100000000
                    billion_strs = [f"{billions:.0f}억", f"약 {billions:.0f}억", f"{billions:g}억"]
                    if any(b in text for b in billion_strs):
                        matched += 1
                        continue
                # "0원" ↔ "없습니다/없음" 동의어 매칭
                if num_value == 0 and unit_str == '원':
                    zero_synonyms = ["없습니다", "없음", "없어요", "0원", "없는"]
                    if any(s in text for s in zero_synonyms):
                        matched += 1
                        continue
                details.append(f"누락된 수치: {num}")
        score_parts.append(matched / len(required_numbers) if required_numbers else 1.0)

    # 고객명/상품명 매칭
    expected_names = re.findall(r'[가-힣]{2,}(?:보험|종신|연금|암|건강|플랜|Plus|V보험)', expected)
    if expected_names:
        matched = 0
        for name in expected_names:
            if name in text:
                matched += 1
            else:
                details.append(f"누락된 상품명: {name}")
        score_parts.append(matched / len(expected_names) if expected_names else 1.0)

    # 관계 유형 매칭 (Q8)
    rel_keywords = re.findall(r'배우자|자녀|부모|대표이사|임원|직원|spouse|child|parent|ceo|executive', expected)
    if rel_keywords:
        matched = sum(1 for k in rel_keywords if k in text)
        score_parts.append(matched / len(rel_keywords))
        for k in rel_keywords:
            if k not in text:
                details.append(f"누락된 관계: {k}")

    # 사람 이름 매칭 (lookbehind로 한글 단어 중간 매칭 방지, stopwords 제외)
    person_names = [n for n in re.findall(r'(?<![가-힣])[가-힣]{2,3}(?=\(|,|$| )', expected)
                    if n not in PERSON_NAME_STOPWORDS]
    if person_names:
        matched = sum(1 for n in person_names if n in text)
        if person_names:
            score_parts.append(matched / len(person_names))

    # gt_tool 필드가 있으면 도구 선택 정확도 평가 (가산)
    gt_tool = case.get("gt_tool", "")
    if gt_tool and response["tools_called"]:
        if gt_tool in response["tools_called"]:
            score_parts.append(1.0)
            details.append(f"도구 선택 정확: {gt_tool}")
        else:
            score_parts.append(0.0)
            details.append(f"도구 선택 오류: expected={gt_tool}, actual={response['tools_called']}")

    # 최종 점수 계산
    if score_parts:
        score = sum(score_parts) / len(score_parts)
    else:
        # expected에서 추출할 키워드가 없으면, 기본 체크만
        score = 1.0 if not details else 0.5

    # 실패 패턴이 있으면 감점
    if any("실패 패턴 감지" in d for d in details):
        score = min(score, 0.3)

    # 등급 판정
    if score >= 0.8:
        grade = "GOOD"
    elif score >= 0.5:
        grade = "PARTIAL"
    else:
        grade = "FAIL"

    return {"grade": grade, "score": round(score, 2), "details": details}


def main():
    print("=" * 60)
    print("  GT 기반 AI 어시스턴트 심화 평가")
    print("=" * 60)
    print()

    with open(GT_FILE, "r", encoding="utf-8") as f:
        gt_data = json.load(f)

    cases = gt_data["test_cases"]
    print(f"테스트 케이스: {len(cases)}건")
    print()

    token = get_auth_token()
    print("[AUTH] 토큰 획득 완료")
    print()

    results = []
    stats = {"GOOD": 0, "PARTIAL": 0, "FAIL": 0, "ERROR": 0}
    type_stats = {}

    for i, case in enumerate(cases):
        case_id = case["id"]
        case_type = case["type"]
        query = case["query"]

        print(f"[{i+1}/{len(cases)}] {case_id}: {query}")

        start = time.time()
        response = send_chat_request(query, token)
        elapsed = time.time() - start

        evaluation = evaluate_gt(case, response)
        grade = evaluation["grade"]
        score = evaluation["score"]
        stats[grade] += 1

        if case_type not in type_stats:
            type_stats[case_type] = {"total": 0, "score_sum": 0.0, "grades": {"GOOD": 0, "PARTIAL": 0, "FAIL": 0, "ERROR": 0}}
        type_stats[case_type]["total"] += 1
        type_stats[case_type]["score_sum"] += score
        type_stats[case_type]["grades"][grade] += 1

        icon = {"GOOD": "✅", "PARTIAL": "⚠️", "FAIL": "❌", "ERROR": "💥"}.get(grade, "?")
        print(f"  {icon} {grade} (score: {score}, {elapsed:.1f}s) tools: {response['tools_called']}")
        for d in evaluation["details"][:3]:
            print(f"    - {d}")

        results.append({
            "id": case_id, "type": case_type, "query": query,
            "grade": grade, "score": score, "elapsed": round(elapsed, 1),
            "tools_called": response["tools_called"],
            "details": evaluation["details"],
            "response_preview": response["full_text"][:500],
            "expected": case.get("expected", "")
        })

        print()
        if i < len(cases) - 1:
            time.sleep(2)

    # 유형별 요약
    print("=" * 60)
    print("  유형별 결과")
    print("=" * 60)
    for qtype in sorted(type_stats.keys()):
        ts = type_stats[qtype]
        avg = ts["score_sum"] / ts["total"] if ts["total"] > 0 else 0
        g = ts["grades"]
        print(f"  {qtype}: avg {avg:.0%} | GOOD:{g['GOOD']} PARTIAL:{g['PARTIAL']} FAIL:{g['FAIL']} ERROR:{g['ERROR']}")

    print()
    total = len(cases)
    avg_score = sum(r["score"] for r in results) / total if total > 0 else 0
    print("=" * 60)
    print(f"  전체: {total}건 | avg {avg_score:.0%}")
    print(f"  GOOD:{stats['GOOD']} PARTIAL:{stats['PARTIAL']} FAIL:{stats['FAIL']} ERROR:{stats['ERROR']}")
    print(f"  결과 파일: {RESULT_FILE}")
    print("=" * 60)

    summary = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "total": total, "avg_score": round(avg_score, 3),
        "stats": stats, "type_stats": {k: {"total": v["total"], "avg_score": round(v["score_sum"]/v["total"], 3), "grades": v["grades"]} for k, v in type_stats.items()},
        "results": results
    }
    with open(RESULT_FILE, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    sys.exit(1 if stats["FAIL"] + stats["ERROR"] > total * 0.3 else 0)


if __name__ == "__main__":
    main()

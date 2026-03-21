#!/usr/bin/env python3
"""
UQ(Q3) Proxy GT 평가 — 문서 원문 재서술 감지

서버에서 실행: python3 ~/aims/tools/ai_assistant_regression/run_uq_evaluation.py
SSH 경유:      ssh rossi@100.110.215.65 'cd ~/aims && python3 tools/ai_assistant_regression/run_uq_evaluation.py'

Q3 유형 질의 20건을 AI에 보내고, 응답에서 문서 원문 재서술/해석 패턴을 감지합니다.
"""

import json
import os
import re
import sys
import time
import urllib.request
import urllib.error

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
RESULT_FILE = "/tmp/uq_evaluation_results.json"

CHAT_API_URL = "http://localhost:3010/api/chat"
AUTH_API_URL = "http://localhost:3010/api/auth/admin-login"
AUTH_EMAIL = "aim2nasa@gmail.com"
AUTH_PASSWORD = "3007"
REQUEST_TIMEOUT = 120

# Q3 테스트 질의 20건
Q3_TEST_CASES = [
    {"id": "UQ-01", "query": "캐치업코리아 해외여행보험 내용 요약해줘"},
    {"id": "UQ-02", "query": "김보성 보험증권에 보장 범위가 어떻게 되어있어?"},
    {"id": "UQ-03", "query": "방금 올린 건강검진 결과서에 뭐라고 써있어?"},
    {"id": "UQ-04", "query": "캐치업코리아 취업규칙에 뭐가 써있어?"},
    {"id": "UQ-05", "query": "김보성 메모 파일 내용 알려줘"},
    {"id": "UQ-06", "query": "안영미 보험증권 내용 요약해줘"},
    {"id": "UQ-07", "query": "곽승철 관련 서류 내용 정리해줘"},
    {"id": "UQ-08", "query": "송유미 청약서에 뭐라고 적혀있어?"},
    {"id": "UQ-09", "query": "캐치업코리아 사업자등록증 내용 알려줘"},
    {"id": "UQ-10", "query": "김보성 퇴직연금 서류 내용 요약"},
    {"id": "UQ-11", "query": "이분희 보험 서류에서 수익자가 누구로 되어있어?"},
    {"id": "UQ-12", "query": "캐치업코리아 근로계약서 내용 보여줘"},
    {"id": "UQ-13", "query": "안영미 변액보험 리뷰 리포트에 뭐가 써있어?"},
    {"id": "UQ-14", "query": "곽지민 보험 서류 내용 요약해줘"},
    {"id": "UQ-15", "query": "마리치 관련 문서 내용 정리해줘"},
    {"id": "UQ-16", "query": "김보성 통장 사본에 뭐가 적혀있어?"},
    {"id": "UQ-17", "query": "캐치업코리아 세무조정계산서 내용 알려줘"},
    {"id": "UQ-18", "query": "송유미 보장내용 확인서에 뭐라고 되어있어?"},
    {"id": "UQ-19", "query": "한상용 보험증권 약관 내용 요약해줘"},
    {"id": "UQ-20", "query": "은형석 관련 서류 내용 정리해줘"},
]

# 문서 원문 재서술/해석 감지 패턴
INTERPRETATION_PATTERNS = [
    r'이 문서는.*에 (관한|대한|관련된)',
    r'내용을 (정리|요약|분석)하면',
    r'(요약하면|정리하면|분석하면)',
    r'문서에 (따르면|의하면)',
    r'(기재|명시|기록)되어 있(는|습니다)',
    r'(확인|파악)된 (내용|정보)은',
    r'주요 (내용|포인트|사항)은',
    r'다음과 같(은|습니다)',  # 도구 결과 나열은 OK, 해석 후 나열은 FAIL
]

# 정상 패턴 (도구 결과 전달)
SAFE_PATTERNS = [
    r'문서를 직접 확인',
    r'검색 결과',
    r'문서 링크',
    r'요약 정보(가|는|를)',
    r'등록된 문서',
    r'\(doc:',  # 문서 링크
]


def get_auth_token():
    payload = json.dumps({"email": AUTH_EMAIL, "password": AUTH_PASSWORD}).encode("utf-8")
    req = urllib.request.Request(
        AUTH_API_URL, data=payload,
        headers={"Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        return data.get("token") or data.get("accessToken")


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
                            except json.JSONDecodeError:
                                pass
    except Exception as e:
        result["error"] = str(e)
    return result


def evaluate_q3(response):
    """Q3 응답을 Proxy GT로 판정

    Returns:
        dict: {"grade": "PASS"|"FAIL", "interpretation_count": int, "safe_count": int, "details": list}
    """
    text = response["full_text"]
    details = []

    if response["error"]:
        return {"grade": "ERROR", "interpretation_count": 0, "safe_count": 0, "details": [f"API 오류: {response['error']}"]}

    # 해석 패턴 감지
    interpretation_count = 0
    for pattern in INTERPRETATION_PATTERNS:
        matches = re.findall(pattern, text)
        if matches:
            interpretation_count += len(matches)
            details.append(f"해석 패턴: '{pattern}' ({len(matches)}건)")

    # 정상 패턴 감지
    safe_count = 0
    for pattern in SAFE_PATTERNS:
        matches = re.findall(pattern, text)
        if matches:
            safe_count += len(matches)

    # 판정: 해석 패턴이 0이면 PASS, 1개 이상이면 FAIL
    # 단, 정상 패턴이 해석 패턴보다 많으면 도구 결과 전달 위주이므로 PASS
    if interpretation_count == 0:
        grade = "PASS"
    elif safe_count > interpretation_count:
        grade = "PASS"
        details.append(f"정상 패턴({safe_count})이 해석 패턴({interpretation_count})보다 많음 → PASS")
    else:
        grade = "FAIL"

    return {
        "grade": grade,
        "interpretation_count": interpretation_count,
        "safe_count": safe_count,
        "details": details
    }


def main():
    print("=" * 60)
    print("  UQ(Q3) Proxy GT 평가 — 문서 원문 재서술 감지")
    print("=" * 60)
    print()

    token = get_auth_token()
    print(f"[AUTH] 토큰 획득 완료")
    print(f"테스트 케이스: {len(Q3_TEST_CASES)}건")
    print()

    results = []
    stats = {"PASS": 0, "FAIL": 0, "ERROR": 0}

    for i, case in enumerate(Q3_TEST_CASES):
        print(f"[{i+1}/{len(Q3_TEST_CASES)}] {case['id']}: {case['query']}")

        start = time.time()
        response = send_chat_request(case["query"], token)
        elapsed = time.time() - start

        evaluation = evaluate_q3(response)
        grade = evaluation["grade"]
        stats[grade] += 1

        icon = {"PASS": "✅", "FAIL": "❌", "ERROR": "💥"}.get(grade, "?")
        print(f"  {icon} {grade} ({elapsed:.1f}s) 해석:{evaluation['interpretation_count']} 정상:{evaluation['safe_count']}")
        for d in evaluation["details"][:3]:
            print(f"    - {d}")

        results.append({
            "id": case["id"],
            "query": case["query"],
            "grade": grade,
            "interpretation_count": evaluation["interpretation_count"],
            "safe_count": evaluation["safe_count"],
            "details": evaluation["details"],
            "tools_called": response["tools_called"],
            "response_preview": response["full_text"][:500],
            "elapsed": round(elapsed, 1)
        })

        print()
        if i < len(Q3_TEST_CASES) - 1:
            time.sleep(2)

    # 결과
    total = len(Q3_TEST_CASES)
    fail_rate = stats["FAIL"] / total * 100 if total > 0 else 0

    print("=" * 60)
    print(f"  결과: PASS {stats['PASS']}/{total}, FAIL {stats['FAIL']}/{total}")
    print(f"  FAIL률: {fail_rate:.0f}%")
    print(f"  판정: {'방안 C 불필요 (FAIL률 < 30%)' if fail_rate < 30 else '방안 C 적용 검토 필요 (FAIL률 >= 30%)'}")
    print(f"  결과 파일: {RESULT_FILE}")
    print("=" * 60)

    summary = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "total": total,
        "stats": stats,
        "fail_rate_percent": round(fail_rate, 1),
        "decision": "C_NOT_NEEDED" if fail_rate < 30 else "C_NEEDED",
        "results": results
    }
    with open(RESULT_FILE, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    sys.exit(0)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
AI 어시스턴트 Regression 테스트 러너

서버에서 직접 실행: python3 ~/aims/tools/ai_assistant_regression/run_regression.py
SSH 경유 실행:      ssh rossi@100.110.215.65 'cd ~/aims && python3 tools/ai_assistant_regression/run_regression.py'

AI 채팅 API(localhost:3010/api/chat)에 SSE 요청을 보내고,
각 케이스의 응답을 검증합니다.

검증 구분:
  - HARD (PASS/FAIL): response_must_contain, response_must_not_contain,
                       response_must_not_match, must_call_tools,
                       required_tools, API 오류
  - SOFT (WARN):      expected_tools (AI 비결정성 수용)

exit code: 0=HARD 전체 PASS, 1=HARD FAIL 있음
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
CASES_FILE = os.path.join(SCRIPT_DIR, "regression_cases.json")
RESULT_FILE = "/tmp/regression_results.json"

CHAT_API_URL = "http://localhost:3010/api/chat"
AUTH_API_URL = "http://localhost:3010/api/auth/admin-login"

# 곽승철 계정 (테스트용)
AUTH_EMAIL = "aim2nasa@gmail.com"
AUTH_PASSWORD = "3007"

# 타임아웃: AI 응답은 느릴 수 있으므로 넉넉하게
REQUEST_TIMEOUT = 120  # 초


def get_auth_token():
    """설계사 계정으로 로그인하여 JWT 토큰 획득 (admin-login API에 email 전달)"""
    payload = json.dumps({"email": AUTH_EMAIL, "password": AUTH_PASSWORD}).encode("utf-8")
    req = urllib.request.Request(
        AUTH_API_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            token = data.get("token") or data.get("accessToken")
            if not token:
                print(f"[ERROR] 인증 응답에 토큰 없음: {json.dumps(data, ensure_ascii=False)[:200]}")
                sys.exit(1)
            return token
    except Exception as e:
        print(f"[ERROR] 인증 실패: {e}")
        sys.exit(1)


def send_chat_request(question, token):
    """AI 채팅 API에 SSE 요청을 보내고 전체 응답을 파싱하여 반환

    Returns:
        dict: {
            "full_text": str,       # AI 최종 텍스트 응답
            "tools_called": list,   # 호출된 도구 이름 목록
            "tool_results": list,   # 도구 결과 이벤트 목록
            "raw_events": list,     # 모든 SSE 이벤트
            "error": str or None    # 오류 메시지
        }
    """
    payload = json.dumps({
        "messages": [{"role": "user", "content": question}]
    }).encode("utf-8")

    req = urllib.request.Request(
        CHAT_API_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
            "Accept": "text/event-stream"
        },
        method="POST"
    )

    result = {
        "full_text": "",
        "tools_called": [],
        "tool_results": [],
        "raw_events": [],
        "error": None
    }

    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
            buffer = ""
            for raw_line in resp:
                line = raw_line.decode("utf-8", errors="replace")
                buffer += line

                # SSE 이벤트는 "data: {...}\n\n"로 구분
                while "\n\n" in buffer:
                    chunk, buffer = buffer.split("\n\n", 1)
                    for sub_line in chunk.strip().split("\n"):
                        if sub_line.startswith("data: "):
                            data_str = sub_line[6:]
                            try:
                                event = json.loads(data_str)
                                result["raw_events"].append(event)
                                _process_event(event, result)
                            except json.JSONDecodeError:
                                pass

    except urllib.error.HTTPError as e:
        result["error"] = f"HTTP {e.code}: {e.reason}"
    except Exception as e:
        result["error"] = str(e)

    return result


def _process_event(event, result):
    """SSE 이벤트를 파싱하여 result에 누적"""
    event_type = event.get("type")

    if event_type == "content":
        result["full_text"] += event.get("content", "")
    elif event_type == "tool_start":
        tools = event.get("tools", [])
        result["tools_called"].extend(tools)
    elif event_type == "tool_calling":
        name = event.get("name")
        if name and name not in result["tools_called"]:
            result["tools_called"].append(name)
    elif event_type == "tool_result":
        result["tool_results"].append(event)
    elif event_type == "error":
        result["error"] = event.get("error", "Unknown error")


def validate_case(case, response):
    """테스트 케이스를 검증하여 결과 반환

    검증을 hard(FAIL) / soft(WARN)로 구분합니다.
    - hard: 반드시 통과해야 하는 검증 (응답 내용, API 오류, 도구 호출 필수)
    - soft: AI 비결정성으로 인해 실패할 수 있는 검증 (expected_tools)

    Returns:
        dict: {"passed": bool, "failures": list[str], "warnings": list[str]}
    """
    failures = []  # hard — FAIL
    warnings = []  # soft — WARN

    # 오류 체크 (hard)
    if response["error"]:
        failures.append(f"API 오류: {response['error']}")

    text = response["full_text"]

    # must_contain 검증 (hard)
    for keyword in case.get("response_must_contain", []):
        if keyword not in text:
            failures.append(f"응답에 '{keyword}'가 포함되어야 하지만 없음")

    # must_not_contain 검증 (hard)
    for keyword in case.get("response_must_not_contain", []):
        if keyword in text:
            failures.append(f"응답에 '{keyword}'가 포함되면 안 되지만 발견됨")

    # must_not_match 정규식 검증 (hard)
    for pattern in case.get("response_must_not_match", []):
        if re.search(pattern, text):
            failures.append(f"응답이 패턴 '{pattern}'에 매칭되면 안 되지만 매칭됨")

    # must_call_tools 검증 (hard): 최소 1개 이상 도구 호출 필수
    called_tools = response["tools_called"]
    if case.get("must_call_tools") and len(called_tools) == 0:
        failures.append("도구 호출 없이 응답함 (가상 데이터 생성 의심)")

    # required_tools 검증 (hard — FAIL): 이 도구는 반드시 호출되어야 함
    # 등가 도구: search_customer_with_contracts는 list_contracts를 내포
    EQUIVALENT_TOOLS = {
        "list_contracts": ["list_contracts", "search_customer_with_contracts"],
        "search_documents": ["search_documents", "search_customer_documents"],
    }
    required_tools = case.get("required_tools", [])
    for tool in required_tools:
        accepted = EQUIVALENT_TOOLS.get(tool, [tool])
        if not any(t in called_tools for t in accepted):
            failures.append(f"필수 도구 '{tool}'가 호출되지 않음 (호출된 도구: {called_tools})")

    # expected_tools 검증 (soft — WARN): AI 비결정성 수용
    expected_tools = case.get("expected_tools", [])
    for tool in expected_tools:
        if tool not in called_tools:
            warnings.append(f"도구 '{tool}'가 호출 기대되었으나 미호출 (호출된 도구: {called_tools})")

    # validate_pagination_hint: tool_result에서 _paginationHint 포함 여부
    if case.get("validate_pagination_hint"):
        has_hint = False
        for evt in response["raw_events"]:
            evt_str = json.dumps(evt)
            if "_paginationHint" in evt_str:
                has_hint = True
                break
        # 결과가 적으면 힌트가 없을 수 있음 — 경고 수준
        if not has_hint:
            warnings.append("_paginationHint가 응답에 없음 (결과가 적으면 정상)")

    return {
        "passed": len(failures) == 0,
        "failures": failures,
        "warnings": warnings
    }


def main():
    print("=" * 60)
    print("  AI 어시스턴트 Regression 테스트")
    print("=" * 60)
    print()

    # 테스트 케이스 로드
    with open(CASES_FILE, "r", encoding="utf-8") as f:
        cases = json.load(f)

    print(f"테스트 케이스: {len(cases)}개")
    print(f"검증 기준: HARD (must_contain/must_not_contain/must_call_tools/required_tools) = PASS/FAIL")
    print(f"           SOFT (expected_tools) = WARN (비결정적 AI 수용)")
    print()

    # 인증
    print("[AUTH] 관리자 로그인...")
    token = get_auth_token()
    print("[AUTH] 토큰 획득 완료")
    print()

    # 테스트 실행
    results = []
    passed = 0
    failed = 0
    total_warnings = 0

    for i, case in enumerate(cases):
        case_id = case["id"]
        case_name = case["name"]
        question = case["question"]

        print(f"[{i+1}/{len(cases)}] {case_id}: {case_name}")
        print(f"  질문: {question}")

        start_time = time.time()
        response = send_chat_request(question, token)
        elapsed = time.time() - start_time

        validation = validate_case(case, response)
        warn_count = len(validation["warnings"])
        total_warnings += warn_count

        result_entry = {
            "id": case_id,
            "name": case_name,
            "passed": validation["passed"],
            "failures": validation["failures"],
            "warnings": validation["warnings"],
            "elapsed_seconds": round(elapsed, 1),
            "tools_called": response["tools_called"],
            "response_preview": response["full_text"][:300],
            "error": response["error"]
        }
        results.append(result_entry)

        if validation["passed"]:
            passed += 1
            status = "PASS"
            if warn_count > 0:
                status += f" ({warn_count} warn)"
            print(f"  {status} ({elapsed:.1f}s) - 도구: {response['tools_called']}")
            for w in validation["warnings"]:
                print(f"    [WARN] {w}")
        else:
            failed += 1
            print(f"  FAIL ({elapsed:.1f}s)")
            for failure in validation["failures"]:
                print(f"    [FAIL] {failure}")
            for w in validation["warnings"]:
                print(f"    [WARN] {w}")

        print()

        # API rate limit 방지: 케이스 간 2초 대기
        if i < len(cases) - 1:
            time.sleep(2)

    # 결과 저장
    summary = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "total": len(cases),
        "passed": passed,
        "failed": failed,
        "warnings": total_warnings,
        "results": results
    }

    with open(RESULT_FILE, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    # 요약 출력
    print("=" * 60)
    print(f"  결과: {passed}/{len(cases)} PASS, {failed}/{len(cases)} FAIL ({total_warnings} warnings)")
    print(f"  결과 파일: {RESULT_FILE}")
    print("=" * 60)

    # exit code: HARD FAIL만 실패 처리
    sys.exit(1 if failed > 0 else 0)


if __name__ == "__main__":
    main()

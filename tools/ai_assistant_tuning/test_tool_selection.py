"""
AI 어시스턴트 도구 선택 정확도 테스트
- Ground Truth의 각 질문에 대해 4.1-mini가 어떤 도구를 선택하는지 확인
- 도구 실행 없이 첫 번째 tool_call만 확인
- Before/After 비교용
"""

import json
import os
import sys
import time
from datetime import datetime
from openai import OpenAI
import requests

# ============================================================
# 설정
# ============================================================

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
GT_PATH = os.path.join(SCRIPT_DIR, "ground_truth.json")
RESULTS_DIR = os.path.join(SCRIPT_DIR, "results")

# MCP 서버에서 도구 정의 가져오기 (SSH 터널 경유)
MCP_SERVER_URL = "http://localhost:3011"

# OpenAI 설정
MODEL = "gpt-4.1-mini"


def load_system_prompt():
    """chatService.js에서 SYSTEM_PROMPT 변수만 추출 (정규식 파싱)"""
    import subprocess
    import re

    # chatService.js 파일 내용을 가져와서 SYSTEM_PROMPT 추출
    result = subprocess.run(
        ["ssh", "rossi@100.110.215.65", "cat", "/home/rossi/aims/backend/api/aims_api/lib/chatService.js"],
        capture_output=True, timeout=15, encoding="utf-8", errors="replace"
    )
    if result.returncode != 0:
        print(f"[ERROR] chatService.js 읽기 실패: {result.stderr}")
        sys.exit(1)

    content = result.stdout
    # const SYSTEM_PROMPT = `...`; 패턴에서 백틱 사이 내용 추출
    match = re.search(r"const SYSTEM_PROMPT = `(.*?)`;", content, re.DOTALL)
    if not match:
        print("[ERROR] SYSTEM_PROMPT를 찾을 수 없습니다")
        sys.exit(1)

    return match.group(1).strip()


def load_tool_definitions():
    """MCP 서버에서 도구 정의 로드"""
    try:
        resp = requests.get(f"{MCP_SERVER_URL}/tools", timeout=10)
        mcp_tools = resp.json().get("tools", [])
        # OpenAI functions 형식으로 변환
        return [
            {
                "type": "function",
                "function": {
                    "name": tool["name"],
                    "description": tool["description"],
                    "parameters": tool.get("inputSchema", {"type": "object", "properties": {}})
                }
            }
            for tool in mcp_tools
        ]
    except Exception as e:
        print(f"[ERROR] MCP 도구 로드 실패: {e}")
        print("  → SSH 터널이 열려있는지 확인: ssh -L 3011:localhost:3011 rossi@100.110.215.65")
        sys.exit(1)


def load_ground_truth():
    """Ground Truth 로드"""
    with open(GT_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data["test_cases"]


def test_single_question(client, system_prompt, tools, question):
    """단일 질문에 대해 도구 선택 테스트 (도구 실행 없이)"""
    now = datetime.now()
    date_info = f"현재 날짜: {now.year}년 {now.month}월 {now.day}일"

    messages = [
        {"role": "system", "content": f"{date_info}\n\n{system_prompt}"},
        {"role": "user", "content": question}
    ]

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            tools=tools,
            max_tokens=512,
            # tool_choice를 auto로 두어 자연스러운 선택 유도
        )

        choice = response.choices[0]
        selected_tool = None
        selected_args = None

        if choice.message.tool_calls and len(choice.message.tool_calls) > 0:
            tc = choice.message.tool_calls[0]
            selected_tool = tc.function.name
            try:
                selected_args = json.loads(tc.function.arguments)
            except json.JSONDecodeError:
                selected_args = tc.function.arguments

        return {
            "selected_tool": selected_tool,
            "selected_args": selected_args,
            "finish_reason": choice.finish_reason,
            "content": choice.message.content,
            "usage": {
                "prompt_tokens": response.usage.prompt_tokens,
                "completion_tokens": response.usage.completion_tokens,
            }
        }
    except Exception as e:
        return {
            "selected_tool": None,
            "selected_args": None,
            "finish_reason": "error",
            "content": str(e),
            "usage": {"prompt_tokens": 0, "completion_tokens": 0}
        }


def evaluate(test_cases, results):
    """정확도 평가 (v2: acceptable_first_calls 기반)"""
    correct = 0
    wrong = []
    no_tool = []

    for tc, result in zip(test_cases, results):
        selected = result["selected_tool"]
        # v2: acceptable_first_calls 사용, 없으면 target_tool 또는 expected_tool 폴백
        acceptable = tc.get("acceptable_first_calls")
        if acceptable is None:
            target = tc.get("target_tool", tc.get("expected_tool"))
            acceptable = [target] if target else []

        target_tool = tc.get("target_tool", tc.get("expected_tool", ""))

        if selected is None:
            no_tool.append(tc)
        elif selected in acceptable:
            correct += 1
        else:
            wrong.append({
                "id": tc["id"],
                "question": tc["question"],
                "expected": f"{target_tool} (acceptable: {acceptable})",
                "selected": selected,
                "category": tc["category"],
                "notes": tc.get("notes", "")
            })

    total = len(test_cases)
    # 정확도: 도구를 호출한 케이스 중 정답 비율
    tool_called = total - len(no_tool)
    accuracy_total = correct / total * 100 if total > 0 else 0
    accuracy_called = correct / tool_called * 100 if tool_called > 0 else 0

    return {
        "total": total,
        "correct": correct,
        "wrong_count": len(wrong),
        "no_tool_count": len(no_tool),
        "accuracy_total": round(accuracy_total, 1),
        "accuracy_called": round(accuracy_called, 1),
        "wrong_cases": wrong,
        "no_tool_cases": [{"id": t["id"], "question": t["question"]} for t in no_tool]
    }


def save_results(label, test_cases, results, evaluation):
    """결과 저장"""
    os.makedirs(RESULTS_DIR, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{label}_{timestamp}.json"
    filepath = os.path.join(RESULTS_DIR, filename)

    output = {
        "label": label,
        "timestamp": datetime.now().isoformat(),
        "model": MODEL,
        "summary": {
            "total": evaluation["total"],
            "correct": evaluation["correct"],
            "wrong": evaluation["wrong_count"],
            "no_tool": evaluation["no_tool_count"],
            "accuracy_total": evaluation["accuracy_total"],
            "accuracy_called": evaluation["accuracy_called"]
        },
        "wrong_cases": evaluation["wrong_cases"],
        "no_tool_cases": evaluation["no_tool_cases"],
        "details": [
            {
                "id": tc["id"],
                "question": tc["question"],
                "target_tool": tc.get("target_tool", tc.get("expected_tool", "")),
                "acceptable": tc.get("acceptable_first_calls", [tc.get("target_tool", tc.get("expected_tool", ""))]),
                "selected_tool": r["selected_tool"],
                "correct": r["selected_tool"] in tc.get("acceptable_first_calls", [tc.get("target_tool", tc.get("expected_tool", ""))]) if r["selected_tool"] else False,
                "selected_args": r["selected_args"],
                "category": tc["category"]
            }
            for tc, r in zip(test_cases, results)
        ]
    }

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    return filepath


def print_report(evaluation):
    """콘솔 리포트 출력"""
    print("\n" + "=" * 60)
    print(f"  Total: {evaluation['correct']}/{evaluation['total']} ({evaluation['accuracy_total']}%)")
    print(f"  Tool called: {evaluation['correct']}/{evaluation['total'] - evaluation['no_tool_count']} ({evaluation['accuracy_called']}%)")
    print("=" * 60)

    if evaluation["wrong_cases"]:
        print(f"\n  [X] Wrong ({evaluation['wrong_count']}cases):")
        for w in evaluation["wrong_cases"]:
            print(f"    [{w['id']}] {w['question']}")
            print(f"      expected: {w['expected']} -> selected: {w['selected']}")

    if evaluation["no_tool_cases"]:
        print(f"\n  [!] No tool ({evaluation['no_tool_count']}cases):")
        for n in evaluation["no_tool_cases"]:
            print(f"    [{n['id']}] {n['question']}")

    print()


def main():
    label = sys.argv[1] if len(sys.argv) > 1 else "test"

    print(f"[1/4] Ground Truth 로드...")
    test_cases = load_ground_truth()
    print(f"  → {len(test_cases)}건")

    print(f"[2/4] 시스템 프롬프트 + 도구 정의 로드...")
    system_prompt = load_system_prompt()
    tools = load_tool_definitions()
    print(f"  → 시스템 프롬프트: {len(system_prompt)}자, 도구: {len(tools)}개")

    # OpenAI API 키 확인
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        # .env.shared에서 로드 시도
        import subprocess
        result = subprocess.run(
            ["ssh", "rossi@100.110.215.65", "grep", "OPENAI_API_KEY", "/home/rossi/aims/.env.shared"],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            line = result.stdout.strip()
            api_key = line.split("=", 1)[1].strip().strip('"').strip("'")
            os.environ["OPENAI_API_KEY"] = api_key

    client = OpenAI(api_key=api_key)

    print(f"[3/4] 테스트 실행 (모델: {MODEL})...")
    results = []
    total_prompt_tokens = 0
    total_completion_tokens = 0

    for i, tc in enumerate(test_cases):
        result = test_single_question(client, system_prompt, tools, tc["question"])
        results.append(result)
        total_prompt_tokens += result["usage"]["prompt_tokens"]
        total_completion_tokens += result["usage"]["completion_tokens"]

        acceptable = tc.get("acceptable_first_calls", [tc.get("target_tool", tc.get("expected_tool", ""))])
        status = "OK" if result["selected_tool"] in acceptable else "NG"
        print(f"  [{i+1}/{len(test_cases)}] {status} {tc['id']}: {tc['question'][:30]}... -> {result['selected_tool']}")

        # Rate limit 방지 (4.1-mini는 빠르지만 안전하게)
        time.sleep(0.5)

    print(f"\n  토큰 사용: prompt={total_prompt_tokens:,}, completion={total_completion_tokens:,}")

    print(f"[4/4] 평가 및 저장...")
    evaluation = evaluate(test_cases, results)
    filepath = save_results(label, test_cases, results, evaluation)

    print_report(evaluation)
    print(f"  결과 저장: {filepath}")


if __name__ == "__main__":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
    main()

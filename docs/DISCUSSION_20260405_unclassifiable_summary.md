# 토의 보고서: unclassifiable 문서의 summary 미생성 버그

> 날짜: 2026-04-05
> 이슈: 비보험 문서(비행기 매뉴얼 등)의 summary가 "문서 유형을 식별할 수 없습니다"로만 표시

## 근본 원인

`openai_service.py:376-377`에서 `unclassifiable` 문서의 summary fallback이 고정 메시지:

```python
if not summary:
    if doc_type == "unclassifiable":
        summary = "문서 유형을 식별할 수 없습니다."  # ← 문제
    else:
        summary = text[:200].strip() + ("..." if len(text) > 200 else "")
```

GPT가 unclassifiable로 분류하면서 summary를 비워서 반환 → 고정 메시지로 대체됨.
문서 유형 식별과 내용 요약은 별개인데, 코드가 이를 연동시킴.

## 해결 방향 (합의)

1. **프롬프트 보강**: unclassifiable이어도 summary는 반드시 본문 기반 생성 지시
2. **fallback 수정**: GPT가 summary를 비울 경우 `text[:200]` fallback 적용 (안전장치)

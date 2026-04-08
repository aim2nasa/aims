"""
OCR 에러 메시지 regression test (#2)
- progressMessage에 구체적 사유가 포함되는지 검증
"""
import ast
import pathlib


def test_progress_message_includes_user_message():
    """progressMessage가 하드코딩 'OCR 처리 실패'가 아닌 동적 메시지인지 검증"""
    src = pathlib.Path(__file__).resolve().parent.parent / "workers" / "ocr_worker.py"
    content = src.read_text(encoding="utf-8")

    # "progressMessage": "OCR 처리 실패" 하드코딩이 없어야 함
    assert '"progressMessage": "OCR 처리 실패"' not in content, (
        "progressMessage가 하드코딩되어 있음 — 동적 메시지를 사용해야 합니다"
    )

    # progress_message 변수를 사용해야 함
    assert "progress_message" in content, (
        "progress_message 변수가 없음 — 동적 메시지 생성이 필요합니다"
    )


def test_user_message_fallback_chain():
    """userMessage → statusMessage → 기본값 fallback 체인이 있는지 검증"""
    src = pathlib.Path(__file__).resolve().parent.parent / "workers" / "ocr_worker.py"
    content = src.read_text(encoding="utf-8")

    assert 'ocr_result.get("userMessage")' in content
    assert 'ocr_result.get("statusMessage"' in content

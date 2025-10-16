#!/usr/bin/env python3
"""
Annual Report 파싱 시간 측정 벤치마크
"""
import time
import sys
import os

# parse_pdf_with_ai.py의 함수를 import
sys.path.insert(0, os.path.dirname(__file__))
from parse_pdf_with_ai import parse_pdf_with_ai

def benchmark_single_file(pdf_path: str):
    """단일 PDF 파일 파싱 시간 측정"""
    filename = os.path.basename(pdf_path)
    print(f"\n{'='*60}")
    print(f"📄 파일: {filename}")
    print(f"{'='*60}")

    start_time = time.time()

    try:
        result = parse_pdf_with_ai(pdf_path)

        end_time = time.time()
        elapsed = end_time - start_time

        # 결과 요약
        if "보유계약 현황" in result:
            contract_count = len(result["보유계약 현황"])
            print(f"✅ 파싱 성공: {contract_count}건 계약")
        else:
            print(f"⚠️  파싱 완료 (구조 확인 필요)")
            print(f"   반환 키: {list(result.keys())}")

        print(f"⏱️  처리 시간: {elapsed:.2f}초")

        return {
            "filename": filename,
            "success": True,
            "elapsed_seconds": elapsed,
            "contract_count": len(result.get("보유계약 현황", []))
        }

    except Exception as e:
        end_time = time.time()
        elapsed = end_time - start_time

        print(f"❌ 에러 발생: {e}")
        print(f"⏱️  실패까지 소요 시간: {elapsed:.2f}초")

        return {
            "filename": filename,
            "success": False,
            "elapsed_seconds": elapsed,
            "error": str(e)
        }

def benchmark_all_files(pdf_files: list):
    """모든 PDF 파일 벤치마크"""
    results = []

    for pdf_path in pdf_files:
        result = benchmark_single_file(pdf_path)
        results.append(result)

    # 전체 통계
    print(f"\n{'='*60}")
    print(f"📊 전체 통계")
    print(f"{'='*60}")

    success_results = [r for r in results if r["success"]]

    if success_results:
        avg_time = sum(r["elapsed_seconds"] for r in success_results) / len(success_results)
        min_time = min(r["elapsed_seconds"] for r in success_results)
        max_time = max(r["elapsed_seconds"] for r in success_results)

        print(f"✅ 성공: {len(success_results)}/{len(results)}건")
        print(f"⏱️  평균 처리 시간: {avg_time:.2f}초")
        print(f"⏱️  최소 처리 시간: {min_time:.2f}초")
        print(f"⏱️  최대 처리 시간: {max_time:.2f}초")
    else:
        print(f"❌ 모든 파일 파싱 실패")

    if len(success_results) < len(results):
        failed_count = len(results) - len(success_results)
        print(f"❌ 실패: {failed_count}건")

if __name__ == "__main__":
    # 샘플 PDF 파일 목록
    pdf_files = [
        "안영미annual report202508_p2p3.pdf",
        "김보성보유계약현황202508_p2p3.pdf",
        "신상철보유계약현황2025081_p2p3.pdf",
        "정부균보유계약현황202508_p2p3.pdf"
    ]

    # 절대 경로로 변환
    script_dir = os.path.dirname(__file__)
    pdf_files = [os.path.join(script_dir, f) for f in pdf_files]

    # 존재하는 파일만 필터링
    existing_files = [f for f in pdf_files if os.path.exists(f)]

    print(f"🚀 Annual Report 파싱 시간 측정 시작")
    print(f"📁 대상 파일: {len(existing_files)}개")

    benchmark_all_files(existing_files)

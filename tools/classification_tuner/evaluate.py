#!/usr/bin/env python3
"""
evaluate.py — Ground Truth 대비 분류 정확도 평가

사용법:
  python evaluate.py --ground-truth ground_truth.json --predicted results/run_001.json
  python evaluate.py --ground-truth ground_truth.json --predicted results/run_002.json --diff results/run_001.json

Ground Truth 형식 (ground_truth.json):
  [
    {"filename": "doc1.pdf", "type": "application"},
    {"filename": "doc2.pdf", "type": "policy"},
    ...
  ]
  또는 (doc_id 기반):
  [
    {"doc_id": "698edd26d0bedd04b64d85d3", "type": "application"},
    ...
  ]

Predicted 형식:
  extract_and_classify.py 또는 reclassify_from_db.py의 출력 JSON을 그대로 사용
"""
import sys
import json
import argparse
from pathlib import Path
from collections import Counter, defaultdict


def load_ground_truth(filepath: str) -> dict:
    """Ground truth 로드 → {key: type} 딕셔너리"""
    data = json.loads(Path(filepath).read_text(encoding="utf-8"))

    # 리스트 형식
    if isinstance(data, list):
        gt = {}
        for item in data:
            # doc_id 또는 filename을 키로 사용
            key = item.get("doc_id") or item.get("filename")
            if key:
                gt[key] = item["type"]
        return gt

    # 딕셔너리 형식 {filename: type}
    if isinstance(data, dict):
        return data

    print(f"[오류] 지원하지 않는 ground truth 형식")
    sys.exit(1)


def load_predicted(filepath: str) -> list:
    """예측 결과 로드"""
    data = json.loads(Path(filepath).read_text(encoding="utf-8"))

    # extract_and_classify.py 또는 reclassify_from_db.py 출력
    if isinstance(data, dict) and "results" in data:
        return data["results"]

    # 직접 리스트
    if isinstance(data, list):
        return data

    print(f"[오류] 지원하지 않는 predicted 형식")
    sys.exit(1)


def get_pred_key_and_type(item: dict) -> tuple:
    """예측 항목에서 키와 분류 결과 추출"""
    # reclassify_from_db.py → doc_id, new_type
    if "doc_id" in item:
        return item["doc_id"], item.get("new_type") or item.get("predicted_type", "unknown")
    # extract_and_classify.py → filename, predicted_type
    if "filename" in item:
        return item["filename"], item.get("predicted_type", "unknown")
    return None, None


def evaluate(ground_truth: dict, predicted: list) -> dict:
    """평가 수행"""
    matched = 0
    mismatched = 0
    not_found = 0
    general_count = 0
    total = 0

    misclassifications = []
    confusion = defaultdict(Counter)  # confusion[actual][predicted] = count
    type_stats = defaultdict(lambda: {"correct": 0, "total": 0})

    for item in predicted:
        key, pred_type = get_pred_key_and_type(item)
        if not key:
            continue

        # doc_id로 못 찾으면 filename으로 fallback
        if key not in ground_truth and "filename" in item:
            key = item["filename"]

        if key not in ground_truth:
            not_found += 1
            continue

        actual_type = ground_truth[key]
        total += 1

        confusion[actual_type][pred_type] += 1
        type_stats[actual_type]["total"] += 1

        if pred_type == "general":
            general_count += 1

        if actual_type == pred_type:
            matched += 1
            type_stats[actual_type]["correct"] += 1
        else:
            mismatched += 1
            display = item.get("display") or item.get("filename") or key
            misclassifications.append({
                "key": key,
                "display": display[:60],
                "actual": actual_type,
                "predicted": pred_type,
                "confidence": item.get("confidence", 0),
            })

    accuracy = matched / total if total > 0 else 0
    general_rate = general_count / total if total > 0 else 0

    # 유형별 정확도
    per_type = {}
    for t, stats in sorted(type_stats.items()):
        per_type[t] = {
            "correct": stats["correct"],
            "total": stats["total"],
            "accuracy": stats["correct"] / stats["total"] if stats["total"] > 0 else 0,
        }

    return {
        "total": total,
        "matched": matched,
        "mismatched": mismatched,
        "not_in_ground_truth": not_found,
        "accuracy": accuracy,
        "general_count": general_count,
        "general_rate": general_rate,
        "per_type": per_type,
        "confusion_matrix": {k: dict(v) for k, v in confusion.items()},
        "misclassifications": sorted(misclassifications, key=lambda x: x["confidence"]),
    }


def print_report(result: dict, diff_result: dict = None):
    """평가 결과 출력"""
    print("\n" + "=" * 70)
    print("  분류 정확도 평가 결과")
    print("=" * 70)

    print(f"\n  총 평가 문서: {result['total']}건")
    print(f"  정확 분류:    {result['matched']}건")
    print(f"  오분류:       {result['mismatched']}건")
    print(f"  정확도:       {result['accuracy']:.1%}")
    print(f"  general 비율: {result['general_rate']:.1%} ({result['general_count']}건)")

    if result.get("not_in_ground_truth"):
        print(f"  GT 미존재:    {result['not_in_ground_truth']}건 (평가 제외)")

    # 유형별 정확도
    if result["per_type"]:
        print(f"\n{'  유형별 정확도':=^50}")
        print(f"  {'유형':<25} {'정확':<6} {'전체':<6} {'정확도':<8}")
        print(f"  {'-'*45}")
        for t, stats in sorted(result["per_type"].items(), key=lambda x: x[1]["accuracy"]):
            print(f"  {t:<25} {stats['correct']:<6} {stats['total']:<6} {stats['accuracy']:.1%}")

    # 혼동 매트릭스 (상위 10개)
    if result["confusion_matrix"]:
        print(f"\n{'  혼동 매트릭스 (오분류만)':=^50}")
        print(f"  {'실제 유형':<20} {'예측 유형':<20} {'건수':<6}")
        print(f"  {'-'*46}")
        confusion_pairs = []
        for actual, preds in result["confusion_matrix"].items():
            for pred, count in preds.items():
                if actual != pred:
                    confusion_pairs.append((actual, pred, count))
        for actual, pred, count in sorted(confusion_pairs, key=lambda x: -x[2])[:15]:
            print(f"  {actual:<20} {pred:<20} {count}")

    # 오분류 상세
    if result["misclassifications"]:
        print(f"\n{'  오분류 상세':=^50}")
        for m in result["misclassifications"]:
            print(f"  [{m['confidence']:.2f}] {m['display']}")
            print(f"         실제: {m['actual']}  ->  예측: {m['predicted']}")

    # 이전 결과와 비교
    if diff_result:
        print(f"\n{'  이전 결과 대비 비교':=^50}")
        prev_acc = diff_result["accuracy"]
        curr_acc = result["accuracy"]
        delta = curr_acc - prev_acc
        symbol = "+" if delta > 0 else ""
        print(f"  이전 정확도: {prev_acc:.1%}")
        print(f"  현재 정확도: {curr_acc:.1%}")
        print(f"  변화:        {symbol}{delta:.1%}")
        print(f"  이전 general: {diff_result['general_rate']:.1%} -> 현재: {result['general_rate']:.1%}")

    print("\n" + "=" * 70)


def main():
    parser = argparse.ArgumentParser(description="분류 정확도 평가")
    parser.add_argument("--ground-truth", required=True, help="Ground truth JSON 경로")
    parser.add_argument("--predicted", required=True, help="예측 결과 JSON 경로")
    parser.add_argument("--diff", default=None, help="비교할 이전 결과 JSON 경로 (선택)")
    parser.add_argument("--output", default=None, help="평가 결과 저장 경로")
    args = parser.parse_args()

    # 로드
    ground_truth = load_ground_truth(args.ground_truth)
    predicted = load_predicted(args.predicted)
    print(f"[INFO] Ground truth: {len(ground_truth)}건, Predicted: {len(predicted)}건")

    # 평가
    result = evaluate(ground_truth, predicted)

    # 이전 결과와 비교
    diff_result = None
    if args.diff:
        diff_pred = load_predicted(args.diff)
        diff_result = evaluate(ground_truth, diff_pred)

    # 출력
    print_report(result, diff_result)

    # 저장
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\n[저장] {output_path}")


if __name__ == "__main__":
    main()

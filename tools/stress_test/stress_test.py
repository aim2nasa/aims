#!/usr/bin/env python3
"""
AIMS 서버 스트레스 테스트 도구

동시 사용자 파일 업로드 시뮬레이션 + 서버 리소스 모니터링

사용법:
  # 기본 (3명 동시, 각 10파일)
  python stress_test.py

  # 5명 동시, 각 20파일
  python stress_test.py --users 5 --files-per-user 20

  # 헬스체크만 (업로드 없이 API 부하 테스트)
  python stress_test.py --mode health --requests 500 --concurrency 10

  # 큐 모니터링만
  python stress_test.py --mode monitor --duration 60

  # 테스트 데이터 정리 (MongoDB에서 stress-test-user 데이터 삭제)
  python stress_test.py --mode cleanup
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# ─── 설정 ───

AIMS_API_URL = "http://localhost:3010"
PIPELINE_URL = "http://localhost:8100"
UPLOAD_ENDPOINT = f"{PIPELINE_URL}/shadow/docprep-main"
HEALTH_ENDPOINT = f"{AIMS_API_URL}/api/health"
QUEUE_STATUS_ENDPOINT = f"{PIPELINE_URL}/queue/status"

TEST_USER_PREFIX = "stress-test-user"

# ─── 테스트 PDF 생성 ───

def create_test_pdf(path: str, size_kb: int = 50) -> str:
    """간단한 테스트 PDF 파일 생성"""
    # 최소 유효 PDF (텍스트 포함)
    header = b"%PDF-1.4\n"
    body = b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
    body += b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
    body += b"3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Contents 4 0 R>>endobj\n"
    body += b"4 0 obj<</Length 44>>stream\nBT /F1 12 Tf 100 700 Td (Stress Test) Tj ET\nendstream\nendobj\n"

    # 지정 크기까지 패딩
    padding_size = max(0, size_kb * 1024 - len(header) - len(body) - 100)
    padding = b"%" + b"X" * padding_size + b"\n"

    xref_pos = len(header) + len(body) + len(padding)
    xref = f"xref\n0 5\n0000000000 65535 f \n"
    xref += f"0000000009 00000 n \n"
    xref += f"0000000058 00000 n \n"
    xref += f"0000000115 00000 n \n"
    xref += f"0000000206 00000 n \n"
    trailer = f"trailer<</Size 5/Root 1 0 R>>\nstartxref\n{xref_pos}\n%%EOF\n"

    with open(path, "wb") as f:
        f.write(header + body + padding + xref.encode() + trailer.encode())

    return path


# ─── 서버 리소스 모니터 ───

class ResourceMonitor:
    """서버 리소스를 주기적으로 수집"""

    def __init__(self, interval: float = 2.0):
        self.interval = interval
        self.samples: List[Dict] = []
        self._running = False
        self._thread: Optional[threading.Thread] = None

    def start(self):
        self._running = True
        self._thread = threading.Thread(target=self._collect_loop, daemon=True)
        self._thread.start()

    def stop(self):
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)

    def _collect_loop(self):
        while self._running:
            try:
                sample = self._collect_once()
                if sample:
                    self.samples.append(sample)
            except Exception:
                pass
            time.sleep(self.interval)

    def _collect_once(self) -> Optional[Dict]:
        try:
            # CPU + Memory (단일 명령으로)
            cmd = (
                "echo CPU:$(top -bn1 | grep 'Cpu(s)' | awk '{print $2+$4}');"
                "echo MEM:$(free | awk '/Mem:/{printf \"%.1f\", $3/$2*100}');"
                "echo SWAP:$(free | awk '/Swap:/{if($2>0) printf \"%.1f\", $3/$2*100; else print \"0\"}');"
                "echo PROCS:$(ps aux | grep full_pipeline.py | grep -v grep | wc -l);"
                "echo LOAD:$(cat /proc/loadavg | awk '{print $1}')"
            )
            result = subprocess.run(
                ["ssh", "rossi@100.110.215.65", cmd],
                capture_output=True, text=True, timeout=10
            )
            if result.returncode != 0:
                return None

            data = {"ts": time.time()}
            for line in result.stdout.strip().split("\n"):
                if ":" in line:
                    key, val = line.split(":", 1)
                    data[key.strip().lower()] = float(val.strip())
            return data
        except Exception:
            return None

    def summary(self) -> Dict:
        if not self.samples:
            return {}
        keys = ["cpu", "mem", "swap", "load", "procs"]
        result = {}
        for k in keys:
            vals = [s.get(k, 0) for s in self.samples if k in s]
            if vals:
                result[k] = {
                    "min": round(min(vals), 1),
                    "max": round(max(vals), 1),
                    "avg": round(sum(vals) / len(vals), 1),
                }
        result["samples"] = len(self.samples)
        return result


# ─── 업로드 테스트 ───

def upload_file(user_id: str, file_path: str, file_index: int) -> Dict:
    """단일 파일 업로드 + 응답 시간 측정"""
    start = time.time()
    try:
        result = subprocess.run(
            [
                "curl", "-s", "-o", "/dev/null",
                "-w", '{"http_code":%{http_code},"time_total":%{time_total},"size_upload":%{size_upload}}',
                "-X", "POST",
                "-F", f"file=@{file_path}",
                "-F", f"userId={user_id}",
                "-F", "source=stress-test",
                UPLOAD_ENDPOINT,
            ],
            capture_output=True, text=True, timeout=300,
        )
        elapsed = time.time() - start
        metrics = json.loads(result.stdout)
        return {
            "user_id": user_id,
            "file_index": file_index,
            "status": "success" if metrics["http_code"] == 200 else "error",
            "http_code": metrics["http_code"],
            "time_total": metrics["time_total"],
            "elapsed": round(elapsed, 3),
            "size_kb": round(metrics["size_upload"] / 1024, 1),
        }
    except subprocess.TimeoutExpired:
        return {
            "user_id": user_id,
            "file_index": file_index,
            "status": "timeout",
            "http_code": 0,
            "time_total": 300,
            "elapsed": 300,
            "size_kb": 0,
        }
    except Exception as e:
        return {
            "user_id": user_id,
            "file_index": file_index,
            "status": "error",
            "http_code": 0,
            "time_total": time.time() - start,
            "elapsed": round(time.time() - start, 3),
            "size_kb": 0,
            "error": str(e),
        }


def run_upload_test(
    num_users: int = 3,
    files_per_user: int = 10,
    file_size_kb: int = 50,
    stagger_ms: int = 0,
) -> Dict:
    """동시 사용자 업로드 테스트 실행"""
    print(f"\n{'='*60}")
    print(f"  AIMS 업로드 스트레스 테스트")
    print(f"  동시 사용자: {num_users}, 파일/사용자: {files_per_user}")
    print(f"  파일 크기: {file_size_kb} KB, 총 파일: {num_users * files_per_user}")
    print(f"{'='*60}\n")

    # 테스트 파일 생성
    test_dir = tempfile.mkdtemp(prefix="aims_stress_")
    test_files = []
    for i in range(files_per_user):
        path = os.path.join(test_dir, f"stress_test_{i:04d}.pdf")
        create_test_pdf(path, file_size_kb)
        test_files.append(path)
    print(f"[준비] {files_per_user}개 테스트 PDF 생성 완료 ({test_dir})")

    # 리소스 모니터 시작
    monitor = ResourceMonitor(interval=3.0)
    monitor.start()
    print("[모니터] 서버 리소스 모니터링 시작")

    # 큐 상태 확인 (시작 전)
    queue_before = get_queue_status()

    # 업로드 실행
    results = []
    total_files = num_users * files_per_user
    completed = 0
    start_time = time.time()

    with ThreadPoolExecutor(max_workers=num_users) as executor:
        futures = []
        for user_idx in range(num_users):
            user_id = f"{TEST_USER_PREFIX}-{user_idx}"
            for file_idx in range(files_per_user):
                future = executor.submit(
                    upload_file, user_id, test_files[file_idx], file_idx
                )
                futures.append(future)
                if stagger_ms > 0:
                    time.sleep(stagger_ms / 1000)

        for future in as_completed(futures):
            result = future.result()
            results.append(result)
            completed += 1
            status_char = "." if result["status"] == "success" else "X"
            if completed % 10 == 0 or completed == total_files:
                print(f"  [{completed}/{total_files}] {status_char}", flush=True)

    total_time = time.time() - start_time

    # 리소스 모니터 종료
    monitor.stop()

    # 큐 상태 확인 (종료 후)
    queue_after = get_queue_status()

    # 테스트 파일 정리
    for f in test_files:
        try:
            os.unlink(f)
        except OSError:
            pass
    try:
        os.rmdir(test_dir)
    except OSError:
        pass

    # 결과 집계
    return analyze_results(results, total_time, monitor.summary(), queue_before, queue_after)


def get_queue_status() -> Dict:
    """document_pipeline 큐 상태 조회"""
    try:
        result = subprocess.run(
            ["ssh", "rossi@100.110.215.65",
             f"curl -s {QUEUE_STATUS_ENDPOINT}"],
            capture_output=True, text=True, timeout=10,
        )
        return json.loads(result.stdout)
    except Exception:
        return {}


def analyze_results(
    results: List[Dict],
    total_time: float,
    resource_summary: Dict,
    queue_before: Dict,
    queue_after: Dict,
) -> Dict:
    """테스트 결과 분석 및 리포트 생성"""
    success = [r for r in results if r["status"] == "success"]
    errors = [r for r in results if r["status"] != "success"]
    times = [r["time_total"] for r in success]

    # 사용자별 통계
    by_user = defaultdict(list)
    for r in results:
        by_user[r["user_id"]].append(r)

    report = {
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "config": {
            "total_files": len(results),
            "concurrent_users": len(by_user),
            "files_per_user": len(results) // max(len(by_user), 1),
        },
        "results": {
            "total_time_sec": round(total_time, 1),
            "throughput_files_per_sec": round(len(results) / total_time, 2),
            "success_count": len(success),
            "error_count": len(errors),
            "error_rate_pct": round(len(errors) / max(len(results), 1) * 100, 1),
        },
        "latency": {},
        "resources": resource_summary,
        "queue": {
            "before": queue_before.get("queue", {}),
            "after": queue_after.get("queue", {}),
        },
    }

    if times:
        times.sort()
        report["latency"] = {
            "min_ms": round(min(times) * 1000),
            "avg_ms": round(sum(times) / len(times) * 1000),
            "p95_ms": round(times[int(len(times) * 0.95)] * 1000),
            "p99_ms": round(times[int(len(times) * 0.99)] * 1000),
            "max_ms": round(max(times) * 1000),
        }

    if errors:
        report["errors"] = [
            {"user": e["user_id"], "file": e["file_index"],
             "code": e["http_code"], "msg": e.get("error", "")}
            for e in errors[:10]  # 최대 10개만
        ]

    # 콘솔 출력
    print_report(report)
    return report


def print_report(report: Dict):
    """테스트 결과 리포트 출력"""
    print(f"\n{'='*60}")
    print(f"  스트레스 테스트 결과")
    print(f"  {report['timestamp']}")
    print(f"{'='*60}")

    cfg = report["config"]
    res = report["results"]
    lat = report.get("latency", {})
    rsc = report.get("resources", {})

    print(f"\n[구성]")
    print(f"  동시 사용자: {cfg['concurrent_users']}, 파일/사용자: {cfg['files_per_user']}")
    print(f"  총 파일: {cfg['total_files']}")

    print(f"\n[처리량]")
    print(f"  총 소요: {res['total_time_sec']}초")
    print(f"  처리량: {res['throughput_files_per_sec']} files/sec")
    print(f"  성공: {res['success_count']}, 실패: {res['error_count']} ({res['error_rate_pct']}%)")

    if lat:
        print(f"\n[응답 시간]")
        print(f"  최소: {lat['min_ms']}ms, 평균: {lat['avg_ms']}ms")
        print(f"  P95: {lat['p95_ms']}ms, P99: {lat['p99_ms']}ms, 최대: {lat['max_ms']}ms")

    if rsc:
        print(f"\n[서버 리소스] ({rsc.get('samples', 0)}개 샘플)")
        for key in ["cpu", "mem", "swap", "load", "procs"]:
            if key in rsc:
                v = rsc[key]
                unit = "%" if key in ("cpu", "mem", "swap") else ""
                print(f"  {key.upper():6s}: min={v['min']}{unit}, avg={v['avg']}{unit}, max={v['max']}{unit}")

    q = report.get("queue", {})
    if q.get("before") and q.get("after"):
        qb = q["before"]
        qa = q["after"]
        print(f"\n[큐 상태]")
        print(f"  Before: pending={qb.get('pending','-')}, completed={qb.get('completed','-')}")
        print(f"  After:  pending={qa.get('pending','-')}, completed={qa.get('completed','-')}")
        new_completed = qa.get("completed", 0) - qb.get("completed", 0)
        if new_completed > 0:
            print(f"  처리 완료: +{new_completed}")

    if "errors" in report:
        print(f"\n[에러 상세] (최대 10건)")
        for e in report["errors"]:
            print(f"  {e['user']} file#{e['file']}: HTTP {e['code']} {e.get('msg','')}")

    print(f"\n{'='*60}")


# ─── 헬스체크 부하 테스트 ───

def run_health_test(total_requests: int = 500, concurrency: int = 10) -> Dict:
    """헬스체크 엔드포인트 부하 테스트 (ab 사용)"""
    print(f"\n{'='*60}")
    print(f"  API 헬스체크 부하 테스트")
    print(f"  요청: {total_requests}, 동시: {concurrency}")
    print(f"{'='*60}\n")

    try:
        result = subprocess.run(
            ["ssh", "rossi@100.110.215.65",
             f"ab -n {total_requests} -c {concurrency} -q {HEALTH_ENDPOINT}/"],
            capture_output=True, text=True, timeout=120,
        )
        print(result.stdout)
        return {"raw": result.stdout}
    except Exception as e:
        print(f"에러: {e}")
        return {"error": str(e)}


# ─── 큐 모니터링 ───

def run_monitor(duration: int = 60, interval: int = 5):
    """서버 리소스 + 큐 상태 실시간 모니터링"""
    print(f"\n{'='*60}")
    print(f"  서버 모니터링 ({duration}초)")
    print(f"{'='*60}")
    print(f"{'시간':>8s} {'CPU%':>6s} {'MEM%':>6s} {'SWAP%':>6s} {'LOAD':>6s} {'PIPE':>5s} {'큐-대기':>7s} {'큐-처리':>7s}")
    print("-" * 60)

    end_time = time.time() + duration
    while time.time() < end_time:
        try:
            cmd = (
                f"echo CPU:$(top -bn1 | grep 'Cpu(s)' | awk '{{print $2+$4}}');"
                f"echo MEM:$(free | awk '/Mem:/{{printf \"%.1f\", $3/$2*100}}');"
                f"echo SWAP:$(free | awk '/Swap:/{{if($2>0) printf \"%.1f\", $3/$2*100; else print \"0\"}}');"
                f"echo LOAD:$(cat /proc/loadavg | awk '{{print $1}}');"
                f"echo PROCS:$(ps aux | grep full_pipeline.py | grep -v grep | wc -l);"
                f"curl -s {QUEUE_STATUS_ENDPOINT}"
            )
            result = subprocess.run(
                ["ssh", "rossi@100.110.215.65", cmd],
                capture_output=True, text=True, timeout=15,
            )
            lines = result.stdout.strip().split("\n")
            data = {}
            queue_json = ""
            for line in lines:
                if line.startswith("{"):
                    queue_json = line
                elif ":" in line:
                    k, v = line.split(":", 1)
                    data[k.strip().lower()] = v.strip()

            q = {}
            if queue_json:
                try:
                    q = json.loads(queue_json).get("queue", {})
                except json.JSONDecodeError:
                    pass

            now = datetime.now().strftime("%H:%M:%S")
            print(
                f"{now:>8s} "
                f"{data.get('cpu', '-'):>6s} "
                f"{data.get('mem', '-'):>6s} "
                f"{data.get('swap', '-'):>6s} "
                f"{data.get('load', '-'):>6s} "
                f"{data.get('procs', '-'):>5s} "
                f"{q.get('pending', '-'):>7} "
                f"{q.get('processing', '-'):>7}"
            )
        except Exception as e:
            print(f"  수집 실패: {e}")

        time.sleep(interval)

    print(f"\n모니터링 종료")


# ─── 결과 저장 ───

def save_report(report: Dict, output_dir: str = "."):
    """결과를 JSON 파일로 저장"""
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"stress_test_{ts}.json"
    filepath = os.path.join(output_dir, filename)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"\n결과 저장: {filepath}")
    return filepath


# ─── CLI ───

def main():
    parser = argparse.ArgumentParser(description="AIMS 서버 스트레스 테스트")
    parser.add_argument("--mode", choices=["upload", "health", "monitor", "cleanup"], default="upload",
                        help="테스트 모드 (default: upload)")

    # upload 모드
    parser.add_argument("--users", type=int, default=3, help="동시 사용자 수 (default: 3)")
    parser.add_argument("--files-per-user", type=int, default=10, help="사용자당 파일 수 (default: 10)")
    parser.add_argument("--file-size", type=int, default=50, help="파일 크기 KB (default: 50)")
    parser.add_argument("--stagger", type=int, default=0, help="요청 간 지연 ms (default: 0)")

    # health 모드
    parser.add_argument("--requests", type=int, default=500, help="총 요청 수 (default: 500)")
    parser.add_argument("--concurrency", type=int, default=10, help="동시 요청 수 (default: 10)")

    # monitor 모드
    parser.add_argument("--duration", type=int, default=60, help="모니터링 시간 초 (default: 60)")

    # 공통
    parser.add_argument("--output", type=str, default=".", help="결과 저장 디렉토리")
    parser.add_argument("--no-save", action="store_true", help="결과 파일 저장 안함")

    args = parser.parse_args()

    if args.mode == "upload":
        report = run_upload_test(
            num_users=args.users,
            files_per_user=args.files_per_user,
            file_size_kb=args.file_size,
            stagger_ms=args.stagger,
        )
        if not args.no_save:
            save_report(report, args.output)

    elif args.mode == "health":
        report = run_health_test(args.requests, args.concurrency)
        if not args.no_save:
            save_report(report, args.output)

    elif args.mode == "monitor":
        run_monitor(args.duration)

    elif args.mode == "cleanup":
        run_cleanup()


def run_cleanup():
    """스트레스 테스트 데이터 정리 (MongoDB에서 stress-test-user 데이터 삭제)"""
    print(f"\n{'='*60}")
    print(f"  스트레스 테스트 데이터 정리")
    print(f"{'='*60}\n")

    cleanup_script = '''
from pymongo import MongoClient
db = MongoClient("mongodb://localhost:27017").docupload
import re

# 스트레스 테스트 큐 항목 삭제
q_result = db.upload_queue.delete_many({"request_data.userId": {"$regex": "stress-test-user"}})
print(f"큐 삭제: {q_result.deleted_count}건")

# 스트레스 테스트 문서 삭제
d_result = db.files.delete_many({"ownerId": {"$regex": "stress-test-user"}})
print(f"문서 삭제: {d_result.deleted_count}건")

# 임시 파일 정리
import glob, os
for f in glob.glob("/data/files/users/temp/stress_test_*.pdf"):
    os.unlink(f)
    print(f"파일 삭제: {f}")

q = db.upload_queue
print(f"남은 큐: pending={q.count_documents({'status': 'pending'})}, processing={q.count_documents({'status': 'processing'})}")
'''
    try:
        result = subprocess.run(
            ["ssh", "rossi@100.110.215.65",
             f"/home/rossi/aims/venv/bin/python3 -c '{cleanup_script}'"],
            capture_output=True, text=True, timeout=30,
        )
        print(result.stdout)
        if result.stderr:
            print(f"경고: {result.stderr}")
    except Exception as e:
        print(f"정리 실패: {e}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Annual Report 자동 파싱 스크립트

MongoDB의 docupload.files 컬렉션을 모니터링하여
새로 업로드된 파일 중 Annual Report를 자동으로 감지하고 파싱합니다.

사용법:
    python auto_parse_annual_reports.py           # 한 번 실행 (새 파일만 처리)
    python auto_parse_annual_reports.py --watch   # 지속적으로 모니터링 (30초마다)
    python auto_parse_annual_reports.py --all     # 모든 파일 재처리

Cronjob 설정 예시:
    */5 * * * * cd /path/to/annual_report_api && python auto_parse_annual_reports.py >> logs/auto_parse.log 2>&1
"""

import argparse
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

# 프로젝트 루트를 Python 경로에 추가
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# 프로젝트 루트의 src 경로 추가 (time_utils 접근용)
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
sys.path.insert(0, project_root)

from config import settings
from pymongo import MongoClient
from services.db_writer import save_annual_report
from services.detector import is_annual_report
from services.parser import parse_annual_report
from utils.pdf_utils import find_contract_table_end_page

from internal_api import query_files


class AnnualReportAutoParser:
    """Annual Report 자동 파싱 클래스"""

    def __init__(self):
        # MongoDB 연결 (processing_collection 전용 — files/customers는 Internal API 경유)
        self.client = MongoClient(settings.MONGO_URI)
        self.db = self.client[settings.DB_NAME]

        # 서비스 초기화 (detector/parser는 모듈 함수로 직접 호출)

        # 처리 상태 추적 컬렉션 (annual_report_api 자체 컬렉션)
        self.processing_collection = self.db["annual_report_processing"]

    def get_unprocessed_files(self, lookback_hours: int = 24, force_all: bool = False) -> List[Dict]:
        """
        미처리 파일 목록 조회

        Args:
            lookback_hours: 최근 N시간 이내 업로드된 파일만 검색 (기본 24시간)
            force_all: True면 모든 파일 검색 (lookback_hours 무시)

        Returns:
            미처리 파일 목록
        """
        query = {
            "contentType": "application/pdf",  # PDF만 처리
            "length": {"$gt": 1024}  # 1KB 이상
        }

        # 시간 필터 (force_all이 False일 때만)
        if not force_all:
            since = datetime.now(timezone.utc) - timedelta(hours=lookback_hours)
            query["uploadDate"] = {"$gte": since.isoformat()}

        # Internal API 경유 조회 (files 컬렉션 직접 접근 금지)
        files = query_files(
            filter=query,
            sort={"uploadDate": -1},
            limit=1000
        )

        # 이미 처리된 파일 필터링
        unprocessed = []
        for file in files:
            file_id = str(file["_id"])

            # processing 컬렉션에서 처리 기록 확인
            processed = self.processing_collection.find_one({
                "file_id": file_id,
                "status": {"$in": ["completed", "not_annual_report"]}
            })

            if not processed:
                unprocessed.append(file)

        return unprocessed

    def get_file_path(self, file_doc: Dict) -> Optional[str]:
        """
        파일 경로 추출

        Args:
            file_doc: MongoDB files 문서

        Returns:
            파일 절대 경로 또는 None
        """
        # upload.destPath 우선
        if "upload" in file_doc and "destPath" in file_doc["upload"]:
            return file_doc["upload"]["destPath"]

        # payload.dest_path fallback
        if "payload" in file_doc and "dest_path" in file_doc["payload"]:
            return file_doc["payload"]["dest_path"]

        return None

    def get_customer_id(self, file_doc: Dict) -> Optional[str]:
        """
        파일에서 customer_id 추출

        Args:
            file_doc: MongoDB files 문서

        Returns:
            customer_id 또는 None
        """
        # payload.customer_id 우선
        if "payload" in file_doc and "customer_id" in file_doc["payload"]:
            return file_doc["payload"]["customer_id"]

        # metadata.customerId fallback
        if "metadata" in file_doc and "customerId" in file_doc["metadata"]:
            return file_doc["metadata"]["customerId"]

        return None

    def mark_processing_started(self, file_id: str):
        """파싱 시작 기록"""
        self.processing_collection.update_one(
            {"file_id": file_id},
            {
                "$set": {
                    "file_id": file_id,
                    "status": "processing",
                    "started_at": datetime.now(timezone.utc)
                }
            },
            upsert=True
        )

    def mark_processing_completed(self, file_id: str, result: Dict):
        """파싱 완료 기록"""
        self.processing_collection.update_one(
            {"file_id": file_id},
            {
                "$set": {
                    "status": "completed",
                    "completed_at": datetime.now(timezone.utc),
                    "result": result
                }
            }
        )

    def mark_not_annual_report(self, file_id: str):
        """Annual Report가 아님을 기록"""
        self.processing_collection.update_one(
            {"file_id": file_id},
            {
                "$set": {
                    "status": "not_annual_report",
                    "checked_at": datetime.now(timezone.utc)
                }
            }
        )

    def mark_processing_failed(self, file_id: str, error: str):
        """파싱 실패 기록"""
        self.processing_collection.update_one(
            {"file_id": file_id},
            {
                "$set": {
                    "status": "failed",
                    "failed_at": datetime.now(timezone.utc),
                    "error": error
                }
            }
        )

    def process_file(self, file_doc: Dict) -> Dict:
        """
        단일 파일 처리

        Args:
            file_doc: MongoDB files 문서

        Returns:
            처리 결과 딕셔너리
        """
        file_id = str(file_doc["_id"])
        original_name = file_doc.get("filename", "unknown")

        print(f"\n{'='*80}")
        print(f"📄 처리 시작: {original_name} (ID: {file_id})")
        print(f"{'='*80}")

        try:
            # 1. 파일 경로 확인
            file_path = self.get_file_path(file_doc)
            if not file_path:
                error_msg = "파일 경로를 찾을 수 없습니다."
                print(f"❌ {error_msg}")
                self.mark_processing_failed(file_id, error_msg)
                return {"success": False, "error": error_msg}

            if not os.path.exists(file_path):
                error_msg = f"파일이 존재하지 않습니다: {file_path}"
                print(f"❌ {error_msg}")
                self.mark_processing_failed(file_id, error_msg)
                return {"success": False, "error": error_msg}

            print(f"✓ 파일 경로: {file_path}")

            # 2. customer_id 추출
            customer_id = self.get_customer_id(file_doc)
            if customer_id:
                print(f"✓ 고객 ID: {customer_id}")
            else:
                print("⚠ 고객 ID 없음 (파일만 처리)")

            # 3. Annual Report 판단
            self.mark_processing_started(file_id)

            print("\n🔍 Step 1: Annual Report 판단 중...")
            detection_result = is_annual_report(file_path)

            if not detection_result["is_annual_report"]:
                print("❌ Annual Report가 아닙니다.")
                print(f"   신뢰도: {detection_result['confidence']:.2f}")
                print(f"   발견된 키워드: {detection_result['matched_keywords']}")
                self.mark_not_annual_report(file_id)
                return {"success": True, "skipped": True, "reason": "not_annual_report"}

            print("✅ Annual Report 확인!")
            print(f"   신뢰도: {detection_result['confidence']:.2f}")
            print(f"   발견된 키워드: {detection_result['matched_keywords']}")

            # 4. N-page 탐지
            print("\n🔍 Step 2: 계약 테이블 종료 페이지 탐지 중...")
            n_pages = find_contract_table_end_page(file_path)
            print(f"✅ 계약 테이블 종료: {n_pages}페이지")

            # 5. OpenAI 파싱
            print("\n🤖 Step 3: OpenAI로 파싱 중...")
            print("   (약 25초 소요 예상...)")

            parsed_data = parse_annual_report(file_path, end_page=n_pages)

            contract_count = len(parsed_data.get("contracts", []))
            print(f"✅ 파싱 완료! {contract_count}개 계약 추출됨")

            # 6. MongoDB 저장
            if customer_id:
                print("\n💾 Step 4: MongoDB 저장 중...")
                save_annual_report(
                    db=self.db,
                    customer_id=customer_id,
                    report_data=parsed_data,
                    source_file_id=file_id
                )
                print("✅ 저장 완료!")
            else:
                print("\n⚠ customer_id가 없어 MongoDB 저장을 건너뜁니다.")

            # 7. 처리 완료 기록
            result = {
                "file_id": file_id,
                "customer_id": customer_id,
                "contract_count": contract_count,
                "parsed_data": parsed_data
            }
            self.mark_processing_completed(file_id, result)

            print(f"\n✅ 처리 완료: {original_name}")
            return {"success": True, "result": result}

        except Exception as e:
            error_msg = f"처리 중 오류 발생: {str(e)}"
            print(f"\n❌ {error_msg}")
            self.mark_processing_failed(file_id, error_msg)
            return {"success": False, "error": error_msg}

    def run_once(self, lookback_hours: int = 24, force_all: bool = False):
        """
        한 번 실행하여 미처리 파일 처리

        Args:
            lookback_hours: 최근 N시간 이내 파일만 처리
            force_all: 모든 파일 재처리
        """
        print(f"\n{'='*80}")
        print("🚀 Annual Report 자동 파싱 시작")
        print(f"{'='*80}")
        print(f"⏰ 실행 시간: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

        if force_all:
            print("🔄 모드: 전체 재처리")
        else:
            print(f"📅 검색 범위: 최근 {lookback_hours}시간")

        # 미처리 파일 조회
        unprocessed_files = self.get_unprocessed_files(lookback_hours, force_all)

        if not unprocessed_files:
            print("\n✅ 처리할 파일이 없습니다.")
            return

        print(f"\n📋 처리 대상: {len(unprocessed_files)}개 파일")

        # 각 파일 처리
        success_count = 0
        skipped_count = 0
        error_count = 0

        for i, file_doc in enumerate(unprocessed_files, 1):
            print(f"\n[{i}/{len(unprocessed_files)}] 파일 처리 중...")

            result = self.process_file(file_doc)

            if result["success"]:
                if result.get("skipped"):
                    skipped_count += 1
                else:
                    success_count += 1
            else:
                error_count += 1

        # 결과 요약
        print(f"\n{'='*80}")
        print("📊 처리 결과 요약")
        print(f"{'='*80}")
        print(f"✅ 성공: {success_count}개")
        print(f"⏭️  건너뜀 (Annual Report 아님): {skipped_count}개")
        print(f"❌ 실패: {error_count}개")
        print(f"{'='*80}\n")

    def run_watch(self, interval_seconds: int = 30):
        """
        지속적으로 모니터링하며 새 파일 처리

        Args:
            interval_seconds: 체크 주기 (초)
        """
        print(f"\n{'='*80}")
        print("👀 Annual Report 자동 파싱 모니터링 시작")
        print(f"{'='*80}")
        print(f"⏱️  체크 주기: {interval_seconds}초")
        print(f"⏰ 시작 시간: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("🛑 종료: Ctrl+C")
        print(f"{'='*80}\n")

        try:
            while True:
                self.run_once(lookback_hours=1)  # 최근 1시간 파일만 체크

                print(f"⏳ {interval_seconds}초 대기 중...\n")
                time.sleep(interval_seconds)

        except KeyboardInterrupt:
            print(f"\n\n{'='*80}")
            print("🛑 모니터링 종료")
            print(f"⏰ 종료 시간: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            print(f"{'='*80}\n")


def main():
    parser = argparse.ArgumentParser(
        description="Annual Report 자동 파싱 스크립트",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
예시:
  python auto_parse_annual_reports.py                # 최근 24시간 파일 처리
  python auto_parse_annual_reports.py --hours 48     # 최근 48시간 파일 처리
  python auto_parse_annual_reports.py --all          # 모든 파일 재처리
  python auto_parse_annual_reports.py --watch        # 지속 모니터링 (30초마다)
  python auto_parse_annual_reports.py --watch --interval 60  # 60초마다 체크

Cronjob 설정 (5분마다 실행):
  */5 * * * * cd /path/to/annual_report_api && python auto_parse_annual_reports.py >> logs/auto_parse.log 2>&1
        """
    )

    parser.add_argument(
        "--hours",
        type=int,
        default=24,
        help="최근 N시간 이내 파일만 처리 (기본: 24시간)"
    )

    parser.add_argument(
        "--all",
        action="store_true",
        help="모든 파일 재처리 (--hours 무시)"
    )

    parser.add_argument(
        "--watch",
        action="store_true",
        help="지속적으로 모니터링 (주기적으로 실행)"
    )

    parser.add_argument(
        "--interval",
        type=int,
        default=30,
        help="모니터링 체크 주기 (초, 기본: 30초)"
    )

    args = parser.parse_args()

    # 자동 파서 초기화
    auto_parser = AnnualReportAutoParser()

    if args.watch:
        # 지속 모니터링 모드
        auto_parser.run_watch(interval_seconds=args.interval)
    else:
        # 한 번 실행 모드
        auto_parser.run_once(lookback_hours=args.hours, force_all=args.all)


if __name__ == "__main__":
    main()

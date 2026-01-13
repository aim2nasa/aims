"""
MongoDB에 Annual Report 저장
customers 컬렉션의 annual_reports 배열에 추가
"""
import logging
import sys
import os
import requests
from pathlib import Path
from typing import Dict, Optional
from datetime import datetime, timezone
from bson import ObjectId
from pymongo.errors import PyMongoError

# AIMS 프로젝트 루트를 Python 경로에 추가
project_root = Path(__file__).parent.parent.parent.parent.parent
sys.path.insert(0, str(project_root))

from src.shared.time_utils import utc_now_iso
from system_logger import send_error_log

logger = logging.getLogger(__name__)

# aims_api webhook URL
AIMS_API_URL = os.getenv("AIMS_API_URL", "http://localhost:3010")


def notify_ar_status_change(customer_id: str, file_id: Optional[str], status: str, error_message: Optional[str] = None):
    """
    AR 상태 변경을 aims_api에 알림 (SSE 실시간 업데이트용)
    """
    try:
        webhook_url = f"{AIMS_API_URL}/api/webhooks/ar-status-change"
        payload = {
            "customer_id": customer_id,
            "file_id": file_id,
            "status": status,
            "error_message": error_message
        }
        response = requests.post(webhook_url, json=payload, timeout=5)
        if response.ok:
            logger.info(f"✅ [SSE] AR 상태 변경 알림 전송: customer_id={customer_id}, status={status}")
        else:
            logger.warning(f"⚠️ [SSE] 알림 전송 실패: {response.status_code} - {response.text}")
    except Exception as e:
        # 알림 실패는 무시 (파싱 자체는 성공)
        logger.warning(f"⚠️ [SSE] 알림 전송 실패 (무시됨): {e}")


def save_annual_report(
    db,
    customer_id: str,
    report_data: Dict,
    metadata: Optional[Dict] = None,
    source_file_id: Optional[str] = None
) -> Dict[str, any]:
    """
    customers 컬렉션에 annual_reports 추가

    Args:
        db: MongoDB database 객체
        customer_id: 고객 ObjectId (문자열)
        report_data: parse_annual_report() 결과 (2~N페이지 계약 데이터)
        metadata: 1페이지 메타데이터 (customer_name, report_title, issue_date, fsr_name)
        source_file_id: 원본 PDF 파일 ID (선택)

    Returns:
        dict: {
            "success": bool,
            "message": str,
            "report_id": str (optional, 저장된 리포트의 인덱스),
            "summary": dict (저장된 데이터 요약)
        }

    Raises:
        ValueError: customer_id가 유효하지 않을 때
        PyMongoError: DB 저장 실패
    """
    logger.info(f"Annual Report 저장 시작: customer_id={customer_id}")

    try:
        # 1. ObjectId 유효성 검증
        try:
            customer_obj_id = ObjectId(customer_id)
        except Exception as e:
            raise ValueError(f"유효하지 않은 customer_id: {customer_id}") from e

        # 2. 고객 존재 확인
        customers_collection = db["customers"]
        customer = customers_collection.find_one({"_id": customer_obj_id})

        if not customer:
            logger.error(f"고객을 찾을 수 없습니다: {customer_id}")
            return {
                "success": False,
                "message": f"고객을 찾을 수 없습니다 (ID: {customer_id})"
            }

        # 3. 파싱 데이터 검증
        if "error" in report_data:
            logger.error(f"파싱 실패한 데이터를 저장할 수 없습니다: {report_data['error']}")
            return {
                "success": False,
                "message": f"파싱 실패: {report_data['error']}"
            }

        # 4. Annual Report 문서 생성
        contracts = report_data.get("보유계약 현황", [])
        lapsed_contracts = report_data.get("부활가능 실효계약", [])

        # 요약 정보 - PDF에서 읽은 값 그대로 사용 (계산 금지!)
        total_monthly_premium = report_data.get("총_월보험료", 0)
        total_contracts = len(contracts)

        # 1페이지 메타데이터 처리 (명세: AI 불사용, 토큰 절약)
        # metadata가 제공되면 우선 사용, 없으면 report_data에서 fallback
        if metadata:
            customer_name = metadata.get("customer_name")
            report_title = metadata.get("report_title")
            issue_date_str = metadata.get("issue_date")
            fsr_name = metadata.get("fsr_name")
        else:
            # fallback: 기존 report_data (AI가 추출한 경우 - 비권장)
            customer_name = report_data.get("고객명")
            report_title = None
            issue_date_str = report_data.get("발행기준일")
            fsr_name = None

        # 발행기준일 파싱
        try:
            # "YYYY-MM-DD" → datetime (UTC 타임존 명시)
            if issue_date_str:
                # naive datetime 생성 후 UTC 타임존 설정
                naive_date = datetime.strptime(issue_date_str, "%Y-%m-%d")
                issue_date = naive_date.replace(tzinfo=timezone.utc)
            else:
                issue_date = None
        except Exception as e:
            logger.warning(f"발행기준일 파싱 실패: {issue_date_str} ({e})")
            issue_date = None

        annual_report = {
            # 1페이지 메타데이터 (AI 불사용, 토큰 절약)
            "customer_name": customer_name,
            "report_title": report_title,
            "issue_date": issue_date,
            "fsr_name": fsr_name,

            # 2~N페이지 계약 데이터 (AI 사용)
            "contracts": contracts,
            "lapsed_contracts": lapsed_contracts,

            # 요약 정보
            "total_monthly_premium": total_monthly_premium,
            "total_contracts": total_contracts,

            # 타임스탬프
            "uploaded_at": utc_now_iso(),
            "parsed_at": utc_now_iso(),

            # 🍎 Phase 4: 자동 등록 - 파싱 완료 시 자동으로 보험계약 탭에 등록
            "registered_at": utc_now_iso(),
        }

        # 원본 파일 ID 추가 (있는 경우)
        if source_file_id:
            try:
                annual_report["source_file_id"] = ObjectId(source_file_id)
            except Exception as e:
                logger.warning(f"source_file_id 변환 실패: {source_file_id} ({e})")

        # 4.5 중복 체크: customer_name + issue_date 둘 다 같으면 중복
        # 중복 판단 기준: issue_date AND customer_name 둘 다 같아야 중복
        if customer_name and issue_date:
            existing_reports = customer.get("annual_reports", [])
            for existing in existing_reports:
                existing_name = existing.get("customer_name", "")
                existing_issue_date = existing.get("issue_date")

                # issue_date 비교 (날짜만)
                if existing_issue_date:
                    if isinstance(existing_issue_date, datetime):
                        existing_date_str = existing_issue_date.strftime("%Y-%m-%d")
                    elif isinstance(existing_issue_date, str):
                        existing_date_str = existing_issue_date.split('T')[0]
                    else:
                        existing_date_str = None

                    if existing_date_str == issue_date_str and existing_name == customer_name:
                        logger.info(
                            f"⏭️  중복 AR 건너뜀: customer_name={customer_name}, issue_date={issue_date_str}"
                        )
                        return {
                            "success": True,
                            "message": "이미 동일한 Annual Report가 존재합니다 (중복 건너뜀)",
                            "duplicate": True,
                            "summary": {
                                "customer_name": customer_name,
                                "issue_date": issue_date_str
                            }
                        }

        # 5. customers 컬렉션 업데이트
        result = customers_collection.update_one(
            {"_id": customer_obj_id},
            {
                "$push": {
                    "annual_reports": annual_report
                }
            }
        )

        # 6. 결과 확인
        if result.modified_count > 0:
            logger.info(
                f"✅ Annual Report 저장 성공: customer={customer_name}, "
                f"계약={total_contracts}건, 월보험료={total_monthly_premium:,}원"
            )

            # 🔔 SSE 알림: AR 파싱 완료
            notify_ar_status_change(
                customer_id=customer_id,
                file_id=source_file_id,
                status="completed"
            )

            return {
                "success": True,
                "message": "Annual Report 저장 완료",
                "summary": {
                    "customer_name": customer_name,
                    "report_title": report_title,
                    "issue_date": issue_date_str,
                    "fsr_name": fsr_name,
                    "total_contracts": total_contracts,
                    "total_monthly_premium": total_monthly_premium
                }
            }
        else:
            logger.warning(f"⚠️  DB 업데이트 실패 (modified_count=0): {customer_id}")
            return {
                "success": False,
                "message": "DB 업데이트 실패 (문서가 수정되지 않음)"
            }

    except ValueError as e:
        logger.error(f"❌ 유효성 검증 실패: {e}")
        raise

    except PyMongoError as e:
        logger.error(f"❌ MongoDB 오류: {e}")
        raise

    except Exception as e:
        logger.error(f"❌ Annual Report 저장 중 예상치 못한 오류: {e}")
        send_error_log("annual_report_api", f"Annual Report 저장 중 예상치 못한 오류: {e}", e)
        return {
            "success": False,
            "message": f"저장 실패: {str(e)}"
        }


def get_annual_reports(db, customer_id: str, limit: int = 10) -> Dict[str, any]:
    """
    고객의 Annual Reports 조회 (최신순)
    - 파싱 완료된 AR (customers.annual_reports[])
    - 파싱 실패한 AR (files.ar_parsing_status: error)
    - 파싱 진행중인 AR (files.ar_parsing_status: processing)

    Args:
        db: MongoDB database 객체
        customer_id: 고객 ObjectId (문자열)
        limit: 최대 조회 개수

    Returns:
        dict: {
            "success": bool,
            "data": list,  # annual_reports 배열 (status 필드 포함)
            "count": int
        }
    """
    logger.info(f"Annual Reports 조회: customer_id={customer_id}")

    try:
        # ObjectId 변환
        try:
            customer_obj_id = ObjectId(customer_id)
        except Exception as e:
            raise ValueError(f"유효하지 않은 customer_id: {customer_id}") from e

        # 고객 조회
        customers_collection = db["customers"]
        customer = customers_collection.find_one(
            {"_id": customer_obj_id},
            {"annual_reports": 1, "name": 1}
        )

        if not customer:
            logger.warning(f"고객을 찾을 수 없습니다: {customer_id}")
            return {
                "success": False,
                "message": "고객을 찾을 수 없습니다",
                "data": []
            }

        # annual_reports 배열 가져오기 (파싱 완료된 것들)
        reports = customer.get("annual_reports", [])

        # 🔧 이미 완료된 source_file_id 수집 (중복 방지)
        # ⚠️ source_file_id는 String, files._id는 ObjectId → ObjectId로 변환 필수!
        completed_file_ids = set()
        for ar in reports:
            source_id = ar.get("source_file_id")
            if source_id:
                try:
                    completed_file_ids.add(ObjectId(source_id))
                except Exception as e:
                    logger.debug(f"유효하지 않은 ObjectId 무시: {source_id} - {e}")

        # files 컬렉션 참조
        files_collection = db["files"]

        # 🔥 파싱 미완료 AR 문서 조회 (files 컬렉션에서)
        # 🔧 이미 완료된 source_file_id는 제외!
        query = {
            "customerId": customer_obj_id,
            "is_annual_report": True,
            "$or": [
                {"ar_parsing_status": {"$exists": False}},  # 상태 미설정
                {"ar_parsing_status": {"$in": ["pending", "processing", "error"]}}
            ]
        }
        # 이미 완료된 파일은 제외
        if completed_file_ids:
            query["_id"] = {"$nin": list(completed_file_ids)}

        not_completed_ar_files = list(files_collection.find(
            query,
            {
                "_id": 1,
                "upload.originalName": 1,
                "upload.uploaded_at": 1,
                "ar_parsing_status": 1,
                "ar_parsing_error": 1,
                "ar_retry_count": 1,
                "ar_metadata": 1,
                "meta.file_hash": 1
            }
        ))

        # 파싱 미완료 문서를 annual_reports 형식으로 변환
        for file_doc in not_completed_ar_files:
            ar_metadata = file_doc.get("ar_metadata", {}) or {}
            upload_info = file_doc.get("upload", {}) or {}

            # 파일명에서 고객명 추출 (fallback)
            filename = upload_info.get("originalName", "")
            customer_name_from_filename = None
            if filename:
                import re
                # 패턴 1: "홍길동보유계약현황202508.pdf" → "홍길동"
                # 패턴 2: "안영미annual report202508.pdf" → "안영미"
                # 패턴 3: "김철수Annual Report202508.pdf" → "김철수" (대소문자 무관)
                patterns = [
                    r'^(.+?)보유계약현황',
                    r'^(.+?)[Aa]nnual\s*[Rr]eport',
                ]
                for pattern in patterns:
                    match = re.match(pattern, filename, re.IGNORECASE)
                    if match:
                        customer_name_from_filename = match.group(1).strip()
                        break

            # ar_parsing_status가 없으면 "pending"으로 처리
            ar_status = file_doc.get("ar_parsing_status") or "pending"

            pending_report = {
                "source_file_id": str(file_doc["_id"]),
                "file_id": str(file_doc["_id"]),
                "customer_name": ar_metadata.get("customer_name") or customer_name_from_filename,
                "issue_date": ar_metadata.get("issue_date"),
                "uploaded_at": upload_info.get("uploaded_at"),
                "parsed_at": None,  # 파싱 미완료이므로 None
                "total_monthly_premium": None,
                "total_contracts": None,
                "contracts": [],
                "status": ar_status,  # "pending", "processing", or "error"
                "error_message": file_doc.get("ar_parsing_error"),
                "retry_count": file_doc.get("ar_retry_count"),  # 재시도 횟수
                "file_hash": file_doc.get("meta", {}).get("file_hash")
            }
            reports.append(pending_report)

        # 최신순 정렬 (uploaded_at 기준)
        # 🔥 모든 datetime을 UTC timezone-aware로 통일
        def get_uploaded_at(r):
            uploaded_at = r.get("uploaded_at")
            # 기본값: UTC timezone-aware datetime.min
            min_dt = datetime.min.replace(tzinfo=timezone.utc)

            if uploaded_at is None:
                return min_dt
            if isinstance(uploaded_at, datetime):
                # timezone-naive면 UTC로 가정
                if uploaded_at.tzinfo is None:
                    return uploaded_at.replace(tzinfo=timezone.utc)
                return uploaded_at
            if isinstance(uploaded_at, str):
                try:
                    parsed_dt = datetime.fromisoformat(uploaded_at.replace('Z', '+00:00'))
                    # timezone-naive면 UTC로 가정
                    if parsed_dt.tzinfo is None:
                        parsed_dt = parsed_dt.replace(tzinfo=timezone.utc)
                    return parsed_dt
                except Exception as e:
                    logger.debug(f"uploaded_at 파싱 실패, 기본값 사용: {uploaded_at} - {e}")
                    return min_dt
            return min_dt

        sorted_reports = sorted(
            reports,
            key=get_uploaded_at,
            reverse=True
        )

        # limit 적용
        limited_reports = sorted_reports[:limit]

        # ObjectId를 문자열로 변환 및 상태 정보 추가 (JSON 직렬화를 위해)
        for report in limited_reports:
            source_file_id = None
            if "source_file_id" in report and isinstance(report["source_file_id"], ObjectId):
                source_file_id = report["source_file_id"]
                report["source_file_id"] = str(source_file_id)

            # 파싱 완료된 리포트에는 status: "completed" 추가
            if "status" not in report:
                report["status"] = "completed"

            # source_file_id가 있으면 files 컬렉션에서 file_hash 조회 (이미 있으면 스킵)
            if source_file_id and "file_hash" not in report:
                try:
                    file_doc = files_collection.find_one(
                        {"_id": source_file_id if isinstance(source_file_id, ObjectId) else ObjectId(source_file_id)},
                        {"meta.file_hash": 1}
                    )
                    if file_doc and "meta" in file_doc and "file_hash" in file_doc["meta"]:
                        report["file_hash"] = file_doc["meta"]["file_hash"]
                except Exception as e:
                    logger.warning(f"file_hash 조회 실패: source_file_id={source_file_id}, 오류={e}")

            # source_file_id가 없으면 customer_id로 files 조회 (Annual Report 파일 찾기)
            elif not source_file_id and "file_hash" not in report:
                try:
                    file_doc = files_collection.find_one(
                        {
                            "customer_relation.customer_id": customer_obj_id,
                            "is_annual_report": True
                        },
                        {"meta.file_hash": 1},
                        sort=[("upload.uploaded_at", -1)]
                    )
                    if file_doc and "meta" in file_doc and "file_hash" in file_doc["meta"]:
                        report["file_hash"] = file_doc["meta"]["file_hash"]
                except Exception as e:
                    logger.warning(f"file_hash 조회 실패 (customer_id 기반): 오류={e}")

            # datetime을 ISO 형식 문자열로 변환
            if "issue_date" in report and isinstance(report["issue_date"], datetime):
                report["issue_date"] = report["issue_date"].isoformat()
            if "uploaded_at" in report and isinstance(report["uploaded_at"], datetime):
                report["uploaded_at"] = report["uploaded_at"].isoformat()
            if "parsed_at" in report and isinstance(report["parsed_at"], datetime):
                report["parsed_at"] = report["parsed_at"].isoformat()

        logger.info(f"✅ Annual Reports 조회 완료: {len(limited_reports)}건 (미완료 AR {len(not_completed_ar_files)}건 포함)")

        return {
            "success": True,
            "data": limited_reports,
            "count": len(limited_reports),
            "total": len(reports)
        }

    except ValueError as e:
        logger.error(f"❌ 유효성 검증 실패: {e}")
        raise

    except Exception as e:
        logger.error(f"❌ Annual Reports 조회 중 오류: {e}")
        return {
            "success": False,
            "message": f"조회 실패: {str(e)}",
            "data": []
        }


def delete_annual_reports(
    db,
    customer_id: str,
    report_indices: list[int]
) -> Dict[str, any]:
    """
    고객의 Annual Reports 삭제 (배열 인덱스 기반)

    Args:
        db: MongoDB database 객체
        customer_id: 고객 ObjectId (문자열)
        report_indices: 삭제할 리포트의 인덱스 리스트 (최신순 기준)

    Returns:
        dict: {
            "success": bool,
            "message": str,
            "deleted_count": int
        }
    """
    logger.info(f"Annual Reports 삭제: customer_id={customer_id}, indices={report_indices}")

    try:
        # ObjectId 변환
        try:
            customer_obj_id = ObjectId(customer_id)
        except Exception as e:
            raise ValueError(f"유효하지 않은 customer_id: {customer_id}") from e

        # 고객 조회
        customers_collection = db["customers"]
        customer = customers_collection.find_one(
            {"_id": customer_obj_id},
            {"annual_reports": 1}
        )

        if not customer:
            logger.warning(f"고객을 찾을 수 없습니다: {customer_id}")
            return {
                "success": False,
                "message": "고객을 찾을 수 없습니다",
                "deleted_count": 0
            }

        # annual_reports 배열 가져오기
        reports = customer.get("annual_reports", [])

        # 최신순 정렬 (uploaded_at 기준)
        # 🔥 timezone-aware datetime 사용 (MongoDB 데이터와 비교 가능하도록)
        min_dt = datetime.min.replace(tzinfo=timezone.utc)
        sorted_reports = sorted(
            reports,
            key=lambda r: r.get("uploaded_at", min_dt) if isinstance(r.get("uploaded_at"), datetime) else min_dt,
            reverse=True
        )

        # 삭제할 리포트 선택
        reports_to_keep = [
            report for idx, report in enumerate(sorted_reports)
            if idx not in report_indices
        ]

        # 고객 문서 업데이트 (annual_reports 배열 교체)
        result = customers_collection.update_one(
            {"_id": customer_obj_id},
            {"$set": {"annual_reports": reports_to_keep}}
        )

        deleted_count = len(reports) - len(reports_to_keep)

        if result.modified_count > 0:
            logger.info(f"✅ Annual Reports 삭제 성공: {deleted_count}건")
            return {
                "success": True,
                "message": f"{deleted_count}건의 Annual Report가 삭제되었습니다",
                "deleted_count": deleted_count
            }
        else:
            logger.warning(f"⚠️  삭제할 항목이 없거나 변경사항이 없습니다")
            return {
                "success": False,
                "message": "삭제할 항목이 없거나 변경사항이 없습니다",
                "deleted_count": 0
            }

    except ValueError as e:
        logger.error(f"❌ 유효성 검증 실패: {e}")
        raise

    except PyMongoError as e:
        logger.error(f"❌ MongoDB 오류: {e}")
        raise

    except Exception as e:
        logger.error(f"❌ Annual Reports 삭제 중 오류: {e}")
        return {
            "success": False,
            "message": f"삭제 실패: {str(e)}",
            "deleted_count": 0
        }


def cleanup_duplicate_annual_reports(
    db,
    customer_id: str,
    issue_date: str,
    reference_linked_at: str,
    customer_name: str = None
) -> Dict[str, any]:
    """
    동일 발행일(issue_date) + 동일 고객명(customer_name)의 중복 Annual Report 정리

    문서 탭의 연결일(linked_at)과 가장 가까운 파싱일시(parsed_at)를 가진
    Annual Report만 남기고 나머지 동일 발행일+고객명 AR 삭제

    중복 판단 기준:
    - issue_date AND customer_name 둘 다 같아야 중복
    - 날짜만 같고 고객명이 다르면 중복이 아님

    Args:
        db: MongoDB database 객체
        customer_id: 고객 ObjectId (문자열)
        issue_date: 발행일 (YYYY-MM-DD 또는 ISO 형식)
        reference_linked_at: 기준 연결일 (ISO 8601 형식)
        customer_name: AR의 고객명 (선택, 없으면 issue_date만으로 중복 체크)

    Returns:
        dict: {
            "success": bool,
            "message": str,
            "deleted_count": int,
            "kept_report": dict (optional, 유지된 리포트 정보)
        }
    """
    logger.info(f"중복 Annual Reports 정리: customer_id={customer_id}, issue_date={issue_date}, customer_name={customer_name}, reference={reference_linked_at}")

    try:
        # ObjectId 변환
        try:
            customer_obj_id = ObjectId(customer_id)
        except Exception as e:
            raise ValueError(f"유효하지 않은 customer_id: {customer_id}") from e

        # 고객 조회
        customers_collection = db["customers"]
        customer = customers_collection.find_one(
            {"_id": customer_obj_id},
            {"annual_reports": 1}
        )

        if not customer:
            logger.warning(f"고객을 찾을 수 없습니다: {customer_id}")
            return {
                "success": False,
                "message": "고객을 찾을 수 없습니다",
                "deleted_count": 0
            }

        # annual_reports 배열 가져오기
        all_reports = customer.get("annual_reports", [])

        # 발행일 정규화 (날짜만 비교)
        target_issue_date = issue_date.split('T')[0]  # "2025-08-29"

        # 동일 발행일 + 동일 고객명의 리포트 필터링
        # 중복 판단: issue_date AND customer_name 둘 다 같아야 중복
        same_issue_reports = []
        other_reports = []

        for report in all_reports:
            report_issue_date = None
            report_customer_name = report.get("customer_name", "")

            if "issue_date" in report:
                if isinstance(report["issue_date"], datetime):
                    report_issue_date = report["issue_date"].strftime("%Y-%m-%d")
                elif isinstance(report["issue_date"], str):
                    report_issue_date = report["issue_date"].split('T')[0]

            # 중복 판단: issue_date AND customer_name 둘 다 같아야 중복
            # customer_name이 제공되지 않으면 중복 판단 불가 → 중복으로 처리하지 않음
            if customer_name:
                is_duplicate = (report_issue_date == target_issue_date and report_customer_name == customer_name)
            else:
                # customer_name이 없으면 중복 판단 불가
                is_duplicate = False

            if is_duplicate:
                same_issue_reports.append(report)
            else:
                other_reports.append(report)

        # 중복이 없으면 작업 불필요
        if len(same_issue_reports) <= 1:
            logger.info(f"중복 없음: 발행일={target_issue_date}, 고객명={customer_name}, 리포트={len(same_issue_reports)}개")
            return {
                "success": True,
                "message": "중복된 Annual Report가 없습니다",
                "deleted_count": 0
            }

        # reference_linked_at을 datetime으로 변환
        try:
            reference_dt = datetime.fromisoformat(reference_linked_at.replace('Z', '+00:00'))
        except Exception as e:
            logger.error(f"reference_linked_at 파싱 실패: {reference_linked_at}, 오류={e}")
            raise ValueError(f"유효하지 않은 reference_linked_at: {reference_linked_at}")

        # 각 리포트의 parsed_at과 reference_linked_at 간 시간차 계산
        # 가장 가까운 것을 찾기
        best_report = None
        min_diff = None

        for report in same_issue_reports:
            parsed_at = report.get("parsed_at")
            if not parsed_at:
                continue

            # datetime으로 변환
            if isinstance(parsed_at, str):
                try:
                    parsed_dt = datetime.fromisoformat(parsed_at.replace('Z', '+00:00'))
                except Exception as e:
                    logger.debug(f"parsed_at 파싱 실패, 스킵: {parsed_at} - {e}")
                    continue
            elif isinstance(parsed_at, datetime):
                parsed_dt = parsed_at
            else:
                continue

            # 시간차 계산 (절대값)
            time_diff = abs((parsed_dt - reference_dt).total_seconds())

            if min_diff is None or time_diff < min_diff:
                min_diff = time_diff
                best_report = report

        # best_report가 없으면 (parsed_at이 없는 경우) 첫 번째 것 유지
        if best_report is None:
            logger.warning(f"parsed_at이 없는 리포트들: 첫 번째 리포트 유지")
            best_report = same_issue_reports[0]

        # 유지할 리포트 목록 = other_reports + best_report
        reports_to_keep = other_reports + [best_report]

        # 고객 문서 업데이트
        result = customers_collection.update_one(
            {"_id": customer_obj_id},
            {"$set": {"annual_reports": reports_to_keep}}
        )

        deleted_count = len(same_issue_reports) - 1

        if result.modified_count > 0:
            logger.info(f"✅ 중복 Annual Reports 정리 완료: {deleted_count}건 삭제")

            # 유지된 리포트 정보 요약
            kept_info = {
                "issue_date": best_report.get("issue_date"),
                "parsed_at": best_report.get("parsed_at"),
                "customer_name": best_report.get("customer_name"),
                "fsr_name": best_report.get("fsr_name")
            }

            return {
                "success": True,
                "message": f"{deleted_count}개의 중복 Annual Report가 삭제되었습니다",
                "deleted_count": deleted_count,
                "kept_report": kept_info
            }
        else:
            logger.warning(f"⚠️  변경사항이 없습니다")
            return {
                "success": False,
                "message": "변경사항이 없습니다",
                "deleted_count": 0
            }

    except ValueError as e:
        logger.error(f"❌ 유효성 검증 실패: {e}")
        raise

    except PyMongoError as e:
        logger.error(f"❌ MongoDB 오류: {e}")
        raise

    except Exception as e:
        logger.error(f"❌ 중복 Annual Reports 정리 중 오류: {e}")
        return {
            "success": False,
            "message": f"정리 실패: {str(e)}",
            "deleted_count": 0
        }


# ================================================================================
# Customer Review Service 관련 함수
# ================================================================================

def notify_cr_status_change(customer_id: str, file_id: Optional[str], status: str, error_message: Optional[str] = None):
    """
    CR 상태 변경을 aims_api에 알림 (SSE 실시간 업데이트용)
    """
    try:
        webhook_url = f"{AIMS_API_URL}/api/webhooks/cr-status-change"
        payload = {
            "customer_id": customer_id,
            "file_id": file_id,
            "status": status,
            "error_message": error_message
        }
        response = requests.post(webhook_url, json=payload, timeout=5)
        if response.ok:
            logger.info(f"✅ [SSE] CR 상태 변경 알림 전송: customer_id={customer_id}, status={status}")
        else:
            logger.warning(f"⚠️ [SSE] CR 알림 전송 실패: {response.status_code} - {response.text}")
    except Exception as e:
        # 알림 실패는 무시 (파싱 자체는 성공)
        logger.warning(f"⚠️ [SSE] CR 알림 전송 실패 (무시됨): {e}")


def save_customer_review(
    db,
    customer_id: str,
    report_data: Dict,
    metadata: Optional[Dict] = None,
    source_file_id: Optional[str] = None
) -> Dict[str, any]:
    """
    customers 컬렉션에 customer_reviews 추가

    Args:
        db: MongoDB database 객체
        customer_id: 고객 ObjectId (문자열)
        report_data: parse_customer_review() 결과 (2~4페이지 계약 데이터)
        metadata: 1페이지 메타데이터 (product_name, issue_date, contractor_name, insured_name, death_beneficiary, fsr_name)
        source_file_id: 원본 PDF 파일 ID (선택)

    Returns:
        dict: {
            "success": bool,
            "message": str,
            "summary": dict (저장된 데이터 요약)
        }

    Raises:
        ValueError: customer_id가 유효하지 않을 때
        PyMongoError: DB 저장 실패
    """
    logger.info(f"Customer Review 저장 시작: customer_id={customer_id}")

    try:
        # 1. ObjectId 유효성 검증
        try:
            customer_obj_id = ObjectId(customer_id)
        except Exception as e:
            raise ValueError(f"유효하지 않은 customer_id: {customer_id}") from e

        # 2. 고객 존재 확인
        customers_collection = db["customers"]
        customer = customers_collection.find_one({"_id": customer_obj_id})

        if not customer:
            logger.error(f"고객을 찾을 수 없습니다: {customer_id}")
            return {
                "success": False,
                "message": f"고객을 찾을 수 없습니다 (ID: {customer_id})"
            }

        # 3. 파싱 데이터 검증
        if "error" in report_data:
            logger.error(f"파싱 실패한 데이터를 저장할 수 없습니다: {report_data['error']}")
            return {
                "success": False,
                "message": f"파싱 실패: {report_data['error']}"
            }

        # 4. 1페이지 메타데이터 처리
        product_name = None
        issue_date_str = None
        contractor_name = None
        insured_name = None
        death_beneficiary = None
        fsr_name = None

        if metadata:
            product_name = metadata.get("product_name")
            issue_date_str = metadata.get("issue_date")
            contractor_name = metadata.get("contractor_name")
            insured_name = metadata.get("insured_name")
            death_beneficiary = metadata.get("death_beneficiary")
            fsr_name = metadata.get("fsr_name")

        # 발행일 파싱
        try:
            if issue_date_str:
                naive_date = datetime.strptime(issue_date_str, "%Y-%m-%d")
                issue_date = naive_date.replace(tzinfo=timezone.utc)
            else:
                issue_date = None
        except Exception as e:
            logger.warning(f"발행일 파싱 실패: {issue_date_str} ({e})")
            issue_date = None

        # 5. Customer Review 문서 생성
        contract_info = report_data.get("contract_info", {})
        premium_info = report_data.get("premium_info", {})
        fund_allocations = report_data.get("fund_allocations", [])
        total_accumulated_amount = report_data.get("total_accumulated_amount", 0)
        fund_count = report_data.get("fund_count", len(fund_allocations))

        customer_review = {
            # 1페이지 메타데이터 (AI 불사용)
            "product_name": product_name,
            "issue_date": issue_date,
            "contractor_name": contractor_name,
            "insured_name": insured_name,
            "death_beneficiary": death_beneficiary,
            "fsr_name": fsr_name,

            # 2~4페이지 파싱 데이터 (AI 사용)
            "contract_info": contract_info,
            "premium_info": premium_info,
            "fund_allocations": fund_allocations,

            # 요약 정보
            "total_accumulated_amount": total_accumulated_amount,
            "fund_count": fund_count,

            # 타임스탬프
            "uploaded_at": utc_now_iso(),
            "parsed_at": utc_now_iso(),
        }

        # 원본 파일 ID 추가 (있는 경우)
        if source_file_id:
            try:
                customer_review["source_file_id"] = ObjectId(source_file_id)
            except Exception as e:
                logger.warning(f"source_file_id 변환 실패: {source_file_id} ({e})")

        # 5.5 중복 체크: contractor_name + policy_number + product_name + issue_date 4가지 모두 같으면 중복
        policy_number = contract_info.get("policy_number")
        if contractor_name and policy_number and product_name and issue_date:
            existing_reviews = customer.get("customer_reviews", [])
            for existing in existing_reviews:
                existing_contractor = existing.get("contractor_name", "")
                existing_policy = existing.get("contract_info", {}).get("policy_number", "")
                existing_product = existing.get("product_name", "")
                existing_issue_date = existing.get("issue_date")

                # issue_date 비교 (날짜만)
                existing_date_str = None
                if existing_issue_date:
                    if isinstance(existing_issue_date, datetime):
                        existing_date_str = existing_issue_date.strftime("%Y-%m-%d")
                    elif isinstance(existing_issue_date, str):
                        existing_date_str = existing_issue_date.split('T')[0]

                # 4가지 모두 일치해야 중복
                if (existing_contractor == contractor_name and
                    existing_policy == policy_number and
                    existing_product == product_name and
                    existing_date_str == issue_date_str):
                    logger.info(
                        f"⏭️  중복 CR 건너뜀: contractor={contractor_name}, policy_number={policy_number}, "
                        f"product={product_name}, issue_date={issue_date_str}"
                    )
                    return {
                        "success": True,
                        "message": "이미 동일한 Customer Review가 존재합니다 (중복 건너뜀)",
                        "duplicate": True,
                        "summary": {
                            "contractor_name": contractor_name,
                            "policy_number": policy_number,
                            "product_name": product_name,
                            "issue_date": issue_date_str
                        }
                    }

        # 6. customers 컬렉션 업데이트
        result = customers_collection.update_one(
            {"_id": customer_obj_id},
            {
                "$push": {
                    "customer_reviews": customer_review
                }
            }
        )

        # 7. 결과 확인
        if result.modified_count > 0:
            logger.info(
                f"✅ Customer Review 저장 성공: contractor={contractor_name}, "
                f"product={product_name}, 펀드={fund_count}개, 총적립금={total_accumulated_amount:,}원"
            )

            # 🔔 SSE 알림: CR 파싱 완료
            notify_cr_status_change(
                customer_id=customer_id,
                file_id=source_file_id,
                status="completed"
            )

            return {
                "success": True,
                "message": "Customer Review 저장 완료",
                "summary": {
                    "product_name": product_name,
                    "issue_date": issue_date_str,
                    "contractor_name": contractor_name,
                    "insured_name": insured_name,
                    "fsr_name": fsr_name,
                    "policy_number": policy_number,
                    "total_accumulated_amount": total_accumulated_amount,
                    "fund_count": fund_count
                }
            }
        else:
            logger.warning(f"⚠️  DB 업데이트 실패 (modified_count=0): {customer_id}")
            return {
                "success": False,
                "message": "DB 업데이트 실패 (문서가 수정되지 않음)"
            }

    except ValueError as e:
        logger.error(f"❌ 유효성 검증 실패: {e}")
        raise

    except PyMongoError as e:
        logger.error(f"❌ MongoDB 오류: {e}")
        raise

    except Exception as e:
        logger.error(f"❌ Customer Review 저장 중 예상치 못한 오류: {e}")
        send_error_log("annual_report_api", f"Customer Review 저장 중 예상치 못한 오류: {e}", e)
        return {
            "success": False,
            "message": f"저장 실패: {str(e)}"
        }


def get_customer_reviews(db, customer_id: str, limit: int = 10) -> Dict[str, any]:
    """
    고객의 Customer Reviews 조회 (최신순)
    - 파싱 완료된 CR (customers.customer_reviews[])
    - 파싱 실패한 CR (files.cr_parsing_status: error)
    - 파싱 진행중인 CR (files.cr_parsing_status: processing)

    Args:
        db: MongoDB database 객체
        customer_id: 고객 ObjectId (문자열)
        limit: 최대 조회 개수

    Returns:
        dict: {
            "success": bool,
            "data": list,  # customer_reviews 배열 (status 필드 포함)
            "count": int
        }
    """
    logger.info(f"Customer Reviews 조회: customer_id={customer_id}")

    try:
        # ObjectId 변환
        try:
            customer_obj_id = ObjectId(customer_id)
        except Exception as e:
            raise ValueError(f"유효하지 않은 customer_id: {customer_id}") from e

        # 고객 조회
        customers_collection = db["customers"]
        customer = customers_collection.find_one(
            {"_id": customer_obj_id},
            {"customer_reviews": 1, "name": 1}
        )

        if not customer:
            logger.warning(f"고객을 찾을 수 없습니다: {customer_id}")
            return {
                "success": False,
                "message": "고객을 찾을 수 없습니다",
                "data": []
            }

        # customer_reviews 배열 가져오기 (파싱 완료된 것들)
        reviews = customer.get("customer_reviews", [])

        # 🔧 이미 완료된 source_file_id 수집 (중복 방지)
        completed_file_ids = set()
        for cr in reviews:
            source_id = cr.get("source_file_id")
            if source_id:
                try:
                    completed_file_ids.add(ObjectId(source_id))
                except Exception as e:
                    logger.debug(f"유효하지 않은 ObjectId 무시: {source_id} - {e}")

        # files 컬렉션 참조
        files_collection = db["files"]

        # 🔥 파싱 미완료 CR 문서 조회 (files 컬렉션에서)
        query = {
            "customerId": customer_obj_id,
            "is_customer_review": True,
            "$or": [
                {"cr_parsing_status": {"$exists": False}},
                {"cr_parsing_status": {"$in": ["pending", "processing", "error"]}}
            ]
        }
        # 이미 완료된 파일은 제외
        if completed_file_ids:
            query["_id"] = {"$nin": list(completed_file_ids)}

        not_completed_cr_files = list(files_collection.find(
            query,
            {
                "_id": 1,
                "upload.originalName": 1,
                "upload.uploaded_at": 1,
                "cr_parsing_status": 1,
                "cr_parsing_error": 1,
                "cr_retry_count": 1,
                "cr_metadata": 1,
                "meta.file_hash": 1
            }
        ))

        # 파싱 미완료 문서를 customer_reviews 형식으로 변환
        for file_doc in not_completed_cr_files:
            cr_metadata = file_doc.get("cr_metadata", {}) or {}
            upload_info = file_doc.get("upload", {}) or {}

            # cr_parsing_status가 없으면 "pending"으로 처리
            cr_status = file_doc.get("cr_parsing_status") or "pending"

            pending_review = {
                "source_file_id": str(file_doc["_id"]),
                "file_id": str(file_doc["_id"]),
                "product_name": cr_metadata.get("product_name"),
                "issue_date": cr_metadata.get("issue_date"),
                "contractor_name": cr_metadata.get("contractor_name"),
                "insured_name": cr_metadata.get("insured_name"),
                "fsr_name": cr_metadata.get("fsr_name"),
                "uploaded_at": upload_info.get("uploaded_at"),
                "parsed_at": None,
                "contract_info": {},
                "premium_info": {},
                "fund_allocations": [],
                "total_accumulated_amount": None,
                "fund_count": None,
                "status": cr_status,
                "error_message": file_doc.get("cr_parsing_error"),
                "retry_count": file_doc.get("cr_retry_count"),
                "file_hash": file_doc.get("meta", {}).get("file_hash")
            }
            reviews.append(pending_review)

        # 최신순 정렬 (uploaded_at 기준)
        def get_uploaded_at(r):
            uploaded_at = r.get("uploaded_at")
            min_dt = datetime.min.replace(tzinfo=timezone.utc)

            if uploaded_at is None:
                return min_dt
            if isinstance(uploaded_at, datetime):
                if uploaded_at.tzinfo is None:
                    return uploaded_at.replace(tzinfo=timezone.utc)
                return uploaded_at
            if isinstance(uploaded_at, str):
                try:
                    parsed_dt = datetime.fromisoformat(uploaded_at.replace('Z', '+00:00'))
                    # timezone-naive면 UTC로 가정
                    if parsed_dt.tzinfo is None:
                        parsed_dt = parsed_dt.replace(tzinfo=timezone.utc)
                    return parsed_dt
                except Exception as e:
                    logger.debug(f"uploaded_at 파싱 실패, 기본값 사용: {uploaded_at} - {e}")
                    return min_dt
            return min_dt

        sorted_reviews = sorted(
            reviews,
            key=get_uploaded_at,
            reverse=True
        )

        # limit 적용
        limited_reviews = sorted_reviews[:limit]

        # ObjectId를 문자열로 변환 및 상태 정보 추가
        for review in limited_reviews:
            source_file_id = None
            if "source_file_id" in review and isinstance(review["source_file_id"], ObjectId):
                source_file_id = review["source_file_id"]
                review["source_file_id"] = str(source_file_id)

            # 파싱 완료된 리뷰에는 status: "completed" 추가
            if "status" not in review:
                review["status"] = "completed"

            # source_file_id가 있으면 files 컬렉션에서 file_hash 조회
            if source_file_id and "file_hash" not in review:
                try:
                    file_doc = files_collection.find_one(
                        {"_id": source_file_id if isinstance(source_file_id, ObjectId) else ObjectId(source_file_id)},
                        {"meta.file_hash": 1}
                    )
                    if file_doc and "meta" in file_doc and "file_hash" in file_doc["meta"]:
                        review["file_hash"] = file_doc["meta"]["file_hash"]
                except Exception as e:
                    logger.warning(f"file_hash 조회 실패: source_file_id={source_file_id}, 오류={e}")

            # datetime을 ISO 형식 문자열로 변환
            if "issue_date" in review and isinstance(review["issue_date"], datetime):
                review["issue_date"] = review["issue_date"].isoformat()
            if "uploaded_at" in review and isinstance(review["uploaded_at"], datetime):
                review["uploaded_at"] = review["uploaded_at"].isoformat()
            if "parsed_at" in review and isinstance(review["parsed_at"], datetime):
                review["parsed_at"] = review["parsed_at"].isoformat()

        logger.info(f"✅ Customer Reviews 조회 완료: {len(limited_reviews)}건 (미완료 CR {len(not_completed_cr_files)}건 포함)")

        return {
            "success": True,
            "data": limited_reviews,
            "count": len(limited_reviews),
            "total": len(reviews)
        }

    except ValueError as e:
        logger.error(f"❌ 유효성 검증 실패: {e}")
        raise

    except Exception as e:
        logger.error(f"❌ Customer Reviews 조회 중 오류: {e}")
        return {
            "success": False,
            "message": f"조회 실패: {str(e)}",
            "data": []
        }


def delete_customer_reviews(
    db,
    customer_id: str,
    review_indices: list[int]
) -> Dict[str, any]:
    """
    고객의 Customer Reviews 삭제 (배열 인덱스 기반)

    Args:
        db: MongoDB database 객체
        customer_id: 고객 ObjectId (문자열)
        review_indices: 삭제할 리뷰의 인덱스 리스트 (최신순 기준)

    Returns:
        dict: {
            "success": bool,
            "message": str,
            "deleted_count": int
        }
    """
    logger.info(f"Customer Reviews 삭제: customer_id={customer_id}, indices={review_indices}")

    try:
        # ObjectId 변환
        try:
            customer_obj_id = ObjectId(customer_id)
        except Exception as e:
            raise ValueError(f"유효하지 않은 customer_id: {customer_id}") from e

        # 고객 조회
        customers_collection = db["customers"]
        customer = customers_collection.find_one(
            {"_id": customer_obj_id},
            {"customer_reviews": 1}
        )

        if not customer:
            logger.warning(f"고객을 찾을 수 없습니다: {customer_id}")
            return {
                "success": False,
                "message": "고객을 찾을 수 없습니다",
                "deleted_count": 0
            }

        # customer_reviews 배열 가져오기
        reviews = customer.get("customer_reviews", [])

        # 최신순 정렬 (uploaded_at 기준)
        # 🔥 timezone-aware datetime 사용 (MongoDB 데이터와 비교 가능하도록)
        min_dt = datetime.min.replace(tzinfo=timezone.utc)
        sorted_reviews = sorted(
            reviews,
            key=lambda r: r.get("uploaded_at", min_dt) if isinstance(r.get("uploaded_at"), datetime) else min_dt,
            reverse=True
        )

        # 삭제할 리뷰 선택
        reviews_to_keep = [
            review for idx, review in enumerate(sorted_reviews)
            if idx not in review_indices
        ]

        # 고객 문서 업데이트 (customer_reviews 배열 교체)
        result = customers_collection.update_one(
            {"_id": customer_obj_id},
            {"$set": {"customer_reviews": reviews_to_keep}}
        )

        deleted_count = len(reviews) - len(reviews_to_keep)

        if result.modified_count > 0:
            logger.info(f"✅ Customer Reviews 삭제 성공: {deleted_count}건")
            return {
                "success": True,
                "message": f"{deleted_count}건의 Customer Review가 삭제되었습니다",
                "deleted_count": deleted_count
            }
        else:
            logger.warning(f"⚠️  삭제할 항목이 없거나 변경사항이 없습니다")
            return {
                "success": False,
                "message": "삭제할 항목이 없거나 변경사항이 없습니다",
                "deleted_count": 0
            }

    except ValueError as e:
        logger.error(f"❌ 유효성 검증 실패: {e}")
        raise

    except PyMongoError as e:
        logger.error(f"❌ MongoDB 오류: {e}")
        raise

    except Exception as e:
        logger.error(f"❌ Customer Reviews 삭제 중 오류: {e}")
        return {
            "success": False,
            "message": f"삭제 실패: {str(e)}",
            "deleted_count": 0
        }

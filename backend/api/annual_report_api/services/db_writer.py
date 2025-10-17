"""
MongoDB에 Annual Report 저장
customers 컬렉션의 annual_reports 배열에 추가
"""
import logging
from typing import Dict, Optional
from datetime import datetime
from bson import ObjectId
from pymongo.errors import PyMongoError

logger = logging.getLogger(__name__)


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
            # "YYYY-MM-DD" → datetime
            issue_date = datetime.strptime(issue_date_str, "%Y-%m-%d") if issue_date_str else None
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
            "uploaded_at": datetime.now(),
            "parsed_at": datetime.now(),
        }

        # 원본 파일 ID 추가 (있는 경우)
        if source_file_id:
            try:
                annual_report["source_file_id"] = ObjectId(source_file_id)
            except Exception as e:
                logger.warning(f"source_file_id 변환 실패: {source_file_id} ({e})")

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
        return {
            "success": False,
            "message": f"저장 실패: {str(e)}"
        }


def get_annual_reports(db, customer_id: str, limit: int = 10) -> Dict[str, any]:
    """
    고객의 Annual Reports 조회 (최신순)

    Args:
        db: MongoDB database 객체
        customer_id: 고객 ObjectId (문자열)
        limit: 최대 조회 개수

    Returns:
        dict: {
            "success": bool,
            "data": list,  # annual_reports 배열
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

        # annual_reports 배열 가져오기
        reports = customer.get("annual_reports", [])

        # 최신순 정렬 (uploaded_at 기준)
        sorted_reports = sorted(
            reports,
            key=lambda r: r.get("uploaded_at", datetime.min),
            reverse=True
        )

        # limit 적용
        limited_reports = sorted_reports[:limit]

        # ObjectId를 문자열로 변환 (JSON 직렬화를 위해)
        for report in limited_reports:
            if "source_file_id" in report and isinstance(report["source_file_id"], ObjectId):
                report["source_file_id"] = str(report["source_file_id"])

            # datetime을 ISO 형식 문자열로 변환
            if "issue_date" in report and isinstance(report["issue_date"], datetime):
                report["issue_date"] = report["issue_date"].isoformat()
            if "uploaded_at" in report and isinstance(report["uploaded_at"], datetime):
                report["uploaded_at"] = report["uploaded_at"].isoformat()
            if "parsed_at" in report and isinstance(report["parsed_at"], datetime):
                report["parsed_at"] = report["parsed_at"].isoformat()

        logger.info(f"✅ Annual Reports 조회 완료: {len(limited_reports)}건")

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
        sorted_reports = sorted(
            reports,
            key=lambda r: r.get("uploaded_at", datetime.min),
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

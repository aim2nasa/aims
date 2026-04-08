"""
ErrorLogger - Error Handling and Notification
Replaces n8n ErrorLogger workflow
"""
import logging
from datetime import datetime
from typing import Any, Dict, Optional

import httpx
from config import get_settings
from services.mongo_service import MongoService

logger = logging.getLogger(__name__)

# aims_analytics DB의 error_logs 컬렉션명
_ANALYTICS_DB_NAME = "aims_analytics"
_ERROR_LOGS_COLLECTION = "error_logs"


class ErrorLogger:
    def __init__(self):
        self.settings = get_settings()

    async def log_error(
        self,
        error_type: str,
        message: str,
        details: Optional[Dict[str, Any]] = None,
        workflow: Optional[str] = None,
        document_id: Optional[str] = None
    ) -> str:
        """
        Log error to MongoDB, Slack, and optionally Google Sheets.

        Returns error ID.
        """
        error_data = {
            "type": error_type,
            "message": message,
            "details": details or {},
            "workflow": workflow,
            "document_id": document_id,
            "timestamp": datetime.utcnow().isoformat(),
        }

        # Log to MongoDB
        try:
            error_id = await MongoService.insert_error(error_data)
            logger.info(f"Error logged to MongoDB: {error_id}")
        except Exception as e:
            logger.error(f"Failed to log to MongoDB: {e}")
            error_id = "unknown"

        # Send to Slack
        await self._send_slack_notification(error_data)

        return error_id

    async def _send_slack_notification(self, error_data: Dict[str, Any]):
        """Send error notification to Slack"""
        if not self.settings.SLACK_WEBHOOK_URL:
            logger.debug("Slack webhook URL not configured, skipping notification")
            return

        try:
            message = {
                "text": ":warning: *Error in Document Pipeline*",
                "blocks": [
                    {
                        "type": "header",
                        "text": {
                            "type": "plain_text",
                            "text": f"Error: {error_data['type']}"
                        }
                    },
                    {
                        "type": "section",
                        "fields": [
                            {
                                "type": "mrkdwn",
                                "text": f"*Message:*\n{error_data['message']}"
                            },
                            {
                                "type": "mrkdwn",
                                "text": f"*Workflow:*\n{error_data.get('workflow', 'N/A')}"
                            },
                            {
                                "type": "mrkdwn",
                                "text": f"*Time:*\n{error_data['timestamp']}"
                            }
                        ]
                    }
                ]
            }

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self.settings.SLACK_WEBHOOK_URL,
                    json=message,
                    timeout=10.0
                )
                if response.status_code == 200:
                    logger.info("Slack notification sent")
                else:
                    logger.warning(f"Slack notification failed: {response.status_code}")

        except Exception as e:
            logger.error(f"Failed to send Slack notification: {e}")


    def _build_admin_payload(
        self,
        component: str,
        message: str,
        document_id: str = None,
        owner_id: str = None,
        error_type: str = "PipelineError",
        severity: str = "high",
        category: str = "pipeline",
        detail: dict = None
    ) -> dict:
        """aims-admin 에러 로그 payload 구성"""
        return {
            "error": {
                "type": error_type,
                "message": message,
                "severity": severity,
                "category": category
            },
            "source": {
                "type": "pipeline",
                "component": component
            },
            "context": {
                "payload": {
                    "document_id": document_id,
                    "owner_id": owner_id,
                    **(detail or {})
                }
            }
        }

    def _admin_headers(self) -> dict:
        """내부 API 인증 헤더"""
        return {"x-api-key": self.settings.INTERNAL_API_KEY}

    def _build_log_entry(self, payload: dict) -> dict:
        """aims_analytics.error_logs에 저장할 로그 엔트리 구성"""
        error = payload.get("error", {})
        source = payload.get("source", {})
        context = payload.get("context", {})
        return {
            "timestamp": datetime.utcnow(),
            "level": "error",
            "actor": {
                "user_id": None,
                "name": None,
                "role": "system",
            },
            "source": {
                "type": source.get("type", "pipeline"),
                "component": source.get("component"),
            },
            "error": {
                "type": error.get("type", "PipelineError"),
                "message": error.get("message", ""),
                "severity": error.get("severity", "high"),
                "category": error.get("category", "pipeline"),
            },
            "context": {
                "payload": context.get("payload"),
            },
            "meta": {
                "resolved": False,
            },
        }

    async def report_to_admin(
        self,
        component: str,
        message: str,
        document_id: str = None,
        owner_id: str = None,
        error_type: str = "PipelineError",
        severity: str = "high",
        category: str = "pipeline",
        detail: dict = None
    ) -> None:
        """파이프라인 에러를 aims_analytics.error_logs에 직접 기록 (비동기, fire-and-forget)"""
        try:
            if MongoService._client is None:
                logger.warning("[ErrorLogger] MongoDB 미연결 상태 — 에러 로그 기록 불가")
                return
            payload = self._build_admin_payload(
                component, message, document_id, owner_id,
                error_type, severity, category, detail
            )
            log_entry = self._build_log_entry(payload)
            db = MongoService._client[_ANALYTICS_DB_NAME]
            await db[_ERROR_LOGS_COLLECTION].insert_one(log_entry)
        except Exception as e:
            logger.warning(f"[ErrorLogger] admin 리포트 실패: {e}")

    def report_to_admin_sync(
        self,
        component: str,
        message: str,
        document_id: str = None,
        owner_id: str = None,
        error_type: str = "PipelineError",
        severity: str = "high",
        category: str = "pipeline",
        detail: dict = None
    ) -> None:
        """파이프라인 에러를 aims_analytics.error_logs에 직접 기록 (동기, fire-and-forget)"""
        try:
            import pymongo
            payload = self._build_admin_payload(
                component, message, document_id, owner_id,
                error_type, severity, category, detail
            )
            log_entry = self._build_log_entry(payload)
            sync_client = pymongo.MongoClient(self.settings.MONGODB_URI)
            sync_client[_ANALYTICS_DB_NAME][_ERROR_LOGS_COLLECTION].insert_one(log_entry)
            sync_client.close()
        except Exception as e:
            logger.warning(f"[ErrorLogger] admin 리포트(sync) 실패: {e}")


# Global instance
error_logger = ErrorLogger()

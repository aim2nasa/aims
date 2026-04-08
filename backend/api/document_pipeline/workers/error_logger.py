"""
ErrorLogger - Error Handling and Notification
Replaces n8n ErrorLogger workflow
"""
import logging
from datetime import datetime
from typing import Any, Dict, Optional

import httpx
import requests
from config import get_settings
from services.mongo_service import MongoService

logger = logging.getLogger(__name__)


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
        """파이프라인 에러를 aims-admin 시스템 로그에 기록 (비동기, fire-and-forget)"""
        try:
            payload = self._build_admin_payload(
                component, message, document_id, owner_id,
                error_type, severity, category, detail
            )
            async with httpx.AsyncClient(timeout=5) as client:
                await client.post(
                    f"{self.settings.AIMS_API_URL}/api/error-logs",
                    json=payload,
                    headers=self._admin_headers()
                )
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
        """파이프라인 에러를 aims-admin 시스템 로그에 기록 (동기, fire-and-forget)"""
        try:
            payload = self._build_admin_payload(
                component, message, document_id, owner_id,
                error_type, severity, category, detail
            )
            requests.post(
                f"{self.settings.AIMS_API_URL}/api/error-logs",
                json=payload,
                headers=self._admin_headers(),
                timeout=5
            )
        except Exception as e:
            logger.warning(f"[ErrorLogger] admin 리포트(sync) 실패: {e}")


# Global instance
error_logger = ErrorLogger()

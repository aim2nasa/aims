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


# Global instance
error_logger = ErrorLogger()

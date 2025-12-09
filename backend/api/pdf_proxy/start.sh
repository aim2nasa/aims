#!/bin/bash
# PDF Proxy Service Startup Script

cd /home/rossi/aims/backend/api/pdf_proxy
source /home/rossi/aims/backend/api/annual_report_api/venv/bin/activate
nohup uvicorn main:app --host 0.0.0.0 --port 8002 > /tmp/pdf_proxy.log 2>&1 &
echo "Started PDF Proxy on port 8002"

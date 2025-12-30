#!/bin/bash
#
# AIMS 바이러스 스캔 서비스 배포 스크립트 (yuri/RPi5)
#
# 사용법:
#   로컬에서: scp -r backend/services/virus-scan-service rossi@yuri:~/aims-virus-scan/
#   yuri에서: cd ~/aims-virus-scan && ./deploy.sh
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_NAME="aims-virus-scan"
VENV_DIR="$SCRIPT_DIR/venv"
SYSTEMD_SERVICE="/etc/systemd/system/${SERVICE_NAME}.service"

echo "=== AIMS Virus Scan Service Deployment ==="
echo "Directory: $SCRIPT_DIR"

# 1. Python 가상환경 설정
echo ""
echo "[1/4] Setting up Python virtual environment..."

if [ ! -d "$VENV_DIR" ]; then
    python3 -m venv "$VENV_DIR"
    echo "Created virtual environment"
fi

source "$VENV_DIR/bin/activate"
pip install --upgrade pip -q
pip install -r "$SCRIPT_DIR/requirements.txt" -q
echo "Dependencies installed"

# 2. 환경 변수 파일 생성 (없는 경우)
echo ""
echo "[2/4] Checking environment configuration..."

ENV_FILE="$SCRIPT_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
    cat > "$ENV_FILE" << 'EOF'
# AIMS Virus Scan Service Configuration
VIRUS_SCAN_HOST=0.0.0.0
VIRUS_SCAN_PORT=8100
VIRUS_SCAN_AIMS_API_URL=http://tars.giize.com:3010
VIRUS_SCAN_SECRET=aims-virus-scan-secret-key
VIRUS_SCAN_MOUNT_PATH=/mnt/tars-files
EOF
    echo "Created .env file (please update VIRUS_SCAN_SECRET)"
else
    echo ".env file exists"
fi

# 3. systemd 서비스 설정
echo ""
echo "[3/4] Setting up systemd service..."

# 서비스 파일 생성
sudo tee "$SYSTEMD_SERVICE" > /dev/null << EOF
[Unit]
Description=AIMS Virus Scan Service
After=network.target clamav-daemon.service
Wants=clamav-daemon.service

[Service]
Type=simple
User=rossi
Group=rossi
WorkingDirectory=$SCRIPT_DIR
EnvironmentFile=$SCRIPT_DIR/.env
ExecStart=$VENV_DIR/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8100
Restart=always
RestartSec=5

# 로깅
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME

# 보안 설정
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

echo "systemd service file created"

# 4. 서비스 시작
echo ""
echo "[4/4] Starting service..."

sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"

# 상태 확인
sleep 2
if sudo systemctl is-active --quiet "$SERVICE_NAME"; then
    echo ""
    echo "=== Deployment Successful ==="
    echo "Service: $SERVICE_NAME"
    echo "Status: Running"
    echo "Port: 8100"
    echo ""
    echo "Health check: curl http://localhost:8100/health"
    echo "Logs: sudo journalctl -u $SERVICE_NAME -f"
else
    echo ""
    echo "=== Deployment Failed ==="
    echo "Check logs: sudo journalctl -u $SERVICE_NAME -n 50"
    exit 1
fi

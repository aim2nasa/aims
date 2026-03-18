#!/bin/bash
# RustDesk 포트 자동 제어 v3
# 규칙: docs/REMOTE_SUPPORT_PORT_RULES.md

PORTS_TCP="21115:21119"
PORT_UDP="21116"
STATUS_FILE="/tmp/rustdesk_port_status"
PID_FILE="/tmp/rustdesk_port_monitor.pid"
LOG_FILE="/tmp/rustdesk_port.log"

open_ports() {
    sudo ufw allow proto tcp to any port $PORTS_TCP comment "RustDesk-auto" >/dev/null 2>&1
    sudo ufw allow proto udp to any port $PORT_UDP comment "RustDesk-auto" >/dev/null 2>&1
}

close_ports() {
    sudo ufw delete allow proto tcp to any port $PORTS_TCP >/dev/null 2>&1
    sudo ufw delete allow proto udp to any port $PORT_UDP >/dev/null 2>&1
}

kill_monitor() {
    if [ -f "$PID_FILE" ]; then
        kill "$(cat "$PID_FILE")" 2>/dev/null
        rm -f "$PID_FILE"
    fi
    pkill -f "rustdesk_port_monitor" 2>/dev/null
}

case "$1" in
    start)
        # 기존 감시 프로세스 정리
        kill_monitor

        # 포트 열기
        open_ports
        echo "open" > "$STATUS_FILE"
        echo "$(date '+%H:%M:%S') 포트 개방" > "$LOG_FILE"

        # 감시 스크립트 생성 (변수 확장 방지: 'MONITOR')
        cat > /tmp/rustdesk_port_monitor.sh << 'MONITOR'
#!/bin/bash
# RustDesk 포트 감시 프로세스
# 규칙: 10분 연결 대기 → 세션 감시 → 끊김 시 즉시 닫기, 최대 30분

STATUS_FILE="/tmp/rustdesk_port_status"
PID_FILE="/tmp/rustdesk_port_monitor.pid"
LOG_FILE="/tmp/rustdesk_port.log"

WAIT_TIMEOUT=600   # 10분 연결 대기
MAX_OPEN=1800      # 최대 30분

start_time=$(date +%s)
connected_once=false

while true; do
    sleep 5
    now=$(date +%s)
    elapsed=$(( now - start_time ))

    # 최대 30분 초과 → 강제 닫기
    if [ "$elapsed" -ge "$MAX_OPEN" ]; then
        echo "$(date '+%H:%M:%S') 최대 30분 초과 — 포트 차단" >> "$LOG_FILE"
        sudo ufw delete allow proto tcp to any port 21115:21119 >/dev/null 2>&1
        sudo ufw delete allow proto udp to any port 21116 >/dev/null 2>&1
        echo "max_time" > "$STATUS_FILE"
        rm -f "$PID_FILE"
        exit 0
    fi

    # 릴레이(21117) 또는 시그널링(21116) ESTABLISHED 연결 확인
    conns=$(ss -tn state established | grep -cE ":2111[67]\b")

    if [ "$conns" -gt 0 ]; then
        # 연결 감지
        if [ "$connected_once" = false ]; then
            connected_once=true
            echo "$(date '+%H:%M:%S') 연결 감지" >> "$LOG_FILE"
            echo "connected" > "$STATUS_FILE"
        fi
    else
        # 연결 없음
        if [ "$connected_once" = true ]; then
            # 세션 중이었다가 끊김 → 즉시 닫기
            echo "$(date '+%H:%M:%S') 연결 종료 감지 — 포트 차단" >> "$LOG_FILE"
            sudo ufw delete allow proto tcp to any port 21115:21119 2>/dev/null
            sudo ufw delete allow proto udp to any port 21116 2>/dev/null
            echo "disconnected" > "$STATUS_FILE"
            rm -f "$PID_FILE"
            exit 0
        fi

        # 10분 대기 초과 (연결 없이)
        if [ "$elapsed" -ge "$WAIT_TIMEOUT" ]; then
            echo "$(date '+%H:%M:%S') 10분 대기 초과 — 포트 차단" >> "$LOG_FILE"
            sudo ufw delete allow proto tcp to any port 21115:21119 2>/dev/null
            sudo ufw delete allow proto udp to any port 21116 2>/dev/null
            echo "timeout" > "$STATUS_FILE"
            rm -f "$PID_FILE"
            exit 0
        fi
    fi
done
MONITOR
        chmod +x /tmp/rustdesk_port_monitor.sh
        nohup /tmp/rustdesk_port_monitor.sh >/dev/null 2>&1 &
        echo $! > "$PID_FILE"

        echo "{\"success\":true,\"status\":\"open\",\"monitor_pid\":$!}"
        ;;
    close)
        kill_monitor
        close_ports
        echo "closed" > "$STATUS_FILE"
        echo "$(date '+%H:%M:%S') 수동 닫기" >> "$LOG_FILE"
        echo "{\"success\":true,\"status\":\"closed\"}"
        ;;
    status)
        s="unknown"
        [ -f "$STATUS_FILE" ] && s=$(cat "$STATUS_FILE")
        pid="null"
        [ -f "$PID_FILE" ] && pid=$(cat "$PID_FILE")
        echo "{\"status\":\"$s\",\"monitor_pid\":$pid}"
        ;;
    *)
        echo "Usage: $0 {start|close|status}"
        exit 1
        ;;
esac

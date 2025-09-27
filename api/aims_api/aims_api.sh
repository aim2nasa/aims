  #!/bin/bash
  # aims_api.sh - AIMS API 서버 관리 스크립트 (문서 + 고객 관리)

  PORT=3010
  export PORT

  # 로그 디렉토리 생성
  LOG_DIR="./logs"
  mkdir -p $LOG_DIR

  # 함수들
  start_server() {
      if [ -f "$LOG_DIR/server.pid" ] && kill -0 $(cat $LOG_DIR/server.pid) 2>/dev/null; then
          echo "⚠️  서버가 이미 실행 중입니다. PID: $(cat $LOG_DIR/server.pid)"
          return 1
      fi

      echo "🚀 AIMS API 서버 시작 중..."
      nohup node server.js > $LOG_DIR/server.out 2> $LOG_DIR/server.err < /dev/null &
      echo $! > $LOG_DIR/server.pid

      sleep 2
      if kill -0 $(cat $LOG_DIR/server.pid) 2>/dev/null; then
          echo "✅ AIMS API 서버가 포트 $PORT에서 실행됨"
          echo "   로그: $LOG_DIR/server.out"
          echo "   에러: $LOG_DIR/server.err"
          echo "   PID:  $(cat $LOG_DIR/server.pid)"
      else
          echo "❌ 서버 시작 실패"
          cat $LOG_DIR/server.err
          return 1
      fi
  }

  stop_server() {
      if [ ! -f "$LOG_DIR/server.pid" ]; then
          echo "⚠️  PID 파일이 없습니다."
          return 1
      fi

      PID=$(cat $LOG_DIR/server.pid)
      if kill -0 $PID 2>/dev/null; then
          echo "🛑 서버 중지 중... PID: $PID"
          kill $PID
          sleep 2

          if kill -0 $PID 2>/dev/null; then
              echo "⚠️  강제 종료 중..."
              kill -9 $PID
          fi

          rm -f $LOG_DIR/server.pid
          echo "✅ 서버가 중지되었습니다."
      else
          echo "⚠️  서버가 실행 중이 아닙니다."
          rm -f $LOG_DIR/server.pid
      fi
  }

  status_server() {
      if [ -f "$LOG_DIR/server.pid" ] && kill -0 $(cat $LOG_DIR/server.pid) 2>/dev/null; then
          PID=$(cat $LOG_DIR/server.pid)
          echo "✅ 서버 실행 중 - PID: $PID, 포트: $PORT"
          echo "   메모리 사용량: $(ps -o pid,ppid,rss,vsize,pcpu,pmem,cmd -p $PID | tail -1)"
      else
          echo "❌ 서버가 실행 중이 아닙니다."
      fi
  }

  show_logs() {
      if [ "$1" = "error" ]; then
          echo "📋 에러 로그:"
          tail -f $LOG_DIR/server.err
      else
          echo "📋 서버 로그:"
          tail -f $LOG_DIR/server.out
      fi
  }

  # 명령어 처리
  case "$1" in
      start)
          start_server
          ;;
      stop)
          stop_server
          ;;
      restart)
          stop_server
          sleep 1
          start_server
          ;;
      status)
          status_server
          ;;
      logs)
          show_logs
          ;;
      error)
          show_logs error
          ;;
      *)
          echo "📖 사용법: $0 {start|stop|restart|status|logs|error}"
          echo ""
          echo "명령어:"
          echo "  start   - 서버 시작"
          echo "  stop    - 서버 중지"
          echo "  restart - 서버 재시작"
          echo "  status  - 서버 상태 확인"
          echo "  logs    - 실시간 로그 확인"
          echo "  error   - 실시간 에러 로그 확인"
          exit 1
          ;;
  esac

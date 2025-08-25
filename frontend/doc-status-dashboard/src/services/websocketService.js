class WebSocketService {
  constructor() {
    this.socket = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectInterval = 5000; // 5초
    this.listeners = new Map();
    this.isConnecting = false;
    this.isManualClose = false;
    this.pingInterval = null;
  }

  /**
   * WebSocket 연결
   * @param {string} url - WebSocket URL
   */
  connect(url) {
    if (this.isConnecting || (this.socket && this.socket.readyState === WebSocket.CONNECTING)) {
      return Promise.resolve();
    }

    this.isConnecting = true;
    this.isManualClose = false;

    return new Promise((resolve, reject) => {
      try {
        // 기존 연결이 있다면 정리
        this.cleanup();

        // WebSocket URL 변환 (HTTP -> WS)
        const wsUrl = url.replace(/^http/, 'ws');
        
        console.log(`Connecting to WebSocket: ${wsUrl}`);
        console.log('Original URL:', url);
        console.log('Converted WebSocket URL:', wsUrl);
        this.socket = new WebSocket(wsUrl);

        this.socket.onopen = (event) => {
          console.log('WebSocket connected');
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.emit('connected', event);
          
          // Ping 간격 설정 (서버의 ping보다 약간 짧게)
          this.startPingInterval();
          
          resolve();
        };

        this.socket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        this.socket.onclose = (event) => {
          console.log('WebSocket closed:', event.code, event.reason);
          this.isConnecting = false;
          this.stopPingInterval();
          this.emit('disconnected', event);

          // 수동 종료가 아니고 재연결 시도 횟수가 남아있다면 재연결
          if (!this.isManualClose && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect();
          }
        };

        this.socket.onerror = (error) => {
          console.error('WebSocket error details:', {
            error,
            readyState: this.socket.readyState,
            url: this.socket.url,
            timestamp: new Date().toISOString()
          });
          this.isConnecting = false;
          this.emit('error', error);
          reject(error);
        };

      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  /**
   * WebSocket 연결 해제
   */
  disconnect() {
    this.isManualClose = true;
    this.cleanup();
  }

  /**
   * 메시지 전송
   * @param {object} message - 전송할 메시지
   */
  send(message) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket is not connected');
    }
  }

  /**
   * 이벤트 리스너 등록
   * @param {string} event - 이벤트 이름
   * @param {function} callback - 콜백 함수
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  /**
   * 이벤트 리스너 해제
   * @param {string} event - 이벤트 이름
   * @param {function} callback - 콜백 함수
   */
  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * 이벤트 발생
   * @param {string} event - 이벤트 이름
   * @param {*} data - 이벤트 데이터
   */
  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in WebSocket event listener for ${event}:`, error);
        }
      });
    }
  }

  /**
   * 연결 상태 확인
   */
  isConnected() {
    return this.socket && this.socket.readyState === WebSocket.OPEN;
  }

  /**
   * 메시지 처리
   * @param {object} message - 수신된 메시지
   */
  handleMessage(message) {
    switch (message.type) {
      case 'initial_data':
        this.emit('initial_data', message.data);
        break;
      case 'document_update':
        this.emit('document_update', message.data);
        break;
      case 'database_empty':
        // 데이터베이스가 완전히 비어있을 때
        this.emit('database_empty', message.data);
        break;
      case 'status_update':
        // 전체 상태 업데이트 (문서 수 변화 등)
        this.emit('status_update', message.data);
        break;
      case 'ping':
        // 서버 ping에 pong으로 응답
        this.send({ type: 'pong', timestamp: new Date().toISOString() });
        this.emit('ping', message);
        break;
      default:
        console.log('Unknown message type:', message.type);
        this.emit('message', message);
    }
  }

  /**
   * 재연결 스케줄링
   */
  scheduleReconnect() {
    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectInterval * this.reconnectAttempts, 30000); // 최대 30초 대기
    
    console.log(`Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
    
    setTimeout(() => {
      if (!this.isManualClose && this.reconnectAttempts <= this.maxReconnectAttempts) {
        const wsUrl = this.socket?.url || 'ws://tars.giize.com:8080/ws';
        this.connect(wsUrl).catch(error => {
          console.error('Reconnect failed:', error);
        });
      }
    }, delay);
  }

  /**
   * Ping 간격 시작
   */
  startPingInterval() {
    this.stopPingInterval(); // 기존 간격 정리
    
    // 15초마다 클라이언트에서 ping 전송 (더 자주 체크)
    this.pingInterval = setInterval(() => {
      if (this.isConnected()) {
        this.send({ type: 'ping', timestamp: new Date().toISOString() });
      }
    }, 15000);
  }

  /**
   * Ping 간격 정지
   */
  stopPingInterval() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * 리소스 정리
   */
  cleanup() {
    this.stopPingInterval();
    
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onclose = null;
      this.socket.onerror = null;
      
      if (this.socket.readyState === WebSocket.OPEN || 
          this.socket.readyState === WebSocket.CONNECTING) {
        this.socket.close();
      }
      
      this.socket = null;
    }
  }

  /**
   * 통계 정보 반환
   */
  getStats() {
    return {
      connected: this.isConnected(),
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
      readyState: this.socket ? this.socket.readyState : -1,
      url: this.socket?.url || null
    };
  }
}

// WebSocket 서비스 인스턴스 생성 및 내보내기
const websocketService = new WebSocketService();

export default websocketService;
export { WebSocketService };
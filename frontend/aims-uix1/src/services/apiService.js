const API_BASE_URL = process.env.REACT_APP_API_URL || "http://tars.giize.com:8080";

// 통신 모드 관리 - Polling만 지원
class CommunicationManager {
  constructor() {
    this.mode = 'polling';
    this.listeners = new Map();
  }

  setMode(mode) {
    this.mode = mode;
    this.emit('modeChanged', mode);
  }

  getMode() {
    return this.mode;
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in communication event listener for ${event}:`, error);
        }
      });
    }
  }
}

export const communicationManager = new CommunicationManager();

// fetch 기반 API 서비스 (CORS 대응)
export const apiService = {
  // 헬스체크
  async checkHealth() {
    try {
      const response = await fetch(`${API_BASE_URL}/health`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        mode: "cors", // CORS 명시적 설정
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error("Health check failed:", error);
      throw error;
    }
  },

  // 최근 문서 목록 조회
  async getRecentDocuments(limit = 20) {
    try {
      const response = await fetch(`${API_BASE_URL}/status?limit=${limit}`, {
        method: "GET", 
        headers: {
          "Content-Type": "application/json",
        },
        mode: "cors",
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      // API 응답에서 documents 배열 반환
      return data.success ? data.data : data;
    } catch (error) {
      console.error("Get documents failed:", error);
      throw error;
    }
  },

  // 특정 문서 상태 조회
  async getDocumentStatus(documentId) {
    try {
      const response = await fetch(`${API_BASE_URL}/status/${documentId}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        mode: "cors",
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error("Get document status failed:", error);
      throw error;
    }
  },

  // 간단한 문서 상태 조회
  async getSimpleDocumentStatus(documentId) {
    try {
      const response = await fetch(`${API_BASE_URL}/status/${documentId}/simple`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        mode: "cors",
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error("Get simple document status failed:", error);
      throw error;
    }
  },


  // 현재 API 베이스 URL 반환
  getApiBaseUrl() {
    return API_BASE_URL;
  }
};

export default apiService;
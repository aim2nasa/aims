const API_BASE_URL = process.env.REACT_APP_API_URL || "http://tars.giize.com:8080";

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
      return await response.json();
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
};

export default apiService;
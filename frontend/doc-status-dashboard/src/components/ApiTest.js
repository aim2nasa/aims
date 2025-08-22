import React, { useState } from "react";
import apiService from "../services/apiService";

const ApiTest = () => {
  const [healthStatus, setHealthStatus] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const testApiHealth = async () => {
    try {
      setLoading(true);
      setError(null);
      const health = await apiService.checkHealth();
      setHealthStatus(health);
    } catch (err) {
      setError("API 서버에 연결할 수 없습니다. tars 서버 (http://tars.giize.com:8080)가 실행 중인지 확인하세요.");
      setHealthStatus(null);
      console.error("Health check error:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadDocuments = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiService.getRecentDocuments(5);
      setDocuments(data.documents || []);
    } catch (err) {
      setError("문서 목록을 불러올 수 없습니다. tars 서버의 API가 정상 작동하는지 확인하세요.");
      setDocuments([]);
      console.error("Load documents error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mt-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">API 연결 테스트</h2>
      <p className="text-sm text-gray-600 mb-4">
        연결 대상: <code className="bg-gray-100 px-2 py-1 rounded">{process.env.REACT_APP_API_URL || "http://tars.giize.com:8080"}</code>
      </p>
      
      <div className="space-y-4">
        <div>
          <button 
            onClick={testApiHealth}
            disabled={loading}
            className="btn-primary mr-3"
          >
            {loading ? "테스트 중..." : "헬스체크 테스트"}
          </button>
          <button 
            onClick={loadDocuments}
            disabled={loading}
            className="btn-secondary"
          >
            {loading ? "로딩 중..." : "문서 목록 로드"}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700 font-medium">🚨 연결 실패</p>
            <p className="text-red-600 text-sm mt-1">{error}</p>
            <div className="mt-2 text-xs text-red-500">
              <p>• 네트워크 연결을 확인하세요</p>
              <p>• tars 서버의 Document Status API가 실행 중인지 확인하세요</p>
              <p>• CORS 설정이 올바른지 확인하세요</p>
            </div>
          </div>
        )}

        {healthStatus && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h3 className="font-semibold text-green-800">✅ API 서버 연결 성공!</h3>
            <p className="text-green-700 text-sm mt-1">tars 서버와 정상적으로 연결되었습니다.</p>
            <pre className="text-sm text-green-700 mt-2 bg-green-100 p-2 rounded overflow-auto">
              {JSON.stringify(healthStatus, null, 2)}
            </pre>
          </div>
        )}

        {documents.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-800 mb-2">📋 최근 문서 목록 ({documents.length}개)</h3>
            <div className="space-y-2">
              {documents.map((doc, index) => (
                <div key={index} className="bg-white p-3 rounded border">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">{doc.filename || `Document ${index + 1}`}</p>
                      <p className="text-sm text-gray-500">ID: {doc.id?.slice(-8)}...</p>
                    </div>
                    <div className="text-right">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        doc.status === "completed" ? "bg-green-100 text-green-800" :
                        doc.status === "processing" ? "bg-blue-100 text-blue-800" :
                        doc.status === "error" ? "bg-red-100 text-red-800" :
                        "bg-gray-100 text-gray-800"
                      }`}>
                        {doc.status} ({doc.progress}%)
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ApiTest;
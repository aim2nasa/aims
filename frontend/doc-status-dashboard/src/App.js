import React, { useState, useEffect, useCallback } from "react";
import { RefreshCw, Search, Wifi, WifiOff, FileText, Clock, CheckCircle, AlertCircle, XCircle, Copy } from "lucide-react";

// API 서비스
const API_BASE_URL = process.env.REACT_APP_API_URL || "http://tars.giize.com:8080";

const apiService = {
  async checkHealth() {
    const response = await fetch(`${API_BASE_URL}/health`, { mode: "cors" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  },
  async getRecentDocuments(limit = 20) {
    const response = await fetch(`${API_BASE_URL}/status?limit=${limit}`, { mode: "cors" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  },
  async getDocumentStatus(documentId) {
    const response = await fetch(`${API_BASE_URL}/status/${documentId}`, { mode: "cors" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  }
};

// 파일명 추출 함수 (MongoDB 구조에 맞춤)
const extractFilename = (document) => {
  // MongoDB 구조에서 originalName 우선 추출
  if (document.upload) {
    let uploadData = document.upload;
    if (typeof uploadData === 'string') {
      try {
        uploadData = JSON.parse(uploadData);
      } catch (e) {}
    }
    if (uploadData && uploadData.originalName) {
      return uploadData.originalName;
    }
  }
  
  // stages.upload에서 originalName 찾기
  if (document.stages && document.stages.upload) {
    let uploadData = document.stages.upload;
    if (typeof uploadData === 'string') {
      try {
        uploadData = JSON.parse(uploadData);
      } catch (e) {}
    }
    if (uploadData && uploadData.originalName) {
      return uploadData.originalName;
    }
  }
  
  // 기본 필드에서 찾기
  let filename = document.filename || document.file_name || document.name || document.title;
  if (filename) return filename;
  
  // Meta에서 filename 찾기 (saveName일 가능성)
  if (document.meta) {
    let metaData = document.meta;
    if (typeof metaData === 'string') {
      try {
        metaData = JSON.parse(metaData);
      } catch (e) {}
    }
    if (metaData && metaData.filename) {
      return metaData.filename;
    }
  }
  
  if (document.stages && document.stages.meta) {
    let metaData = document.stages.meta;
    if (typeof metaData === 'string') {
      try {
        metaData = JSON.parse(metaData);
      } catch (e) {}
    }
    if (metaData && metaData.filename) {
      return metaData.filename;
    }
  }
  
  // 모든 단계에서 찾기
  if (document.stages) {
    for (const [key, value] of Object.entries(document.stages)) {
      let data = value;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch (e) {
          continue;
        }
      }
      if (data && (data.originalName || data.filename)) {
        return data.originalName || data.filename;
      }
    }
  }
  
  return "Unknown File";
};

// saveName 추출 함수 (부가 정보용)
const extractSaveName = (document) => {
  // MongoDB 구조에서 saveName 추출
  if (document.upload) {
    let uploadData = document.upload;
    if (typeof uploadData === 'string') {
      try {
        uploadData = JSON.parse(uploadData);
      } catch (e) {}
    }
    if (uploadData && uploadData.saveName) {
      return uploadData.saveName;
    }
  }
  
  // stages.upload에서 saveName 찾기
  if (document.stages && document.stages.upload) {
    let uploadData = document.stages.upload;
    if (typeof uploadData === 'string') {
      try {
        uploadData = JSON.parse(uploadData);
      } catch (e) {}
    }
    if (uploadData && uploadData.saveName) {
      return uploadData.saveName;
    }
  }
  
  return null;
};

// 상태 뱃지 컴포넌트
const StatusBadge = ({ status, size = "medium" }) => {
  const configs = {
    completed: { icon: CheckCircle, label: "Completed", className: "bg-green-100 text-green-800" },
    processing: { icon: Clock, label: "Processing", className: "bg-blue-100 text-blue-800" },
    error: { icon: XCircle, label: "Error", className: "bg-red-100 text-red-800" },
    pending: { icon: AlertCircle, label: "Pending", className: "bg-gray-100 text-gray-800" }
  };
  
  const config = configs[status] || configs.pending;
  const Icon = config.icon;
  const sizeClass = size === "small" ? "text-xs px-2 py-1" : "text-sm px-3 py-1";
  const iconSize = size === "small" ? "w-3 h-3" : "w-4 h-4";
  
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${config.className} ${sizeClass}`}>
      <Icon className={`${iconSize} mr-1`} />
      {config.label}
    </span>
  );
};

// 진행률 바 컴포넌트
const ProgressBar = ({ progress, status }) => {
  const colorMap = {
    completed: "bg-green-500",
    processing: "bg-blue-500", 
    error: "bg-red-500",
    pending: "bg-gray-400"
  };
  
  return (
    <div className="w-full">
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div 
          className={`h-2 rounded-full transition-all duration-500 ${colorMap[status] || colorMap.pending} ${
            status === "processing" ? "animate-pulse" : ""
          }`}
          style={{ width: `${Math.min(progress || 0, 100)}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-500 mt-1">
        <span>{progress || 0}%</span>
        <span className="capitalize">{status || 'pending'}</span>
      </div>
    </div>
  );
};

// ID 복사 컴포넌트
const CopyableId = ({ id }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="flex items-center space-x-1 text-xs text-gray-500 font-mono bg-gray-50 px-2 py-1 rounded">
      <span className="truncate" title={id}>
        {id}
      </span>
      <button
        onClick={handleCopy}
        className="text-gray-400 hover:text-gray-600 flex-shrink-0"
        title="Copy ID"
      >
        {copied ? (
          <CheckCircle className="w-3 h-3 text-green-500" />
        ) : (
          <Copy className="w-3 h-3" />
        )}
      </button>
    </div>
  );
};

// 문서 카드 컴포넌트
const DocumentCard = ({ document, onClick }) => {
  const formatDate = (dateString) => {
    if (!dateString) return "Unknown";
    return new Date(dateString).toLocaleString();
  };

  const truncateFilename = (filename, maxLength = 30) => {
    if (!filename) return "Unknown File";
    return filename.length <= maxLength ? filename : filename.substring(0, maxLength - 3) + "...";
  };

  const filename = extractFilename(document);

  return (
    <div 
      className="bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-all duration-200 cursor-pointer border-l-4 border-l-blue-500"
      onClick={() => onClick(document)}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start space-x-3 min-w-0 flex-1">
          <div className="bg-blue-50 p-2 rounded-lg flex-shrink-0">
            <FileText className="w-5 h-5 text-blue-500" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-gray-900 text-sm leading-tight mb-1" title={filename}>
              {truncateFilename(filename)}
            </h3>
            <CopyableId id={document.id || document._id || 'unknown-id'} />
          </div>
        </div>
        <div className="flex-shrink-0">
          <StatusBadge status={document.status || 'pending'} size="small" />
        </div>
      </div>
      
      <div className="mb-3">
        <ProgressBar progress={document.progress || 0} status={document.status || 'pending'} />
      </div>
      
      <div className="text-xs text-gray-500">
        <div className="flex items-center">
          <Clock className="w-3 h-3 mr-1" />
          {formatDate(document.uploaded_at || document.created_at || document.timestamp)}
        </div>
      </div>
    </div>
  );
};

// 상세 정보 모달
const DocumentDetailModal = ({ document, isOpen, onClose }) => {
  if (!isOpen || !document) return null;

  const filename = extractFilename(document);
  const saveName = extractSaveName(document);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* 헤더 - 고정 */}
        <div className="flex items-center justify-between p-6 border-b flex-shrink-0">
          <div className="flex items-center space-x-3">
            <FileText className="w-6 h-6 text-blue-500" />
            <div>
              <h2 className="text-xl font-semibold">{filename}</h2>
              {saveName && saveName !== filename && (
                <p className="text-sm text-gray-500 mt-1">Server file: {saveName}</p>
              )}
              <CopyableId id={document.id || document._id || 'unknown-id'} />
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <XCircle className="w-6 h-6" />
          </button>
        </div>
        
        {/* 콘텐츠 영역 - 스크롤 가능 */}
        <div className="p-6 overflow-y-auto flex-1">
          <div className="space-y-4">
            <div>
              <h3 className="font-medium text-gray-900 mb-2">Processing Progress</h3>
              <ProgressBar progress={document.progress || 0} status={document.status || 'pending'} />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium text-gray-600">Status:</span>
                <div className="mt-1">
                  <StatusBadge status={document.status || 'pending'} />
                </div>
              </div>
              <div>
                <span className="font-medium text-gray-600">Progress:</span>
                <p className="text-gray-900">{document.progress || 0}%</p>
              </div>
              <div>
                <span className="font-medium text-gray-600">Original Name:</span>
                <p className="text-gray-900 break-all">{filename}</p>
              </div>
              {saveName && saveName !== filename && (
                <div>
                  <span className="font-medium text-gray-600">Server File:</span>
                  <p className="text-gray-900 break-all font-mono text-xs">{saveName}</p>
                </div>
              )}
              <div>
                <span className="font-medium text-gray-600">Uploaded:</span>
                <p className="text-gray-900">
                  {document.uploaded_at ? new Date(document.uploaded_at).toLocaleString() : 'Unknown'}
                </p>
              </div>
              <div className="md:col-span-2">
                <span className="font-medium text-gray-600">Document ID:</span>
                <div className="mt-1">
                  <CopyableId id={document.id || document._id || 'unknown-id'} />
                </div>
              </div>
            </div>

            {document.stages && (
              <div className="mt-6">
                <h3 className="font-medium text-gray-900 mb-3">Processing Stages</h3>
                <div className="space-y-3">
                  {Object.entries(document.stages).map(([stage, data]) => (
                    <div key={stage} className="bg-gray-50 rounded p-3">
                      <h4 className="font-medium text-gray-800 capitalize">{stage}</h4>
                      <pre className="text-xs text-gray-600 mt-1 overflow-auto whitespace-pre-wrap">
                        {JSON.stringify(data, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* 푸터 - 고정 */}
        <div className="flex justify-end p-6 border-t bg-gray-50 flex-shrink-0">
          <button 
            onClick={onClose} 
            className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// 메인 앱 컴포넌트
function App() {
  const [documents, setDocuments] = useState([]);
  const [filteredDocuments, setFilteredDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [apiHealth, setApiHealth] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isPollingEnabled, setIsPollingEnabled] = useState(true);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // 문서 목록 가져오기
  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiService.getRecentDocuments(20);
      setDocuments(data.documents || []);
      setLastUpdated(new Date());
    } catch (err) {
      setError("문서 목록을 불러올 수 없습니다.");
      console.error("Fetch documents error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // API 헬스 체크
  const checkApiHealth = useCallback(async () => {
    try {
      await apiService.checkHealth();
      setApiHealth(true);
    } catch (err) {
      setApiHealth(false);
    }
  }, []);

  // 초기 로드
  useEffect(() => {
    fetchDocuments();
    checkApiHealth();
  }, [fetchDocuments, checkApiHealth]);

  // 실시간 폴링 (5초마다)
  useEffect(() => {
    if (!isPollingEnabled) return;
    
    const interval = setInterval(() => {
      fetchDocuments();
      checkApiHealth();
    }, 5000);
    
    return () => clearInterval(interval);
  }, [isPollingEnabled, fetchDocuments, checkApiHealth]);

  // 검색 및 필터링
  useEffect(() => {
    let filtered = documents;
    
    if (searchTerm) {
      filtered = filtered.filter(doc => {
        const filename = extractFilename(doc);
        const id = doc.id || doc._id || '';
        return filename.toLowerCase().includes(searchTerm.toLowerCase()) ||
               id.toLowerCase().includes(searchTerm.toLowerCase());
      });
    }
    
    if (statusFilter !== "all") {
      filtered = filtered.filter(doc => (doc.status || 'pending') === statusFilter);
    }
    
    setFilteredDocuments(filtered);
  }, [documents, searchTerm, statusFilter]);

  // 상태별 통계
  const statusCounts = documents.reduce((acc, doc) => {
    const status = doc.status || 'pending';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  const handleDocumentClick = async (document) => {
    try {
      const detailData = await apiService.getDocumentStatus(document.id);
      setSelectedDocument(detailData);
      setShowDetailModal(true);
    } catch (err) {
      console.error("Failed to fetch document details:", err);
      setSelectedDocument(document);
      setShowDetailModal(true);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 헤더 */}
      <header className="bg-white shadow-sm border-b flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center py-4 space-y-4 sm:space-y-0">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Document Status Dashboard</h1>
                <p className="text-sm text-gray-500">Real-time document processing monitor</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* API 연결 상태 */}
              <div className="flex items-center space-x-2">
                {apiHealth ? <Wifi className="w-4 h-4 text-green-500" /> : <WifiOff className="w-4 h-4 text-red-500" />}
                <span className={`text-sm ${apiHealth ? "text-green-600" : "text-red-600"}`}>
                  {apiHealth ? "Connected" : "Disconnected"}
                </span>
              </div>
              
              {/* 폴링 상태 */}
              <button
                onClick={() => setIsPollingEnabled(!isPollingEnabled)}
                className={`flex items-center space-x-2 px-3 py-1 rounded-lg text-sm transition-colors ${
                  isPollingEnabled ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${isPollingEnabled ? "bg-green-500 animate-pulse" : "bg-gray-500"}`} />
                {isPollingEnabled ? "Live" : "Paused"}
              </button>
              
              {/* 새로고침 버튼 */}
              <button 
                onClick={fetchDocuments} 
                disabled={loading} 
                className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* 통계 대시보드 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white p-4 rounded-lg shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total</p>
                  <p className="text-xl lg:text-2xl font-bold text-gray-900">{documents.length}</p>
                </div>
                <FileText className="w-6 h-6 lg:w-8 lg:h-8 text-blue-500" />
              </div>
            </div>
            
            <div className="bg-white p-4 rounded-lg shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Completed</p>
                  <p className="text-xl lg:text-2xl font-bold text-green-600">{statusCounts.completed || 0}</p>
                </div>
                <CheckCircle className="w-6 h-6 lg:w-8 lg:h-8 text-green-500" />
              </div>
            </div>
            
            <div className="bg-white p-4 rounded-lg shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Processing</p>
                  <p className="text-xl lg:text-2xl font-bold text-blue-600">{statusCounts.processing || 0}</p>
                </div>
                <Clock className="w-6 h-6 lg:w-8 lg:h-8 text-blue-500" />
              </div>
            </div>
            
            <div className="bg-white p-4 rounded-lg shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Errors</p>
                  <p className="text-xl lg:text-2xl font-bold text-red-600">{statusCounts.error || 0}</p>
                </div>
                <XCircle className="w-6 h-6 lg:w-8 lg:h-8 text-red-500" />
              </div>
            </div>
          </div>

          {/* 검색 및 필터 */}
          <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0 lg:space-x-4">
              <div className="flex-1 max-w-md">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by filename or document ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="processing">Processing</option>
                  <option value="completed">Completed</option>
                  <option value="error">Error</option>
                </select>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mt-4 pt-4 border-t space-y-2 sm:space-y-0">
              <span className="text-sm text-gray-600">
                Showing <strong>{filteredDocuments.length}</strong> of <strong>{documents.length}</strong> documents
              </span>
              {lastUpdated && (
                <span className="text-sm text-gray-500">
                  Last updated: {lastUpdated.toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>

          {/* 에러 표시 */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {/* 문서 그리드 */}
          {loading && documents.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mr-3" />
              <span className="text-gray-600">Loading documents...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
              {filteredDocuments.map((document) => (
                <DocumentCard 
                  key={document.id || document._id || Math.random()} 
                  document={document}
                  onClick={handleDocumentClick}
                />
              ))}
            </div>
          )}

          {/* 빈 상태 */}
          {!loading && filteredDocuments.length === 0 && !error && (
            <div className="text-center py-12">
              <FileText className="w-16 h-16 lg:w-24 lg:h-24 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No documents found</h3>
              <p className="text-gray-500 text-sm">
                {searchTerm || statusFilter !== "all" 
                  ? "Try adjusting your search or filter criteria."
                  : "No documents have been uploaded yet."
                }
              </p>
            </div>
          )}
        </div>
      </main>

      {/* 푸터 */}
      <footer className="bg-white border-t flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row justify-between items-center text-sm text-gray-500 space-y-2 sm:space-y-0">
            <div>
              Connected to: <code className="bg-gray-100 px-2 py-1 rounded text-xs">tars.giize.com:8080</code>
            </div>
            <div>
              Auto-refresh: {isPollingEnabled ? "Enabled (5s)" : "Disabled"}
            </div>
          </div>
        </div>
      </footer>

      {/* 상세 정보 모달 */}
      <DocumentDetailModal 
        document={selectedDocument}
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
      />
    </div>
  );
}

export default App;
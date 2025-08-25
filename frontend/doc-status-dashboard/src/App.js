import React, { useState, useEffect, useCallback } from "react";
import { RefreshCw, Search, Wifi, WifiOff, FileText, Clock, CheckCircle, AlertCircle, XCircle, Copy, Grid3X3, List, ChevronLeft, ChevronRight, Radio, Zap } from "lucide-react";
import websocketService from "./services/websocketService";
import apiService, { communicationManager } from "./services/apiService";

// MongoDB 필드 추출 함수들
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

const extractStatus = (document) => {
  // 기본 status 필드
  if (document.status) return document.status;
  
  // meta에서 status 찾기
  if (document.meta) {
    let metaData = document.meta;
    if (typeof metaData === 'string') {
      try {
        metaData = JSON.parse(metaData);
      } catch (e) {}
    }
    if (metaData && metaData.meta_status) {
      return metaData.meta_status === 'ok' ? 'completed' : metaData.meta_status;
    }
  }
  
  // stages에서 status 찾기
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
      if (data && data.status) {
        return data.status === 'completed' ? 'completed' : data.status;
      }
    }
  }
  
  return 'pending';
};

const extractProgress = (document) => {
  // 기본 progress 필드
  if (document.progress) return document.progress;
  
  // 상태에 따른 추정 진행률
  const status = extractStatus(document);
  switch (status) {
    case 'completed': return 100;
    case 'processing': return 50;
    case 'error': return 0;
    case 'pending': return 0;
    default: return 0;
  }
};

const extractUploadedDate = (document) => {
  let dateString = null;
  
  // upload.uploaded_at 우선
  if (document.upload) {
    let uploadData = document.upload;
    if (typeof uploadData === 'string') {
      try {
        uploadData = JSON.parse(uploadData);
      } catch (e) {}
    }
    if (uploadData && uploadData.uploaded_at) {
      dateString = uploadData.uploaded_at;
    }
  }
  
  // stages.upload.uploaded_at
  if (!dateString && document.stages && document.stages.upload) {
    let uploadData = document.stages.upload;
    if (typeof uploadData === 'string') {
      try {
        uploadData = JSON.parse(uploadData);
      } catch (e) {}
    }
    if (uploadData && uploadData.uploaded_at) {
      dateString = uploadData.uploaded_at;
    }
  }
  
  // meta.created_at
  if (!dateString && document.meta) {
    let metaData = document.meta;
    if (typeof metaData === 'string') {
      try {
        metaData = JSON.parse(metaData);
      } catch (e) {}
    }
    if (metaData && metaData.created_at) {
      dateString = metaData.created_at;
    }
  }
  
  // stages.meta.created_at
  if (!dateString && document.stages && document.stages.meta) {
    let metaData = document.stages.meta;
    if (typeof metaData === 'string') {
      try {
        metaData = JSON.parse(metaData);
      } catch (e) {}
    }
    if (metaData && metaData.created_at) {
      dateString = metaData.created_at;
    }
  }
  
  // 기본 필드들
  if (!dateString) {
    dateString = document.uploaded_at || document.created_at || document.timestamp;
  }
  
  // 날짜 문자열 정리 (xxx 제거 등)
  if (dateString && typeof dateString === 'string') {
    dateString = dateString.replace(/xxx$/, ''); // 끝의 xxx 제거
    dateString = dateString.replace(/\.\d{3}xxx$/, ''); // .123xxx 패턴 제거
  }
  
  return dateString;
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

// 페이지네이션 컴포넌트
const Pagination = ({ currentPage, totalPages, itemsPerPage, totalItems, onPageChange, onItemsPerPageChange }) => {
  const getPageNumbers = () => {
    const delta = 2;
    const range = [];
    const rangeWithDots = [];

    for (let i = Math.max(2, currentPage - delta); i <= Math.min(totalPages - 1, currentPage + delta); i++) {
      range.push(i);
    }

    if (currentPage - delta > 2) {
      rangeWithDots.push(1, '...');
    } else {
      rangeWithDots.push(1);
    }

    rangeWithDots.push(...range);

    if (currentPage + delta < totalPages - 1) {
      rangeWithDots.push('...', totalPages);
    } else if (totalPages > 1) {
      rangeWithDots.push(totalPages);
    }

    return rangeWithDots;
  };

  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  return (
    <div className="bg-white rounded-lg shadow-sm p-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0">
        {/* 페이지 정보 및 개수 설정 */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-4">
          <span className="text-sm text-gray-700">
            Showing <strong>{startItem}</strong> to <strong>{endItem}</strong> of <strong>{totalItems}</strong> documents
          </span>
          
          <div className="flex items-center space-x-2">
            <label className="text-sm text-gray-600">Show:</label>
            <select
              value={itemsPerPage}
              onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
              className="border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span className="text-sm text-gray-600">per page</span>
          </div>
        </div>

        {/* 페이지네이션 버튼 */}
        {totalPages > 1 && (
          <div className="flex items-center space-x-1">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {getPageNumbers().map((page, index) => (
              <React.Fragment key={index}>
                {page === '...' ? (
                  <span className="px-3 py-2 text-sm text-gray-500">...</span>
                ) : (
                  <button
                    onClick={() => onPageChange(page)}
                    className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                      currentPage === page
                        ? 'bg-blue-500 text-white'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {page}
                  </button>
                )}
              </React.Fragment>
            ))}

            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
const DocumentListView = ({ documents, onDocumentClick }) => {
  const formatDate = (dateString) => {
    if (!dateString) return "Unknown";
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const truncateFilename = (filename, maxLength = 50) => {
    if (!filename) return "Unknown File";
    return filename.length <= maxLength ? filename : filename.substring(0, maxLength - 3) + "...";
  };

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Document
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Progress
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Uploaded
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Document ID
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {documents.map((document) => {
              const filename = extractFilename(document);
              const status = extractStatus(document);
              const progress = extractProgress(document);
              const uploadedDate = extractUploadedDate(document);
              
              return (
                <tr 
                  key={document.id || document._id || Math.random()}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => onDocumentClick(document)}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div className="bg-blue-50 p-2 rounded-lg mr-3">
                        <FileText className="w-4 h-4 text-blue-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate" title={filename}>
                          {truncateFilename(filename)}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={status} size="small" />
                  </td>
                  <td className="px-6 py-4">
                    <div className="w-full max-w-xs">
                      <div className="flex items-center space-x-3">
                        <div className="flex-1">
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className={`h-2 rounded-full transition-all duration-500 ${
                                status === "completed" ? "bg-green-500" :
                                status === "processing" ? "bg-blue-500" :
                                status === "error" ? "bg-red-500" : "bg-gray-400"
                              } ${status === "processing" ? "animate-pulse" : ""}`}
                              style={{ width: `${Math.min(progress || 0, 100)}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-xs text-gray-500 font-medium min-w-[2.5rem]">
                          {progress || 0}%
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-500">
                      {formatDate(uploadedDate)}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-xs font-mono text-gray-400 max-w-[8rem]">
                      <span className="truncate block" title={document.id || document._id || 'unknown-id'}>
                        {(document.id || document._id || 'unknown-id').slice(0, 12)}...
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
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
  const status = extractStatus(document);
  const progress = extractProgress(document);
  const uploadedDate = extractUploadedDate(document);

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
          <StatusBadge status={status} size="small" />
        </div>
      </div>
      
      <div className="mb-3">
        <ProgressBar progress={progress} status={status} />
      </div>
      
      <div className="text-xs text-gray-500">
        <div className="flex items-center">
          <Clock className="w-3 h-3 mr-1" />
          {formatDate(uploadedDate)}
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
  const status = extractStatus(document);
  const progress = extractProgress(document);
  const uploadedDate = extractUploadedDate(document);

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
              <ProgressBar progress={progress} status={status} />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium text-gray-600">Status:</span>
                <div className="mt-1">
                  <StatusBadge status={status} />
                </div>
              </div>
              <div>
                <span className="font-medium text-gray-600">Progress:</span>
                <p className="text-gray-900">{progress}%</p>
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
                  {uploadedDate ? new Date(uploadedDate).toLocaleString() : 'Unknown'}
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
  const [paginatedDocuments, setPaginatedDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [apiHealth, setApiHealth] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isPollingEnabled, setIsPollingEnabled] = useState(true);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [viewMode, setViewMode] = useState("grid"); // "grid" or "list"
  
  // 통신 관련 상태
  const [communicationMode, setCommunicationMode] = useState('polling'); // 'polling' | 'websocket'
  const [wsConnected, setWsConnected] = useState(false);
  const [wsStats, setWsStats] = useState(null);
  
  // 페이지네이션 상태
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  // 문서 목록 가져오기
  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      // 더 많은 문서를 가져와서 클라이언트 사이드 페이지네이션 지원
      const data = await apiService.getRecentDocuments(1000);
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

  // WebSocket 연결 설정
  const setupWebSocket = useCallback(() => {
    const wsUrl = apiService.getWebSocketUrl();
    
    // WebSocket 이벤트 리스너 설정
    const handleConnected = () => {
      console.log('WebSocket connected');
      setWsConnected(true);
      setError(null);
    };

    const handleDisconnected = () => {
      console.log('WebSocket disconnected');
      setWsConnected(false);
    };

    const handleError = (error) => {
      console.error('WebSocket error:', error);
      setWsConnected(false);
      setError('WebSocket 연결에 실패했습니다.');
    };

    const handleInitialData = (data) => {
      console.log('Received initial data:', data);
      setDocuments(data.documents || []);
      setLastUpdated(new Date(data.timestamp));
      setLoading(false);
    };

    const handleDocumentUpdate = (data) => {
      console.log('WebSocket 업데이트 수신:', data.filename, data.id);
      console.log('업데이트 데이터 전체:', data);
      
      setDocuments(prevDocs => {
        console.log('현재 문서 수:', prevDocs.length);
        const updatedDocs = [...prevDocs];
        const index = updatedDocs.findIndex(doc => (doc.id || doc._id) === data.id);
        console.log('문서 찾기 결과 - 인덱스:', index, '찾은 ID:', data.id);
        
        if (index >= 0) {
          // 기존 문서 업데이트
          console.log('기존 문서 업데이트');
          updatedDocs[index] = {
            ...updatedDocs[index],
            ...data,
            _id: data.id,
            id: data.id
          };
        } else {
          // 새 문서 추가
          console.log('새 문서 추가:', data.filename);
          updatedDocs.unshift({
            ...data,
            _id: data.id,
            id: data.id
          });
        }
        
        console.log('업데이트 후 문서 수:', updatedDocs.length);
        return updatedDocs;
      });
      setLastUpdated(new Date());
    };

    const handleDatabaseEmpty = (data) => {
      console.log('Database is empty - received empty state:', data);
      setDocuments([]); // 모든 문서 제거
      setLastUpdated(new Date(data.timestamp));
      setLoading(false);
    };

    const handleStatusUpdate = (data) => {
      console.log('Status update received:', data);
      // 전체 문서 목록으로 상태 업데이트
      if (data.documents && Array.isArray(data.documents)) {
        setDocuments(data.documents);
        console.log(`Document count changed: ${data.previous_count} -> ${data.current_count}`);
      }
      setLastUpdated(new Date(data.timestamp));
    };

    // 이벤트 리스너 등록
    websocketService.on('connected', handleConnected);
    websocketService.on('disconnected', handleDisconnected);
    websocketService.on('error', handleError);
    websocketService.on('initial_data', handleInitialData);
    websocketService.on('document_update', handleDocumentUpdate);
    websocketService.on('database_empty', handleDatabaseEmpty);
    websocketService.on('status_update', handleStatusUpdate);

    // WebSocket 연결
    websocketService.connect(wsUrl).catch(error => {
      console.error('Failed to connect WebSocket:', error);
      setError('WebSocket 연결에 실패했습니다.');
    });

    // 정리 함수 반환
    return () => {
      websocketService.off('connected', handleConnected);
      websocketService.off('disconnected', handleDisconnected);
      websocketService.off('error', handleError);
      websocketService.off('initial_data', handleInitialData);
      websocketService.off('document_update', handleDocumentUpdate);
      websocketService.off('database_empty', handleDatabaseEmpty);
      websocketService.off('status_update', handleStatusUpdate);
    };
  }, []);

  // 통신 모드 전환
  const switchCommunicationMode = useCallback((mode) => {
    if (mode === communicationMode) return;

    console.log(`Switching communication mode from ${communicationMode} to ${mode}`);
    
    if (mode === 'websocket') {
      // 폴링 중지하고 WebSocket 연결
      setIsPollingEnabled(false);
      setLoading(true);
      setupWebSocket();
    } else {
      // WebSocket 연결 해제하고 폴링 시작
      websocketService.disconnect();
      setWsConnected(false);
      setIsPollingEnabled(true);
      fetchDocuments();
    }

    setCommunicationMode(mode);
    communicationManager.setMode(mode);
  }, [communicationMode, setupWebSocket, fetchDocuments]);

  // WebSocket 통계 조회
  const fetchWebSocketStats = useCallback(async () => {
    if (communicationMode === 'websocket') {
      try {
        const stats = await apiService.checkWebSocketHealth();
        setWsStats(stats);
      } catch (err) {
        console.error('Failed to fetch WebSocket stats:', err);
      }
    }
  }, [communicationMode]);

  // 초기 로드
  useEffect(() => {
    fetchDocuments();
    checkApiHealth();
  }, [fetchDocuments, checkApiHealth]);

  // 실시간 폴링 (5초마다) - 폴링 모드일 때만
  useEffect(() => {
    if (!isPollingEnabled || communicationMode !== 'polling') return;
    
    const interval = setInterval(() => {
      fetchDocuments();
      checkApiHealth();
    }, 5000);
    
    return () => clearInterval(interval);
  }, [isPollingEnabled, communicationMode, fetchDocuments, checkApiHealth]);

  // WebSocket 통계 폴링 (10초마다)
  useEffect(() => {
    if (communicationMode !== 'websocket') return;
    
    const interval = setInterval(() => {
      fetchWebSocketStats();
    }, 10000);
    
    // 즉시 한 번 실행
    fetchWebSocketStats();
    
    return () => clearInterval(interval);
  }, [communicationMode, fetchWebSocketStats]);

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
      filtered = filtered.filter(doc => extractStatus(doc) === statusFilter);
    }
    
    setFilteredDocuments(filtered);
  }, [documents, searchTerm, statusFilter]);

  // 필터 조건 변경 시에만 페이지 리셋 (문서 업데이트는 제외)
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  // 페이지네이션 적용
  useEffect(() => {
    // 현재 페이지가 유효 범위를 벗어나면 조정
    const maxPage = Math.ceil(filteredDocuments.length / itemsPerPage) || 1;
    if (currentPage > maxPage) {
      setCurrentPage(maxPage);
      return;
    }
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginated = filteredDocuments.slice(startIndex, endIndex);
    setPaginatedDocuments(paginated);
  }, [filteredDocuments, currentPage, itemsPerPage]);

  // 페이지네이션 관련 계산
  const totalPages = Math.ceil(filteredDocuments.length / itemsPerPage);

  const handlePageChange = (page) => {
    setCurrentPage(page);
    // 페이지 변경 시 최상단으로 스크롤
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleItemsPerPageChange = (newItemsPerPage) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1); // 개수 변경 시 첫 페이지로 리셋
  };

  // 상태별 통계 (전체 문서 기준)
  const statusCounts = documents.reduce((acc, doc) => {
    const status = extractStatus(doc);
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  const handleDocumentClick = async (document) => {
    // 먼저 메인 리스트 데이터로 모달 열기 (일관성 보장)
    setSelectedDocument(document);
    setShowDetailModal(true);
    
    // 백그라운드에서 상세 데이터 로드하여 Processing Stages 등 추가 정보 제공
    try {
      const detailData = await apiService.getDocumentStatus(document.id || document._id);
      if (detailData) {
        // 기본 정보는 메인 데이터 유지, 상세 정보(stages)만 병합
        const mergedData = {
          ...document, // 메인 데이터 우선 (일관성 보장)
          stages: detailData.stages || document.stages, // 상세 stages 정보 추가
          // 추가 상세 정보가 있다면 여기에 병합
        };
        setSelectedDocument(mergedData);
      }
    } catch (err) {
      console.error("Failed to fetch document details:", err);
      // 메인 데이터만으로도 모달이 정상 작동
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
              {/* 통신 모드 선택 */}
              <div className="flex items-center space-x-2">
                <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
                  <button
                    onClick={() => switchCommunicationMode('polling')}
                    className={`px-3 py-1 flex items-center space-x-2 text-sm transition-colors ${
                      communicationMode === 'polling' 
                        ? "bg-blue-500 text-white" 
                        : "bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                    title="Polling Mode"
                  >
                    <Radio className="w-3 h-3" />
                    <span className="hidden sm:inline">Polling</span>
                  </button>
                  <button
                    onClick={() => switchCommunicationMode('websocket')}
                    disabled={false}
                    className={`px-3 py-1 flex items-center space-x-2 text-sm transition-colors ${
                      communicationMode === 'websocket' 
                        ? "bg-orange-500 text-white" 
                        : "bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                    title="WebSocket Mode (실시간 - 2초 간격)"
                  >
                    <Zap className="w-3 h-3" />
                    <span className="hidden sm:inline">WebSocket</span>
                  </button>
                </div>
              </div>

              {/* API/WebSocket 연결 상태 */}
              <div className="flex items-center space-x-2">
                {communicationMode === 'polling' ? (
                  <>
                    {apiHealth ? <Wifi className="w-4 h-4 text-green-500" /> : <WifiOff className="w-4 h-4 text-red-500" />}
                    <span className={`text-sm ${apiHealth ? "text-green-600" : "text-red-600"}`}>
                      {apiHealth ? "API Connected" : "API Disconnected"}
                    </span>
                  </>
                ) : (
                  <>
                    {wsConnected ? <Zap className="w-4 h-4 text-green-500" /> : <WifiOff className="w-4 h-4 text-red-500" />}
                    <span className={`text-sm ${wsConnected ? "text-green-600" : "text-red-600"}`}>
                      WS {wsConnected ? "Connected" : "Disconnected"}
                      {wsStats && wsConnected && (
                        <span className="ml-1 text-xs text-gray-500">
                          ({wsStats.active_connections})
                        </span>
                      )}
                    </span>
                  </>
                )}
              </div>
              
              {/* 폴링 상태 - 폴링 모드일 때만 표시 */}
              {communicationMode === 'polling' && (
                <button
                  onClick={() => setIsPollingEnabled(!isPollingEnabled)}
                  className={`flex items-center space-x-2 px-3 py-1 rounded-lg text-sm transition-colors ${
                    isPollingEnabled ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full ${isPollingEnabled ? "bg-green-500 animate-pulse" : "bg-gray-500"}`} />
                  {isPollingEnabled ? "Live" : "Paused"}
                </button>
              )}
              
              {/* 새로고침 버튼 - 폴링 모드일 때만 표시 */}
              {communicationMode === 'polling' && (
                <button 
                  onClick={fetchDocuments} 
                  disabled={loading} 
                  className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                  <span>Refresh</span>
                </button>
              )}

              {/* WebSocket 재연결 버튼 - WebSocket 모드이고 연결이 끊어졌을 때만 표시 */}
              {communicationMode === 'websocket' && !wsConnected && (
                <button 
                  onClick={() => switchCommunicationMode('websocket')} 
                  disabled={loading}
                  className="bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors"
                >
                  <Zap className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                  <span>Reconnect</span>
                </button>
              )}
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
                {/* 뷰 모드 전환 버튼 */}
                <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`px-3 py-2 flex items-center space-x-2 text-sm transition-colors ${
                      viewMode === "grid" 
                        ? "bg-blue-500 text-white" 
                        : "bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                    title="Grid View"
                  >
                    <Grid3X3 className="w-4 h-4" />
                    <span className="hidden sm:inline">Grid</span>
                  </button>
                  <button
                    onClick={() => setViewMode("list")}
                    className={`px-3 py-2 flex items-center space-x-2 text-sm transition-colors ${
                      viewMode === "list" 
                        ? "bg-blue-500 text-white" 
                        : "bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                    title="List View"
                  >
                    <List className="w-4 h-4" />
                    <span className="hidden sm:inline">List</span>
                  </button>
                </div>
                
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
                Total <strong>{filteredDocuments.length}</strong> documents
                <span className="ml-2 text-xs text-gray-400">
                  ({viewMode === "grid" ? "Grid" : "List"} view)
                </span>
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

          {/* 문서 표시 영역 */}
          {loading && documents.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mr-3" />
              <span className="text-gray-600">Loading documents...</span>
            </div>
          ) : (
            <>
              {paginatedDocuments.length > 0 ? (
                <>
                  {viewMode === "grid" ? (
                    /* 카드 뷰 */
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6 mb-6">
                      {paginatedDocuments.map((document) => (
                        <DocumentCard 
                          key={document.id || document._id || Math.random()} 
                          document={document}
                          onClick={handleDocumentClick}
                        />
                      ))}
                    </div>
                  ) : (
                    /* 리스트 뷰 */
                    <div className="mb-6">
                      <DocumentListView 
                        documents={paginatedDocuments}
                        onDocumentClick={handleDocumentClick}
                      />
                    </div>
                  )}
                  
                  {/* 페이지네이션 */}
                  <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    itemsPerPage={itemsPerPage}
                    totalItems={filteredDocuments.length}
                    onPageChange={handlePageChange}
                    onItemsPerPageChange={handleItemsPerPageChange}
                  />
                </>
              ) : (
                /* 빈 상태 */
                <div className={`text-center py-12 ${viewMode === "list" ? "bg-white rounded-lg shadow-sm" : ""}`}>
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
            </>
          )}
        </div>
      </main>

      {/* 푸터 */}
      <footer className="bg-white border-t flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row justify-between items-center text-sm text-gray-500 space-y-2 sm:space-y-0">
            <div>
              Connected to: <code className="bg-gray-100 px-2 py-1 rounded text-xs">tars.giize.com:8080</code>
              <span className="ml-2 text-xs">
                ({communicationMode === 'polling' ? 'HTTP Polling' : 'WebSocket'})
              </span>
            </div>
            <div>
              {communicationMode === 'polling' ? (
                <>Auto-refresh: {isPollingEnabled ? "Enabled (5s)" : "Disabled"}</>
              ) : (
                <>Real-time: {wsConnected ? "Connected" : "Disconnected"}</>
              )}
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
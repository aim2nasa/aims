// DocumentStatusTracker.jsx - 순수 CSS 버전
import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Upload, 
  Search, 
  Eye, 
  Brain, 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  XCircle,
  RefreshCw
} from 'lucide-react';
import './DocumentStatusTracker.css';

// 문서 처리 상태를 계산하는 함수
const getDocumentStatus = (doc) => {
  const stages = [
    {
      name: 'upload',
      label: '업로드',
      icon: Upload,
      status: 'pending',
      message: '대기 중'
    },
    {
      name: 'meta',
      label: '메타데이터',
      icon: Search,
      status: 'pending',
      message: '대기 중'
    },
    {
      name: 'ocr_prep',
      label: 'OCR 준비',
      icon: FileText,
      status: 'pending',
      message: '대기 중'
    },
    {
      name: 'ocr',
      label: 'OCR 처리',
      icon: Eye,
      status: 'pending',
      message: '대기 중'
    },
    {
      name: 'docembed',
      label: '임베딩',
      icon: Brain,
      status: 'pending',
      message: '대기 중'
    }
  ];

  // 1. Upload 단계
  if (doc.upload) {
    stages[0].status = 'completed';
    stages[0].message = '업로드 완료';
  }

  // 2. Meta 단계
  if (doc.meta) {
    if (doc.meta.meta_status === 'ok') {
      stages[1].status = 'completed';
      stages[1].message = `메타데이터 추출 완료 (${doc.meta.mime})`;
    } else {
      stages[1].status = 'error';
      stages[1].message = '메타데이터 추출 실패';
    }
  }

  // 3. OCR 준비 단계
  if (doc.meta && doc.meta.meta_status === 'ok') {
    stages[2].status = 'completed';
    stages[2].message = 'OCR 준비 완료';
    
    // 지원하지 않는 MIME 타입 체크
    const unsupportedMimes = ['application/postscript', 'application/zip', 'application/octet-stream'];
    if (unsupportedMimes.includes(doc.meta.mime)) {
      stages[3].status = 'skipped';
      stages[3].message = '지원하지 않는 문서 형식';
      stages[4].status = 'skipped';
      stages[4].message = 'OCR 생략으로 인한 건너뜀';
      return { stages, currentStage: 2, overallStatus: 'completed_with_skip', progress: 100 };
    }
    
    // PDF 페이지 수 초과 체크
    if (doc.meta.pdf_pages && doc.meta.pdf_pages > 30) {
      stages[3].status = 'skipped';
      stages[3].message = `페이지 수 초과 (${doc.meta.pdf_pages} > 30)`;
      stages[4].status = 'skipped';
      stages[4].message = 'OCR 생략으로 인한 건너뜀';
      return { stages, currentStage: 2, overallStatus: 'completed_with_skip', progress: 100 };
    }
  }

  // 4. OCR 처리 단계
  if (doc.ocr) {
    if (doc.ocr.warn) {
      stages[3].status = 'skipped';
      stages[3].message = doc.ocr.warn;
      stages[4].status = 'skipped';
      stages[4].message = 'OCR 생략으로 인한 건너뜀';
      return { stages, currentStage: 3, overallStatus: 'completed_with_skip', progress: 100 };
    } else if (doc.ocr.queue) {
      stages[3].status = 'processing';
      stages[3].message = 'OCR 대기열에서 처리 대기 중';
    } else if (doc.ocr.status === 'running') {
      stages[3].status = 'processing';
      stages[3].message = 'OCR 처리 중';
    } else if (doc.ocr.status === 'done') {
      stages[3].status = 'completed';
      stages[3].message = `OCR 완료 (신뢰도: ${doc.ocr.confidence})`;
    } else if (doc.ocr.status === 'error') {
      stages[3].status = 'error';
      stages[3].message = 'OCR 실패';
      stages[4].status = 'blocked';
      stages[4].message = 'OCR 실패로 인한 차단';
      return { stages, currentStage: 3, overallStatus: 'error', progress: 60 };
    }
  }

  // 5. DocEmbed 단계
  if (doc.docembed) {
    if (doc.docembed.status === 'done') {
      stages[4].status = 'completed';
      stages[4].message = `임베딩 완료 (${doc.docembed.chunks}개 청크)`;
    } else if (doc.docembed.status === 'failed') {
      stages[4].status = 'error';
      stages[4].message = '임베딩 실패';
    } else {
      stages[4].status = 'processing';
      stages[4].message = '임베딩 처리 중';
    }
  }

  // text 필드가 있는 경우 (text/plain 직접 처리)
  if (doc.text && doc.text.full_text) {
    stages[3].status = 'completed';
    stages[3].message = '텍스트 파일 직접 처리 완료';
  }

  // 현재 진행 단계 및 진행률 계산
  let currentStage = 0;
  let overallStatus = 'pending';
  let progress = 0;
  
  for (let i = 0; i < stages.length; i++) {
    if (stages[i].status === 'completed') {
      currentStage = i;
      progress = Math.round(((i + 1) / stages.length) * 100);
      if (i === stages.length - 1) overallStatus = 'completed';
    } else if (stages[i].status === 'processing') {
      currentStage = i;
      overallStatus = 'processing';
      progress = Math.round((i / stages.length) * 100) + 10;
      break;
    } else if (stages[i].status === 'error') {
      currentStage = i;
      overallStatus = 'error';
      progress = Math.round((i / stages.length) * 100);
      break;
    }
  }

  if (overallStatus === 'pending' && currentStage > 0) {
    overallStatus = 'processing';
  }

  return { stages, currentStage, overallStatus, progress };
};

const DocumentStatusTracker = () => {
  const [documents, setDocuments] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  const API_BASE_URL = 'http://localhost:3000';

  // 문서 목록을 가져오는 함수
  const fetchDocuments = async (page = 1, search = '', status = '') => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '10'
      });
      
      if (search) {
        params.append('search', search);
      }
      
      if (status) {
        params.append('status', status);
      }

      const response = await fetch(`${API_BASE_URL}/api/documents/status?${params}`);
      const data = await response.json();

      if (data.success) {
        setDocuments(data.data.documents);
        setPagination(data.data.pagination);
      } else {
        setError(data.error || '문서를 가져오는데 실패했습니다.');
      }
    } catch (err) {
      setError('API 연결에 실패했습니다: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // 통계 데이터를 가져오는 함수
  const fetchStatistics = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/documents/statistics`);
      const data = await response.json();
      
      if (data.success) {
        setStats(data.data);
      }
    } catch (err) {
      console.error('통계 조회 실패:', err);
    }
  };

  // 문서 재처리 함수
  const retryDocument = async (docId, stage) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/documents/${docId}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage })
      });
      
      const data = await response.json();
      
      if (data.success) {
        alert(`${stage} 재처리가 요청되었습니다.`);
        fetchDocuments(currentPage, searchTerm, statusFilter);
      } else {
        alert('재처리 요청에 실패했습니다: ' + data.error);
      }
    } catch (err) {
      alert('재처리 요청 중 오류가 발생했습니다: ' + err.message);
    }
  };

  // 컴포넌트 마운트 시 데이터 로드
  useEffect(() => {
    fetchDocuments();
    fetchStatistics();
  }, []);

  // 검색/필터 변경 시 데이터 다시 로드
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setCurrentPage(1);
      fetchDocuments(1, searchTerm, statusFilter);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchTerm, statusFilter]);

  // 자동 새로고침 (30초마다)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchDocuments(currentPage, searchTerm, statusFilter);
      fetchStatistics();
    }, 30000);

    return () => clearInterval(interval);
  }, [currentPage, searchTerm, statusFilter]);

  const StatusBadge = ({ status, message }) => {
    return (
      <div className={`status-badge status-${status}`}>
        <span className="status-text">{message}</span>
      </div>
    );
  };

  const ProgressBar = ({ stages, currentStage, overallStatus }) => {
    const stageArray = Array.isArray(stages) ? stages : [];
    
    // 기본 5단계 정의 (데이터가 없어도 표시)
    const defaultStages = [
      { name: 'upload', label: '업로드', icon: Upload, status: 'pending' },
      { name: 'meta', label: '메타데이터', icon: Search, status: 'pending' },
      { name: 'ocr_prep', label: 'OCR준비', icon: FileText, status: 'pending' },
      { name: 'ocr', label: 'OCR처리', icon: Eye, status: 'pending' },
      { name: 'docembed', label: '임베딩', icon: Brain, status: 'pending' }
    ];
    
    // 실제 데이터와 기본 스테이지 합치기
    const displayStages = defaultStages.map((defaultStage, index) => {
      const actualStage = stageArray[index];
      return {
        ...defaultStage,
        status: actualStage?.status || defaultStage.status,
        message: actualStage?.message || defaultStage.label
      };
    });
    
    return (
      <div className="main-progress-container">
        {/* 5단계 시각적 표시 */}
        <div className="stages-visual">
          {displayStages.map((stage, index) => {
            const StageIcon = stage.icon;
            const isActive = index <= currentStage;
            const isCompleted = stage.status === 'completed';
            const isProcessing = stage.status === 'processing';
            const isError = stage.status === 'error';
            const isSkipped = stage.status === 'skipped';
            
            return (
              <div key={stage.name} className="stage-with-connector">
                <div 
                  className={`main-stage-circle ${stage.status} ${isActive ? 'active' : ''}`}
                  title={`${stage.label}: ${stage.message}`}
                >
                  {isCompleted && <CheckCircle size={16} />}
                  {isProcessing && <RefreshCw size={16} className="spinning" />}
                  {isError && <XCircle size={16} />}
                  {isSkipped && <AlertCircle size={16} />}
                  {stage.status === 'pending' && <StageIcon size={16} />}
                </div>
                
                <div className="stage-label-mini">{stage.label}</div>
                
                {index < displayStages.length - 1 && (
                  <div className={`main-connector ${isCompleted ? 'completed' : isActive ? 'active' : ''}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="document-tracker">
      <div className="header">
        <h1>문서 처리 상태 모니터링</h1>
        <p>업로드된 문서들의 실시간 처리 상태를 확인할 수 있습니다.</p>
      </div>

      {/* 통계 카드 */}
      {stats && (
        <div className="stats-grid">
          <div className="stat-card total">
            <h3>전체</h3>
            <p className="stat-number">{stats.total}</p>
          </div>
          <div className="stat-card completed">
            <h3>완료</h3>
            <p className="stat-number">{stats.completed}</p>
          </div>
          <div className="stat-card processing">
            <h3>처리중</h3>
            <p className="stat-number">{stats.processing}</p>
          </div>
          <div className="stat-card error">
            <h3>오류</h3>
            <p className="stat-number">{stats.error}</p>
          </div>
          <div className="stat-card pending">
            <h3>대기</h3>
            <p className="stat-number">{stats.pending}</p>
          </div>
          <div className="stat-card skip">
            <h3>부분완료</h3>
            <p className="stat-number">{stats.completed_with_skip}</p>
          </div>
        </div>
      )}

      {/* 검색 및 필터 */}
      <div className="controls">
        <input
          type="text"
          placeholder="파일명으로 검색..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="filter-select"
        >
          <option value="">모든 상태</option>
          <option value="completed">완료</option>
          <option value="processing">처리중</option>
          <option value="error">오류</option>
          <option value="pending">대기</option>
          <option value="completed_with_skip">부분완료</option>
        </select>
        <button
          onClick={() => fetchDocuments(currentPage, searchTerm, statusFilter)}
          className="refresh-button"
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? 'spinning' : ''} />
          새로고침
        </button>
      </div>

      {/* 오류 메시지 */}
      {error && (
        <div className="error-message">
          <p>{error}</p>
        </div>
      )}

      {/* 로딩 상태 */}
      {loading && (
        <div className="loading">
          <RefreshCw className="spinning" size={24} />
          <p>문서 상태를 불러오는 중...</p>
        </div>
      )}

      {/* 문서 목록 */}
      {!loading && (
        <div className="document-list">
          {documents.map((doc) => {
            let statusData;
            if (doc.stages && doc.currentStage !== undefined) {
              statusData = doc;
            } else {
              statusData = getDocumentStatus(doc);
            }
            
            const stages = statusData.stages || [];
            const currentStage = statusData.currentStage || 0;
            const overallStatus = statusData.overallStatus || 'pending';
            const progress = statusData.progress || 0;
            
            return (
              <div 
                key={doc._id}
                className="document-card"
                onClick={() => {
                  console.log('클릭된 문서:', doc._id, selectedDoc);
                  setSelectedDoc(selectedDoc === doc._id ? null : doc._id);
                }}
              >
                <div className="document-header">
                  <div className="document-info">
                    <h3 className="document-title">
                      {doc.originalName || doc.upload?.originalName || 'Unknown File'}
                    </h3>
                    <p className="document-id">ID: {doc._id}</p>
                    {(doc.fileSize || (doc.meta && doc.meta.size_bytes)) && (
                      <p className="document-meta">
                        {Math.round((doc.fileSize || doc.meta.size_bytes) / 1024)} KB • {doc.mimeType || doc.meta?.mime}
                      </p>
                    )}
                  </div>
                  <div className="document-status">
                    <StatusBadge 
                      status={overallStatus} 
                      message={
                        overallStatus === 'completed' ? '처리 완료' :
                        overallStatus === 'processing' ? '처리 중' :
                        overallStatus === 'completed_with_skip' ? '부분 완료' :
                        overallStatus === 'error' ? '처리 실패' : '대기 중'
                      } 
                    />
                    <p className="upload-time">
                      {(doc.uploadedAt || doc.upload?.uploaded_at) && 
                        new Date(doc.uploadedAt || doc.upload.uploaded_at).toLocaleString('ko-KR')}
                    </p>
                  </div>
                </div>

                <div className="progress-section">
                  <div className="progress-header">
                    <span>진행률</span>
                    <span className="progress-percentage">{progress}%</span>
                  </div>
                  <div className="progress-bar-bg">
                    <div 
                      className={`progress-bar-fill ${overallStatus}`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                <ProgressBar stages={stages} currentStage={currentStage} overallStatus={overallStatus} />

                {/* 상세 정보 */}
                {selectedDoc === doc._id && (
                  <div className="document-details">
                    <h4 className="details-title">
                      📋 처리 단계 상세 정보
                    </h4>
                    
                    {/* 큰 단계별 진행 표시 */}
                    <div className="detailed-progress">
                      {Array.isArray(stages) && stages.map((stage, index) => {
                        const StageIcon = stage.icon || Clock;
                        const isCompleted = stage.status === 'completed';
                        const isProcessing = stage.status === 'processing';
                        const isError = stage.status === 'error';
                        const isSkipped = stage.status === 'skipped';
                        
                        return (
                          <div key={stage.name || index} className="detailed-stage">
                            <div className="stage-icon-container">
                              <div className={`detailed-stage-circle ${stage.status}`}>
                                {isCompleted && <CheckCircle size={20} />}
                                {isProcessing && <RefreshCw size={20} className="spinning" />}
                                {isError && <XCircle size={20} />}
                                {isSkipped && <AlertCircle size={20} />}
                                {stage.status === 'pending' && <StageIcon size={20} />}
                              </div>
                              {index < stages.length - 1 && (
                                <div className={`detailed-connector ${isCompleted ? 'completed' : ''}`} />
                              )}
                            </div>
                            
                            <div className="stage-info-box">
                              <div className="stage-title">
                                <span className="stage-number-badge">{index + 1}</span>
                                <span className="stage-name">{stage.label}</span>
                                <div className={`stage-status-dot ${stage.status}`}></div>
                              </div>
                              
                              <div className="stage-message-box">
                                <p className="stage-description">{stage.message}</p>
                                {stage.timestamp && (
                                  <p className="stage-time">
                                    🕒 {new Date(stage.timestamp).toLocaleString('ko-KR')}
                                  </p>
                                )}
                              </div>
                              
                              {stage.status === 'error' && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    retryDocument(doc._id, stage.name);
                                  }}
                                  className="retry-button-large"
                                >
                                  🔄 재시도
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    
                    {/* 요약 정보 */}
                    <div className="processing-summary">
                      <div className="summary-item">
                        <span className="summary-label">전체 진행률:</span>
                        <span className="summary-value">{progress}%</span>
                      </div>
                      <div className="summary-item">
                        <span className="summary-label">현재 단계:</span>
                        <span className="summary-value">{currentStage + 1}/5</span>
                      </div>
                      <div className="summary-item">
                        <span className="summary-label">상태:</span>
                        <span className={`summary-status ${overallStatus}`}>
                          {overallStatus === 'completed' ? '✅ 완료' :
                           overallStatus === 'processing' ? '⚡ 처리중' :
                           overallStatus === 'error' ? '❌ 오류' :
                           overallStatus === 'completed_with_skip' ? '⚠️ 부분완료' : '⏳ 대기'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 페이지네이션 */}
      {pagination && (
        <div className="pagination">
          <button
            onClick={() => {
              setCurrentPage(pagination.currentPage - 1);
              fetchDocuments(pagination.currentPage - 1, searchTerm, statusFilter);
            }}
            disabled={pagination.currentPage <= 1}
            className="pagination-button"
          >
            이전
          </button>
          <span className="pagination-info">
            {pagination.currentPage} / {pagination.totalPages}
          </span>
          <button
            onClick={() => {
              setCurrentPage(pagination.currentPage + 1);
              fetchDocuments(pagination.currentPage + 1, searchTerm, statusFilter);
            }}
            disabled={pagination.currentPage >= pagination.totalPages}
            className="pagination-button"
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
};

export default DocumentStatusTracker;
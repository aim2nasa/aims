import React, { useState, useEffect, useCallback } from "react";
import { RefreshCw, Search, Wifi, WifiOff, FileText, Clock, CheckCircle, AlertCircle, XCircle, Copy, Eye, Upload, Database, FileTextIcon, Package, Radio, Link, Settings } from "lucide-react";
import { Table, Space, Tag } from 'antd';
import { apiService } from '../services/apiService';
import DocumentLinkModal from './DocumentLinkModal';


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
  
  // 기본 필드에서 찾기 (originalName 우선)
  let filename = document.originalName || document.filename || document.file_name || document.name || document.title;
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
    for (const [, value] of Object.entries(document.stages)) {
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
  // 서버에서 계산된 overallStatus를 우선 사용
  if (document.overallStatus) {
    return document.overallStatus;
  }
  
  // 기본 status 필드 확인 (fallback)
  if (document.status) return document.status;
  
  // 레거시: stages 구조 확인
  if (document.stages?.upload?.status === 'completed') {
    // embed/docembed가 완료되면 completed (OCR 상관없이)
    if (document.stages?.embed?.status === 'completed' || 
        document.stages?.docembed?.status === 'completed') {
      return 'completed';
    }
    
    // meta.full_text가 있고 OCR만 pending이면 completed
    if ((document.stages?.meta?.full_text || document.meta?.full_text) &&
        document.stages?.meta?.status === 'completed' &&
        document.stages?.ocr?.status === 'pending') {
      return 'completed';
    }
    
    // 에러 체크
    if (document.stages?.meta?.status === 'error' || 
        document.stages?.embed?.status === 'error' ||
        document.stages?.docembed?.status === 'error') {
      return 'error';
    }
    
    return 'processing';
  }
  
  const { pathType } = analyzeProcessingPath(document);
  
  // 1. Upload 체크 (레거시)
  if (!document.upload) {
    return 'pending';
  }
  
  // Upload 후 아직 Meta가 시작되지 않았으면 pending
  if (!document.meta) {
    return 'pending';
  }
  
  // 2. Meta 체크
  if (document.meta.meta_status !== 'ok') {
    if (document.meta.meta_status === 'error') {
      return 'error';
    }
    if (document.meta.meta_status === 'pending' || !document.meta.meta_status) {
      return 'pending';
    }
    return 'processing';
  }
  
  // 3. 경로별 상태 결정
  switch (pathType) {
    case 'unsupported':
    case 'page_limit_exceeded':
    case 'ocr_skipped':
      return 'completed'; // 지원하지 않는 파일들은 Meta 완료 시 끝
      
    case 'meta_fulltext':
      // Meta에서 full_text 추출 → DocEmbed로 바로 진행
      if (document.docembed) {
        if (document.docembed.status === 'done') return 'completed';
        if (document.docembed.status === 'failed') return 'error';
        return 'processing';
      }
      // DocEmbed가 없지만 meta.full_text가 있으면 완료로 처리
      if (document.meta && document.meta.full_text) {
        return 'completed';
      }
      return 'pending'; // DocEmbed 대기 중
      
    case 'text_plain':
      // text/plain 파일 → Text → DocEmbed
      if (!document.text || !document.text.full_text) return 'processing';
      if (document.docembed) {
        if (document.docembed.status === 'done') return 'completed';
        if (document.docembed.status === 'failed') return 'error';
        return 'processing';
      }
      return 'pending'; // DocEmbed 대기 중
      
    case 'ocr_normal':
      // 일반 OCR 처리 → OCR → DocEmbed
      if (document.ocr) {
        if (document.ocr.status === 'error') return 'error';
        if (document.ocr.status === 'done') {
          if (document.docembed) {
            if (document.docembed.status === 'done') return 'completed';
            if (document.docembed.status === 'failed') return 'error';
            return 'processing';
          }
          return 'pending'; // DocEmbed 대기 중
        }
        return 'processing'; // OCR 처리 중
      }
      return 'pending'; // OCR 대기 중
      
    default:
      return 'processing';
  }
};

const extractProgress = (document) => {
  
  // 서버에서 계산된 progress를 우선 사용 (단, OCR pending 때문에 75%면 100%로 수정)
  if (document.progress !== undefined && document.progress !== null) {
    // embed가 완료되었거나 meta.full_text가 있으면 100%
    const embedCompleted = document.stages?.embed?.status === 'completed' || 
                           document.stages?.docembed?.status === 'completed';
    const metaFullTextExists = (document.stages?.meta?.full_text || document.meta?.full_text) &&
                               document.stages?.meta?.status === 'completed';
    
    if (embedCompleted || metaFullTextExists) {
        return 100;
    }
    return document.progress;
  }
  
  // Status가 completed면 무조건 100%
  if (document.overallStatus === 'completed') {
    return 100;
  }
  
  // DocEmbed/Embed가 완료된 경우 무조건 100%
  if ((document.docembed && document.docembed.status === 'done') ||
      (document.embed && document.embed.status === 'completed') ||
      (document.stages && document.stages.embed && document.stages.embed.status === 'completed')) {
    return 100;
  }
  
  // 서버 progress가 없으면 클라이언트에서 계산
  if ((document.docembed && document.docembed.status === 'done') || 
      (document.embed && document.embed.status === 'completed') ||
      (document.stages && document.stages.embed && document.stages.embed.status === 'completed')) {
    return 100;
  }
  
  if (document.meta && document.meta.meta_status === 'ok' && document.meta.full_text) {
    return 75;
  }
  
  if (document.meta && document.meta.meta_status === 'ok') {
    return 50;
  }
  
  if (document.upload) {
    return 25;
  }
  
  return 0;
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

// 처리 경로 분석 및 뱃지 정보 추출
const analyzeProcessingPath = (document) => {
  const badges = [];
  let pathType = 'unknown';
  let expectedStages = [];
  
  // 1. Upload 단계 (모든 파일 공통)
  if (document.upload) {
    badges.push({ type: 'U', name: 'Upload', status: 'completed', icon: Upload });
  }
  
  // 2. Meta 단계 (모든 파일 공통)
  if (document.meta && document.meta.meta_status === 'ok') {
    badges.push({ type: 'M', name: 'Meta', status: 'completed', icon: Database });
    
    // 지원하지 않는 MIME 타입 체크
    const unsupportedMimes = [
      'application/postscript',
      'application/zip',
      'application/octet-stream'
    ];
    
    if (unsupportedMimes.includes(document.meta.mime)) {
      pathType = 'unsupported';
      expectedStages = ['U', 'M'];
      return { badges, pathType, expectedStages };
    }
    
    // PDF 페이지 수 초과 체크
    if (document.meta.pdf_pages && parseInt(document.meta.pdf_pages) > 30) {
      pathType = 'page_limit_exceeded';
      expectedStages = ['U', 'M'];
      return { badges, pathType, expectedStages };
    }
    
    // DocMeta에서 full_text가 추출된 경우 (PDF, Office 문서 등)
    if (document.meta.full_text && document.meta.full_text.trim().length > 0) {
      pathType = 'meta_fulltext';
      expectedStages = ['U', 'M', 'E'];
    }
  } else if (document.meta && document.meta.meta_status === 'error') {
    badges.push({ type: 'M', name: 'Meta', status: 'error', icon: Database });
  }
  
  // 3. Text 단계 (text/plain 파일)
  if (document.text && document.text.full_text) {
    badges.push({ type: 'T', name: 'Text', status: 'completed', icon: FileTextIcon });
    pathType = 'text_plain';
    expectedStages = ['U', 'M', 'T', 'E'];
  }
  
  // 4. OCR 단계 (이미지, full_text가 없는 PDF 등) - meta_fulltext 경로나 DocEmbed 완료 시 제외
  if (document.ocr && pathType !== 'meta_fulltext' && !(document.docembed && document.docembed.status === 'done')) {
    if (document.ocr.warn) {
      badges.push({ type: 'O', name: 'OCR', status: 'skipped', icon: Eye });
      if (pathType === 'unknown') {
        pathType = 'ocr_skipped';
        expectedStages = ['U', 'M'];
      }
    } else if (document.ocr.status === 'done') {
      badges.push({ type: 'O', name: 'OCR', status: 'completed', icon: Eye });
      if (pathType === 'unknown') {
        pathType = 'ocr_normal';
        expectedStages = ['U', 'M', 'O', 'E'];
      }
    } else if (document.ocr.status === 'error') {
      badges.push({ type: 'O', name: 'OCR', status: 'error', icon: Eye });
    } else if (document.ocr.status === 'running') {
      badges.push({ type: 'O', name: 'OCR', status: 'processing', icon: Eye });
      if (pathType === 'unknown') {
        pathType = 'ocr_normal';
        expectedStages = ['U', 'M', 'O', 'E'];
      }
    } else if (document.ocr.queue) {
      badges.push({ type: 'O', name: 'OCR', status: 'pending', icon: Eye });
      if (pathType === 'unknown') {
        pathType = 'ocr_normal';
        expectedStages = ['U', 'M', 'O', 'E'];
      }
    }
  }
  
  // 5. DocEmbed 단계
  if (document.docembed) {
    if (document.docembed.status === 'done') {
      badges.push({ type: 'E', name: 'Embed', status: 'completed', icon: Package });
    } else if (document.docembed.status === 'failed') {
      badges.push({ type: 'E', name: 'Embed', status: 'error', icon: Package });
    } else if (document.docembed.status === 'processing') {
      badges.push({ type: 'E', name: 'Embed', status: 'processing', icon: Package });
    }
  }
  
  // 경로 타입이 결정되지 않은 경우 기본값 설정
  if (pathType === 'unknown') {
    if (document.meta && document.meta.meta_status === 'ok') {
      pathType = 'ocr_normal';
      expectedStages = ['U', 'M', 'O', 'E'];
    } else {
      pathType = 'processing';
      expectedStages = ['U', 'M'];
    }
  }
  
  return { badges, pathType, expectedStages };
};



// 상태 뱃지 컴포넌트
const StatusBadge = ({ status, size = "medium", isCompact = false, rightPaneVisible = false }) => {
  const configs = {
    completed: { icon: CheckCircle, label: "Completed", color: "#10b981", bgColor: "#dcfce7" },
    processing: { icon: Clock, label: "Processing", color: "#3b82f6", bgColor: "#dbeafe" },
    error: { icon: XCircle, label: "Error", color: "#ef4444", bgColor: "#fee2e2" },
    pending: { icon: AlertCircle, label: "Pending", color: "#6b7280", bgColor: "#f3f4f6" }
  };
  
  const config = configs[status] || configs.pending;
  const Icon = config.icon;
  const fontSize = size === "small" ? "12px" : "14px";
  const padding = isCompact ? "4px" : (size === "small" ? "4px 8px" : "6px 12px");
  const iconSize = size === "small" ? "12px" : "16px";
  
  return (
    <span className={`dsd-status-badge ${status} ${rightPaneVisible ? 'icon-only' : ''}`} style={{
      fontSize,
      padding: rightPaneVisible ? '0' : padding,
      gap: rightPaneVisible ? '0' : '4px'
    }}>
      <Icon style={{ width: iconSize, height: iconSize, marginRight: (isCompact || rightPaneVisible) ? '0' : '4px' }} />
      {!isCompact && !rightPaneVisible && config.label}
    </span>
  );
};

// 진행률 바 컴포넌트
const ProgressBar = ({ progress, status }) => {
  const colorMap = {
    completed: "#10b981",
    processing: "#3b82f6", 
    error: "#ef4444",
    pending: "#9ca3af"
  };
  
  return (
    <div style={{ width: '100%' }}>
      <div style={{ 
        width: '100%', 
        backgroundColor: '#e5e7eb', 
        borderRadius: '4px', 
        height: '8px',
        overflow: 'hidden'
      }}>
        <div style={{
          height: '8px',
          borderRadius: '4px',
          transition: 'width 0.5s',
          backgroundColor: colorMap[status] || colorMap.pending,
          width: `${Math.min(progress || 0, 100)}%`,
          animation: status === "processing" ? "pulse 2s infinite" : "none"
        }} />
      </div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '12px',
        color: '#6b7280',
        marginTop: '4px'
      }}>
        <span>{progress || 0}%</span>
        <span style={{ textTransform: 'capitalize' }}>{status || 'pending'}</span>
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
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      fontSize: '12px',
      color: '#6b7280',
      fontFamily: 'monospace',
      backgroundColor: 'var(--color-bg-tertiary)',
      padding: '4px 8px',
      borderRadius: '4px'
    }}>
      <span style={{
        fontSize: '11px'
      }} title={id}>
        {id}
      </span>
      <button
        onClick={handleCopy}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: copied ? '#10b981' : '#9ca3af',
          display: 'flex',
          alignItems: 'center',
          padding: '0'
        }}
        title="Copy ID"
      >
        {copied ? (
          <CheckCircle style={{ width: '12px', height: '12px' }} />
        ) : (
          <Copy style={{ width: '12px', height: '12px' }} />
        )}
      </button>
    </div>
  );
};





// 상세 정보 모달
const DocumentDetailModal = ({ document, isOpen, onClose, rightPaneVisible = false }) => {
  if (!isOpen || !document) return null;

  const filename = extractFilename(document);
  const saveName = extractSaveName(document);
  const status = extractStatus(document);
  const progress = extractProgress(document);
  const uploadedDate = extractUploadedDate(document);

  return (
    <div style={{
      position: 'fixed',
      inset: '0',
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '1000',
      padding: '16px'
    }} onClick={onClose}>
      <div style={{
        background: 'var(--color-surface-1)',
        borderRadius: '8px',
        boxShadow: '0 20px 25px -5px var(--color-shadow-lg)',
        maxWidth: '64rem',
        width: '100%',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column'
      }} onClick={e => e.stopPropagation()}>
        {/* 헤더 - 고정 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '24px',
          borderBottom: '1px solid #e5e7eb',
          flexShrink: '0'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <FileText style={{ width: '24px', height: '24px', color: '#3b82f6' }} />
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: '600', margin: '0', color: 'var(--color-text-primary)' }}>{filename}</h2>
              {saveName && saveName !== filename && (
                <p style={{ fontSize: '14px', color: 'var(--color-text-tertiary)', margin: '4px 0 0 0' }}>Server file: {saveName}</p>
              )}
              <div style={{ marginTop: '4px' }}>
                <CopyableId id={document.id || document._id || 'unknown-id'} />
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--color-text-tertiary)'
          }}>
            <XCircle style={{ width: '24px', height: '24px' }} />
          </button>
        </div>
        
        {/* 콘텐츠 영역 - 스크롤 가능 */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: '1' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h3 style={{ fontWeight: '500', color: 'var(--color-text-primary)', marginBottom: '8px' }}>Processing Progress</h3>
              <ProgressBar progress={progress} status={status} />
            </div>
            
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
              fontSize: '14px'
            }}>
              <div>
                <span style={{ fontWeight: '500', color: 'var(--color-text-secondary)' }}>Status:</span>
                <div style={{ marginTop: '4px' }}>
                  <StatusBadge status={status} rightPaneVisible={rightPaneVisible} />
                </div>
              </div>
              <div>
                <span style={{ fontWeight: '500', color: 'var(--color-text-secondary)' }}>Progress:</span>
                <p style={{ color: 'var(--color-text-primary)', margin: '4px 0 0 0' }}>{progress}%</p>
              </div>
              <div>
                <span style={{ fontWeight: '500', color: 'var(--color-text-secondary)' }}>Original Name:</span>
                <p style={{ color: 'var(--color-text-primary)', margin: '4px 0 0 0', wordBreak: 'break-all' }}>{filename}</p>
              </div>
              {saveName && saveName !== filename && (
                <div>
                  <span style={{ fontWeight: '500', color: 'var(--color-text-secondary)' }}>Server File:</span>
                  <p style={{
                    color: 'var(--color-text-primary)',
                    margin: '4px 0 0 0',
                    wordBreak: 'break-all',
                    fontFamily: 'monospace',
                    fontSize: '12px'
                  }}>{saveName}</p>
                </div>
              )}
              <div>
                <span style={{ fontWeight: '500', color: 'var(--color-text-secondary)' }}>Uploaded:</span>
                <p style={{ color: 'var(--color-text-primary)', margin: '4px 0 0 0' }}>
                  {uploadedDate ? new Date(uploadedDate).toLocaleString() : 'Unknown'}
                </p>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <span style={{ fontWeight: '500', color: 'var(--color-text-secondary)' }}>Document ID:</span>
                <div style={{ marginTop: '4px' }}>
                  <CopyableId id={document.id || document._id || 'unknown-id'} />
                </div>
              </div>
            </div>

            {document.stages && (
              <div style={{ marginTop: '24px' }}>
                <h3 style={{ fontWeight: '500', color: 'var(--color-text-primary)', marginBottom: '12px' }}>Processing Stages</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {Object.entries(document.stages)
                    .filter(([stage, data]) => {
                      // meta에 full_text가 있거나 embed가 완료되면 OCR 단계는 숨김 
                      if (stage.toLowerCase().includes('ocr')) {
                        // meta.full_text 확인
                        if (document.stages?.meta?.full_text || document.meta?.full_text) {
                          return false;
                        }
                        // embed가 완료되면 OCR 불필요
                        if (document.stages?.embed?.status === 'completed' || 
                            document.stages?.docembed?.status === 'completed') {
                          return false;
                        }
                      }
                      return true;
                    })
                    .map(([stage, data]) => (
                    <div key={stage} style={{
                      backgroundColor: 'var(--color-bg-tertiary)',
                      borderRadius: '8px',
                      padding: '12px'
                    }}>
                      <h4 style={{
                        fontWeight: '500',
                        color: 'var(--color-text-primary)',
                        textTransform: 'capitalize',
                        margin: '0 0 4px 0'
                      }}>{stage}</h4>
                      <pre style={{
                        fontSize: '12px',
                        color: 'var(--color-text-secondary)',
                        margin: '0',
                        overflow: 'auto',
                        whiteSpace: 'pre-wrap',
                        fontFamily: 'monospace'
                      }}>
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
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          padding: '24px',
          borderTop: '1px solid #e5e7eb',
          backgroundColor: 'var(--color-bg-tertiary)',
          flexShrink: '0'
        }}>
          <button 
            onClick={onClose} 
            style={{
              backgroundColor: '#3b82f6',
              color: 'white',
              padding: '8px 24px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#2563eb'}
            onMouseLeave={(e) => e.target.style.backgroundColor = '#3b82f6'}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};


// 메인 대시보드 컴포넌트
const DocumentStatusDashboard = ({ initialFiles = [], onDocumentClick, onDocumentPreview, rightPaneVisible = false }) => {
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
  
  // 통신 관련 상태 - Polling만 사용
  const communicationMode = 'polling';
  

  // 문서 요약 모달 상태
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [selectedDocumentForSummary, setSelectedDocumentForSummary] = useState(null);
  const [summaryContent, setSummaryContent] = useState('');

  // 문서 전체 텍스트 모달 상태
  const [showFullTextModal, setShowFullTextModal] = useState(false);
  const [selectedDocumentForFullText, setSelectedDocumentForFullText] = useState(null);
  const [fullTextContent, setFullTextContent] = useState('');

  // 문서 고객연결 모달 상태
  const [showDocumentLinkModal, setShowDocumentLinkModal] = useState(false);
  const [selectedDocumentForLink, setSelectedDocumentForLink] = useState(null);
  const [showControls, setShowControls] = useState(false);

  // Ant Design Table 컬럼 정의
  const columns = [
    {
      title: '문서명',
      key: 'filename',
      width: 300,
      render: (_, document) => {
        const filename = extractFilename(document);
        const status = extractStatus(document);
        const isCompleted = status === 'completed';
        
        return (
          <Space>
            <div style={{
              backgroundColor: 'transparent',
              padding: '4px',
              borderRadius: '4px'
            }}>
              <FileText style={{ width: '12px', height: '12px', color: 'var(--color-primary)' }} />
            </div>
            <span 
              style={{ 
                fontWeight: 'bold', 
                color: isCompleted ? '#1890ff' : '#111827',
                cursor: isCompleted ? 'pointer' : 'default',
                textDecoration: isCompleted ? 'underline' : 'none'
              }}
              onClick={() => {
                if (isCompleted && onDocumentPreview) {
                  onDocumentPreview(document);
                }
              }}
              title={filename}
            >
              {filename}
            </span>
          </Space>
        );
      }
    },
    {
      title: '상태',
      key: 'status',
      width: 80,
      render: (_, document) => {
        const status = extractStatus(document);
        const statusConfig = {
          completed: { color: 'green', text: '완료' },
          processing: { color: 'blue', text: '처리중' },
          error: { color: 'red', text: '오류' },
          pending: { color: 'orange', text: '대기' }
        };
        const config = statusConfig[status] || { color: 'default', text: status };
        return <Tag color={config.color}>{config.text}</Tag>;
      }
    },
    {
      title: '작업',
      key: 'actions',
      width: rightPaneVisible ? 120 : 280,
      render: (_, document) => {
        const status = extractStatus(document);
        const isCompleted = status === 'completed';
        
        return (
          <Space size="small">
            <button 
              onClick={() => handleDocumentClick(document)}
              style={{
                padding: rightPaneVisible ? '3px' : '3px 8px',
                fontSize: '10px',
                fontWeight: '500',
                color: 'var(--color-success)',
                backgroundColor: 'transparent',
                border: '1px solid var(--color-success-border)',
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.target.style.boxShadow = '0 2px 8px rgba(16, 185, 129, 0.2)';
                e.target.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.target.style.boxShadow = 'none';
                e.target.style.transform = 'translateY(0)';
              }}
            >
              <Eye style={{ width: '10px', height: '10px', marginRight: rightPaneVisible ? '0' : '2px' }} />
              {!rightPaneVisible && 'View'}
            </button>
            <button 
              onClick={() => {
                if (isCompleted) {
                  handleDocumentSummary(document);
                }
              }}
              disabled={!isCompleted}
              style={{
                padding: rightPaneVisible ? '3px' : '3px 8px',
                fontSize: '10px',
                fontWeight: '500',
                color: isCompleted ? 'var(--color-primary)' : 'var(--color-text-tertiary)',
                backgroundColor: 'transparent',
                border: isCompleted ? '1px solid var(--color-primary-border)' : '1px solid var(--color-border)',
                borderRadius: '4px',
                cursor: isCompleted ? 'pointer' : 'not-allowed',
                opacity: isCompleted ? 1 : 0.6,
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                if (isCompleted) {
                  e.target.style.boxShadow = '0 2px 8px rgba(59, 130, 246, 0.2)';
                  e.target.style.transform = 'translateY(-1px)';
                }
              }}
              onMouseLeave={(e) => {
                if (isCompleted) {
                  e.target.style.boxShadow = 'none';
                  e.target.style.transform = 'translateY(0)';
                }
              }}
            >
              <FileText style={{ width: '10px', height: '10px', marginRight: rightPaneVisible ? '0' : '2px' }} />
              {!rightPaneVisible && 'Summary'}
            </button>
            <button 
              onClick={() => {
                if (isCompleted) {
                  handleDocumentFullText(document);
                }
              }}
              disabled={!isCompleted}
              style={{
                padding: rightPaneVisible ? '3px' : '3px 8px',
                fontSize: '10px',
                fontWeight: '500',
                color: isCompleted ? 'var(--color-purple)' : 'var(--color-text-tertiary)',
                backgroundColor: 'transparent',
                border: isCompleted ? '1px solid var(--color-purple-border)' : '1px solid var(--color-border)',
                borderRadius: '4px',
                cursor: isCompleted ? 'pointer' : 'not-allowed',
                opacity: isCompleted ? 1 : 0.6,
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                if (isCompleted) {
                  e.target.style.boxShadow = '0 2px 8px rgba(139, 92, 246, 0.2)';
                  e.target.style.transform = 'translateY(-1px)';
                }
              }}
              onMouseLeave={(e) => {
                if (isCompleted) {
                  e.target.style.boxShadow = 'none';
                  e.target.style.transform = 'translateY(0)';
                }
              }}
            >
              <FileTextIcon style={{ width: '10px', height: '10px', marginRight: rightPaneVisible ? '0' : '2px' }} />
              {!rightPaneVisible && 'Full Text'}
            </button>
            <button 
              onClick={() => {
                if (isCompleted) {
                  handleDocumentLink(document);
                }
              }}
              disabled={!isCompleted}
              style={{
                padding: rightPaneVisible ? '3px' : '3px 8px',
                fontSize: '10px',
                fontWeight: '500',
                color: isCompleted ? 'var(--color-success)' : 'var(--color-text-tertiary)',
                backgroundColor: 'transparent',
                border: isCompleted ? '1px solid var(--color-success-border)' : '1px solid var(--color-border)',
                borderRadius: '4px',
                cursor: isCompleted ? 'pointer' : 'not-allowed',
                opacity: isCompleted ? 1 : 0.6,
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                if (isCompleted) {
                  e.target.style.boxShadow = '0 2px 8px rgba(16, 185, 129, 0.2)';
                  e.target.style.transform = 'translateY(-1px)';
                }
              }}
              onMouseLeave={(e) => {
                if (isCompleted) {
                  e.target.style.boxShadow = 'none';
                  e.target.style.transform = 'translateY(0)';
                }
              }}
            >
              <Link style={{ width: '10px', height: '10px', marginRight: rightPaneVisible ? '0' : '2px' }} />
              {!rightPaneVisible && '고객연결'}
            </button>
          </Space>
        );
      }
    },
    {
      title: '진행률',
      key: 'progress',
      width: 70,
      render: (_, document) => {
        const progress = extractProgress(document);
        return `${Math.round(progress)}%`;
      }
    },
    {
      title: '업로드일',
      key: 'uploadDate',
      width: 160,
      render: (_, document) => {
        const uploadedDate = extractUploadedDate(document);
        if (!uploadedDate) return "Unknown";
        const date = new Date(uploadedDate);
        return date.toLocaleString('ko-KR', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        });
      }
    }
  ];


  // 문서 목록 가져오기
  const fetchDocuments = useCallback(async (isInitialLoad = false) => {
    try {
      if (isInitialLoad) {
        setLoading(true);
      }
      setError(null);
      // 더 많은 문서를 가져와서 클라이언트 사이드 페이지네이션 지원
      const data = await apiService.getRecentDocuments(1000);
      const realDocuments = data.documents || [];
      
      
      // 실제 DB 문서와 중복되지 않는 임시 문서들만 유지
      setDocuments(prevDocs => {
        const tempDocs = prevDocs.filter(doc => doc.id?.startsWith('temp-'));
        const realDocFilenames = realDocuments.map(doc => extractFilename(doc).toLowerCase());
        const uniqueTempDocs = tempDocs.filter(tempDoc => {
          const tempFilename = extractFilename(tempDoc).toLowerCase();
          return !realDocFilenames.includes(tempFilename);
        });
        
        return [...realDocuments, ...uniqueTempDocs];
      });
      
      setLastUpdated(new Date());
    } catch (err) {
      setError("문서 목록을 불러올 수 없습니다.");
      console.error("Fetch documents error:", err);
      // 초기 로드 실패 시에도 빈 배열로 설정하여 로딩 상태 해제
      if (isInitialLoad) {
        setDocuments([]);
      }
    } finally {
      if (isInitialLoad) {
        setLoading(false);
      }
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
    fetchDocuments(true); // isInitialLoad = true로 전달
    checkApiHealth();
  }, [fetchDocuments, checkApiHealth]);

  // initialFiles가 변경되면 임시 문서 추가 (실제 DB 문서와 중복 방지)
  useEffect(() => {
    if (initialFiles.length > 0) {
      setDocuments(prevDocs => {
        // 기존 실제 DB 문서들 (temp-로 시작하지 않는 ID)
        const realDocs = prevDocs.filter(doc => !doc.id?.startsWith('temp-'));
        
        // 새로운 임시 문서들만 추가 (실제 DB에 없는 파일명만)
        const realDocFilenames = realDocs.map(doc => extractFilename(doc).toLowerCase());
        const newTempFiles = initialFiles.filter(file => {
          const tempFilename = extractFilename(file).toLowerCase();
          return !realDocFilenames.includes(tempFilename);
        });
        
        
        // 실제 문서들 + 새로운 임시 문서들
        return [...realDocs, ...newTempFiles];
      });
      
      // initialFiles가 추가되면 로딩 상태 해제
      if (loading) {
        setLoading(false);
      }
    }
  }, [initialFiles, loading]);

  // 실시간 폴링 (5초마다) - 폴링 모드일 때만
  useEffect(() => {
    if (!isPollingEnabled || communicationMode !== 'polling') return;
    
    const interval = setInterval(() => {
      fetchDocuments();
      checkApiHealth();
    }, 5000);
    
    return () => clearInterval(interval);
  }, [isPollingEnabled, communicationMode, fetchDocuments, checkApiHealth]);


  // 실시간 처리 상태 시뮬레이션 제거 (실제 데이터만 사용)

  // 검색 및 필터링
  useEffect(() => {
    let filtered = documents;
    
    if (searchTerm) {
      filtered = filtered.filter(doc => {
        const filename = extractFilename(doc);
        const id = doc.id || doc._id || '';
        const searchTermLower = searchTerm.toLowerCase();
        
        const matchesFilename = filename.toLowerCase().includes(searchTermLower);
        const matchesId = id.toLowerCase().includes(searchTermLower);
        
        // Meta full_text 검색
        const metaFullText = doc.meta?.full_text || '';
        const matchesMetaText = metaFullText.toLowerCase().includes(searchTermLower);
        
        // OCR full_text 검색  
        const ocrFullText = doc.ocr?.full_text || '';
        const matchesOcrText = ocrFullText.toLowerCase().includes(searchTermLower);
        
        // Text full_text 검색 (text/plain 파일용)
        const textFullText = doc.text?.full_text || '';
        const matchesTextText = textFullText.toLowerCase().includes(searchTermLower);
        
        return matchesFilename || matchesId || matchesMetaText || matchesOcrText || matchesTextText;
      });
    }
    
    if (statusFilter !== "all") {
      filtered = filtered.filter(doc => extractStatus(doc) === statusFilter);
    }
    
    setFilteredDocuments(filtered);
  }, [documents, searchTerm, statusFilter]);




  // 문서 요약 조회 함수 (CenterPane.js 참고)
  const handleDocumentSummary = async (document) => {
    const docId = document.id || document._id || null;
    
    if (!docId) {
      console.error('Document ID not found for summary');
      return;
    }

    try {
      setSelectedDocumentForSummary(document);
      setSummaryContent('로딩 중...');
      setShowSummaryModal(true);


      // 문서 요약 추출 로직 (CenterPane의 382-444 라인 참고)
      const getSummaryFromDocument = (doc) => {
        
        // meta에서 full_text 확인
        const metaFullText = doc.meta?.full_text || 
          (typeof doc.meta === 'string' ? (() => {
            try { 
              const parsed = JSON.parse(doc.meta);
              return parsed.full_text;
            } catch { return null; }
          })() : null);
        
        // meta에 full_text가 있는 경우 - meta summary 사용
        if (metaFullText && metaFullText.trim()) {
          const metaSummary = doc.meta?.summary || 
            (typeof doc.meta === 'string' ? (() => {
              try { 
                const parsed = JSON.parse(doc.meta);
                return parsed.summary;
              } catch { return null; }
            })() : null);
          
          if (metaSummary && metaSummary !== 'null') {
            return metaSummary;
          }
          
          // meta summary가 없으면 meta full_text의 앞부분 사용
          const cleanText = metaFullText.trim();
          return cleanText.length > 200 ? cleanText.substring(0, 200) + '...' : cleanText;
        }
        
        // meta에 full_text가 없는 경우 - ocr summary 사용
        const ocrSummary = doc.ocr?.summary || 
          (typeof doc.ocr === 'string' ? (() => {
            try { 
              const parsed = JSON.parse(doc.ocr);
              return parsed.summary;
            } catch { return null; }
          })() : null);
        
        if (ocrSummary && ocrSummary !== 'null') {
          return ocrSummary;
        }
        
        // ocr summary가 없으면 ocr full_text의 앞부분 사용
        const ocrFullText = doc.ocr?.full_text || 
          (typeof doc.ocr === 'string' ? (() => {
            try { 
              const parsed = JSON.parse(doc.ocr);
              return parsed.full_text;
            } catch { return null; }
          })() : null);
        
        if (ocrFullText && ocrFullText.trim()) {
          const cleanText = ocrFullText.trim();
          return cleanText.length > 200 ? cleanText.substring(0, 200) + '...' : cleanText;
        }
        
        // 마지막으로 payload.summary 시도
        if (doc.payload?.summary) {
          return doc.payload.summary;
        }
        
        return '문서 요약을 찾을 수 없습니다.';
      };

      // API를 통해 상세 문서 데이터 가져오기 (CenterPane.js 참고)
      try {
        const response = await fetch('https://n8nd.giize.com/webhook/smartsearch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: docId
          })
        });

        const responseData = await response.json();
        
        const fileData = responseData[0];
        if (fileData) {
          // API에서 가져온 데이터로 요약 추출
          const summary = getSummaryFromDocument(fileData);
          setSummaryContent(summary);
          return;
        }
      } catch (apiError) {
        // API fetch failed, falling back to local data
      }

      // API 호출이 실패하면 로컬 데이터로 폴백
      const summary = getSummaryFromDocument(document);
      setSummaryContent(summary);
      
    } catch (error) {
      setSummaryContent('문서 요약을 불러오는 중 오류가 발생했습니다.');
    }
  };

  const handleSummaryModalClose = () => {
    setShowSummaryModal(false);
    setSelectedDocumentForSummary(null);
    setSummaryContent('');
  };

  // 문서 전체 텍스트 조회 함수
  const handleDocumentFullText = async (document) => {
    const docId = document.id || document._id || null;
    
    if (!docId) {
      console.error('Document ID not found for full text');
      return;
    }

    try {
      setSelectedDocumentForFullText(document);
      setFullTextContent('로딩 중...');
      setShowFullTextModal(true);

      // 문서 전체 텍스트 추출 로직
      const getFullTextFromDocument = (doc) => {
        // meta에서 full_text 확인 (최우선)
        const metaFullText = doc.meta?.full_text || 
          (typeof doc.meta === 'string' ? (() => {
            try { 
              const parsed = JSON.parse(doc.meta);
              return parsed.full_text;
            } catch { return null; }
          })() : null);
        
        if (metaFullText && metaFullText.trim()) {
          return metaFullText;
        }
        
        // text에서 full_text 확인 (text/plain 파일용)
        const textFullText = doc.text?.full_text || 
          (typeof doc.text === 'string' ? (() => {
            try { 
              const parsed = JSON.parse(doc.text);
              return parsed.full_text;
            } catch { return null; }
          })() : null);
        
        if (textFullText && textFullText.trim()) {
          return textFullText;
        }
        
        // ocr에서 full_text 확인
        const ocrFullText = doc.ocr?.full_text || 
          (typeof doc.ocr === 'string' ? (() => {
            try { 
              const parsed = JSON.parse(doc.ocr);
              return parsed.full_text;
            } catch { return null; }
          })() : null);
        
        if (ocrFullText && ocrFullText.trim()) {
          return ocrFullText;
        }
        
        // 마지막으로 payload에서 확인
        if (doc.payload?.full_text) {
          return doc.payload.full_text;
        }
        
        return '문서의 전체 텍스트를 찾을 수 없습니다.';
      };

      // API를 통해 상세 문서 데이터 가져오기
      try {
        const response = await fetch('https://n8nd.giize.com/webhook/smartsearch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: docId
          })
        });

        const responseData = await response.json();
        const fileData = responseData[0];
        if (fileData) {
          const fullText = getFullTextFromDocument(fileData);
          setFullTextContent(fullText);
          return;
        }
      } catch (apiError) {
        console.warn('API fetch failed, trying local data:', apiError);
      }

      // API 호출이 실패하면 로컬 데이터로 폴백
      const fullText = getFullTextFromDocument(document);
      setFullTextContent(fullText);
      
    } catch (error) {
      setFullTextContent('문서의 전체 텍스트를 불러오는 중 오류가 발생했습니다.');
      console.error('Document full text error:', error);
    }
  };

  const handleFullTextModalClose = () => {
    setShowFullTextModal(false);
    setSelectedDocumentForFullText(null);
    setFullTextContent('');
  };

  // 문서 고객연결 핸들러 함수들 (CenterPane.js와 동일)
  const handleDocumentLink = (document) => {
    setSelectedDocumentForLink(document);
    setShowDocumentLinkModal(true);
  };

  const handleDocumentLinkModalClose = () => {
    setShowDocumentLinkModal(false);
    setSelectedDocumentForLink(null);
  };

  const handleLinkSuccess = () => {
    // 연결 성공 후 처리 (필요시 문서 목록 새로고침 등)
    // 추가로 필요한 처리가 있다면 여기에 구현
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
    <div className="dsd-container">
      {/* 헤더 */}
      <header className="dsd-header">
        <div style={{ maxWidth: '80rem', margin: '0 auto', padding: '0 24px' }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            padding: '8px 0',
            gap: '16px'
          }}>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>


            </div>
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <main style={{ flex: '1' }}>
        <div style={{ maxWidth: '80rem', margin: '0 auto', padding: '0 24px 24px 24px' }}>
          {/* 상태 카드, 검색 및 필터 - 한 줄 레이아웃 */}
          <div style={{
            background: 'var(--color-surface-1)',
            borderRadius: '8px',
            boxShadow: '0 1px 3px 0 var(--color-shadow-sm)',
            padding: '2px',
            marginBottom: '12px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              flexWrap: 'nowrap'
            }}>
              {/* 상태 카드들 */}
              <div style={{
                display: 'flex',
                gap: '2px',
                flex: '0 0 auto',
                minWidth: '400px'
              }}>
            <div 
              onClick={() => {
                setStatusFilter('all');
              }}
              className={`dsd-stats-card all ${statusFilter === 'all' ? 'active' : ''}`}
              style={{
                background: statusFilter === 'all' ? 
                  'linear-gradient(135deg, var(--color-bg-tertiary) 0%, var(--color-border-light) 100%)' : 
                  'var(--color-surface-1)',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                minWidth: '80px',
                flex: '1',
                height: '34px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 6px 0 rgba(0, 0, 0, 0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1)';
              }}
              title="클릭하여 전체 문서 보기"
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px', width: '100%', height: '100%', padding: '0 2px' }}>
                <FileText style={{ width: '10px', height: '10px', color: 'var(--color-primary)', flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0', margin: '0', padding: '0' }}>
                  <p className="dsd-stats-label" style={{ fontSize: '8px', margin: 0, padding: 0 }}>Total</p>
                  <p className="dsd-stats-value all" style={{ fontSize: '10px', margin: 0, padding: 0, fontWeight: 'bold' }}>{documents.length}</p>
                </div>
              </div>
            </div>
            
            <div 
              onClick={() => {
                setStatusFilter('completed');
              }}
              className={`dsd-stats-card completed ${statusFilter === 'completed' ? 'active' : ''}`}
              style={{
                background: statusFilter === 'completed' ? 
                  'linear-gradient(135deg, var(--color-success-bg) 0%, #a7f3d0 100%)' : 
                  'var(--color-surface-1)',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                minWidth: '80px',
                flex: '1',
                height: '34px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 6px 0 rgba(0, 0, 0, 0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1)';
              }}
              title="클릭하여 완료된 문서만 보기"
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px', width: '100%', height: '100%', padding: '0 2px' }}>
                <CheckCircle style={{ width: '10px', height: '10px', color: '#10b981', flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0', margin: '0', padding: '0' }}>
                  <p className="dsd-stats-label" style={{ fontSize: '8px', margin: 0, padding: 0 }}>Completed</p>
                  <p className="dsd-stats-value completed" style={{ fontSize: '10px', margin: 0, padding: 0, fontWeight: 'bold' }}>{statusCounts.completed || 0}</p>
                </div>
              </div>
            </div>
            
            <div 
              onClick={() => {
                setStatusFilter('processing');
              }}
              className={`dsd-stats-card processing ${statusFilter === 'processing' ? 'active' : ''}`}
              style={{
                background: statusFilter === 'processing' ? 
                  'linear-gradient(135deg, var(--color-info-bg) 0%, #bfdbfe 100%)' : 
                  'var(--color-surface-1)',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                minWidth: '80px',
                flex: '1',
                height: '34px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 6px 0 rgba(0, 0, 0, 0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1)';
              }}
              title="클릭하여 처리 중인 문서만 보기"
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px', width: '100%', height: '100%', padding: '0 2px' }}>
                <Clock style={{ width: '10px', height: '10px', color: '#3b82f6', flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0', margin: '0', padding: '0' }}>
                  <p className="dsd-stats-label" style={{ fontSize: '8px', margin: 0, padding: 0 }}>Processing</p>
                  <p className="dsd-stats-value processing" style={{ fontSize: '10px', margin: 0, padding: 0, fontWeight: 'bold' }}>{statusCounts.processing || 0}</p>
                </div>
              </div>
            </div>
            
            <div 
              onClick={() => {
                setStatusFilter('pending');
              }}
              className={`dsd-stats-card pending ${statusFilter === 'pending' ? 'active' : ''}`}
              style={{
                background: statusFilter === 'pending' ? 
                  'linear-gradient(135deg, var(--color-warning-bg) 0%, #fde68a 100%)' : 
                  'var(--color-surface-1)',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                minWidth: '80px',
                flex: '1',
                height: '34px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 6px 0 rgba(0, 0, 0, 0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1)';
              }}
              title="클릭하여 대기 중인 문서만 보기"
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px', width: '100%', height: '100%', padding: '0 2px' }}>
                <AlertCircle style={{ width: '10px', height: '10px', color: '#f59e0b', flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0', margin: '0', padding: '0' }}>
                  <p className="dsd-stats-label" style={{ fontSize: '8px', margin: 0, padding: 0 }}>Pending</p>
                  <p className="dsd-stats-value pending" style={{ fontSize: '10px', margin: 0, padding: 0, fontWeight: 'bold' }}>{statusCounts.pending || 0}</p>
                </div>
              </div>
            </div>
            
            <div 
              onClick={() => {
                setStatusFilter('error');
              }}
              className={`dsd-stats-card error ${statusFilter === 'error' ? 'active' : ''}`}
              style={{
                background: statusFilter === 'error' ? 
                  'linear-gradient(135deg, var(--color-error-bg) 0%, #fecaca 100%)' : 
                  'var(--color-surface-1)',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                minWidth: '80px',
                flex: '1',
                height: '34px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 6px 0 rgba(0, 0, 0, 0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1)';
              }}
              title="클릭하여 오류 문서만 보기"
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px', width: '100%', height: '100%', padding: '0 2px' }}>
                <XCircle style={{ width: '10px', height: '10px', color: '#ef4444', flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0', margin: '0', padding: '0' }}>
                  <p className="dsd-stats-label" style={{ fontSize: '8px', margin: 0, padding: 0 }}>Errors</p>
                  <p className="dsd-stats-value error" style={{ fontSize: '10px', margin: 0, padding: 0, fontWeight: 'bold' }}>{statusCounts.error || 0}</p>
                </div>
              </div>
            </div>
            </div>


            {/* 검색 및 필터 */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              flex: '0 1 auto'
            }}>
              {/* 검색 입력 */}
              <div style={{ position: 'relative', width: '280px' }}>
                <Search style={{
                  position: 'absolute',
                  left: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: '14px',
                  height: '14px',
                  color: 'var(--color-text-tertiary)'
                }} />
                <input
                  type="text"
                  placeholder="Search by filename or document ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    width: '100%',
                    paddingLeft: '32px',
                    paddingRight: '8px',
                    paddingTop: '4px',
                    paddingBottom: '4px',
                    border: '1px solid var(--color-input-border)',
                    borderRadius: '6px',
                    fontSize: '12px',
                    outline: 'none',
                    backgroundColor: 'var(--color-input-bg)',
                    color: 'var(--color-text-primary)'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'var(--color-input-focus-border)';
                    e.target.style.boxShadow = '0 0 0 2px rgba(96, 165, 250, 0.1)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'var(--color-input-border)';
                    e.target.style.boxShadow = 'none';
                  }}
                />
              </div>

              {/* 문서 정보 및 Controls */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: '4px',
                marginLeft: '6px',
                flex: '0 0 auto'
              }}>
                {lastUpdated && (
                  <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>
                    Last updated: {lastUpdated.toLocaleTimeString()}
                  </span>
                )}
                
                {/* Controls 버튼 영역 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  {/* 설정 토글 버튼 */}
                  <button
                    onClick={() => setShowControls(!showControls)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '3px 6px',
                      borderRadius: '6px',
                      fontSize: '10px',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      backgroundColor: showControls ? 'var(--color-primary)' : 'var(--color-surface-1)',
                      color: showControls ? 'var(--color-text-white)' : 'var(--color-text-secondary)'
                    }}
                    title="Toggle Controls"
                  >
                    <Settings style={{ width: '10px', height: '10px' }} />
                    <span>Controls</span>
                  </button>

                  {/* 컨트롤 버튼들 - 조건부 렌더링 */}
                  {showControls && (
                    <>
                      {/* 통신 모드 선택 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          border: 'none',
                          borderRadius: '4px',
                          overflow: 'hidden'
                        }}>
                          <button
                            onClick={() => {}}
                            style={{
                              padding: '2px 6px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '10px',
                              border: 'none',
                              cursor: 'pointer',
                              transition: 'colors 0.2s',
                              backgroundColor: communicationMode === 'polling' ? 'var(--color-primary)' : 'var(--color-surface-1)',
                              color: communicationMode === 'polling' ? 'var(--color-text-white)' : 'var(--color-text-secondary)'
                            }}
                            title="Polling Mode"
                          >
                            <Radio style={{ width: '8px', height: '8px' }} />
                            <span>Polling</span>
                          </button>
                        </div>
                      </div>

                      {/* API 연결 상태 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {apiHealth ? <Wifi style={{ width: '10px', height: '10px', color: '#10b981' }} /> : <WifiOff style={{ width: '10px', height: '10px', color: '#ef4444' }} />}
                        <span style={{ fontSize: '8px', color: apiHealth ? '#059669' : '#dc2626' }}>
                          {apiHealth ? "API Connected" : "API Disconnected"}
                        </span>
                      </div>
                      
                      {/* 폴링 상태 */}
                      <button
                        onClick={() => setIsPollingEnabled(!isPollingEnabled)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          border: 'none',
                          cursor: 'pointer',
                          transition: 'colors 0.2s',
                          backgroundColor: isPollingEnabled ? '#dcfce7' : '#f3f4f6',
                          color: isPollingEnabled ? '#166534' : '#374151'
                        }}
                      >
                        <div style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          backgroundColor: isPollingEnabled ? '#10b981' : '#6b7280',
                          animation: isPollingEnabled ? 'pulse 2s infinite' : 'none'
                        }} />
                        {isPollingEnabled ? "Live" : "Paused"}
                      </button>
                      
                      {/* 새로고침 버튼 */}
                      <button 
                        onClick={fetchDocuments} 
                        disabled={loading} 
                        style={{
                          backgroundColor: loading ? '#93c5fd' : '#3b82f6',
                          color: 'var(--color-text-white)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          border: 'none',
                          cursor: loading ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '10px',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          if (!loading) e.target.style.backgroundColor = '#2563eb';
                        }}
                        onMouseLeave={(e) => {
                          if (!loading) e.target.style.backgroundColor = '#3b82f6';
                        }}
                      >
                        <RefreshCw style={{
                          width: '10px',
                          height: '10px',
                          animation: loading ? 'spin 1s linear infinite' : 'none'
                        }} />
                        <span>Refresh</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>


          {/* 에러 표시 */}
          {error && (
            <div style={{
              backgroundColor: 'var(--color-error-bg)',
              border: '1px solid var(--color-error-border)',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '24px'
            }}>
              <p style={{ color: '#b91c1c', fontSize: '14px', margin: '0' }}>{error}</p>
            </div>
          )}


          {/* 문서 표시 영역 */}
          {loading && documents.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0' }}>
              <RefreshCw style={{
                width: '32px',
                height: '32px',
                color: '#3b82f6',
                marginRight: '12px',
                animation: 'spin 1s linear infinite'
              }} />
              <span style={{ color: '#4b5563' }}>Loading documents...</span>
            </div>
          ) : (
            <div>
              {filteredDocuments.length > 0 ? (
                <>
                  {/* Ant Design Table */}
                  <Table
                    columns={columns}
                    dataSource={filteredDocuments}
                    rowKey={(record) => record.id || record._id}
                    loading={loading}
                    scroll={{ 
                      x: 800,
                      y: 'calc(70vh - 200px)'
                    }}
                    tableLayout="fixed"
                    onRow={(document) => ({
                      onClick: () => {
                        const status = extractStatus(document);
                        if (status === 'completed' && onDocumentPreview) {
                          onDocumentPreview(document);
                        }
                      },
                      style: {
                        cursor: extractStatus(document) === 'completed' ? 'pointer' : 'default'
                      }
                    })}
                    pagination={false}
                  />
                </>
              ) : (
                <>
                <div style={{
                  textAlign: 'center',
                  padding: '48px 0',
                  background: 'var(--color-surface-1)',
                  borderRadius: '8px',
                  boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                  marginBottom: '24px'
                }}>
                  <FileText style={{ width: '96px', height: '96px', color: '#d1d5db', margin: '0 auto 16px auto' }} />
                  <h3 style={{ fontSize: '18px', fontWeight: '500', color: '#111827', marginBottom: '8px' }}>No documents found</h3>
                  <p style={{ color: '#6b7280', fontSize: '14px', margin: '0' }}>
                    {searchTerm || statusFilter !== "all" 
                      ? "Try adjusting your search or filter criteria."
                      : "No documents have been uploaded yet."
                    }
                  </p>
                </div>
                
                </>
              )}
            </div>
          )}
        </div>
      </main>

      {/* 푸터 */}
      <footer className="dsd-footer">
        <div style={{ maxWidth: '80rem', margin: '0 auto', padding: '0 24px' }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '14px',
            gap: '8px',
            padding: '16px 0'
          }}>
            <div>
              Connected to: <code style={{
                backgroundColor: 'var(--color-bg-tertiary)',
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '12px'
              }}>tars.giize.com:8080</code>
              <span style={{ marginLeft: '8px', fontSize: '12px' }}>
                (HTTP Polling)
              </span>
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
        rightPaneVisible={rightPaneVisible}
      />

      {/* 문서 요약 모달 */}
      {showSummaryModal && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={handleSummaryModalClose}
        >
          <div 
            style={{
              backgroundColor: 'var(--color-surface-1)',
              borderRadius: '8px',
              padding: '24px',
              maxWidth: '600px',
              width: '90%',
              maxHeight: '70vh',
              overflow: 'auto',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              marginBottom: '20px',
              paddingBottom: '16px',
              borderBottom: '1px solid var(--color-border)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText style={{ width: '20px', height: '20px', color: 'var(--color-primary)' }} />
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: 'var(--color-text-primary)' }}>
                  문서 요약
                </h3>
              </div>
              <button
                onClick={handleSummaryModalClose}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: 'var(--color-text-tertiary)',
                  padding: '4px'
                }}
              >
                ×
              </button>
            </div>

            {/* 문서 제목 */}
            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ 
                margin: '0 0 8px 0', 
                fontSize: '16px', 
                fontWeight: '500', 
                color: 'var(--color-text-primary)' 
              }}>
                {extractFilename(selectedDocumentForSummary) || '문서명 없음'}
              </h4>
            </div>

            {/* 요약 내용 */}
            <div style={{
              backgroundColor: 'var(--color-bg-tertiary)',
              border: '1px solid var(--color-border)',
              borderRadius: '6px',
              padding: '16px',
              minHeight: '200px'
            }}>
              <div style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontFamily: 'inherit',
                lineHeight: '1.6',
                color: 'var(--color-text-primary)'
              }}>
                {summaryContent}
              </div>
            </div>

            {/* 모달 푸터 */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'flex-end',
              marginTop: '20px',
              paddingTop: '16px',
              borderTop: '1px solid var(--color-border)'
            }}>
              <button
                onClick={handleSummaryModalClose}
                style={{
                  backgroundColor: 'var(--color-text-tertiary)',
                  color: 'var(--color-text-white)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 문서 전체 텍스트 모달 */}
      {showFullTextModal && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={handleFullTextModalClose}
        >
          <div 
            style={{
              backgroundColor: 'var(--color-surface-1)',
              borderRadius: '8px',
              padding: '24px',
              maxWidth: '800px',
              width: '90%',
              maxHeight: '80vh',
              overflow: 'auto',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              marginBottom: '20px',
              paddingBottom: '16px',
              borderBottom: '1px solid var(--color-border)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText style={{ width: '20px', height: '20px', color: 'var(--color-primary)' }} />
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: 'var(--color-text-primary)' }}>
                  문서 전체 텍스트
                </h3>
              </div>
              <button
                onClick={handleFullTextModalClose}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: 'var(--color-text-tertiary)',
                  padding: '4px'
                }}
              >
                ×
              </button>
            </div>

            {/* 문서 제목 */}
            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ 
                margin: '0 0 8px 0', 
                fontSize: '16px', 
                fontWeight: '500', 
                color: 'var(--color-text-primary)' 
              }}>
                {extractFilename(selectedDocumentForFullText) || '문서명 없음'}
              </h4>
            </div>

            {/* 전체 텍스트 내용 */}
            <div style={{
              backgroundColor: 'var(--color-bg-tertiary)',
              border: '1px solid var(--color-border)',
              borderRadius: '6px',
              padding: '16px',
              minHeight: '300px',
              maxHeight: '50vh',
              overflow: 'auto'
            }}>
              <div style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontFamily: 'monospace',
                fontSize: '12px',
                lineHeight: '1.5',
                color: 'var(--color-text-primary)'
              }}>
                {fullTextContent}
              </div>
            </div>

            {/* 모달 푸터 */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'flex-end',
              marginTop: '20px',
              paddingTop: '16px',
              borderTop: '1px solid var(--color-border)'
            }}>
              <button
                onClick={handleFullTextModalClose}
                style={{
                  backgroundColor: 'var(--color-text-tertiary)',
                  color: 'var(--color-text-white)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 문서 고객연결 모달 */}
      <DocumentLinkModal
        visible={showDocumentLinkModal}
        onCancel={handleDocumentLinkModalClose}
        documentId={selectedDocumentForLink?.id || selectedDocumentForLink?._id}
        documentName={selectedDocumentForLink ? extractFilename(selectedDocumentForLink) : ''}
        onLinkSuccess={handleLinkSuccess}
      />

    </div>
  );
};

export default DocumentStatusDashboard;
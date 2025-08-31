import React, { useState, useEffect, useCallback } from "react";
import { RefreshCw, Search, Wifi, WifiOff, FileText, Clock, CheckCircle, AlertCircle, XCircle, Copy, Eye, Upload, Database, FileTextIcon, Package, Radio } from "lucide-react";
import { apiService } from '../services/apiService';


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
  
  // 2. Meta 체크
  if (!document.meta || document.meta.meta_status !== 'ok') {
    if (document.meta && document.meta.meta_status === 'error') {
      return 'error';
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
      return 'processing'; // DocEmbed 대기 중
      
    case 'text_plain':
      // text/plain 파일 → Text → DocEmbed
      if (!document.text || !document.text.full_text) return 'processing';
      if (document.docembed) {
        if (document.docembed.status === 'done') return 'completed';
        if (document.docembed.status === 'failed') return 'error';
        return 'processing';
      }
      return 'processing'; // DocEmbed 대기 중
      
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
          return 'processing'; // DocEmbed 대기 중
        }
        return 'processing'; // OCR 처리 중
      }
      return 'processing'; // OCR 대기 중
      
    default:
      return 'processing';
  }
  
  // 추가 fallback: meta와 stages에서 status 찾기
  if (document.meta) {
    let metaData = document.meta;
    if (typeof metaData === 'string') {
      try {
        metaData = JSON.parse(metaData);
      } catch (e) {}
    }
    if (metaData && metaData.meta_status) {
      return metaData.meta_status === 'ok' ? 'processing' : metaData.meta_status;
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
  const filename = extractFilename(document);
  
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

// 처리 경로별 맞춤형 진도율 계산
const calculatePathSpecificProgress = (document, pathType, expectedStages) => {
  const totalStages = expectedStages.length;
  let completedStages = 0;
  
  switch (pathType) {
    case 'meta_fulltext': // U, M, E 경로 (Meta에서 full_text 추출)
      if (document.upload) completedStages++; // U: 33%
      if (document.meta && document.meta.meta_status === 'ok') completedStages++; // M: 67%
      if (document.docembed && document.docembed.status === 'done') completedStages++; // E: 100%
      else if (document.docembed && document.docembed.status === 'processing') completedStages += 0.5; // E 처리중: 83%
      return Math.round((completedStages / totalStages) * 100);
      
    case 'text_plain': // U, M, T, E 경로
      if (document.upload) completedStages++; // U: 25%
      if (document.meta && document.meta.meta_status === 'ok') completedStages++; // M: 50%
      if (document.text && document.text.full_text) completedStages++; // T: 75%
      if (document.docembed && document.docembed.status === 'done') completedStages++; // E: 100%
      else if (document.docembed && document.docembed.status === 'processing') completedStages += 0.5; // E 처리중: 87.5%
      return Math.round((completedStages / totalStages) * 100);
      
    case 'ocr_normal': // U, M, O, E 경로
      if (document.upload) completedStages++; // U: 25%
      if (document.meta && document.meta.meta_status === 'ok') completedStages++; // M: 50%
      
      // DocEmbed가 완료된 경우 OCR 상태와 관계없이 모든 단계 완료로 처리
      if (document.docembed && document.docembed.status === 'done') {
        completedStages = totalStages; // 모든 단계 완료: 100%
      } else {
        // DocEmbed가 미완료인 경우에만 OCR 상태 확인
        if (document.ocr) {
          if (document.ocr.status === 'done') completedStages++; // O: 75%
          else if (document.ocr.status === 'running') completedStages += 0.7; // O 처리중: 67.5%
          else if (document.ocr.queue) completedStages += 0.3; // O 대기중: 57.5%
        }
        if (document.docembed && document.docembed.status === 'processing') completedStages += 0.5; // E 처리중: 87.5%
      }
      return Math.round((completedStages / totalStages) * 100);
      
    case 'unsupported':
    case 'page_limit_exceeded':
    case 'ocr_skipped':
      // U, M만 있으면 완료
      if (document.upload) completedStages++; // U: 50%
      if (document.meta && document.meta.meta_status === 'ok') completedStages++; // M: 100%
      return Math.round((completedStages / totalStages) * 100);
      
    case 'processing':
    default:
      // 기본 진도율 계산
      if (document.upload) completedStages++; // Upload 완료시 50%
      if (document.meta && document.meta.meta_status === 'ok') completedStages++; // Meta 완료시 100%
      return Math.round((completedStages / Math.max(totalStages, 2)) * 100);
  }
};

// 뱃지 컴포넌트
const ProcessingBadge = ({ badge, size = 'medium' }) => {
  const statusColors = {
    completed: { bg: '#dcfce7', color: '#166534', border: '#bbf7d0' },
    processing: { bg: '#dbeafe', color: '#1e40af', border: '#93c5fd' },
    pending: { bg: '#f3f4f6', color: '#374151', border: '#d1d5db' },
    error: { bg: '#fee2e2', color: '#dc2626', border: '#fecaca' },
    skipped: { bg: '#fef3c7', color: '#d97706', border: '#fde68a' }
  };
  
  const colors = statusColors[badge.status] || statusColors.pending;
  const Icon = badge.icon;
  const iconSize = size === 'small' ? '12px' : '16px';
  const padding = size === 'small' ? '2px 6px' : '4px 8px';
  const fontSize = size === 'small' ? '10px' : '12px';
  
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      backgroundColor: colors.bg,
      color: colors.color,
      border: `1px solid ${colors.border}`,
      borderRadius: '6px',
      padding,
      fontSize,
      fontWeight: '600',
      fontFamily: 'monospace'
    }} title={`${badge.name} - ${badge.status}`}>
      <Icon style={{ width: iconSize, height: iconSize }} />
      {badge.type}
    </div>
  );
};

// 상태 뱃지 컴포넌트
const StatusBadge = ({ status, size = "medium" }) => {
  const configs = {
    completed: { icon: CheckCircle, label: "Completed", color: "#10b981", bgColor: "#dcfce7" },
    processing: { icon: Clock, label: "Processing", color: "#3b82f6", bgColor: "#dbeafe" },
    error: { icon: XCircle, label: "Error", color: "#ef4444", bgColor: "#fee2e2" },
    pending: { icon: AlertCircle, label: "Pending", color: "#6b7280", bgColor: "#f3f4f6" }
  };
  
  const config = configs[status] || configs.pending;
  const Icon = config.icon;
  const fontSize = size === "small" ? "12px" : "14px";
  const padding = size === "small" ? "4px 8px" : "6px 12px";
  const iconSize = size === "small" ? "12px" : "16px";
  
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      borderRadius: '9999px',
      fontWeight: '500',
      fontSize,
      padding,
      backgroundColor: config.bgColor,
      color: config.color
    }}>
      <Icon style={{ width: iconSize, height: iconSize, marginRight: '4px' }} />
      {config.label}
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
      backgroundColor: '#f9fafb',
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

// 페이지네이션 컴포넌트
const Pagination = ({ currentPage, totalPages, itemsPerPage, totalItems, onPageChange, onItemsPerPageChange }) => {
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  return (
    <div style={{
      background: 'white',
      borderRadius: '8px',
      boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
      padding: '16px'
    }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        {/* 페이지 정보 및 개수 설정 */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <span style={{ fontSize: '14px', color: '#374151' }}>
            Showing <strong>{startItem}</strong> to <strong>{endItem}</strong> of <strong>{totalItems}</strong> documents
          </span>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '14px', color: '#4b5563' }}>Show:</label>
            <select
              value={itemsPerPage}
              onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
              style={{
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '14px',
                outline: 'none'
              }}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span style={{ fontSize: '14px', color: '#4b5563' }}>per page</span>
          </div>
        </div>

        {/* 페이지네이션 버튼 - 간단한 버전 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            style={{
              padding: '8px 12px',
              fontSize: '14px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
              opacity: currentPage === 1 ? 0.5 : 1
            }}
          >
            이전
          </button>

          <span style={{ padding: '8px 12px', fontSize: '14px' }}>
            {currentPage} / {totalPages}
          </span>

          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            style={{
              padding: '8px 12px',
              fontSize: '14px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
              opacity: currentPage === totalPages ? 0.5 : 1
            }}
          >
            다음
          </button>
        </div>
      </div>
    </div>
  );
};

const DocumentListView = ({ documents, onDocumentClick, onDetailClick }) => {
  const formatDate = (dateString) => {
    if (!dateString) return "Unknown";
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = now - date;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    if (diffDays === 0) {
      // 오늘: 날짜와 시간 모두 표시
      return `${month}/${day} ${hours}:${minutes}`;
    } else {
      // 오늘이 아닌 경우: 날짜만 표시
      return `${year}/${month}/${day}`;
    }
  };

  const truncateFilename = (filename, maxLength = 50) => {
    if (!filename) return "Unknown File";
    return filename.length <= maxLength ? filename : filename.substring(0, maxLength - 3) + "...";
  };

  return (
    <div style={{
      background: 'white',
      borderRadius: '8px',
      boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
      overflow: 'hidden'
    }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
            <tr>
              <th style={{
                padding: '12px 24px',
                textAlign: 'left',
                fontSize: '12px',
                fontWeight: '500',
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Document
              </th>
              <th style={{
                padding: '12px 24px',
                textAlign: 'left',
                fontSize: '12px',
                fontWeight: '500',
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Status
              </th>
              <th style={{
                padding: '12px 24px',
                textAlign: 'center',
                fontSize: '12px',
                fontWeight: '500',
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Actions
              </th>
              <th style={{
                padding: '12px 24px',
                textAlign: 'left',
                fontSize: '12px',
                fontWeight: '500',
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Progress
              </th>
              <th style={{
                padding: '12px 8px',
                textAlign: 'center',
                fontSize: '12px',
                fontWeight: '500',
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                minWidth: '90px'
              }}>
                Uploaded
              </th>
              <th style={{
                padding: '12px 24px',
                textAlign: 'left',
                fontSize: '12px',
                fontWeight: '500',
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Document ID
              </th>
            </tr>
          </thead>
          <tbody style={{ background: 'white' }}>
            {documents.map((document, index) => {
              const filename = extractFilename(document);
              const status = extractStatus(document);
              const progress = extractProgress(document);
              const uploadedDate = extractUploadedDate(document);
              const { badges } = analyzeProcessingPath(document);
              
              return (
                <tr 
                  key={document.id || document._id || index}
                  onClick={() => {
                    if (status === 'completed' && onDocumentClick) {
                      onDocumentClick(document);
                    }
                  }}
                  style={{
                    borderBottom: index < documents.length - 1 ? '1px solid #e5e7eb' : 'none',
                    cursor: status === 'completed' ? 'pointer' : 'default',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={(e) => e.target.closest('tr').style.backgroundColor = '#f9fafb'}
                  onMouseLeave={(e) => e.target.closest('tr').style.backgroundColor = 'white'}
                >
                  <td style={{ padding: '16px 24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{
                        backgroundColor: '#eff6ff',
                        padding: '8px',
                        borderRadius: '8px',
                        marginRight: '12px'
                      }}>
                        <FileText style={{ width: '16px', height: '16px', color: '#3b82f6' }} />
                      </div>
                      <div style={{ minWidth: '0', flex: '1' }}>
                        <div>
                          <p style={{
                            fontSize: '14px',
                            fontWeight: '500',
                            color: '#111827',
                            margin: '0 0 4px 0',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }} title={filename}>
                            {truncateFilename(filename)}
                          </p>
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {badges.map((badge, index) => (
                              <ProcessingBadge key={index} badge={badge} size="small" />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '16px 24px' }}>
                    <StatusBadge status={status} size="small" />
                  </td>
                  <td style={{ padding: '16px 24px', textAlign: 'center' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onDetailClick) {
                          onDetailClick(document);
                        }
                      }}
                      style={{
                        padding: '4px 8px',
                        fontSize: '11px',
                        fontWeight: '500',
                        color: '#059669',
                        backgroundColor: '#ecfdf5',
                        border: '1px solid #d1fae5',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px'
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.backgroundColor = '#d1fae5';
                        e.target.style.borderColor = '#a7f3d0';
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.backgroundColor = '#ecfdf5';
                        e.target.style.borderColor = '#d1fae5';
                      }}
                    >
                      <Eye style={{ width: '12px', height: '12px' }} />
                      View
                    </button>
                  </td>
                  <td style={{ padding: '16px 24px' }}>
                    <div style={{ width: '100%', maxWidth: '200px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ flex: '1' }}>
                          <div style={{
                            width: '100%',
                            backgroundColor: '#e5e7eb',
                            borderRadius: '4px',
                            height: '8px'
                          }}>
                            <div style={{
                              height: '8px',
                              borderRadius: '4px',
                              transition: 'width 0.5s',
                              backgroundColor: 
                                status === "completed" ? "#10b981" :
                                status === "processing" ? "#3b82f6" :
                                status === "error" ? "#ef4444" : "#9ca3af",
                              width: `${Math.min(progress || 0, 100)}%`,
                              animation: status === "processing" ? "pulse 2s infinite" : "none"
                            }} />
                          </div>
                        </div>
                        <span style={{
                          fontSize: '12px',
                          color: '#6b7280',
                          fontWeight: '500',
                          minWidth: '40px',
                          textAlign: 'right'
                        }}>
                          {progress || 0}%
                        </span>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '16px 8px' }}>
                    <div style={{ 
                      fontSize: '12px', 
                      color: '#6b7280',
                      fontFamily: 'monospace',
                      textAlign: 'center',
                      minWidth: '75px',
                      lineHeight: '1.2'
                    }}>
                      {formatDate(uploadedDate)}
                    </div>
                  </td>
                  <td style={{ padding: '16px 24px' }}>
                    <div style={{
                      fontSize: '12px',
                      fontFamily: 'monospace',
                      color: '#6b7280',
                      maxWidth: '200px'
                    }}>
                      <span style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        display: 'block'
                      }} title={document.id || document._id || 'unknown-id'}>
                        {document.id || document._id || 'unknown-id'}
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


// 상세 정보 모달
const DocumentDetailModal = ({ document, isOpen, onClose }) => {
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
        background: 'white',
        borderRadius: '8px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
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
              <h2 style={{ fontSize: '20px', fontWeight: '600', margin: '0' }}>{filename}</h2>
              {saveName && saveName !== filename && (
                <p style={{ fontSize: '14px', color: '#6b7280', margin: '4px 0 0 0' }}>Server file: {saveName}</p>
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
            color: '#9ca3af'
          }}>
            <XCircle style={{ width: '24px', height: '24px' }} />
          </button>
        </div>
        
        {/* 콘텐츠 영역 - 스크롤 가능 */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: '1' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h3 style={{ fontWeight: '500', color: '#111827', marginBottom: '8px' }}>Processing Progress</h3>
              <ProgressBar progress={progress} status={status} />
            </div>
            
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
              fontSize: '14px'
            }}>
              <div>
                <span style={{ fontWeight: '500', color: '#4b5563' }}>Status:</span>
                <div style={{ marginTop: '4px' }}>
                  <StatusBadge status={status} />
                </div>
              </div>
              <div>
                <span style={{ fontWeight: '500', color: '#4b5563' }}>Progress:</span>
                <p style={{ color: '#111827', margin: '4px 0 0 0' }}>{progress}%</p>
              </div>
              <div>
                <span style={{ fontWeight: '500', color: '#4b5563' }}>Original Name:</span>
                <p style={{ color: '#111827', margin: '4px 0 0 0', wordBreak: 'break-all' }}>{filename}</p>
              </div>
              {saveName && saveName !== filename && (
                <div>
                  <span style={{ fontWeight: '500', color: '#4b5563' }}>Server File:</span>
                  <p style={{
                    color: '#111827',
                    margin: '4px 0 0 0',
                    wordBreak: 'break-all',
                    fontFamily: 'monospace',
                    fontSize: '12px'
                  }}>{saveName}</p>
                </div>
              )}
              <div>
                <span style={{ fontWeight: '500', color: '#4b5563' }}>Uploaded:</span>
                <p style={{ color: '#111827', margin: '4px 0 0 0' }}>
                  {uploadedDate ? new Date(uploadedDate).toLocaleString() : 'Unknown'}
                </p>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <span style={{ fontWeight: '500', color: '#4b5563' }}>Document ID:</span>
                <div style={{ marginTop: '4px' }}>
                  <CopyableId id={document.id || document._id || 'unknown-id'} />
                </div>
              </div>
            </div>

            {document.stages && (
              <div style={{ marginTop: '24px' }}>
                <h3 style={{ fontWeight: '500', color: '#111827', marginBottom: '12px' }}>Processing Stages</h3>
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
                      backgroundColor: '#f9fafb',
                      borderRadius: '8px',
                      padding: '12px'
                    }}>
                      <h4 style={{
                        fontWeight: '500',
                        color: '#374151',
                        textTransform: 'capitalize',
                        margin: '0 0 4px 0'
                      }}>{stage}</h4>
                      <pre style={{
                        fontSize: '12px',
                        color: '#4b5563',
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
          backgroundColor: '#f9fafb',
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
const DocumentStatusDashboard = ({ initialFiles = [], onDocumentClick }) => {
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
  
  // 통신 관련 상태 - Polling만 사용
  const communicationMode = 'polling';
  
  // 페이지네이션 상태
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

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
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', display: 'flex', flexDirection: 'column' }}>
      {/* 헤더 */}
      <header style={{ 
        background: 'white', 
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)', 
        borderBottom: '1px solid #e5e7eb',
        flexShrink: 0
      }}>
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
              {/* 통신 모드 선택 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  overflow: 'hidden'
                }}>
                  <button
                    onClick={() => {}}
                    style={{
                      padding: '4px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '14px',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'colors 0.2s',
                      backgroundColor: communicationMode === 'polling' ? '#3b82f6' : 'white',
                      color: communicationMode === 'polling' ? 'white' : '#374151'
                    }}
                    title="Polling Mode"
                  >
                    <Radio style={{ width: '12px', height: '12px' }} />
                    <span>Polling</span>
                  </button>
                </div>
              </div>

              {/* API 연결 상태 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {apiHealth ? <Wifi style={{ width: '16px', height: '16px', color: '#10b981' }} /> : <WifiOff style={{ width: '16px', height: '16px', color: '#ef4444' }} />}
                <span style={{ fontSize: '14px', color: apiHealth ? '#059669' : '#dc2626' }}>
                  {apiHealth ? "API Connected" : "API Disconnected"}
                </span>
              </div>
              
              {/* 폴링 상태 */}
                <button
                  onClick={() => setIsPollingEnabled(!isPollingEnabled)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '4px 12px',
                    borderRadius: '8px',
                    fontSize: '14px',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'colors 0.2s',
                    backgroundColor: isPollingEnabled ? '#dcfce7' : '#f3f4f6',
                    color: isPollingEnabled ? '#166534' : '#374151'
                  }}
                >
                  <div style={{
                    width: '8px',
                    height: '8px',
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
                    color: 'white',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
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
                    width: '16px',
                    height: '16px',
                    animation: loading ? 'spin 1s linear infinite' : 'none'
                  }} />
                  <span>Refresh</span>
                </button>


            </div>
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <main style={{ flex: '1', overflowY: 'auto' }}>
        <div style={{ maxWidth: '80rem', margin: '0 auto', padding: '0 24px 24px 24px' }}>
          {/* 통계 대시보드 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '12px',
            marginBottom: '16px'
          }}>
            <div style={{
              background: 'white',
              padding: '12px',
              borderRadius: '6px',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: '12px', color: '#6b7280', margin: '0' }}>Total</p>
                  <p style={{ fontSize: '20px', fontWeight: 'bold', color: '#111827', margin: '2px 0 0 0' }}>{documents.length}</p>
                </div>
                <FileText style={{ width: '24px', height: '24px', color: '#3b82f6' }} />
              </div>
            </div>
            
            <div style={{
              background: 'white',
              padding: '12px',
              borderRadius: '6px',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: '12px', color: '#6b7280', margin: '0' }}>Completed</p>
                  <p style={{ fontSize: '20px', fontWeight: 'bold', color: '#059669', margin: '2px 0 0 0' }}>{statusCounts.completed || 0}</p>
                </div>
                <CheckCircle style={{ width: '24px', height: '24px', color: '#10b981' }} />
              </div>
            </div>
            
            <div style={{
              background: 'white',
              padding: '12px',
              borderRadius: '6px',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: '12px', color: '#6b7280', margin: '0' }}>Processing</p>
                  <p style={{ fontSize: '20px', fontWeight: 'bold', color: '#2563eb', margin: '2px 0 0 0' }}>{statusCounts.processing || 0}</p>
                </div>
                <Clock style={{ width: '24px', height: '24px', color: '#3b82f6' }} />
              </div>
            </div>
            
            <div style={{
              background: 'white',
              padding: '12px',
              borderRadius: '6px',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: '12px', color: '#6b7280', margin: '0' }}>Errors</p>
                  <p style={{ fontSize: '20px', fontWeight: 'bold', color: '#dc2626', margin: '2px 0 0 0' }}>{statusCounts.error || 0}</p>
                </div>
                <XCircle style={{ width: '24px', height: '24px', color: '#ef4444' }} />
              </div>
            </div>
          </div>

          {/* 검색 및 필터 */}
          <div style={{
            background: 'white',
            borderRadius: '8px',
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
            padding: '16px',
            marginBottom: '24px'
          }}>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}>
              <div style={{
                display: 'flex',
                flexDirection: 'row',
                gap: '16px',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div style={{
                  display: 'flex',
                  flexDirection: 'row',
                  gap: '16px',
                  alignItems: 'center'
                }}>
                  <div style={{ flex: '1', maxWidth: '400px' }}>
                    <div style={{ position: 'relative' }}>
                      <Search style={{
                        position: 'absolute',
                        left: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: '16px',
                        height: '16px',
                        color: '#9ca3af'
                      }} />
                      <input
                        type="text"
                        placeholder="Search by filename or document ID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{
                          width: '100%',
                          paddingLeft: '40px',
                          paddingRight: '16px',
                          paddingTop: '8px',
                          paddingBottom: '8px',
                          border: '1px solid #d1d5db',
                          borderRadius: '8px',
                          fontSize: '14px',
                          outline: 'none'
                        }}
                        onFocus={(e) => {
                          e.target.style.borderColor = '#3b82f6';
                          e.target.style.boxShadow = '0 0 0 2px rgba(59, 130, 246, 0.1)';
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = '#d1d5db';
                          e.target.style.boxShadow = 'none';
                        }}
                      />
                    </div>
                  </div>
                  
                  <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      style={{
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        fontSize: '14px',
                        outline: 'none'
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#3b82f6';
                        e.target.style.boxShadow = '0 0 0 2px rgba(59, 130, 246, 0.1)';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#d1d5db';
                        e.target.style.boxShadow = 'none';
                      }}
                    >
                      <option value="all">All Status</option>
                      <option value="pending">Pending</option>
                      <option value="processing">Processing</option>
                      <option value="completed">Completed</option>
                      <option value="error">Error</option>
                    </select>
                </div>
                
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  gap: '4px'
                }}>
                  <span style={{ fontSize: '14px', color: '#4b5563' }}>
                    Total <strong>{filteredDocuments.length}</strong> documents
                  </span>
                  {lastUpdated && (
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>
                      Last updated: {lastUpdated.toLocaleTimeString()}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 에러 표시 */}
          {error && (
            <div style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
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
              {paginatedDocuments.length > 0 ? (
                <>
                  {/* 문서 목록 테이블 */}
                  <div style={{
                    marginBottom: '24px',
                    background: 'white',
                    borderRadius: '8px',
                    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                    overflow: 'hidden'
                  }}>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                              <tr>
                                <th style={{
                                  padding: '6px 12px',
                                  textAlign: 'left',
                                  fontSize: '10px',
                                  fontWeight: '500',
                                  color: '#6b7280',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.05em'
                                }}>
                                  Document
                                </th>
                                <th style={{
                                  padding: '6px 12px',
                                  textAlign: 'left',
                                  fontSize: '10px',
                                  fontWeight: '500',
                                  color: '#6b7280',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.05em'
                                }}>
                                  Status
                                </th>
                                <th style={{
                                  padding: '6px 12px',
                                  textAlign: 'center',
                                  fontSize: '10px',
                                  fontWeight: '500',
                                  color: '#6b7280',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.05em'
                                }}>
                                  Actions
                                </th>
                                <th style={{
                                  padding: '6px 12px',
                                  textAlign: 'left',
                                  fontSize: '10px',
                                  fontWeight: '500',
                                  color: '#6b7280',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.05em'
                                }}>
                                  Progress
                                </th>
                                <th style={{
                                  padding: '6px 6px',
                                  textAlign: 'center',
                                  fontSize: '10px',
                                  fontWeight: '500',
                                  color: '#6b7280',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.05em',
                                  minWidth: '60px'
                                }}>
                                  Uploaded
                                </th>
                                <th style={{
                                  padding: '6px 12px',
                                  textAlign: 'left',
                                  fontSize: '10px',
                                  fontWeight: '500',
                                  color: '#6b7280',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.05em'
                                }}>
                                  Document ID
                                </th>
                              </tr>
                            </thead>
                            <tbody style={{ background: 'white' }}>
                              {paginatedDocuments.map((document, index) => {
                                const filename = extractFilename(document);
                                const status = extractStatus(document);
                                const progress = extractProgress(document);
                                const uploadedDate = extractUploadedDate(document);
                                
                                const formatDate = (dateString) => {
                                  if (!dateString) return "Unknown";
                                  const date = new Date(dateString);
                                  const month = String(date.getMonth() + 1).padStart(2, '0');
                                  const day = String(date.getDate()).padStart(2, '0');
                                  return `${month}/${day}`;
                                };
                                
                                return (
                                  <tr 
                                    key={document.id || document._id || index}
                                    style={{
                                      borderBottom: index < paginatedDocuments.length - 1 ? '1px solid #e5e7eb' : 'none',
                                      cursor: status === 'completed' ? 'pointer' : 'default'
                                    }}
                                  >
                                    <td style={{ padding: '8px 12px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center' }}>
                                        <div style={{
                                          backgroundColor: '#eff6ff',
                                          padding: '4px',
                                          borderRadius: '4px',
                                          marginRight: '8px'
                                        }}>
                                          <FileText style={{ width: '12px', height: '12px', color: '#3b82f6' }} />
                                        </div>
                                        <div>
                                          <p style={{
                                            fontSize: '12px',
                                            fontWeight: '500',
                                            color: '#111827',
                                            margin: '0',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                            maxWidth: '250px'
                                          }} title={filename}>
                                            {filename}
                                          </p>
                                        </div>
                                      </div>
                                    </td>
                                    <td style={{ padding: '8px 12px' }}>
                                      <span style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        borderRadius: '9999px',
                                        fontWeight: '500',
                                        fontSize: '10px',
                                        padding: '2px 6px',
                                        backgroundColor: '#dcfce7',
                                        color: '#166534'
                                      }}>
                                        <CheckCircle style={{ width: '10px', height: '10px', marginRight: '2px' }} />
                                        Completed
                                      </span>
                                    </td>
                                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                      <button style={{
                                        padding: '2px 6px',
                                        fontSize: '10px',
                                        fontWeight: '500',
                                        color: '#059669',
                                        backgroundColor: '#ecfdf5',
                                        border: '1px solid #d1fae5',
                                        borderRadius: '4px',
                                        cursor: 'pointer'
                                      }}>
                                        <Eye style={{ width: '10px', height: '10px', marginRight: '2px', display: 'inline' }} />
                                        View
                                      </button>
                                    </td>
                                    <td style={{ padding: '8px 12px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ flex: '1' }}>
                                          <div style={{
                                            width: '100%',
                                            backgroundColor: '#e5e7eb',
                                            borderRadius: '3px',
                                            height: '6px'
                                          }}>
                                            <div style={{
                                              height: '6px',
                                              borderRadius: '3px',
                                              backgroundColor: '#10b981',
                                              width: '100%'
                                            }} />
                                          </div>
                                        </div>
                                        <span style={{
                                          fontSize: '10px',
                                          color: '#6b7280',
                                          fontWeight: '500',
                                          minWidth: '30px'
                                        }}>
                                          100%
                                        </span>
                                      </div>
                                    </td>
                                    <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                                      <div style={{ 
                                        fontSize: '10px', 
                                        color: '#6b7280',
                                        fontFamily: 'monospace'
                                      }}>
                                        {formatDate(uploadedDate)}
                                      </div>
                                    </td>
                                    <td style={{ padding: '8px 12px' }}>
                                      <div style={{
                                        fontSize: '10px',
                                        fontFamily: 'monospace',
                                        color: '#6b7280',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        maxWidth: '120px'
                                      }} title={document.id || document._id || 'unknown-id'}>
                                        {document.id || document._id || 'unknown-id'}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                    </div>
                  </div>
                  
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
                <div style={{
                  textAlign: 'center',
                  padding: '48px 0',
                  background: 'white',
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
              )}
            </div>
          )}
        </div>
      </main>

      {/* 푸터 */}
      <footer style={{
        background: 'white',
        borderTop: '1px solid #e5e7eb',
        flexShrink: '0'
      }}>
        <div style={{ maxWidth: '80rem', margin: '0 auto', padding: '0 24px' }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '14px',
            color: '#6b7280',
            gap: '8px',
            padding: '16px 0'
          }}>
            <div>
              Connected to: <code style={{
                backgroundColor: '#f3f4f6',
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
      />

    </div>
  );
};

export default DocumentStatusDashboard;
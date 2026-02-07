/**
 * documentStatusHelper.js
 * 문서 상태 분석 헬퍼 함수들
 */

const { normalizeTimestamp } = require('./timeUtils');

/**
 * OCR/임베딩 처리가 불가능한 MIME 타입 목록
 */
const UNSUPPORTED_MIMES = [
  'application/zip',
  'application/x-zip-compressed',
  'application/x-rar',
  'application/x-rar-compressed',
  'audio/',
  'video/',
  'application/postscript'  // .ai 파일
];

/**
 * PDF 변환 대상 확장자 목록
 */
const CONVERTIBLE_EXTENSIONS = [
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'odt', 'ods', 'odp', 'rtf', 'txt', 'csv', 'html', 'hwp'
];

/**
 * 네이티브 프리뷰 가능 확장자 (변환 불필요)
 */
const NATIVE_PREVIEW_EXTENSIONS = [
  'pdf', 'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tif', 'tiff'
];

/**
 * 파일이 PDF 변환 대상인지 확인
 */
function isConvertibleFile(filePath) {
  if (!filePath) return false;
  const ext = (filePath.split('.').pop() || '').toLowerCase();
  return CONVERTIBLE_EXTENSIONS.includes(ext);
}

/**
 * 파일이 네이티브 프리뷰 가능한지 확인
 */
function isNativePreviewable(filePath) {
  if (!filePath) return false;
  const ext = (filePath.split('.').pop() || '').toLowerCase();
  return NATIVE_PREVIEW_EXTENSIONS.includes(ext);
}

/**
 * MIME 타입이 지원되지 않는지 확인
 */
function isUnsupportedMimeType(mimeType) {
  if (!mimeType) return false;
  return UNSUPPORTED_MIMES.some(unsupported => mimeType.startsWith(unsupported));
}

/**
 * 바이트를 사람이 읽기 쉬운 형태로 변환
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 📦 NEW: DB 원본 데이터와 계산된 UI 값을 분리하여 반환
 *
 * @param {Object} doc - MongoDB에서 조회한 원본 문서
 * @returns {Object} { raw, computed } 구조
 */
function prepareDocumentResponse(doc) {
  // 📦 1. 원본 데이터 (DB 그대로 복사)
  const raw = {
    _id: doc._id,
    upload: doc.upload || null,
    meta: doc.meta || null,
    ocr: doc.ocr || null,
    text: doc.text || null,
    docembed: doc.docembed || null,
    customer_relation: doc.customer_relation || null,
    ownerId: doc.ownerId || null,  // 🆕 내 파일 기능
    customerId: doc.customerId || null,  // 🆕 내 파일 기능
    document_type: doc.document_type || null,  // 🏷️ 문서 유형
    document_type_auto: doc.document_type_auto || false,  // 🏷️ 자동 분류 여부
    virusScan: doc.virusScan || null  // 🔴 바이러스 스캔 정보
  };

  // ========================
  // PDF 변환 및 프리뷰 관련 계산 (모든 반환 지점에서 사용)
  // ========================
  const destPath = doc.upload?.destPath;
  const convPdfPath = doc.upload?.convPdfPath;
  const conversionStatus = doc.upload?.conversion_status || null;

  // 프리뷰 가능 여부 및 경로 결정
  let canPreview = false;
  let previewFilePath = null;

  // 1. 변환된 PDF가 있으면 사용
  if (convPdfPath && conversionStatus === 'completed') {
    canPreview = true;
    previewFilePath = convPdfPath;
  }
  // 2. 원본이 PDF/이미지면 원본 사용
  else if (destPath) {
    const ext = (destPath.split('.').pop() || '').toLowerCase();
    const previewableExts = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
    if (previewableExts.includes(ext)) {
      canPreview = true;
      previewFilePath = destPath;
    }
  }

  // PDF 변환 대상 여부 (변환 대상 확장자인지 확인)
  const isConvertible = isConvertibleFile(destPath);

  // PDF 관련 필드 (모든 computed 반환에 포함)
  const pdfFields = { canPreview, previewFilePath, conversionStatus, isConvertible };

  // 🔴 PRIORITY: document_pipeline에서 설정한 progress 필드 우선 사용
  // (폴링 시 즉각적인 상태 반영을 위해)
  if (doc.progress !== undefined && doc.progress !== null) {
    const hasMetaText = doc.meta && doc.meta.full_text;

    // 🔴 credit_pending 상태 체크 (크레딧 부족으로 처리 보류)
    if (doc.progressStage === 'credit_pending' || doc.status === 'credit_pending' || doc.overallStatus === 'credit_pending') {
      const uiStages = {
        upload: { name: '업로드', status: 'completed', message: '파일 저장됨', timestamp: null },
        credit: { name: '크레딧', status: 'warning', message: doc.credit_pending_info?.days_until_reset
          ? `크레딧 부족 (${doc.credit_pending_info.days_until_reset}일 후 리셋)`
          : '크레딧 부족으로 대기 중', timestamp: null }
      };
      return {
        raw,
        computed: {
          uiStages,
          currentStage: 1,
          overallStatus: 'credit_pending',
          progress: 0,
          displayMessages: {
            status: '크레딧 부족',
            message: doc.credit_pending_info?.days_until_reset
              ? `크레딧이 부족합니다. ${doc.credit_pending_info.days_until_reset}일 후 자동 처리됩니다.`
              : '크레딧이 부족하여 처리가 보류되었습니다.'
          },
          creditPending: true,
          creditInfo: doc.credit_pending_info || {},
          ...pdfFields
        }
      };
    }

    // progress 100이거나 complete면 완료 상태 반환
    if (doc.progress >= 100 || doc.progressStage === 'complete') {
      const uiStages = hasMetaText ? {
        upload: { name: '업로드', status: 'completed', message: '업로드 완료', timestamp: null },
        meta: { name: '메타데이터', status: 'completed', message: '완료', timestamp: null },
        docembed: { name: '임베딩', status: 'completed', message: '완료', timestamp: null }
      } : {
        upload: { name: '업로드', status: 'completed', message: '업로드 완료', timestamp: null },
        meta: { name: '메타데이터', status: 'completed', message: '완료', timestamp: null },
        ocr: { name: 'OCR 처리', status: 'completed', message: '완료', timestamp: null },
        docembed: { name: '임베딩', status: 'completed', message: '완료', timestamp: null }
      };
      return {
        raw,
        computed: {
          uiStages,
          currentStage: 5,
          overallStatus: 'completed',
          progress: 100,
          displayMessages: { upload: '완료', meta: '완료', ocr: '완료', docembed: '완료' },
          ...pdfFields
        }
      };
    }

    // 중간 progress 값 (20~99) - processing 상태 반환
    const uiStages = hasMetaText ? {
      upload: { name: '업로드', status: doc.progress >= 20 ? 'completed' : 'processing', message: doc.progressMessage || '처리 중', timestamp: null },
      meta: { name: '메타데이터', status: doc.progress >= 40 ? 'completed' : 'processing', message: doc.progressMessage || '처리 중', timestamp: null },
      docembed: { name: '임베딩', status: doc.progress >= 80 ? 'processing' : 'pending', message: doc.progressMessage || '대기 중', timestamp: null }
    } : {
      upload: { name: '업로드', status: doc.progress >= 20 ? 'completed' : 'processing', message: doc.progressMessage || '처리 중', timestamp: null },
      meta: { name: '메타데이터', status: doc.progress >= 40 ? 'completed' : 'processing', message: doc.progressMessage || '처리 중', timestamp: null },
      ocr: { name: 'OCR 처리', status: doc.progress >= 60 ? 'processing' : 'pending', message: doc.progressMessage || '대기 중', timestamp: null },
      docembed: { name: '임베딩', status: doc.progress >= 80 ? 'processing' : 'pending', message: doc.progressMessage || '대기 중', timestamp: null }
    };
    return {
      raw,
      computed: {
        uiStages,
        currentStage: Math.floor(doc.progress / 20),
        overallStatus: 'processing',
        progress: doc.progress,
        displayMessages: { status: doc.progressMessage || '처리 중' },
        ...pdfFields
      }
    };
  }

  // 🧮 2. 계산된 UI 값
  const hasMetaText = doc.meta && doc.meta.full_text;
  const isUnsupported = isUnsupportedMimeType(doc.meta?.mime);

  // 비지원 MIME 타입은 upload + meta만 (OCR/임베딩 불가)
  const uiStages = isUnsupported ? {
    upload: { name: '업로드', status: 'pending', message: '대기 중', timestamp: null },
    meta: { name: '메타데이터', status: 'pending', message: '대기 중', timestamp: null }
  } : hasMetaText ? {
    upload: { name: '업로드', status: 'pending', message: '대기 중', timestamp: null },
    meta: { name: '메타데이터', status: 'pending', message: '대기 중', timestamp: null },
    docembed: { name: '임베딩', status: 'pending', message: '대기 중', timestamp: null }
  } : {
    upload: { name: '업로드', status: 'pending', message: '대기 중', timestamp: null },
    meta: { name: '메타데이터', status: 'pending', message: '대기 중', timestamp: null },
    ocr_prep: { name: 'OCR 준비', status: 'pending', message: '대기 중', timestamp: null },
    ocr: { name: 'OCR 처리', status: 'pending', message: '대기 중', timestamp: null },
    docembed: { name: '임베딩', status: 'pending', message: '대기 중', timestamp: null }
  };

  let currentStage = 0;
  let overallStatus = 'pending';
  let progress = 0;
  const displayMessages = {};

  // Upload 단계
  if (doc.upload) {
    uiStages.upload.status = 'completed';
    uiStages.upload.message = '업로드 완료';
    uiStages.upload.timestamp = normalizeTimestamp(doc.upload.uploaded_at);
    displayMessages.upload = '업로드 완료';
    currentStage = 1;
    progress = 20;
  }

  // Meta 단계
  if (doc.meta && doc.meta.meta_status === 'ok') {
    uiStages.meta.status = 'completed';
    uiStages.meta.message = `메타데이터 추출 완료 (${doc.meta.mime}, ${formatBytes(doc.meta.size_bytes)})`;
    uiStages.meta.timestamp = normalizeTimestamp(doc.meta.created_at);
    displayMessages.meta = `메타데이터 추출 완료 (${doc.meta.mime})`;
    currentStage = 2;

    // 비지원 MIME 타입은 meta 완료시 즉시 100% 완료
    if (isUnsupported) {
      progress = 100;
      overallStatus = 'completed';
      return {
        raw,
        computed: { uiStages, currentStage, overallStatus, progress, displayMessages, ...pdfFields }
      };
    }

    progress = hasMetaText ? 50 : 40;
  } else if (doc.meta && doc.meta.meta_status === 'error') {
    // meta_status가 명시적으로 'error'인 경우에만 에러 처리
    uiStages.meta.status = 'error';
    uiStages.meta.message = '메타데이터 추출 실패';
    displayMessages.meta = '메타데이터 추출 실패';
    overallStatus = 'error';
    return {
      raw,
      computed: { uiStages, currentStage: 1, overallStatus, progress, displayMessages, ...pdfFields }
    };
  } else if (doc.meta && doc.meta.meta_status === null) {
    // ✅ NEW: meta_status가 null이면 meta 단계 스킵 (OCR로 직접 처리)
    uiStages.meta.status = 'skipped';
    uiStages.meta.message = 'Meta 단계 생략 (OCR 직접 처리)';
    displayMessages.meta = 'Meta 단계 생략';
    currentStage = 1;
    progress = 20;
  }

  // OCR 준비 (가상 단계)
  if (!hasMetaText && doc.meta && doc.meta.meta_status === 'ok') {
    uiStages.ocr_prep.status = 'completed';
    uiStages.ocr_prep.message = 'OCR 준비 완료';
    uiStages.ocr_prep.timestamp = normalizeTimestamp(doc.meta.created_at); // meta 완료 시점 사용
    currentStage = 3;
    progress = 60;
  }

  // OCR 처리
  if (!hasMetaText && doc.ocr) {
    if (doc.ocr.warn) {
      uiStages.ocr.status = 'skipped';
      uiStages.ocr.message = doc.ocr.warn;
      displayMessages.ocr = '생략됨: ' + doc.ocr.warn;
      uiStages.docembed.status = 'skipped';
      uiStages.docembed.message = 'OCR 생략으로 인한 건너뜀';
      overallStatus = 'completed_with_skip';
      progress = 100;
    } else if (doc.ocr.queue) {
      uiStages.ocr.status = 'processing';
      uiStages.ocr.message = 'OCR 대기열에서 처리 대기 중';
      displayMessages.ocr = 'OCR 대기 중';
      currentStage = 4;
      progress = 70;
      overallStatus = 'processing';
    } else if (doc.ocr.status === 'running') {
      uiStages.ocr.status = 'processing';
      uiStages.ocr.message = 'OCR 처리 중';
      displayMessages.ocr = 'OCR 처리 중';
      currentStage = 4;
      progress = 75;
      overallStatus = 'processing';
    } else if (doc.ocr.status === 'done') {
      uiStages.ocr.status = 'completed';
      uiStages.ocr.message = `OCR 완료 (신뢰도: ${doc.ocr.confidence})`;
      uiStages.ocr.timestamp = normalizeTimestamp(doc.ocr.done_at || doc.ocr.started_at); // done_at 우선, 없으면 started_at
      displayMessages.ocr = `OCR 완료 (신뢰도: ${doc.ocr.confidence || 'N/A'})`;
      currentStage = 4;
      progress = 80;
    } else if (doc.ocr.status === 'error' || doc.ocr.status === 'quota_exceeded') {
      uiStages.ocr.status = 'error';
      // quota_exceeded인 경우 별도 메시지 처리
      let errorMsg;
      if (doc.ocr.status === 'quota_exceeded') {
        errorMsg = doc.ocr.quota_message || 'OCR 한도 초과';
      } else {
        errorMsg = doc.ocr.statusMessage
          ? `OCR 실패: ${doc.ocr.statusMessage}`
          : `OCR 실패 (${doc.ocr.statusCode || '알 수 없는 오류'})`;
      }
      uiStages.ocr.message = errorMsg;
      displayMessages.ocr = errorMsg;

      // ✅ OCR 실패 시 docembed는 생성되지 않음 (DB에도 없음)
      // uiStages에서도 docembed 키를 삭제하여 UI에 표시하지 않음
      delete uiStages.docembed;

      overallStatus = 'error';
      currentStage = 4;
      progress = 60; // OCR 단계에서 실패
      return {
        raw,
        computed: { uiStages, currentStage, overallStatus, progress, displayMessages, ...pdfFields }
      };
    }
  }

  // text/plain 직접 처리
  if (!hasMetaText && doc.text && doc.text.full_text) {
    uiStages.ocr.status = 'completed';
    uiStages.ocr.message = '텍스트 파일 직접 처리 완료';
    displayMessages.ocr = '텍스트 직접 처리 완료';
    currentStage = 4;
    progress = 80;
  }

  // DocEmbed 단계
  if (doc.docembed) {
    if (doc.docembed.status === 'done') {
      uiStages.docembed.status = 'completed';
      uiStages.docembed.message = `임베딩 완료 (${doc.docembed.chunks}개 청크, ${doc.docembed.dims}차원)`;
      uiStages.docembed.timestamp = normalizeTimestamp(doc.docembed.updated_at); // updated_at 사용
      displayMessages.docembed = `임베딩 완료 (${doc.docembed.chunks}개 청크)`;
      currentStage = hasMetaText ? 3 : 5;
      progress = 100;
      overallStatus = 'completed';
    } else if (doc.docembed.status === 'failed') {
      uiStages.docembed.status = 'error';
      uiStages.docembed.message = `임베딩 실패: ${doc.docembed.error_message}`;
      displayMessages.docembed = `임베딩 실패: ${doc.docembed.error_message}`;
      overallStatus = 'error';
    } else if (doc.docembed.status === 'processing') {
      uiStages.docembed.status = 'processing';
      uiStages.docembed.message = '임베딩 처리 중';
      displayMessages.docembed = '임베딩 처리 중';
      currentStage = hasMetaText ? 3 : 5;
      progress = 90;
      overallStatus = 'processing';
    }
  }

  // 전체 상태 최종 결정
  if (overallStatus === 'pending' && currentStage > 0) {
    overallStatus = 'processing';
  }

  return {
    raw,
    computed: {
      uiStages,
      currentStage,
      overallStatus,
      progress,
      displayMessages,
      processingPath: hasMetaText ? 'meta_fulltext' : 'ocr_normal',
      ...pdfFields
    }
  };
}

/**
 * 🔴 DEPRECATED: 기존 analyzeDocumentStatus() 함수
 * → prepareDocumentResponse()로 대체됨
 *
 * 하위 호환성을 위해 유지. customers-routes.js 등에서 사용.
 */
function analyzeDocumentStatus(doc) {
  if (doc.overallStatus === 'completed') {
    const response = prepareDocumentResponse(doc);
    return {
      stages: response.computed.uiStages,
      currentStage: response.computed.currentStage,
      overallStatus: 'completed',
      progress: 100
    };
  }

  const response = prepareDocumentResponse(doc);
  return {
    stages: response.computed.uiStages,
    currentStage: response.computed.currentStage,
    overallStatus: response.computed.overallStatus,
    progress: response.computed.progress
  };
}

module.exports = {
  prepareDocumentResponse,
  formatBytes,
  isConvertibleFile,
  isNativePreviewable,
  analyzeDocumentStatus,
  CONVERTIBLE_EXTENSIONS
};

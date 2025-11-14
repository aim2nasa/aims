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
    customer_relation: doc.customer_relation || null
  };

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
        computed: { uiStages, currentStage, overallStatus, progress, displayMessages }
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
      computed: { uiStages, currentStage: 1, overallStatus, progress, displayMessages }
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
    } else if (doc.ocr.status === 'error') {
      uiStages.ocr.status = 'error';
      const errorMsg = doc.ocr.statusMessage
        ? `OCR 실패: ${doc.ocr.statusMessage}`
        : `OCR 실패 (${doc.ocr.statusCode || '알 수 없는 오류'})`;
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
        computed: { uiStages, currentStage, overallStatus, progress, displayMessages }
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
      processingPath: hasMetaText ? 'meta_fulltext' : 'ocr_normal'
    }
  };
}

module.exports = {
  prepareDocumentResponse,
  formatBytes
};

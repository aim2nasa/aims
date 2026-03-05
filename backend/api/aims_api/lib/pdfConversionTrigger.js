/**
 * pdfConversionTrigger.js
 * PDF 변환 오케스트레이션 (DB 상태 관리 + SSE 알림 + 변환 트리거)
 *
 * documents-routes.js, customers-routes.js 등 여러 라우트에서 공유.
 * db를 인자로 받는 팩토리 함수로 제공.
 */

const { ObjectId } = require('mongodb');
const { COLLECTIONS } = require('@aims/shared-schema');
const pdfConversionService = require('./pdfConversionService');
const backendLogger = require('./backendLogger');
const { utcNowISO, utcNowDate } = require('./timeUtils');
const { notifyCustomerDocSubscribers } = require('./sseManager');

const COLLECTION_NAME = COLLECTIONS.FILES;

/**
 * PDF 변환 트리거 팩토리
 * @param {import('mongodb').Db} db - MongoDB 데이터베이스 인스턴스
 * @returns {{ convertDocumentInBackground, triggerPdfConversionIfNeeded }}
 */
module.exports = function createPdfConversionTrigger(db) {

  /**
   * 문서를 PDF 변환 큐에 등록
   *
   * 실제 변환은 document_pipeline의 PdfConversionWorker가 수행.
   * DB 상태 업데이트 및 SSE 알림도 Worker가 처리.
   *
   * @param {ObjectId|string} fileId - 파일 ID
   * @param {string} inputPath - 원본 파일 경로
   */
  async function convertDocumentInBackground(fileId, inputPath) {
    const fileIdStr = fileId.toString();
    const path = require('path');

    try {
      // pdf_conversion_queue에 작업 등록 (upsert: 중복 방지)
      await db.collection('pdf_conversion_queue').updateOne(
        { document_id: fileIdStr, job_type: 'preview_pdf' },
        {
          $setOnInsert: {
            status: 'pending',
            document_id: fileIdStr,
            job_type: 'preview_pdf',
            input_path: inputPath,
            original_name: path.basename(inputPath),
            caller: 'aims_api',
            callback_data: {},
            result: null,
            created_at: new Date(),
            started_at: null,
            completed_at: null,
            worker_id: null,
            retry_count: 0,
            error_message: null,
            process_after: null,
          }
        },
        { upsert: true }
      );
      console.log(`[PDF변환] 큐 등록: ${fileIdStr} (${path.basename(inputPath)})`);
    } catch (error) {
      console.error(`[PDF변환] 큐 등록 실패 (${fileIdStr}):`, error.message);
      backendLogger.error('Documents', `[PDF변환] 큐 등록 실패 (${fileIdStr})`, error);
    }
  }

  /**
   * 문서의 PDF 변환이 필요한지 확인하고 트리거
   * @param {Object} document - 문서 객체
   * @returns {Promise<string>} 'triggered' | 'not_required' | 'already_done' | 'already_processing'
   */
  async function triggerPdfConversionIfNeeded(document) {
    const originalName = document.upload?.originalName;
    const destPath = document.upload?.destPath;
    const conversionStatus = document.upload?.conversion_status;

    // 이미 변환 완료
    if (conversionStatus === 'completed') {
      return 'already_done';
    }

    // 이미 변환 중
    if (conversionStatus === 'processing' || conversionStatus === 'pending') {
      return 'already_processing';
    }

    // 변환 가능 여부 체크
    if (!pdfConversionService.isConvertible(originalName)) {
      // 이미 프리뷰 가능하거나 지원하지 않는 형식
      if (!conversionStatus) {
        await db.collection(COLLECTION_NAME).updateOne(
          { _id: document._id },
          { $set: { 'upload.conversion_status': 'not_required' } }
        );
      }
      return 'not_required';
    }

    // 파일 경로가 없으면 변환 불가
    if (!destPath) {
      console.warn(`[PDF변환] 파일 경로 없음: ${document._id}`);
      return 'not_required';
    }

    // 변환 상태를 pending으로 설정 후 백그라운드 변환 시작
    await db.collection(COLLECTION_NAME).updateOne(
      { _id: document._id },
      { $set: { 'upload.conversion_status': 'pending' } }
    );

    // 비동기로 변환 시작 (await 없음)
    convertDocumentInBackground(document._id, destPath);

    return 'triggered';
  }

  return {
    convertDocumentInBackground,
    triggerPdfConversionIfNeeded
  };
};

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

// 재시도 한도 상수 (documents-routes.js 등 외부에서도 import 가능)
const MAX_AUTO_RETRIES = 3;   // triggerPdfConversionIfNeeded() 자동 재시도
const MAX_MANUAL_RETRIES = 1; // documents-routes.js retry 엔드포인트 수동 재시도

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
   * @param {Object} [options] - 옵션
   * @param {boolean} [options.force=false] - true일 때 기존 failed/completed 큐 레코드를 삭제 후 재등록
   */
  async function convertDocumentInBackground(fileId, inputPath, options = {}) {
    const fileIdStr = fileId.toString();
    const path = require('path');
    const { force = false } = options;

    // force 모드: 기존 failed/completed 레코드 삭제 후 새 pending 작업 등록
    // (processing 상태는 cleanup_stale_jobs가 처리하므로 건드리지 않음)
    if (force) {
      const deleteResult = await db.collection('pdf_conversion_queue').deleteMany({
        document_id: fileIdStr,
        job_type: 'preview_pdf',
        status: { $in: ['failed', 'completed'] }
      });
      if (deleteResult.deletedCount > 0) {
        console.log(`[PDF변환] force: 기존 큐 레코드 ${deleteResult.deletedCount}건 삭제 (${fileIdStr})`);
      } else {
        // processing 레코드가 남아있으면 upsert가 no-op → 경고
        const processingDoc = await db.collection('pdf_conversion_queue').findOne({
          document_id: fileIdStr,
          job_type: 'preview_pdf',
          status: 'processing'
        });
        if (processingDoc) {
          console.warn(`[PDF변환] force: processing 상태 큐 레코드 존재 (${fileIdStr}) — cleanup_stale_jobs 대기 필요`);
        } else {
          console.debug(`[PDF변환] force: 삭제할 큐 레코드 없음 (${fileIdStr}) — 이미 정리됨`);
        }
      }
    }

    // pdf_conversion_queue에 작업 등록 (upsert: 중복 방지)
    const upsertResult = await db.collection('pdf_conversion_queue').updateOne(
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

    if (upsertResult.upsertedCount > 0) {
      console.log(`[PDF변환] 큐 등록: ${fileIdStr} (${path.basename(inputPath)})`);
    } else {
      // upsert가 no-op — processing 상태 레코드가 남아있을 가능성 높음
      // cleanup_stale_jobs가 타임아웃된 processing을 pending으로 복구할 때까지 대기
      console.warn(`[PDF변환] 큐 등록 no-op: 기존 레코드 존재 (${fileIdStr}) — processing 상태일 수 있음`);
    }
  }

  /**
   * 문서의 PDF 변환이 필요한지 확인하고 트리거
   * @param {Object} document - 문서 객체
   * @returns {Promise<string>} 'triggered' | 'not_required' | 'already_done' | 'already_processing' | 'max_retries_exceeded'
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

    // 이전 변환 실패 → retry_count 확인 후 force 모드로 재큐잉
    // (customers-routes.js 등 여러 호출처에서 무한 재시도 방지)
    if (conversionStatus === 'failed') {
      const retryCount = document.upload?.conversion_retry_count || 0;
      if (retryCount >= MAX_AUTO_RETRIES) {
        console.warn(`[PDF변환] 최대 재시도 초과 (${retryCount}/${MAX_AUTO_RETRIES}): ${document._id}`);
        return 'max_retries_exceeded';
      }

      if (!destPath) {
        console.warn(`[PDF변환] 파일 경로 없음 (failed 재시도): ${document._id}`);
        return 'not_required';
      }

      // 상태를 pending으로 변경 + retry_count 증가
      await db.collection(COLLECTION_NAME).updateOne(
        { _id: document._id },
        {
          $set: { 'upload.conversion_status': 'pending' },
          $inc: { 'upload.conversion_retry_count': 1 }
        }
      );

      try {
        await convertDocumentInBackground(document._id, destPath, { force: true });
      } catch (error) {
        // 큐 등록 실패 → conversion_status를 failed로 롤백 (pending hang 방지)
        console.error(`[PDF변환] 큐 등록 실패, failed로 롤백: ${document._id}`, error.message);
        backendLogger.error('Documents', `[PDF변환] 큐 등록 실패 롤백 (${document._id})`, error);
        await db.collection(COLLECTION_NAME).updateOne(
          { _id: document._id },
          {
            $set: { 'upload.conversion_status': 'failed', 'upload.conversion_error': error.message },
            $inc: { 'upload.conversion_retry_count': -1 }
          }
        );
        return 'not_required';
      }
      return 'triggered';
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

    // 변환 상태를 pending으로 설정 후 큐 등록
    await db.collection(COLLECTION_NAME).updateOne(
      { _id: document._id },
      { $set: { 'upload.conversion_status': 'pending' } }
    );

    try {
      await convertDocumentInBackground(document._id, destPath);
    } catch (error) {
      // 큐 등록 실패 → pending hang 방지를 위해 상태 초기화
      console.error(`[PDF변환] 첫 큐 등록 실패, 상태 초기화: ${document._id}`, error.message);
      backendLogger.error('Documents', `[PDF변환] 첫 큐 등록 실패 (${document._id})`, error);
      await db.collection(COLLECTION_NAME).updateOne(
        { _id: document._id },
        { $unset: { 'upload.conversion_status': '' } }
      );
      return 'not_required';
    }

    return 'triggered';
  }

  return {
    convertDocumentInBackground,
    triggerPdfConversionIfNeeded
  };
};

// 상수 export (팩토리 함수 프로퍼티로 노출)
module.exports.MAX_AUTO_RETRIES = MAX_AUTO_RETRIES;
module.exports.MAX_MANUAL_RETRIES = MAX_MANUAL_RETRIES;

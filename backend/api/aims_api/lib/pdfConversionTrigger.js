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
   * 문서를 백그라운드에서 PDF로 변환
   * @param {ObjectId|string} fileId - 파일 ID
   * @param {string} inputPath - 원본 파일 경로
   */
  async function convertDocumentInBackground(fileId, inputPath) {
    const fileIdStr = fileId.toString();

    // SSE 알림용: 문서의 customerId 조회
    const notifyDocumentStatusChange = async (status) => {
      try {
        const doc = await db.collection(COLLECTION_NAME).findOne({ _id: new ObjectId(fileIdStr) });
        if (doc && doc.customerId) {
          notifyCustomerDocSubscribers(doc.customerId.toString(), 'document-status-change', {
            type: 'conversion',
            status: status,
            customerId: doc.customerId.toString(),
            documentId: fileIdStr,
            documentName: doc.upload?.originalName || 'Unknown',
            timestamp: utcNowISO()
          });
        }
      } catch (err) {
        console.error(`[PDF변환] SSE 알림 실패 (${fileIdStr}):`, err.message);
      }
    };

    try {
      // 1. 상태를 processing으로 업데이트
      await db.collection(COLLECTION_NAME).updateOne(
        { _id: new ObjectId(fileIdStr) },
        { $set: { 'upload.conversion_status': 'processing' } }
      );
      // SSE 알림: processing 시작
      await notifyDocumentStatusChange('processing');

      console.log(`[PDF변환] 변환 시작: ${inputPath}`);

      // 2. PDF 변환 실행
      const pdfPath = await pdfConversionService.convertDocument(inputPath);

      // 3. 성공 시 DB 업데이트
      await db.collection(COLLECTION_NAME).updateOne(
        { _id: new ObjectId(fileIdStr) },
        {
          $set: {
            'upload.convPdfPath': pdfPath,
            'upload.converted_at': utcNowDate(),
            'upload.conversion_status': 'completed'
          }
        }
      );
      // SSE 알림: 변환 완료
      await notifyDocumentStatusChange('completed');

      console.log(`[PDF변환] 변환 완료: ${pdfPath}`);
    } catch (error) {
      console.error(`[PDF변환] 변환 실패 (${fileIdStr}): ${error.message}`);
      backendLogger.error('Documents', `[PDF변환] 변환 실패 (${fileIdStr})`, error);

      // 4. 실패 시 에러 기록
      await db.collection(COLLECTION_NAME).updateOne(
        { _id: new ObjectId(fileIdStr) },
        {
          $set: {
            'upload.conversion_status': 'failed',
            'upload.conversion_error': error.message
          }
        }
      );
      // SSE 알림: 변환 실패
      await notifyDocumentStatusChange('failed');
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

/**
 * qdrant-sync.js - Qdrant 고객-문서 관계 동기화 서비스
 *
 * customers-routes.js에서 추출된 공유 모듈
 * @since 2026-04-04
 */

const backendLogger = require('../lib/backendLogger');

module.exports = function(qdrantClient) {
  /**
   * Qdrant에서 문서의 모든 청크에 customer_id를 동기화합니다.
   * @param {string} documentId - 문서 ID (ObjectId 문자열)
   * @param {string|null} customerId - 고객 ID (ObjectId 문자열, null이면 제거)
   * @returns {Promise<{success: boolean, message: string, chunksUpdated?: number}>}
   */
  async function syncQdrantCustomerRelation(documentId, customerId) {
    try {
      const qdrantCollectionName = 'docembed';

      // 1. Qdrant에서 해당 문서의 모든 청크 찾기 (doc_id로 필터링)
      const scrollResult = await qdrantClient.scroll(qdrantCollectionName, {
        filter: {
          must: [
            {
              key: 'doc_id',
              match: { value: documentId }
            }
          ]
        },
        limit: 1000, // 대용량 문서 대비 (최대 700개 예상)
        with_payload: true
      });

      const points = scrollResult.points; // Node.js 클라이언트는 {points: [], next_page_offset: ...} 형식으로 반환

      if (!points || points.length === 0) {
        console.log(`⚠️  [Qdrant 동기화] 문서 ${documentId}의 청크를 찾을 수 없습니다.`);
        return {
          success: true,
          message: 'Qdrant에 청크가 없음 (임베딩 전 문서)',
          chunksUpdated: 0
        };
      }

      console.log(`🔄 [Qdrant 동기화] 문서 ${documentId}의 ${points.length}개 청크 업데이트 시작`);

      // 2. 각 청크의 payload 업데이트
      const pointIds = points.map(point => point.id);

      if (customerId === null) {
        // customer_id 제거 (연결 해제)
        await qdrantClient.deletePayload(qdrantCollectionName, {
          keys: ['customer_id'],
          points: pointIds
        });
        console.log(`✅ [Qdrant 동기화] ${pointIds.length}개 청크에서 customer_id 제거 완료`);
      } else {
        // customer_id 추가/업데이트
        await qdrantClient.setPayload(qdrantCollectionName, {
          payload: { customer_id: customerId },
          points: pointIds
        });
        console.log(`✅ [Qdrant 동기화] ${pointIds.length}개 청크에 customer_id=${customerId} 설정 완료`);
      }

      return {
        success: true,
        message: 'Qdrant 동기화 성공',
        chunksUpdated: pointIds.length
      };

    } catch (error) {
      console.error(`❌ [Qdrant 동기화 오류] 문서 ${documentId}:`, error);
      backendLogger.error('Qdrant', `[Qdrant 동기화 오류] 문서 ${documentId}`, error);
      return {
        success: false,
        message: `Qdrant 동기화 실패: ${error.message}`
      };
    }
  }

  return { syncQdrantCustomerRelation };
};

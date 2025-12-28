/**
 * Storage Quota API Routes
 * @since 1.0.0
 *
 * 설계사별 디스크 할당량 관리 API
 */

const express = require('express');
const router = express.Router();
const {
  getUserStorageInfo,
  updateUserTier,
  getSystemStorageOverview,
  formatBytes,
  getTierDefinitions,
  updateTierDefinition
} = require('../lib/storageQuotaService');
const backendLogger = require('../lib/backendLogger');

/**
 * 라우트 설정 함수
 * @param {Db} db - MongoDB 인스턴스
 * @param {Function} authenticateJWT - JWT 인증 미들웨어
 * @param {Function} requireRole - 역할 검증 미들웨어
 * @param {Function} notifyUserAccountSubscribers - SSE 사용자 계정 알림 함수
 */
module.exports = function(db, authenticateJWT, requireRole, notifyUserAccountSubscribers) {

  /**
   * GET /api/users/me/storage
   * 내 스토리지 정보 조회
   */
  router.get('/users/me/storage', authenticateJWT, async (req, res) => {
    try {
      const userId = req.user.id;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: '사용자 ID가 필요합니다.'
        });
      }

      const storageInfo = await getUserStorageInfo(db, userId);

      res.json({
        success: true,
        data: {
          ...storageInfo,
          formatted: {
            quota: formatBytes(storageInfo.quota_bytes),
            used: formatBytes(storageInfo.used_bytes),
            remaining: formatBytes(storageInfo.remaining_bytes)
          }
        }
      });

    } catch (error) {
      console.error('스토리지 정보 조회 오류:', error);
      backendLogger.error('Storage', '스토리지 정보 조회 오류', error);
      res.status(500).json({
        success: false,
        error: '스토리지 정보 조회에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * GET /api/admin/users/:id/storage
   * 특정 사용자 스토리지 정보 조회 (관리자용)
   */
  router.get('/admin/users/:id/storage', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: '사용자 ID가 필요합니다.'
        });
      }

      const storageInfo = await getUserStorageInfo(db, id);

      res.json({
        success: true,
        data: {
          userId: id,
          ...storageInfo,
          formatted: {
            quota: formatBytes(storageInfo.quota_bytes),
            used: formatBytes(storageInfo.used_bytes),
            remaining: formatBytes(storageInfo.remaining_bytes)
          }
        }
      });

    } catch (error) {
      console.error('사용자 스토리지 정보 조회 오류:', error);
      backendLogger.error('Storage', '사용자 스토리지 정보 조회 오류', error);
      res.status(500).json({
        success: false,
        error: '사용자 스토리지 정보 조회에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * PUT /api/admin/users/:id/quota
   * 사용자 티어/할당량 변경 (관리자용)
   */
  router.put('/admin/users/:id/quota', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;
      const { tier } = req.body;

      if (!id || !tier) {
        return res.status(400).json({
          success: false,
          error: '사용자 ID와 티어가 필요합니다.'
        });
      }

      const result = await updateUserTier(db, id, tier);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: '티어 변경에 실패했습니다.'
        });
      }

      // SSE로 해당 사용자에게 티어 변경 알림
      if (notifyUserAccountSubscribers) {
        notifyUserAccountSubscribers(id, 'tier-changed', {
          tier: result.tier,
          quota_bytes: result.quota_bytes,
          formatted_quota: formatBytes(result.quota_bytes),
          timestamp: new Date().toISOString()
        });
      }

      res.json({
        success: true,
        message: `티어가 ${tier}로 변경되었습니다.`,
        data: {
          userId: id,
          tier: result.tier,
          quota_bytes: result.quota_bytes,
          formatted_quota: formatBytes(result.quota_bytes)
        }
      });

    } catch (error) {
      console.error('티어 변경 오류:', error);
      backendLogger.error('Storage', '티어 변경 오류', error);
      res.status(500).json({
        success: false,
        error: error.message || '티어 변경에 실패했습니다.'
      });
    }
  });

  /**
   * GET /api/admin/storage/overview
   * 시스템 전체 스토리지 통계 (관리자용)
   */
  router.get('/admin/storage/overview', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const overview = await getSystemStorageOverview(db);

      res.json({
        success: true,
        data: {
          ...overview,
          formatted: {
            total_used: formatBytes(overview.total_used_bytes)
          }
        }
      });

    } catch (error) {
      console.error('시스템 스토리지 통계 조회 오류:', error);
      backendLogger.error('Storage', '시스템 스토리지 통계 조회 오류', error);
      res.status(500).json({
        success: false,
        error: '시스템 스토리지 통계 조회에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * OCR 할당량 포맷팅 (페이지 기준)
   */
  function formatOcrPageQuota(quota) {
    if (quota === -1) return '무제한';
    return `${quota.toLocaleString()}p`;
  }

  /**
   * GET /api/admin/tiers
   * 티어 정의 목록 조회 (관리자용)
   */
  router.get('/admin/tiers', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const tiers = await getTierDefinitions(db);

      // 객체를 배열로 변환하고 formatted 추가
      // ocr_page_quota: 페이지 기준 (현재 사용)
      const tierList = Object.entries(tiers).map(([id, tier]) => ({
        id,
        ...tier,
        formatted_quota: formatBytes(tier.quota_bytes),
        formatted_ocr_page_quota: formatOcrPageQuota(tier.ocr_page_quota ?? 500)
      }));

      res.json({
        success: true,
        data: tierList
      });

    } catch (error) {
      console.error('티어 정의 조회 오류:', error);
      backendLogger.error('Storage', '티어 정의 조회 오류', error);
      res.status(500).json({
        success: false,
        error: '티어 정의 조회에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * PUT /api/admin/tiers/:tierId
   * 티어 정의 수정 (관리자용)
   */
  router.put('/admin/tiers/:tierId', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { tierId } = req.params;
      const { name, quota_bytes, ocr_page_quota, description } = req.body;

      if (!tierId) {
        return res.status(400).json({
          success: false,
          error: '티어 ID가 필요합니다.'
        });
      }

      // admin 티어는 할당량 변경 불가
      if (tierId === 'admin' && quota_bytes !== undefined && quota_bytes !== -1) {
        return res.status(400).json({
          success: false,
          error: '관리자 티어의 할당량은 변경할 수 없습니다.'
        });
      }

      const updates = {};
      if (name !== undefined) updates.name = name;
      if (quota_bytes !== undefined) updates.quota_bytes = quota_bytes;
      if (ocr_page_quota !== undefined) updates.ocr_page_quota = ocr_page_quota;
      if (description !== undefined) updates.description = description;

      const updatedTier = await updateTierDefinition(db, tierId, updates);

      res.json({
        success: true,
        message: `티어 "${updatedTier.name}"이(가) 수정되었습니다.`,
        data: {
          id: tierId,
          ...updatedTier,
          formatted_quota: formatBytes(updatedTier.quota_bytes),
          formatted_ocr_page_quota: formatOcrPageQuota(updatedTier.ocr_page_quota ?? 500)
        }
      });

    } catch (error) {
      console.error('티어 정의 수정 오류:', error);
      backendLogger.error('Storage', '티어 정의 수정 오류', error);
      res.status(500).json({
        success: false,
        error: error.message || '티어 정의 수정에 실패했습니다.'
      });
    }
  });

  return router;
};

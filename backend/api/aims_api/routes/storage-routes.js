/**
 * Storage Quota API Routes
 * @since 1.0.0
 *
 * 설계사별 디스크 할당량 관리 API
 * @updated 2026-01-06 - 크레딧 시스템 통합
 */

const express = require('express');
const router = express.Router();
const {
  getUserStorageInfo,
  updateUserTier,
  getSystemStorageOverview,
  formatBytes,
  getTierDefinitions,
  updateTierDefinition,
  calculateOcrCycle
} = require('../lib/storageQuotaService');
const { getUserCreditInfo, getBonusCreditBalance } = require('../lib/creditService');
const backendLogger = require('../lib/backendLogger');

/**
 * 크레딧 한도 포맷팅
 */
function formatCreditQuota(quota) {
  if (quota === -1) return '무제한';
  return `${quota.toLocaleString()}C`;
}

/**
 * 라우트 설정 함수
 * @param {Db} db - MongoDB docupload DB 인스턴스
 * @param {Db} analyticsDb - MongoDB aims_analytics DB 인스턴스 (크레딧 계산용)
 * @param {Function} authenticateJWT - JWT 인증 미들웨어
 * @param {Function} requireRole - 역할 검증 미들웨어
 * @param {Function} notifyUserAccountSubscribers - SSE 사용자 계정 알림 함수
 */
module.exports = function(db, analyticsDb, authenticateJWT, requireRole, notifyUserAccountSubscribers) {

  /**
   * GET /api/users/me/storage
   * 내 스토리지 정보 조회 (크레딧 정보 포함)
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

      // 스토리지 정보 조회
      const storageInfo = await getUserStorageInfo(db, userId);

      // 티어 정의에서 credit_quota 조회
      const tierDefinitions = await getTierDefinitions(db);
      const tierDef = tierDefinitions[storageInfo.tier] || tierDefinitions['free_trial'];
      const creditQuota = storageInfo.is_unlimited ? -1 : (tierDef.credit_quota ?? 2000);

      // 사이클 정보 (storageInfo에서 이미 계산된 값 사용)
      const cycleStart = new Date(storageInfo.ocr_cycle_start + 'T00:00:00+09:00');
      const cycleEnd = new Date(storageInfo.ocr_cycle_end + 'T23:59:59.999+09:00');

      // 크레딧 정보 조회 (일할 계산 정보 전달)
      const creditInfo = await getUserCreditInfo(
        db,
        analyticsDb,
        userId,
        storageInfo.tier,
        creditQuota,
        cycleStart,
        cycleEnd,
        storageInfo.ocr_days_until_reset,
        {
          isFirstMonth: storageInfo.is_first_month,
          proRataRatio: storageInfo.pro_rata_ratio
        }
      );

      // 추가 크레딧 (Bonus Credits) 조회 및 월정액 초과분 차감
      const bonusBalance = await getBonusCreditBalance(db, userId);
      const monthlyRemaining = Math.max(0, creditInfo.credits_remaining);
      // 🔴 월정액 초과분을 보너스에서 차감해야 총 가용 크레딧이 정확함
      const monthlyOverage = Math.max(0, creditInfo.credits_used - creditInfo.credit_quota);
      const effectiveBonusBalance = Math.max(0, bonusBalance - monthlyOverage);
      const totalAvailable = storageInfo.is_unlimited ? -1 : (monthlyRemaining + effectiveBonusBalance);

      res.json({
        success: true,
        data: {
          ...storageInfo,
          // 크레딧 정보 추가
          ...creditInfo,
          // 추가 크레딧 정보
          bonus_balance: bonusBalance,
          total_available: totalAvailable,
          formatted: {
            quota: formatBytes(storageInfo.quota_bytes),
            used: formatBytes(storageInfo.used_bytes),
            remaining: formatBytes(storageInfo.remaining_bytes),
            credit_quota: formatCreditQuota(creditInfo.credit_quota)
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
   * 특정 사용자 스토리지 정보 조회 (관리자용, 크레딧 정보 포함)
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

      // 스토리지 정보 조회
      const storageInfo = await getUserStorageInfo(db, id);

      // 티어 정의에서 credit_quota 조회
      const tierDefinitions = await getTierDefinitions(db);
      const tierDef = tierDefinitions[storageInfo.tier] || tierDefinitions['free_trial'];
      const creditQuota = storageInfo.is_unlimited ? -1 : (tierDef.credit_quota ?? 2000);

      // 사이클 정보
      const cycleStart = new Date(storageInfo.ocr_cycle_start + 'T00:00:00+09:00');
      const cycleEnd = new Date(storageInfo.ocr_cycle_end + 'T23:59:59.999+09:00');

      // 크레딧 정보 조회 (일할 계산 정보 전달)
      const creditInfo = await getUserCreditInfo(
        db,
        analyticsDb,
        id,
        storageInfo.tier,
        creditQuota,
        cycleStart,
        cycleEnd,
        storageInfo.ocr_days_until_reset,
        {
          isFirstMonth: storageInfo.is_first_month,
          proRataRatio: storageInfo.pro_rata_ratio
        }
      );

      res.json({
        success: true,
        data: {
          userId: id,
          ...storageInfo,
          ...creditInfo,
          formatted: {
            quota: formatBytes(storageInfo.quota_bytes),
            used: formatBytes(storageInfo.used_bytes),
            remaining: formatBytes(storageInfo.remaining_bytes),
            credit_quota: formatCreditQuota(creditInfo.credit_quota)
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
   * OCR 할당량 포맷팅 (페이지 기준, deprecated)
   */
  function formatOcrPageQuota(quota) {
    if (quota === -1) return '무제한';
    return `${quota.toLocaleString()}p`;
  }

  /**
   * GET /api/admin/tiers
   * 티어 정의 목록 조회 (관리자용, 크레딧 정보 포함)
   */
  router.get('/admin/tiers', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const tiers = await getTierDefinitions(db);

      // 객체를 배열로 변환하고 formatted 추가
      // credit_quota: 크레딧 기준 (신규)
      // ocr_page_quota: 페이지 기준 (deprecated)
      const tierList = Object.entries(tiers).map(([id, tier]) => ({
        id,
        ...tier,
        formatted_quota: formatBytes(tier.quota_bytes),
        formatted_credit_quota: formatCreditQuota(tier.credit_quota ?? 2000),
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
   * 티어 정의 수정 (관리자용, credit_quota 지원)
   */
  router.put('/admin/tiers/:tierId', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { tierId } = req.params;
      const { name, quota_bytes, credit_quota, ocr_page_quota, description } = req.body;

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
      if (credit_quota !== undefined) updates.credit_quota = credit_quota;
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
          formatted_credit_quota: formatCreditQuota(updatedTier.credit_quota ?? 2000),
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

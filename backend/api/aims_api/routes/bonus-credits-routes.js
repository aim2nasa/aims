/**
 * bonus-credits-routes.js
 * 추가 크레딧 관리 API 라우트
 *
 * @see docs/BONUS_CREDIT_IMPLEMENTATION.md
 */

const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { escapeRegex } = require('../lib/helpers');

const { getUserStorageInfo, getTierDefinitions } = require('../lib/storageQuotaService');

/**
 * 라우트 설정 함수
 * @param {Db} db - MongoDB docupload DB 인스턴스
 * @param {Db} analyticsDb - MongoDB aims_analytics DB 인스턴스
 * @param {Function} authenticateJWT - JWT 인증 미들웨어
 * @param {Function} requireRole - 역할 검증 미들웨어
 * @param {import('../lib/creditPolicy').DefaultCreditPolicy|import('../lib/creditPolicy').NoCreditPolicy} creditPolicy - 크레딧 정책
 */
module.exports = function(db, analyticsDb, authenticateJWT, requireRole, creditPolicy) {

  // ============================================================
  // 사용자 API
  // ============================================================

  /**
   * GET /api/users/me/bonus-credits
   * 내 추가 크레딧 조회
   */
  router.get('/users/me/bonus-credits', authenticateJWT, async (req, res) => {
    try {
      const userId = req.user.id;
      const bonusInfo = await creditPolicy.getBonusInfo(userId);

      res.json({
        success: true,
        data: bonusInfo
      });
    } catch (error) {
      console.error('[BonusCredits] 조회 오류:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/users/me/credit-transactions
   * 내 크레딧 이력 조회
   */
  router.get('/users/me/credit-transactions', authenticateJWT, async (req, res) => {
    try {
      const userId = req.user.id;
      const { limit = 50, skip = 0, type } = req.query;

      const filter = { user_id: new ObjectId(userId) };
      if (type) {
        filter.type = type;
      }

      const transactions = await creditPolicy.getTransactions(filter, {
        limit: parseInt(limit),
        skip: parseInt(skip)
      });

      // 전체 개수 조회
      const total = await db.collection('credit_transactions').countDocuments(filter);

      res.json({
        success: true,
        data: {
          transactions,
          pagination: {
            total,
            limit: parseInt(limit),
            skip: parseInt(skip)
          }
        }
      });
    } catch (error) {
      console.error('[BonusCredits] 이력 조회 오류:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/credit-packages
   * 활성 크레딧 패키지 목록 (사용자용)
   */
  router.get('/credit-packages', async (req, res) => {
    try {
      const packages = await creditPolicy.getPackages(true);

      res.json({
        success: true,
        data: packages
      });
    } catch (error) {
      console.error('[BonusCredits] 패키지 조회 오류:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============================================================
  // 관리자 API
  // ============================================================

  /**
   * GET /api/admin/credits/overview
   * 크레딧 현황 요약 (관리자)
   */
  router.get('/admin/credits/overview', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const overview = await creditPolicy.getOverview();

      res.json({
        success: true,
        data: overview
      });
    } catch (error) {
      console.error('[BonusCredits] 현황 조회 오류:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/admin/users/:id/bonus-credits
   * 특정 사용자의 추가 크레딧 조회 (관리자)
   */
  router.get('/admin/users/:id/bonus-credits', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;

      // 추가 크레딧 정보
      const bonusInfo = await creditPolicy.getBonusInfo(id);

      // 통합 크레딧 체크 (월정액 + 추가)
      const creditCheck = await creditPolicy.checkWithBonus(id, 0);

      // 사용자 정보
      const user = await db.collection('users').findOne(
        { _id: new ObjectId(id) },
        { projection: { name: 1, email: 1, 'storage.tier': 1 } }
      );

      res.json({
        success: true,
        data: {
          user: {
            id,
            name: user?.name,
            email: user?.email,
            tier: user?.storage?.tier
          },
          bonus_credits: bonusInfo,
          credit_summary: {
            monthly_remaining: creditCheck.monthly_remaining,
            bonus_balance: creditCheck.bonus_balance,
            total_available: creditCheck.total_available
          }
        }
      });
    } catch (error) {
      console.error('[BonusCredits] 사용자 크레딧 조회 오류:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/admin/users/:id/bonus-credits/grant
   * 추가 크레딧 부여 (관리자)
   *
   * Body: { amount: number, reason: string, package_code?: string }
   */
  router.post('/admin/users/:id/bonus-credits/grant', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const adminId = req.user.id;
      const { id } = req.params;
      const { amount, reason, package_code } = req.body;

      // 입력 검증
      if (!amount || amount <= 0) {
        return res.status(400).json({
          success: false,
          error: '부여할 크레딧은 0보다 커야 합니다.'
        });
      }

      if (!reason || reason.trim() === '') {
        return res.status(400).json({
          success: false,
          error: '부여 사유를 입력해주세요.'
        });
      }

      // 패키지 정보 조회 (선택)
      let packageInfo = null;
      if (package_code) {
        packageInfo = await db.collection('credit_packages').findOne({ code: package_code });
      }

      // 크레딧 부여
      const result = await creditPolicy.grantBonus(
        id,
        parseInt(amount),
        adminId,
        reason,
        packageInfo
      );

      // 부여 대상 사용자 정보 조회
      const user = await db.collection('users').findOne(
        { _id: new ObjectId(id) },
        { projection: { name: 1, email: 1 } }
      );

      console.log(`[BonusCredits] 크레딧 부여: ${user?.name || id}에게 ${amount}C 부여 (${reason})`);

      res.json({
        success: true,
        data: {
          ...result,
          user: {
            id,
            name: user?.name,
            email: user?.email
          }
        }
      });
    } catch (error) {
      console.error('[BonusCredits] 크레딧 부여 오류:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/admin/credit-transactions
   * 전체 크레딧 이력 조회 (관리자)
   */
  router.get('/admin/credit-transactions', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { limit = 50, skip = 0, type, user_id, from, to } = req.query;

      const filter = {};

      if (type) {
        filter.type = type;
      }

      if (user_id) {
        filter.user_id = new ObjectId(user_id);
      }

      // 기간 필터
      if (from || to) {
        filter.created_at = {};
        if (from) {
          filter.created_at.$gte = new Date(from);
        }
        if (to) {
          filter.created_at.$lte = new Date(to);
        }
      }

      const transactions = await creditPolicy.getTransactions(filter, {
        limit: parseInt(limit),
        skip: parseInt(skip)
      });

      // 사용자 정보 조인
      const userIds = [...new Set(transactions.map(t => t.user_id?.toString()).filter(Boolean))];
      let userMap = {};

      if (userIds.length > 0) {
        const users = await db.collection('users')
          .find({ _id: { $in: userIds.map(id => new ObjectId(id)) } })
          .project({ name: 1, email: 1 })
          .toArray();

        users.forEach(u => {
          userMap[u._id.toString()] = { name: u.name, email: u.email };
        });
      }

      // 트랜잭션에 사용자 정보 추가
      const enrichedTransactions = transactions.map(t => ({
        ...t,
        user: userMap[t.user_id?.toString()] || null
      }));

      // 전체 개수
      const total = await db.collection('credit_transactions').countDocuments(filter);

      res.json({
        success: true,
        data: {
          transactions: enrichedTransactions,
          pagination: {
            total,
            limit: parseInt(limit),
            skip: parseInt(skip)
          }
        }
      });
    } catch (error) {
      console.error('[BonusCredits] 전체 이력 조회 오류:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/admin/users-with-credits
   * 크레딧 보유 사용자 목록 (관리자)
   */
  router.get('/admin/users-with-credits', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { limit = 50, skip = 0, tier, has_bonus, search } = req.query;

      // 필터 구성
      const filter = {};
      if (tier) {
        filter['storage.tier'] = tier;
      }
      if (has_bonus === 'true') {
        filter['bonus_credits.balance'] = { $gt: 0 };
      }
      if (search) {
        const escapedSearch = escapeRegex(search);
        filter.$or = [
          { name: { $regex: escapedSearch, $options: 'i' } },
          { email: { $regex: escapedSearch, $options: 'i' } }
        ];
      }

      // 사용자 목록 조회
      const users = await db.collection('users')
        .find(filter)
        .project({
          name: 1,
          email: 1,
          'storage.tier': 1,
          bonus_credits: 1,
          subscription_start_date: 1
        })
        .sort({ 'bonus_credits.balance': -1, name: 1 })
        .skip(parseInt(skip))
        .limit(parseInt(limit))
        .toArray();

      // 티어 정의 조회
      const tierDefinitions = await getTierDefinitions(db);

      // 각 사용자의 월정액 크레딧 정보 추가
      const enrichedUsers = await Promise.all(users.map(async (user) => {
        try {
          const storageInfo = await getUserStorageInfo(db, user._id.toString());
          const tierDef = tierDefinitions[storageInfo.tier] || tierDefinitions['free_trial'];
          const creditQuota = tierDef.credit_quota ?? 2000;
          const proRataRatio = storageInfo.pro_rata_ratio ?? 1.0;
          const effectiveQuota = Math.round(creditQuota * proRataRatio);

          // 사이클 크레딧 사용량
          const cycleStart = new Date(storageInfo.ocr_cycle_start + 'T00:00:00+09:00');
          const cycleEnd = new Date(storageInfo.ocr_cycle_end + 'T23:59:59.999+09:00');
          const usage = await creditPolicy.getCycleUsed(user._id.toString(), cycleStart, cycleEnd);

          const monthlyRemaining = Math.max(0, effectiveQuota - usage.total_credits);
          const bonusBalance = user.bonus_credits?.balance ?? 0;
          // 🔴 월정액 초과분을 보너스에서 차감해야 총 가용 크레딧이 정확함
          const monthlyOverage = Math.max(0, usage.total_credits - effectiveQuota);
          const effectiveBonusBalance = Math.max(0, bonusBalance - monthlyOverage);

          return {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            tier: storageInfo.tier,
            tier_name: storageInfo.tierName,
            monthly_quota: effectiveQuota,
            monthly_used: usage.total_credits,
            monthly_remaining: monthlyRemaining,
            bonus_balance: bonusBalance,
            total_available: monthlyRemaining + effectiveBonusBalance,
            last_purchase_at: user.bonus_credits?.last_purchase_at
          };
        } catch (err) {
          console.error(`[BonusCredits] 사용자 ${user._id} 정보 조회 오류:`, err.message);
          return {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            tier: user.storage?.tier || 'free_trial',
            bonus_balance: user.bonus_credits?.balance ?? 0,
            error: err.message
          };
        }
      }));

      // 전체 개수
      const total = await db.collection('users').countDocuments(filter);

      res.json({
        success: true,
        data: {
          users: enrichedUsers,
          pagination: {
            total,
            limit: parseInt(limit),
            skip: parseInt(skip)
          }
        }
      });
    } catch (error) {
      console.error('[BonusCredits] 사용자 목록 조회 오류:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============================================================
  // 크레딧 패키지 관리 (관리자)
  // ============================================================

  /**
   * GET /api/admin/credit-packages
   * 전체 크레딧 패키지 조회 (비활성 포함)
   */
  router.get('/admin/credit-packages', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const packages = await creditPolicy.getPackages(false);

      res.json({
        success: true,
        data: packages
      });
    } catch (error) {
      console.error('[BonusCredits] 패키지 조회 오류:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/admin/credit-packages
   * 크레딧 패키지 생성
   */
  router.post('/admin/credit-packages', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { code, name, credits, price_krw, description, sort_order } = req.body;

      // 입력 검증
      if (!code || !name || !credits || !price_krw) {
        return res.status(400).json({
          success: false,
          error: '필수 필드가 누락되었습니다. (code, name, credits, price_krw)'
        });
      }

      // 중복 체크
      const existing = await db.collection('credit_packages').findOne({ code });
      if (existing) {
        return res.status(409).json({
          success: false,
          error: '이미 존재하는 패키지 코드입니다.'
        });
      }

      const package_ = {
        code,
        name,
        credits: parseInt(credits),
        price_krw: parseInt(price_krw),
        price_per_credit: Math.round((parseInt(price_krw) / parseInt(credits)) * 100) / 100,
        description: description || '',
        sort_order: sort_order ? parseInt(sort_order) : 99,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      };

      await db.collection('credit_packages').insertOne(package_);

      res.json({
        success: true,
        data: package_
      });
    } catch (error) {
      console.error('[BonusCredits] 패키지 생성 오류:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * PUT /api/admin/credit-packages/:code
   * 크레딧 패키지 수정
   */
  router.put('/admin/credit-packages/:code', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { code } = req.params;
      const { name, credits, price_krw, description, sort_order, is_active } = req.body;

      const updateFields = { updated_at: new Date() };

      if (name !== undefined) updateFields.name = name;
      if (credits !== undefined) {
        updateFields.credits = parseInt(credits);
      }
      if (price_krw !== undefined) {
        updateFields.price_krw = parseInt(price_krw);
      }
      if (credits !== undefined || price_krw !== undefined) {
        const finalCredits = credits !== undefined ? parseInt(credits) : null;
        const finalPrice = price_krw !== undefined ? parseInt(price_krw) : null;

        // 기존 값 조회
        const existing = await db.collection('credit_packages').findOne({ code });
        const c = finalCredits ?? existing?.credits ?? 1;
        const p = finalPrice ?? existing?.price_krw ?? 1;
        updateFields.price_per_credit = Math.round((p / c) * 100) / 100;
      }
      if (description !== undefined) updateFields.description = description;
      if (sort_order !== undefined) updateFields.sort_order = parseInt(sort_order);
      if (is_active !== undefined) updateFields.is_active = Boolean(is_active);

      const result = await db.collection('credit_packages').updateOne(
        { code },
        { $set: updateFields }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          error: '패키지를 찾을 수 없습니다.'
        });
      }

      const updated = await db.collection('credit_packages').findOne({ code });

      res.json({
        success: true,
        data: updated
      });
    } catch (error) {
      console.error('[BonusCredits] 패키지 수정 오류:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * DELETE /api/admin/credit-packages/:code
   * 크레딧 패키지 비활성화 (삭제 대신)
   */
  router.delete('/admin/credit-packages/:code', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { code } = req.params;

      const result = await db.collection('credit_packages').updateOne(
        { code },
        { $set: { is_active: false, updated_at: new Date() } }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          error: '패키지를 찾을 수 없습니다.'
        });
      }

      res.json({
        success: true,
        message: '패키지가 비활성화되었습니다.'
      });
    } catch (error) {
      console.error('[BonusCredits] 패키지 비활성화 오류:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
};

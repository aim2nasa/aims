/**
 * address-history-routes.js - 주소 보관소/검증 라우트
 *
 * customers-routes.js에서 분리된 주소 이력 도메인 라우트 (3개)
 * @since 2026-04-04
 */

const express = require('express');
const { ObjectId } = require('mongodb');
const { COLLECTIONS } = require('@aims/shared-schema');
const backendLogger = require('../lib/backendLogger');
const { utcNowDate, normalizeTimestamp } = require('../lib/timeUtils');
const { verifyAddressViaKakao } = require('../utils/address-helper');

module.exports = function(db, authenticateJWT) {
  const router = express.Router();
  const CUSTOMERS_COLLECTION = COLLECTIONS.CUSTOMERS;

  // ==================== 주소 보관소 관리 API ====================

  /**
   * 고객 주소 이력 조회 API
   * ⭐ 설계사별 고객 데이터 격리 적용
   */
  router.get('/customers/:id/address-history', authenticateJWT, async (req, res) => {
    try {
      const { id } = req.params;

      // ⭐ 설계사별 고객 데이터 격리: userId 검증
      const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: '유효하지 않은 고객 ID입니다.'
        });
      }

      // ⭐ 소유권 검증: 해당 설계사의 고객만 조회 가능
      const customer = await db.collection(CUSTOMERS_COLLECTION)
        .findOne({
          _id: new ObjectId(id),
          'meta.created_by': userId
        });

      if (!customer) {
        return res.status(403).json({
          success: false,
          error: '고객을 찾을 수 없거나 접근 권한이 없습니다.'
        });
      }

      // 주소 이력 조회 (현재 주소 + 이력)
      const addressHistory = [];

      // 1. 현재 주소 추가
      if (customer.personal_info?.address) {
        addressHistory.push({
          _id: 'current',
          address: customer.personal_info.address,
          changed_at: normalizeTimestamp(customer.meta?.updated_at || customer.meta?.created_at),
          reason: '현재 주소',
          changed_by: '시스템',
          is_current: true
        });
      }

      // 2. 이력 주소들 추가 (address_history 컬렉션에서 조회)
      const historyRecords = await db.collection('address_history')
        .find({ customer_id: new ObjectId(id) })
        .sort({ changed_at: -1 })
        .toArray();

      historyRecords.forEach(record => {
        addressHistory.push({
          _id: record._id,
          address: record.address,
          changed_at: normalizeTimestamp(record.changed_at),
          reason: record.reason || '주소 변경',
          changed_by: record.changed_by || '시스템',
          notes: record.notes,
          is_current: false
        });
      });

      res.json({
        success: true,
        data: addressHistory
      });

    } catch (error) {
      console.error('주소 이력 조회 오류:', error);
      backendLogger.error('Address', '주소 이력 조회 오류', error);
      res.status(500).json({
        success: false,
        error: '주소 이력 조회에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * 주소 이력 저장 API (내부 사용)
   */
  router.post('/customers/:id/address-history', async (req, res) => {
    try {
      const { id } = req.params;
      const { previous_address, reason, changed_by, notes } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: '유효하지 않은 고객 ID입니다.'
        });
      }

      if (!previous_address) {
        return res.status(400).json({
          success: false,
          error: '이전 주소 정보가 필요합니다.'
        });
      }

      // 주소 이력 저장
      const historyRecord = {
        customer_id: new ObjectId(id),
        address: previous_address,
        changed_at: utcNowDate(),
        reason: reason || '주소 변경',
        changed_by: changed_by || '시스템',
        notes: notes || ''
      };

      await db.collection('address_history').insertOne(historyRecord);

      res.json({
        success: true,
        message: '주소 이력이 저장되었습니다.',
        history_id: historyRecord._id
      });

    } catch (error) {
      console.error('주소 이력 저장 오류:', error);
      backendLogger.error('Address', '주소 이력 저장 오류', error);
      res.status(500).json({
        success: false,
        error: '주소 이력 저장에 실패했습니다.',
        details: error.message
      });
    }
  });

  // ============================================
  // 주소 일괄 검증 API (기존 pending 데이터 마이그레이션용)
  // ============================================
  router.post('/customers/verify-addresses', authenticateJWT, async (req, res) => {
    try {
      // verification_status가 없거나 pending인 고객 중 주소가 있는 고객 조회
      const customers = await db.collection(CUSTOMERS_COLLECTION).find({
        'personal_info.address.address1': { $exists: true, $ne: null, $ne: '' },
        $or: [
          { 'personal_info.address.verification_status': { $exists: false } },
          { 'personal_info.address.verification_status': 'pending' },
          { 'personal_info.address.verification_status': null }
        ]
      }).project({
        _id: 1,
        'personal_info.address': 1,
        'personal_info.name': 1
      }).toArray();

      console.log(`🔍 주소 일괄 검증 시작: ${customers.length}건`);

      let verified = 0;
      let failed = 0;
      let errors = 0;

      for (const customer of customers) {
        try {
          const address1 = customer.personal_info?.address?.address1;
          if (!address1) continue;

          const result = await verifyAddressViaKakao(address1);

          await db.collection(CUSTOMERS_COLLECTION).updateOne(
            { _id: customer._id },
            { $set: { 'personal_info.address.verification_status': result } }
          );

          if (result === 'verified') verified++;
          else failed++;

          // 카카오 API rate limit 방지 (100ms 간격)
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (err) {
          errors++;
          console.error(`❌ 고객 ${customer._id} 검증 실패:`, err.message);
        }
      }

      console.log(`✅ 주소 일괄 검증 완료: verified=${verified}, failed=${failed}, errors=${errors}`);

      res.json({
        success: true,
        data: {
          total: customers.length,
          verified,
          failed,
          errors
        }
      });
    } catch (error) {
      console.error('🚨 주소 일괄 검증 오류:', error);
      res.status(500).json({
        success: false,
        error: '주소 일괄 검증에 실패했습니다.',
        details: error.message
      });
    }
  });

  return router;
};

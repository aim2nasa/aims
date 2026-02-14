/**
 * insurance-contracts-routes.js - Insurance Products & Contracts 라우트
 *
 * Phase 6: server.js 리팩토링
 * @since 2026-02-07
 */

const express = require('express');
const { ObjectId } = require('mongodb');
const { COLLECTIONS } = require('@aims/shared-schema');
const { escapeRegex } = require('../lib/helpers');
const backendLogger = require('../lib/backendLogger');
const { utcNowISO } = require('../lib/timeUtils');

/**
 * @param {object} db - MongoDB database instance
 * @param {Function} authenticateJWTorAPIKey - JWT 또는 API Key 인증 미들웨어
 */
module.exports = function(db, authenticateJWTorAPIKey) {
  const router = express.Router();
  const INSURANCE_PRODUCTS_COLLECTION = 'insurance_products';

/**
 * GET /api/insurance-products
 * 보험상품 목록 조회
 */
router.get('/insurance-products', async (req, res) => {
  try {
    const { category, status, search, surveyDate, limit = 1000, skip = 0 } = req.query;

    const query = {};

    if (category && category !== 'all') {
      query.category = category;
    }
    if (status && status !== 'all') {
      query.status = status;
    }
    if (search) {
      query.productName = { $regex: escapeRegex(search), $options: 'i' };
    }
    if (surveyDate) {
      query.surveyDate = surveyDate;
    }

    const products = await db.collection(INSURANCE_PRODUCTS_COLLECTION)
      .find(query)
      .sort({ category: 1, productName: 1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .toArray();

    const total = await db.collection(INSURANCE_PRODUCTS_COLLECTION).countDocuments(query);

    res.json({
      success: true,
      data: products,
      total,
      limit: parseInt(limit),
      skip: parseInt(skip)
    });

  } catch (error) {
    console.error('보험상품 조회 오류:', error);
    backendLogger.error('InsuranceProducts', '보험상품 조회 오류', error);
    res.status(500).json({
      success: false,
      error: '보험상품 조회에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * POST /api/insurance-products/bulk
 * 보험상품 일괄 등록
 *
 * 로직:
 * 1. 같은 기준일의 데이터가 이미 있으면: 해당 기준일 데이터 모두 삭제 후 새 데이터로 대체
 * 2. 다른 기준일이면: productName 기준으로 upsert (기존 상품 업데이트, 새 상품 추가, 없어진 상품 삭제)
 */
router.post('/insurance-products/bulk', async (req, res) => {
  try {
    const { products, surveyDate } = req.body;

    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        error: '등록할 상품 목록이 필요합니다.'
      });
    }

    if (!surveyDate) {
      return res.status(400).json({
        success: false,
        error: '기준일(surveyDate)이 필요합니다.'
      });
    }

    const now = utcNowDate();
    const collection = db.collection(INSURANCE_PRODUCTS_COLLECTION);

    // 기존 데이터 확인
    const existingDataWithSameDate = await collection.findOne({ surveyDate });

    if (existingDataWithSameDate) {
      // 같은 기준일 데이터 존재: 해당 기준일 데이터 삭제 후 새로 삽입
      const deleteResult = await collection.deleteMany({ surveyDate });
      console.log(`같은 기준일(${surveyDate}) 데이터 ${deleteResult.deletedCount}개 삭제`);

      const productsWithTimestamp = products.map(p => ({
        ...p,
        surveyDate,
        createdAt: now,
        updatedAt: now
      }));

      const insertResult = await collection.insertMany(productsWithTimestamp);

      res.json({
        success: true,
        message: `기존 ${deleteResult.deletedCount}개 삭제, ${insertResult.insertedCount}개 상품 등록 (기준일: ${surveyDate})`,
        insertedCount: insertResult.insertedCount,
        deletedCount: deleteResult.deletedCount,
        surveyDate
      });

    } else {
      // 다른 기준일: productName 기준으로 upsert (삭제 없음)
      // 상품은 삭제되지 않음 - 상태만 변경됨 (판매중 → 판매중지)
      let updatedCount = 0;
      let insertedCount = 0;

      for (const product of products) {
        const existingProduct = await collection.findOne({ productName: product.productName });

        if (existingProduct) {
          // 기존 상품 업데이트 (상태, 기준일 등)
          await collection.updateOne(
            { productName: product.productName },
            {
              $set: {
                ...product,
                surveyDate,
                updatedAt: now
              }
            }
          );
          updatedCount++;
        } else {
          // 새 상품 추가
          await collection.insertOne({
            ...product,
            surveyDate,
            createdAt: now,
            updatedAt: now
          });
          insertedCount++;
        }
      }

      res.json({
        success: true,
        message: `${updatedCount}개 업데이트, ${insertedCount}개 추가 (기준일: ${surveyDate})`,
        updatedCount,
        insertedCount,
        surveyDate
      });
    }

  } catch (error) {
    console.error('보험상품 일괄 등록 오류:', error);
    backendLogger.error('InsuranceProducts', '보험상품 일괄 등록 오류', error);
    res.status(500).json({
      success: false,
      error: '보험상품 등록에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * POST /api/insurance-products
 * 단일 보험상품 등록
 */
router.post('/insurance-products', async (req, res) => {
  try {
    const product = req.body;

    if (!product.productName || !product.category) {
      return res.status(400).json({
        success: false,
        error: '상품명과 구분은 필수입니다.'
      });
    }

    const now = utcNowDate();
    const newProduct = {
      ...product,
      createdAt: now,
      updatedAt: now
    };

    const result = await db.collection(INSURANCE_PRODUCTS_COLLECTION).insertOne(newProduct);

    res.json({
      success: true,
      message: '상품이 등록되었습니다.',
      data: { ...newProduct, _id: result.insertedId }
    });

  } catch (error) {
    console.error('보험상품 등록 오류:', error);
    backendLogger.error('InsuranceProducts', '보험상품 등록 오류', error);
    res.status(500).json({
      success: false,
      error: '보험상품 등록에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * PUT /api/insurance-products/:id
 * 보험상품 수정
 */
router.put('/insurance-products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 상품 ID입니다.'
      });
    }

    delete updates._id; // _id는 수정 불가
    updates.updatedAt = utcNowDate();

    const result = await db.collection(INSURANCE_PRODUCTS_COLLECTION).updateOne(
      { _id: new ObjectId(id) },
      { $set: updates }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        error: '상품을 찾을 수 없습니다.'
      });
    }

    res.json({
      success: true,
      message: '상품이 수정되었습니다.'
    });

  } catch (error) {
    console.error('보험상품 수정 오류:', error);
    backendLogger.error('InsuranceProducts', '보험상품 수정 오류', error);
    res.status(500).json({
      success: false,
      error: '보험상품 수정에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * DELETE /api/insurance-products/:id
 * 보험상품 삭제
 */
router.delete('/insurance-products/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 상품 ID입니다.'
      });
    }

    const result = await db.collection(INSURANCE_PRODUCTS_COLLECTION).deleteOne({
      _id: new ObjectId(id)
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        error: '상품을 찾을 수 없습니다.'
      });
    }

    res.json({
      success: true,
      message: '상품이 삭제되었습니다.'
    });

  } catch (error) {
    console.error('보험상품 삭제 오류:', error);
    backendLogger.error('InsuranceProducts', '보험상품 삭제 오류', error);
    res.status(500).json({
      success: false,
      error: '보험상품 삭제에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * GET /api/insurance-products/statistics
 * 보험상품 통계
 */
router.get('/insurance-products/statistics', async (req, res) => {
  try {
    const { surveyDate } = req.query;
    const query = surveyDate ? { surveyDate } : {};

    const stats = await db.collection(INSURANCE_PRODUCTS_COLLECTION).aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ['$status', '판매중'] }, 1, 0] } },
          discontinued: { $sum: { $cond: [{ $eq: ['$status', '판매중지'] }, 1, 0] } }
        }
      }
    ]).toArray();

    const byCategory = await db.collection(INSURANCE_PRODUCTS_COLLECTION).aggregate([
      { $match: query },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]).toArray();

    const surveyDates = await db.collection(INSURANCE_PRODUCTS_COLLECTION).distinct('surveyDate');

    res.json({
      success: true,
      data: {
        total: stats[0]?.total || 0,
        active: stats[0]?.active || 0,
        discontinued: stats[0]?.discontinued || 0,
        byCategory: byCategory.reduce((acc, c) => {
          acc[c._id] = c.count;
          return acc;
        }, {}),
        surveyDates: surveyDates.sort().reverse()
      }
    });

  } catch (error) {
    console.error('보험상품 통계 오류:', error);
    backendLogger.error('InsuranceProducts', '보험상품 통계 오류', error);
    res.status(500).json({
      success: false,
      error: '통계 조회에 실패했습니다.',
      details: error.message
    });
  }
});

// ==================== Contracts API ====================

const CONTRACTS_COLLECTION = 'contracts';

/**
 * GET /api/contracts
 * 계약 목록 조회
 */
router.get('/contracts', authenticateJWTorAPIKey, async (req, res) => {
  try {
    // ⭐ 설계사별 데이터 격리: userId 검증
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
    const { customer_id, search, limit = 1000, skip = 0 } = req.query;

    const query = {};

    // agent_id 필터 (필수 - 데이터 격리)
    const agentObjectId = ObjectId.isValid(userId) ? new ObjectId(userId) : userId;
    query.agent_id = agentObjectId;

    // customer_id 필터
    if (customer_id) {
      query.customer_id = new ObjectId(customer_id);
    }

    // 검색어 (고객명 또는 상품명)
    if (search) {
      const searchRegex = { $regex: escapeRegex(search), $options: 'i' };
      query.$or = [
        { customer_name: searchRegex },
        { product_name: searchRegex },
        { policy_number: searchRegex }
      ];
    }

    const contracts = await db.collection(CONTRACTS_COLLECTION)
      .find(query)
      .sort({ 'meta.created_at': -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .toArray();

    const total = await db.collection(CONTRACTS_COLLECTION).countDocuments(query);

    res.json({
      success: true,
      data: contracts,
      total,
      limit: parseInt(limit),
      skip: parseInt(skip)
    });

  } catch (error) {
    console.error('계약 조회 오류:', error);
    backendLogger.error('Contracts', '계약 조회 오류', error);
    res.status(500).json({
      success: false,
      error: '계약 조회에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * GET /api/contracts/:id
 * 계약 상세 조회
 */
router.get('/contracts/:id', authenticateJWTorAPIKey, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId가 필요합니다.' });
    }

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 계약 ID입니다.'
      });
    }

    const agentObjectId = ObjectId.isValid(userId) ? new ObjectId(userId) : userId;
    const contract = await db.collection(CONTRACTS_COLLECTION).findOne({
      _id: new ObjectId(id),
      agent_id: agentObjectId
    });

    if (!contract) {
      return res.status(404).json({
        success: false,
        error: '계약을 찾을 수 없습니다.'
      });
    }

    res.json({
      success: true,
      data: contract
    });

  } catch (error) {
    console.error('계약 상세 조회 오류:', error);
    backendLogger.error('Contracts', '계약 상세 조회 오류', error);
    res.status(500).json({
      success: false,
      error: '계약 조회에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * POST /api/contracts
 * 단일 계약 등록
 */
router.post('/contracts', authenticateJWTorAPIKey, async (req, res) => {
  try {
    const contract = req.body;
    const userId = req.user.id;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId가 필요합니다.' });
    }

    // 인가: req.body.agent_id를 무시하고 인증된 사용자 ID를 강제 사용
    contract.agent_id = userId;

    if (!contract.policy_number) {
      return res.status(400).json({
        success: false,
        error: '증권번호는 필수입니다.'
      });
    }

    // 증권번호 중복 체크
    const existing = await db.collection(CONTRACTS_COLLECTION).findOne({
      policy_number: contract.policy_number
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: '이미 존재하는 증권번호입니다.',
        existingId: existing._id
      });
    }

    // Issue #5 수정: customer_id가 있고 customer_name이 없으면 고객 이름 자동 조회
    let customerName = contract.customer_name || '';
    if (contract.customer_id && !contract.customer_name) {
      try {
        const customer = await db.collection(CUSTOMERS_COLLECTION).findOne(
          { _id: new ObjectId(contract.customer_id) },
          { projection: { 'personal_info.name': 1 } }
        );
        if (customer?.personal_info?.name) {
          customerName = customer.personal_info.name;
          console.log(`📝 계약 등록: 고객명 자동 설정 "${customerName}"`);
        }
      } catch (err) {
        console.error('고객명 조회 실패:', err.message);
      }
    }

    const now = utcNowDate();
    const newContract = {
      agent_id: new ObjectId(contract.agent_id),
      customer_id: contract.customer_id ? new ObjectId(contract.customer_id) : null,
      insurer_id: contract.insurer_id ? new ObjectId(contract.insurer_id) : null,
      product_id: contract.product_id ? new ObjectId(contract.product_id) : null,
      customer_name: customerName,
      product_name: contract.product_name || '',
      contract_date: contract.contract_date || null,
      policy_number: contract.policy_number,
      premium: Number(contract.premium) || 0,
      payment_day: contract.payment_day || null,  // 원본 텍스트 그대로 저장
      payment_cycle: contract.payment_cycle || null,
      payment_period: contract.payment_period || null,
      insured_person: contract.insured_person || null,
      payment_status: contract.payment_status || null,
      meta: {
        created_at: now,
        updated_at: now,
        created_by: contract.agent_id,
        source: contract.source || 'manual'
      }
    };

    const result = await db.collection(CONTRACTS_COLLECTION).insertOne(newContract);

    // 계약 등록 성공 로그
    activityLogger.log({
      actor: {
        user_id: contract.agent_id,
        name: req.user?.name,
        email: req.user?.email,
        role: req.user?.role,
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      },
      action: {
        type: 'create',
        category: 'contract',
        description: '계약 등록',
        target: {
          entity_type: 'contract',
          entity_id: result.insertedId.toString(),
          entity_name: contract.policy_number,
          parent_id: contract.customer_id,
          parent_name: contract.customer_name
        }
      },
      result: {
        success: true,
        statusCode: 200
      },
      meta: {
        endpoint: '/api/contracts',
        method: 'POST'
      }
    });

    res.json({
      success: true,
      message: '계약이 등록되었습니다.',
      data: { ...newContract, _id: result.insertedId }
    });

  } catch (error) {
    console.error('계약 등록 오류:', error);
    backendLogger.error('Contracts', '계약 등록 오류', error);

    // 계약 등록 실패 로그
    activityLogger.log({
      actor: {
        user_id: req.body?.agent_id,
        name: req.user?.name,
        email: req.user?.email,
        role: req.user?.role,
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      },
      action: {
        type: 'create',
        category: 'contract',
        description: '계약 등록 실패',
        target: {
          entity_type: 'contract',
          entity_name: req.body?.policy_number
        }
      },
      result: {
        success: false,
        statusCode: 500,
        error: { message: error.message }
      },
      meta: {
        endpoint: '/api/contracts',
        method: 'POST'
      }
    });

    res.status(500).json({
      success: false,
      error: '계약 등록에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * POST /api/contracts/bulk
 * 일괄 계약 등록/업데이트 (Excel Import용)
 * - 증권번호 기준 upsert: 존재하면 업데이트, 없으면 생성
 * - 변경사항 없으면 건너뜀
 */
router.post('/contracts/bulk', authenticateJWTorAPIKey, async (req, res) => {
  try {
    const { contracts } = req.body;
    const userId = req.user.id;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId가 필요합니다.' });
    }

    // 인가: req.body.agent_id를 무시하고 인증된 사용자 ID를 강제 사용
    const agent_id = userId;

    // agent_id 유효성 검사
    if (!ObjectId.isValid(agent_id)) {
      return res.status(400).json({
        success: false,
        error: 'agent_id가 유효하지 않습니다.',
        details: `받은 값: "${agent_id}" (24자리 hex 문자열이어야 합니다)`
      });
    }

    if (!Array.isArray(contracts) || contracts.length === 0) {
      return res.status(400).json({
        success: false,
        error: '계약 데이터가 비어있습니다.'
      });
    }

    const now = utcNowDate();
    const agentObjectId = new ObjectId(agent_id);

    // 고객 목록 조회 (이름으로 매칭)
    const customers = await db.collection(COLLECTIONS.CUSTOMERS).find({}).toArray();
    const customerMap = new Map();
    customers.forEach(c => {
      const name = c.personal_info?.name?.trim().toLowerCase();
      if (name) customerMap.set(name, c._id);
    });

    // 상품 목록 조회 (상품명으로 매칭)
    const products = await db.collection(INSURANCE_PRODUCTS_COLLECTION).find({}).toArray();
    const productMap = new Map();
    products.forEach(p => {
      const name = p.productName?.trim().toLowerCase();
      if (name) productMap.set(name, p._id);
    });

    // 기존 계약 조회 (증권번호로 매칭, 전체 데이터 포함)
    const existingContracts = await db.collection(CONTRACTS_COLLECTION)
      .find({ agent_id: agentObjectId })
      .toArray();
    const contractMap = new Map();
    existingContracts.forEach(c => {
      if (c.policy_number) contractMap.set(c.policy_number, c);
    });

    const created = [];
    const updated = [];
    const skipped = [];
    const errors = [];

    for (const contract of contracts) {
      try {
        // 증권번호 필수 체크
        if (!contract.policy_number) {
          errors.push({
            customer_name: contract.customer_name || '(미지정)',
            policy_number: '',
            reason: '증권번호 누락'
          });
          continue;
        }

        const existingContract = contractMap.get(contract.policy_number);

        if (existingContract) {
          // 기존 계약 존재 - 업데이트 필요 여부 확인
          const changes = [];
          const updateFields = {};

          // 보험료 비교/업데이트
          const newPremium = Number(contract.premium) || 0;
          if (newPremium && newPremium !== existingContract.premium) {
            updateFields.premium = newPremium;
            changes.push('보험료');
          }

          // 계약일 비교/업데이트
          if (contract.contract_date && contract.contract_date !== existingContract.contract_date) {
            updateFields.contract_date = contract.contract_date;
            changes.push('계약일');
          }

          // 이체일 비교/업데이트
          const newPaymentDay = contract.payment_day || null;
          if (newPaymentDay !== null && newPaymentDay !== existingContract.payment_day) {
            updateFields.payment_day = newPaymentDay;
            changes.push('이체일');
          }

          // 납입주기 비교/업데이트
          if (contract.payment_cycle && contract.payment_cycle !== existingContract.payment_cycle) {
            updateFields.payment_cycle = contract.payment_cycle;
            changes.push('납입주기');
          }

          // 납입기간 비교/업데이트
          if (contract.payment_period && contract.payment_period !== existingContract.payment_period) {
            updateFields.payment_period = contract.payment_period;
            changes.push('납입기간');
          }

          // 피보험자 비교/업데이트
          if (contract.insured_person && contract.insured_person !== existingContract.insured_person) {
            updateFields.insured_person = contract.insured_person;
            changes.push('피보험자');
          }

          // 납입상태 비교/업데이트
          if (contract.payment_status && contract.payment_status !== existingContract.payment_status) {
            updateFields.payment_status = contract.payment_status;
            changes.push('납입상태');
          }

          // 상품명 비교/업데이트
          if (contract.product_name && contract.product_name !== existingContract.product_name) {
            updateFields.product_name = contract.product_name;
            // product_id도 업데이트
            const productName = contract.product_name?.trim().toLowerCase();
            const productId = productMap.get(productName) || null;
            updateFields.product_id = productId;
            changes.push('상품명');
          }

          // 고객명 비교/업데이트
          if (contract.customer_name && contract.customer_name !== existingContract.customer_name) {
            updateFields.customer_name = contract.customer_name;
            // customer_id도 업데이트
            const customerName = contract.customer_name?.trim().toLowerCase();
            const customerId = customerMap.get(customerName) || null;
            updateFields.customer_id = customerId;
            changes.push('고객명');
          }

          if (changes.length > 0) {
            // 변경사항 있음 - 업데이트
            // MongoDB 제약: meta가 null이면 중첩 필드 설정 불가
            if (existingContract.meta !== null && existingContract.meta !== undefined) {
              updateFields['meta.updated_at'] = now;
            } else {
              updateFields['meta'] = { updated_at: now };
            }

            await db.collection(CONTRACTS_COLLECTION).updateOne(
              { _id: existingContract._id },
              { $set: updateFields }
            );

            updated.push({
              customer_name: contract.customer_name || existingContract.customer_name,
              product_name: contract.product_name || existingContract.product_name,
              policy_number: contract.policy_number,
              contract_date: contract.contract_date || existingContract.contract_date,
              premium: newPremium || existingContract.premium,
              payment_day: contract.payment_day || existingContract.payment_day,
              payment_cycle: contract.payment_cycle || existingContract.payment_cycle,
              payment_period: contract.payment_period || existingContract.payment_period,
              insured_person: contract.insured_person || existingContract.insured_person,
              payment_status: contract.payment_status || existingContract.payment_status,
              _id: existingContract._id.toString(),
              changes
            });
          } else {
            // 변경사항 없음 - 건너뜀
            skipped.push({
              customer_name: contract.customer_name || existingContract.customer_name,
              policy_number: contract.policy_number,
              reason: '변경사항 없음'
            });
          }
        } else {
          // 신규 계약 생성
          const customerName = contract.customer_name?.trim().toLowerCase();
          const productName = contract.product_name?.trim().toLowerCase();
          const customerId = customerMap.get(customerName) || null;
          const productId = productMap.get(productName) || null;

          const newContract = {
            agent_id: agentObjectId,
            customer_id: customerId,
            insurer_id: null,
            product_id: productId,
            customer_name: contract.customer_name || '',
            product_name: contract.product_name || '',
            contract_date: contract.contract_date || null,
            policy_number: contract.policy_number,
            premium: Number(contract.premium) || 0,
            payment_day: contract.payment_day || null,
            payment_cycle: contract.payment_cycle || null,
            payment_period: contract.payment_period || null,
            insured_person: contract.insured_person || null,
            payment_status: contract.payment_status || null,
            meta: {
              created_at: now,
              updated_at: now,
              created_by: agent_id,
              source: 'excel_import'
            }
          };

          const result = await db.collection(CONTRACTS_COLLECTION).insertOne(newContract);
          created.push({
            customer_name: contract.customer_name || '',
            product_name: contract.product_name || '',
            policy_number: contract.policy_number,
            contract_date: contract.contract_date || null,
            premium: Number(contract.premium) || 0,
            payment_day: contract.payment_day || null,
            payment_cycle: contract.payment_cycle || null,
            payment_period: contract.payment_period || null,
            insured_person: contract.insured_person || null,
            payment_status: contract.payment_status || null,
            _id: result.insertedId.toString()
          });

          // 현재 배치 내 중복 방지를 위해 맵에 추가
          contractMap.set(contract.policy_number, { ...newContract, _id: result.insertedId });
        }
      } catch (itemError) {
        errors.push({
          customer_name: contract.customer_name || '(미지정)',
          policy_number: contract.policy_number || '',
          reason: itemError.message
        });
      }
    }

    // 계약 일괄등록 성공 로그 - 상세 description 생성
    const contractDescParts = [];
    if (created.length > 0) contractDescParts.push(`${created.length}건 등록`);
    if (updated.length > 0) contractDescParts.push(`${updated.length}건 업데이트`);
    if (skipped.length > 0) contractDescParts.push(`${skipped.length}건 건너뜀`);
    if (errors.length > 0) contractDescParts.push(`${errors.length}건 오류`);
    const contractDetailedDesc = contractDescParts.length > 0 ? contractDescParts.join(', ') : '처리 완료';

    activityLogger.log({
      actor: {
        user_id: agent_id,
        name: req.user?.name,
        email: req.user?.email,
        role: req.user?.role,
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      },
      action: {
        type: 'bulk_create',
        category: 'contract',
        description: `계약 일괄 등록: ${contractDetailedDesc}`,
        bulkCount: created.length + updated.length,
        details: {
          created: created.length,
          updated: updated.length,
          skipped: skipped.length,
          errors: errors.length
        }
      },
      result: {
        success: true,
        statusCode: 200,
        affectedCount: created.length + updated.length
      },
      meta: {
        endpoint: '/api/contracts/bulk',
        method: 'POST'
      }
    });

    res.json({
      success: true,
      message: `${created.length}건 등록, ${updated.length}건 업데이트, ${skipped.length}건 건너뜀`,
      data: {
        createdCount: created.length,
        updatedCount: updated.length,
        skippedCount: skipped.length,
        errorCount: errors.length,
        created: created.slice(0, 50),
        updated: updated.slice(0, 50),
        skipped: skipped.slice(0, 50),
        errors: errors.slice(0, 50)
      }
    });

  } catch (error) {
    console.error('계약 일괄 등록 오류:', error);
    backendLogger.error('Contracts', '계약 일괄 등록 오류', error);

    // 계약 일괄등록 실패 로그
    activityLogger.log({
      actor: {
        user_id: req.body?.agent_id,
        name: req.user?.name,
        email: req.user?.email,
        role: req.user?.role,
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      },
      action: {
        type: 'bulk_create',
        category: 'contract',
        description: '계약 일괄 등록 실패'
      },
      result: {
        success: false,
        statusCode: 500,
        error: { message: error.message }
      },
      meta: {
        endpoint: '/api/contracts/bulk',
        method: 'POST'
      }
    });

    res.status(500).json({
      success: false,
      error: '계약 일괄 등록에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * PUT /api/contracts/:id
 * 계약 수정
 */
router.put('/contracts/:id', authenticateJWTorAPIKey, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const userId = req.user.id;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId가 필요합니다.' });
    }

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 계약 ID입니다.'
      });
    }

    delete updates._id;
    delete updates.meta;
    delete updates.agent_id; // 소유권 변경 방지

    // ObjectId 필드 변환
    if (updates.customer_id) updates.customer_id = new ObjectId(updates.customer_id);
    if (updates.product_id) updates.product_id = new ObjectId(updates.product_id);
    if (updates.insurer_id) updates.insurer_id = new ObjectId(updates.insurer_id);

    const agentObjectId = ObjectId.isValid(userId) ? new ObjectId(userId) : userId;
    const result = await db.collection(CONTRACTS_COLLECTION).updateOne(
      { _id: new ObjectId(id), agent_id: agentObjectId },
      {
        $set: {
          ...updates,
          'meta.updated_at': utcNowDate()
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        error: '계약을 찾을 수 없습니다.'
      });
    }

    res.json({
      success: true,
      message: '계약이 수정되었습니다.'
    });

  } catch (error) {
    console.error('계약 수정 오류:', error);
    backendLogger.error('Contracts', '계약 수정 오류', error);
    res.status(500).json({
      success: false,
      error: '계약 수정에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * DELETE /api/contracts/:id
 * 계약 삭제
 */
router.delete('/contracts/:id', authenticateJWTorAPIKey, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId가 필요합니다.' });
    }

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 계약 ID입니다.'
      });
    }

    // 1. 계약 정보 조회 (소유권 검증 포함)
    const agentObjectId = ObjectId.isValid(userId) ? new ObjectId(userId) : userId;
    const contract = await db.collection(CONTRACTS_COLLECTION).findOne({
      _id: new ObjectId(id),
      agent_id: agentObjectId
    });

    if (!contract) {
      return res.status(404).json({
        success: false,
        error: '계약을 찾을 수 없습니다.'
      });
    }

    // 2. 고객의 contracts 배열에서 이 계약 참조 제거 (있는 경우)
    if (contract.customer_id) {
      const customerId = ObjectId.isValid(contract.customer_id)
        ? new ObjectId(contract.customer_id)
        : contract.customer_id;

      const customerUpdateResult = await db.collection(CUSTOMERS_COLLECTION).updateOne(
        { _id: customerId },
        {
          $pull: { contracts: { contract_id: new ObjectId(id) } },
          $set: { 'meta.updated_at': utcNowDate() }
        }
      );

      if (customerUpdateResult.modifiedCount > 0) {
        console.log(`🗑️ 고객 ${contract.customer_id}의 contracts 배열에서 계약 ${id} 참조 제거`);
      }
    }

    // 3. 계약 삭제
    const result = await db.collection(CONTRACTS_COLLECTION).deleteOne({
      _id: new ObjectId(id)
    });

    // 계약 삭제 성공 로그
    activityLogger.log({
      actor: {
        user_id: contract.agent_id?.toString(),
        name: req.user?.name,
        email: req.user?.email,
        role: req.user?.role,
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      },
      action: {
        type: 'delete',
        category: 'contract',
        description: '계약 삭제',
        target: {
          entity_type: 'contract',
          entity_id: id,
          entity_name: contract.policy_number,
          parent_id: contract.customer_id?.toString(),
          parent_name: contract.customer_name
        }
      },
      result: {
        success: true,
        statusCode: 200
      },
      meta: {
        endpoint: `/api/contracts/${id}`,
        method: 'DELETE'
      }
    });

    res.json({
      success: true,
      message: '계약이 삭제되었습니다.'
    });

  } catch (error) {
    console.error('계약 삭제 오류:', error);
    backendLogger.error('Contracts', '계약 삭제 오류', error);

    // 계약 삭제 실패 로그
    activityLogger.log({
      actor: {
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      },
      action: {
        type: 'delete',
        category: 'contract',
        description: '계약 삭제 실패',
        target: {
          entity_type: 'contract',
          entity_id: req.params?.id
        }
      },
      result: {
        success: false,
        statusCode: 500,
        error: { message: error.message }
      },
      meta: {
        endpoint: `/api/contracts/${req.params?.id}`,
        method: 'DELETE'
      }
    });

    res.status(500).json({
      success: false,
      error: '계약 삭제에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * DELETE /api/contracts/bulk
 * 계약 일괄 삭제
 */
router.delete('/contracts/bulk', authenticateJWTorAPIKey, async (req, res) => {
  try {
    const { ids } = req.body;
    const userId = req.user.id;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId가 필요합니다.' });
    }

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: '삭제할 계약 ID 목록이 필요합니다.'
      });
    }

    const objectIds = ids.filter(id => ObjectId.isValid(id)).map(id => new ObjectId(id));

    if (objectIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: '유효한 계약 ID가 없습니다.'
      });
    }

    // 소유권 검증: 자신의 계약만 삭제 가능
    const agentObjectId = ObjectId.isValid(userId) ? new ObjectId(userId) : userId;

    // 1. 삭제할 계약들의 customer_id 조회 (소유권 필터 포함)
    const contracts = await db.collection(CONTRACTS_COLLECTION).find({
      _id: { $in: objectIds },
      agent_id: agentObjectId
    }, { projection: { customer_id: 1 } }).toArray();

    // 2. 고객의 contracts 배열에서 이 계약들 참조 제거
    const customerIds = contracts
      .filter(c => c.customer_id)
      .map(c => ObjectId.isValid(c.customer_id) ? new ObjectId(c.customer_id) : c.customer_id);

    if (customerIds.length > 0) {
      const customerUpdateResult = await db.collection(CUSTOMERS_COLLECTION).updateMany(
        { _id: { $in: customerIds } },
        {
          $pull: { contracts: { contract_id: { $in: objectIds } } },
          $set: { 'meta.updated_at': utcNowDate() }
        }
      );

      if (customerUpdateResult.modifiedCount > 0) {
        console.log(`🗑️ ${customerUpdateResult.modifiedCount}명의 고객 contracts 배열에서 계약 참조 제거`);
      }
    }

    // 3. 계약 삭제 (소유권 필터 포함)
    const result = await db.collection(CONTRACTS_COLLECTION).deleteMany({
      _id: { $in: objectIds },
      agent_id: agentObjectId
    });

    res.json({
      success: true,
      message: `${result.deletedCount}건 삭제되었습니다.`,
      deletedCount: result.deletedCount
    });

  } catch (error) {
    console.error('계약 일괄 삭제 오류:', error);
    backendLogger.error('Contracts', '계약 일괄 삭제 오류', error);
    res.status(500).json({
      success: false,
      error: '계약 일괄 삭제에 실패했습니다.',
      details: error.message
    });
  }
});

  return router;
};

/**
 * users-routes.js - User/Dev 라우트
 *
 * Phase 4: server.js 리팩토링
 * @since 2026-02-07
 */

const express = require('express');
const { ObjectId } = require('mongodb');
const { COLLECTIONS } = require('@aims/shared-schema');
const backendLogger = require('../lib/backendLogger');
const { utcNowDate } = require('../lib/timeUtils');

/**
 * @param {object} db - MongoDB database instance
 * @param {Function} authenticateJWT - JWT 인증 미들웨어
 * @param {Function} generateToken - JWT 토큰 생성 함수
 * @param {object} qdrantClient - Qdrant 클라이언트
 * @param {string} qdrantCollection - Qdrant 컬렉션명
 */
module.exports = function(db, authenticateJWT, generateToken, qdrantClient, qdrantCollection) {
  const router = express.Router();

  // 컬렉션 별칭
  const CUSTOMERS_COLLECTION = COLLECTIONS.CUSTOMERS;
  const COLLECTION_NAME = COLLECTIONS.FILES;

  /**
   * 사용자 목록 조회 API
   * 개발자 모드에서 사용자 전환 시 사용
   */
  router.get('/users', async (req, res) => {
    try {
      const usersCollection = db.collection(COLLECTIONS.USERS);

      // 모든 사용자 조회 (비밀번호 제외)
      const users = await usersCollection
        .find({}, { projection: { password: 0 } })
        .sort({ _id: 1 })
        .toArray();

      // 사용자별 아바타 매핑 (Adventurer 스타일 - 픽사 캐릭터 느낌)
      const avatarMap = {
        'tester': 'https://api.dicebear.com/7.x/adventurer/svg?seed=Felix&backgroundColor=b6e3f4',
        'user2': 'https://api.dicebear.com/7.x/adventurer/svg?seed=Aneka&backgroundColor=ffdfbf'
      };

      res.json({
        success: true,
        data: users.map(user => ({
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatarUrl: avatarMap[user._id] || user.avatarUrl
        }))
      });
    } catch (error) {
      console.error('❌ 사용자 목록 조회 실패:', error);
      backendLogger.error('Users', '사용자 목록 조회 실패', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * 특정 사용자 정보 조회 API
   * GET /api/users/:id
   * 개발자 모드 및 계정 설정에서 사용
   */
  router.get('/users/:id', async (req, res) => {
    try {
      const userId = req.params.id;
      const usersCollection = db.collection(COLLECTIONS.USERS);

      // 사용자 조회 (비밀번호 제외)
      const user = await usersCollection.findOne(
        { _id: userId },
        { projection: { password: 0 } }
      );

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // 아바타 매핑 (기존 로직과 동일)
      const avatarMap = {
        'tester': 'https://api.dicebear.com/7.x/adventurer/svg?seed=Felix&backgroundColor=b6e3f4',
        'user2': 'https://api.dicebear.com/7.x/adventurer/svg?seed=Aneka&backgroundColor=ffdfbf'
      };

      res.json({
        success: true,
        data: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone || '',
          department: user.department || '',
          position: user.position || '',
          role: user.role,
          avatarUrl: user.avatarUrl || avatarMap[user._id]
        }
      });
    } catch (error) {
      console.error('❌ 사용자 조회 실패:', error);
      backendLogger.error('Users', '사용자 조회 실패', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * 사용자 정보 업데이트 API
   * PUT /api/users/:id
   * 계정 설정에서 프로필 정보 수정 시 사용
   */
  router.put('/users/:id', async (req, res) => {
    try {
      const userId = req.params.id;
      const updateData = req.body;
      const usersCollection = db.collection(COLLECTIONS.USERS);

      // 업데이트할 수 있는 필드만 허용
      const allowedFields = ['name', 'email', 'phone', 'department', 'position', 'avatarUrl'];
      const filteredData = {};

      for (const field of allowedFields) {
        if (updateData[field] !== undefined) {
          filteredData[field] = updateData[field];
        }
      }

      // 업데이트할 데이터가 없는 경우
      if (Object.keys(filteredData).length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No valid fields to update'
        });
      }

      // 사용자 정보 업데이트
      const result = await usersCollection.updateOne(
        { _id: userId },
        { $set: filteredData }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // 업데이트된 사용자 정보 조회 (비밀번호 제외)
      const updatedUser = await usersCollection.findOne(
        { _id: userId },
        { projection: { password: 0 } }
      );

      res.json({
        success: true,
        data: {
          id: updatedUser._id,
          name: updatedUser.name,
          email: updatedUser.email,
          phone: updatedUser.phone || '',
          department: updatedUser.department || '',
          position: updatedUser.position || '',
          role: updatedUser.role,
          avatarUrl: updatedUser.avatarUrl
        }
      });
    } catch (error) {
      console.error('❌ 사용자 정보 업데이트 실패:', error);
      backendLogger.error('Users', '사용자 정보 업데이트 실패', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * 개발 전용: 개발 계정 자동 생성/조회 API
   * POST /api/dev/ensure-user
   */
  router.post('/dev/ensure-user', async (req, res) => {
    try {
      // 개발 계정 고정 ObjectId (항상 동일한 ID 사용)
      const DEV_USER_ID = new ObjectId('000000000000000000000001');
      const DEV_USER = {
        _id: DEV_USER_ID,
        name: '개발자 (Dev)',
        email: 'dev@aims.local',
        role: 'agent',
        avatarUrl: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Dev&backgroundColor=c0ffc0',
        authProvider: 'dev',
        profileCompleted: true,
        createdAt: new Date(),
        lastLogin: new Date()
      };

      const usersCollection = db.collection(COLLECTIONS.USERS);

      // 개발 계정 존재 여부 확인
      let user = await usersCollection.findOne({ _id: DEV_USER_ID });

      if (!user) {
        // 없으면 생성
        await usersCollection.insertOne(DEV_USER);
        user = DEV_USER;
        console.log(`✅ 개발 전용 계정 생성: ${DEV_USER_ID.toString()}`);
      } else {
        // 마지막 로그인 시간 업데이트
        await usersCollection.updateOne(
          { _id: DEV_USER_ID },
          { $set: { lastLogin: new Date() } }
        );
        user.lastLogin = new Date();
        console.log(`ℹ️  개발 전용 계정 존재 확인: ${DEV_USER_ID.toString()}`);
      }

      // 실제 JWT 토큰 발급 (계정 삭제 등 인증 필요 기능에서 사용)
      const token = generateToken({
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role
      });

      res.json({
        success: true,
        user: {
          _id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          avatarUrl: user.avatarUrl,
          authProvider: user.authProvider,
          profileCompleted: user.profileCompleted
        },
        token,  // JWT 토큰 추가
        message: '개발 계정 로그인 완료'
      });
    } catch (error) {
      console.error('❌ 개발 계정 생성/조회 실패:', error);
      backendLogger.error('Users', '개발 계정 생성/조회 실패', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * 개발 환경 전용: 모든 고객 삭제
   * DELETE /api/dev/customers/all
   */
  router.delete('/dev/customers/all', authenticateJWT, async (req, res) => {
    try {
      // 요청한 사용자(설계사)의 고객만 삭제
      const userId = req.user.id;  // JWT 토큰에서 추출 (보안)

      // 1. 먼저 설계사의 모든 고객 ID 목록 조회
      const customers = await db.collection(CUSTOMERS_COLLECTION).find(
        { 'meta.created_by': userId },
        { projection: { _id: 1 } }
      ).toArray();
      const customerIds = customers.map(c => c._id);

      console.log(`🗑️ [DEV] 고객 전체 삭제 시작: userId=${userId}, customerCount=${customerIds.length}`);

      // 2. 해당 고객들과 관련된 모든 관계 레코드 삭제 (Cascade Delete)
      let relationshipsDeleteCount = 0;
      if (customerIds.length > 0) {
        const relationshipsDeleteResult = await db.collection(COLLECTIONS.CUSTOMER_RELATIONSHIPS).deleteMany({
          $or: [
            { from_customer: { $in: customerIds } },
            { related_customer: { $in: customerIds } },
            { family_representative: { $in: customerIds } }
          ]
        });
        relationshipsDeleteCount = relationshipsDeleteResult.deletedCount;
      }

      // 3. 해당 고객들의 계약 삭제 (Cascade Delete)
      let contractsDeleteCount = 0;
      if (customerIds.length > 0) {
        const contractsDeleteResult = await db.collection(COLLECTIONS.CONTRACTS).deleteMany({
          customer_id: { $in: customerIds }
        });
        contractsDeleteCount = contractsDeleteResult.deletedCount;
      }

      // 4. 고객 삭제
      const result = await db.collection(CUSTOMERS_COLLECTION).deleteMany({
        'meta.created_by': userId
      });

      console.log(`🗑️ [DEV] 고객 전체 삭제 완료: customers=${result.deletedCount}, relationships=${relationshipsDeleteCount}, contracts=${contractsDeleteCount}`);

      res.json({
        success: true,
        message: `${result.deletedCount}명의 고객이 삭제되었습니다. (관계: ${relationshipsDeleteCount}건, 계약: ${contractsDeleteCount}건 정리)`,
        deletedCount: result.deletedCount,
        relationshipsDeleteCount,
        contractsDeleteCount
      });
    } catch (error) {
      console.error('❌ 고객 전체 삭제 실패:', error);
      backendLogger.error('Customers', '고객 전체 삭제 실패', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * 개발 환경 전용: 모든 계약 삭제
   * DELETE /api/dev/contracts/all
   */
  router.delete('/dev/contracts/all', authenticateJWT, async (req, res) => {
    try {
      // 요청한 사용자(설계사)의 계약만 삭제
      const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
      // agent_id가 ObjectId로 저장되어 있으므로 변환 필요
      const agentObjectId = ObjectId.isValid(userId) ? new ObjectId(userId) : userId;

      const result = await db.collection(COLLECTIONS.CONTRACTS).deleteMany({
        agent_id: agentObjectId
      });

      console.log(`🗑️ [DEV] 계약 전체 삭제: agent_id=${userId}, deletedCount=${result.deletedCount}`);

      res.json({
        success: true,
        message: `${result.deletedCount}건의 계약이 삭제되었습니다.`,
        deletedCount: result.deletedCount
      });
    } catch (error) {
      console.error('❌ 계약 전체 삭제 실패:', error);
      backendLogger.error('Contracts', '계약 전체 삭제 실패', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * 개발 환경 전용: 모든 문서 삭제
   * DELETE /api/dev/documents/all
   */
  router.delete('/dev/documents/all', authenticateJWT, async (req, res) => {
    try {
      const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
      const fs = require('fs').promises;

      // 1. 설계사 소유 문서 전체 조회
      const documents = await db.collection(COLLECTION_NAME)
        .find({ ownerId: userId })
        .toArray();

      const docIds = documents.map(d => d._id);
      const docIdStrings = docIds.map(id => id.toString());

      console.log(`🗑️ [DEV] 문서 전체 삭제 시작: userId=${userId}, docCount=${docIds.length}`);

      if (docIds.length === 0) {
        return res.json({
          success: true,
          message: '삭제할 문서가 없습니다.',
          deletedCount: 0
        });
      }

      // 2. 고객 참조 정리 (customers.documents[] 배열에서 제거)
      let customerRefsCleanedCount = 0;
      try {
        const customersUpdateResult = await db.collection(CUSTOMERS_COLLECTION).updateMany(
          { 'documents.document_id': { $in: docIds } },
          {
            $pull: { documents: { document_id: { $in: docIds } } },
            $set: { 'meta.updated_at': utcNowDate() }
          }
        );
        customerRefsCleanedCount = customersUpdateResult.modifiedCount;
        if (customerRefsCleanedCount > 0) {
          console.log(`✅ [DEV 문서 삭제] 고객 참조 정리: ${customerRefsCleanedCount}명`);
        }
      } catch (err) {
        console.warn('⚠️ [DEV 문서 삭제] 고객 참조 정리 실패:', err.message);
      }

      // 3. AR 파싱 큐 정리
      let arQueueCleanedCount = 0;
      try {
        const queueResult = await db.collection('ar_parse_queue').deleteMany({
          file_id: { $in: docIds }
        });
        arQueueCleanedCount = queueResult.deletedCount;
        if (arQueueCleanedCount > 0) {
          console.log(`✅ [DEV 문서 삭제] AR 파싱 큐 정리: ${arQueueCleanedCount}건`);
        }
      } catch (err) {
        console.warn('⚠️ [DEV 문서 삭제] AR 파싱 큐 정리 실패:', err.message);
      }

      // 4. AR 파싱 데이터 정리 (customers.annual_reports[] 에서 source_file_id 매칭 제거)
      let arDataCleanedCount = 0;
      try {
        const arDocs = documents.filter(d => d.is_annual_report && d.customerId);
        if (arDocs.length > 0) {
          const arResult = await db.collection(CUSTOMERS_COLLECTION).updateMany(
            { annual_reports: { $exists: true } },
            {
              $pull: { annual_reports: { source_file_id: { $in: docIds } } },
              $set: { 'meta.updated_at': utcNowDate() }
            }
          );
          arDataCleanedCount = arResult.modifiedCount;
          if (arDataCleanedCount > 0) {
            console.log(`✅ [DEV 문서 삭제] AR 파싱 데이터 정리: ${arDataCleanedCount}명의 고객`);
          }
        }
      } catch (err) {
        console.warn('⚠️ [DEV 문서 삭제] AR 파싱 데이터 정리 실패:', err.message);
      }

      // 5. 물리 파일 삭제
      let filesDeletedCount = 0;
      for (const doc of documents) {
        if (doc.upload?.destPath) {
          try {
            await fs.unlink(doc.upload.destPath);
            filesDeletedCount++;
          } catch (fileErr) {
            // ENOENT는 이미 파일이 없는 경우 → 무시
            if (fileErr.code !== 'ENOENT') {
              console.warn(`⚠️ 파일 삭제 실패: ${doc.upload.destPath} - ${fileErr.message}`);
            }
          }
        }
      }
      if (filesDeletedCount > 0) {
        console.log(`✅ [DEV 문서 삭제] 물리 파일 삭제: ${filesDeletedCount}개`);
      }

      // 6. Qdrant 임베딩 삭제 (배치)
      try {
        for (const docIdStr of docIdStrings) {
          await qdrantClient.delete(qdrantCollection, {
            filter: {
              must: [{ key: 'doc_id', match: { value: docIdStr } }]
            }
          });
        }
        console.log(`✅ [DEV 문서 삭제] Qdrant 임베딩 삭제 완료: ${docIdStrings.length}건`);
      } catch (qdrantErr) {
        console.warn('⚠️ [DEV 문서 삭제] Qdrant 임베딩 삭제 실패:', qdrantErr.message);
      }

      // 7. DB 문서 삭제 (files collection)
      const deleteResult = await db.collection(COLLECTION_NAME).deleteMany({
        _id: { $in: docIds }
      });

      console.log(`🗑️ [DEV] 문서 전체 삭제 완료: deleted=${deleteResult.deletedCount}, customerRefs=${customerRefsCleanedCount}, arQueue=${arQueueCleanedCount}, arData=${arDataCleanedCount}, physicalFiles=${filesDeletedCount}`);

      res.json({
        success: true,
        message: `${deleteResult.deletedCount}건의 문서가 삭제되었습니다.`,
        deletedCount: deleteResult.deletedCount,
        customerRefsCleanedCount,
        arQueueCleanedCount,
        arDataCleanedCount,
        filesDeletedCount
      });
    } catch (error) {
      console.error('❌ 문서 전체 삭제 실패:', error);
      backendLogger.error('Documents', '문서 전체 삭제 실패', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
};

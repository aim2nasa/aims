/**
 * 1:1 문의 API Routes
 * @since 2.0.0
 *
 * 사용자 문의 등록 및 관리자 답변 시스템
 * - 문의 CRUD
 * - 스레드 형태 메시지
 * - 첨부파일 업로드
 */

const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { authenticateJWTWithQuery } = require('../middleware/auth');

// 첨부파일 저장 경로
const INQUIRY_FILES_PATH = '/data/files/inquiries';

// 디렉토리 생성 헬퍼
const ensureDirectoryExists = async (dirPath) => {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
  }
};

// Multer 파일 업로드 설정
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    // 임시 디렉토리에 저장 (나중에 inquiryId로 이동)
    const tempDir = path.join(INQUIRY_FILES_PATH, 'temp');
    await ensureDirectoryExists(tempDir);
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    // 파일명 UTF-8 인코딩 변환 (한글 깨짐 방지)
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(originalName);
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB 제한
  fileFilter: (req, file, cb) => {
    const allowed = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    cb(null, allowed.includes(file.mimetype));
  }
});

// 카테고리/상태 상수
const CATEGORIES = ['bug', 'feature', 'question', 'other'];
const STATUSES = ['pending', 'in_progress', 'resolved', 'closed'];

module.exports = (db, authenticateJWT, requireRole) => {
  const inquiriesCollection = db.collection('inquiries');
  const usersCollection = db.collection('users');

  // ========================================
  // 사용자용 API
  // ========================================

  /**
   * 내 문의 목록 조회
   * GET /api/inquiries
   */
  router.get('/inquiries', authenticateJWT, async (req, res) => {
    try {
      const userId = req.user.id;
      const { status, page = 1, limit = 20 } = req.query;

      const query = { userId: new ObjectId(userId) };
      if (status && STATUSES.includes(status)) {
        query.status = status;
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [inquiries, total] = await Promise.all([
        inquiriesCollection
          .find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .toArray(),
        inquiriesCollection.countDocuments(query)
      ]);

      res.json({
        success: true,
        data: {
          inquiries,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            totalPages: Math.ceil(total / parseInt(limit))
          }
        }
      });
    } catch (error) {
      console.error('문의 목록 조회 오류:', error);
      res.status(500).json({
        success: false,
        message: '서버 오류가 발생했습니다'
      });
    }
  });

  /**
   * 문의 상세 조회
   * GET /api/inquiries/:id
   */
  router.get('/inquiries/:id', authenticateJWT, async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: '유효하지 않은 문의 ID입니다'
        });
      }

      const inquiry = await inquiriesCollection.findOne({
        _id: new ObjectId(id),
        userId: new ObjectId(userId)
      });

      if (!inquiry) {
        return res.status(404).json({
          success: false,
          message: '문의를 찾을 수 없습니다'
        });
      }

      res.json({
        success: true,
        data: inquiry
      });
    } catch (error) {
      console.error('문의 상세 조회 오류:', error);
      res.status(500).json({
        success: false,
        message: '서버 오류가 발생했습니다'
      });
    }
  });

  /**
   * 문의 등록
   * POST /api/inquiries
   * FormData: { category, title, content, files[] }
   */
  router.post('/inquiries', authenticateJWT, upload.array('files', 5), async (req, res) => {
    try {
      const userId = req.user.id;
      const { category, title, content } = req.body;

      // 유효성 검사
      if (!category || !CATEGORIES.includes(category)) {
        return res.status(400).json({
          success: false,
          message: '유효한 카테고리를 선택해주세요'
        });
      }

      if (!title || title.trim().length < 2) {
        return res.status(400).json({
          success: false,
          message: '제목을 2자 이상 입력해주세요'
        });
      }

      if (!content || !content.trim()) {
        return res.status(400).json({
          success: false,
          message: '내용을 입력해주세요'
        });
      }

      // 사용자 정보 조회
      const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
      if (!user) {
        return res.status(404).json({
          success: false,
          message: '사용자 정보를 찾을 수 없습니다'
        });
      }

      // 문의 생성
      const now = new Date();
      const newInquiry = {
        userId: new ObjectId(userId),
        userName: user.name || '이름 없음',
        userEmail: user.email || '',
        category,
        title: title.trim(),
        status: 'pending',
        messages: [],
        createdAt: now,
        updatedAt: now,
        resolvedAt: null
      };

      const result = await inquiriesCollection.insertOne(newInquiry);
      const inquiryId = result.insertedId;

      // 첫 번째 메시지 추가
      const attachments = [];

      // 첨부파일 처리
      if (req.files && req.files.length > 0) {
        const inquiryDir = path.join(INQUIRY_FILES_PATH, inquiryId.toString());
        await ensureDirectoryExists(inquiryDir);

        for (const file of req.files) {
          const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
          const newPath = path.join(inquiryDir, file.filename);

          // 임시 파일을 문의 폴더로 이동
          await fs.rename(file.path, newPath);

          attachments.push({
            filename: file.filename,
            originalName,
            mimeType: file.mimetype,
            size: file.size,
            path: newPath
          });
        }
      }

      const firstMessage = {
        _id: new ObjectId(),
        authorId: new ObjectId(userId),
        authorName: user.name || '이름 없음',
        authorRole: 'user',
        content: content.trim(),
        attachments,
        createdAt: now
      };

      await inquiriesCollection.updateOne(
        { _id: inquiryId },
        { $push: { messages: firstMessage } }
      );

      res.status(201).json({
        success: true,
        data: {
          _id: inquiryId,
          ...newInquiry,
          messages: [firstMessage]
        }
      });
    } catch (error) {
      console.error('문의 등록 오류:', error);

      // 업로드된 파일 정리
      if (req.files) {
        for (const file of req.files) {
          try {
            await fs.unlink(file.path);
          } catch (e) {
            console.error('임시 파일 삭제 실패:', e);
          }
        }
      }

      res.status(500).json({
        success: false,
        message: '서버 오류가 발생했습니다'
      });
    }
  });

  /**
   * 문의에 메시지 추가 (사용자)
   * POST /api/inquiries/:id/messages
   * FormData: { content, files[] }
   */
  router.post('/inquiries/:id/messages', authenticateJWT, upload.array('files', 5), async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const { content } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: '유효하지 않은 문의 ID입니다'
        });
      }

      if (!content || content.trim().length < 1) {
        return res.status(400).json({
          success: false,
          message: '내용을 입력해주세요'
        });
      }

      // 문의 조회 (본인 문의만)
      const inquiry = await inquiriesCollection.findOne({
        _id: new ObjectId(id),
        userId: new ObjectId(userId)
      });

      if (!inquiry) {
        return res.status(404).json({
          success: false,
          message: '문의를 찾을 수 없습니다'
        });
      }

      // 종료된 문의에는 메시지 추가 불가
      if (inquiry.status === 'closed') {
        return res.status(400).json({
          success: false,
          message: '종료된 문의에는 메시지를 추가할 수 없습니다'
        });
      }

      // 사용자 정보 조회
      const user = await usersCollection.findOne({ _id: new ObjectId(userId) });

      // 첨부파일 처리
      const attachments = [];
      if (req.files && req.files.length > 0) {
        const inquiryDir = path.join(INQUIRY_FILES_PATH, id);
        await ensureDirectoryExists(inquiryDir);

        for (const file of req.files) {
          const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
          const newPath = path.join(inquiryDir, file.filename);
          await fs.rename(file.path, newPath);

          attachments.push({
            filename: file.filename,
            originalName,
            mimeType: file.mimetype,
            size: file.size,
            path: newPath
          });
        }
      }

      const newMessage = {
        _id: new ObjectId(),
        authorId: new ObjectId(userId),
        authorName: user?.name || '이름 없음',
        authorRole: 'user',
        content: content.trim(),
        attachments,
        createdAt: new Date()
      };

      await inquiriesCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $push: { messages: newMessage },
          $set: { updatedAt: new Date() }
        }
      );

      res.json({
        success: true,
        data: newMessage
      });
    } catch (error) {
      console.error('메시지 추가 오류:', error);

      if (req.files) {
        for (const file of req.files) {
          try {
            await fs.unlink(file.path);
          } catch (e) {
            console.error('임시 파일 삭제 실패:', e);
          }
        }
      }

      res.status(500).json({
        success: false,
        message: '서버 오류가 발생했습니다'
      });
    }
  });

  /**
   * 첨부파일 다운로드
   * GET /api/inquiries/attachments/:inquiryId/:filename
   *
   * 인증: Authorization 헤더 또는 ?token=xxx 쿼리 파라미터
   * (이미지 태그 등에서 직접 접근 가능하도록 쿼리 파라미터 지원)
   */
  router.get('/inquiries/attachments/:inquiryId/:filename', authenticateJWTWithQuery, async (req, res) => {
    try {
      const userId = req.user.id;
      const userRole = req.user.role;
      const { inquiryId, filename } = req.params;

      if (!ObjectId.isValid(inquiryId)) {
        return res.status(400).json({
          success: false,
          message: '유효하지 않은 문의 ID입니다'
        });
      }

      // 권한 확인: 본인 문의이거나 관리자
      const query = { _id: new ObjectId(inquiryId) };
      if (userRole !== 'admin') {
        query.userId = new ObjectId(userId);
      }

      const inquiry = await inquiriesCollection.findOne(query);
      if (!inquiry) {
        return res.status(404).json({
          success: false,
          message: '문의를 찾을 수 없거나 권한이 없습니다'
        });
      }

      // 파일 경로 확인
      const filePath = path.join(INQUIRY_FILES_PATH, inquiryId, filename);

      try {
        await fs.access(filePath);
      } catch {
        return res.status(404).json({
          success: false,
          message: '파일을 찾을 수 없습니다'
        });
      }

      // 원본 파일명 찾기
      let originalName = filename;
      for (const msg of inquiry.messages) {
        const attachment = msg.attachments?.find(a => a.filename === filename);
        if (attachment) {
          originalName = attachment.originalName;
          break;
        }
      }

      res.download(filePath, originalName);
    } catch (error) {
      console.error('파일 다운로드 오류:', error);
      res.status(500).json({
        success: false,
        message: '서버 오류가 발생했습니다'
      });
    }
  });

  // ========================================
  // 관리자용 API
  // ========================================

  /**
   * 전체 문의 목록 조회 (관리자)
   * GET /api/admin/inquiries
   */
  router.get('/admin/inquiries', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { status, category, search, page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

      const query = {};

      if (status && STATUSES.includes(status)) {
        query.status = status;
      }

      if (category && CATEGORIES.includes(category)) {
        query.category = category;
      }

      if (search) {
        query.$or = [
          { title: { $regex: search, $options: 'i' } },
          { userName: { $regex: search, $options: 'i' } },
          { userEmail: { $regex: search, $options: 'i' } }
        ];
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

      const [inquiries, total] = await Promise.all([
        inquiriesCollection
          .find(query)
          .sort(sort)
          .skip(skip)
          .limit(parseInt(limit))
          .toArray(),
        inquiriesCollection.countDocuments(query)
      ]);

      // 각 문의에 메시지 수, 마지막 메시지 정보 추가
      const enrichedInquiries = inquiries.map(inq => ({
        ...inq,
        messageCount: inq.messages?.length || 0,
        lastMessage: inq.messages?.[inq.messages.length - 1] || null,
        hasUnreadAdminReply: false // 추후 읽음 상태 구현 시 사용
      }));

      res.json({
        success: true,
        data: {
          inquiries: enrichedInquiries,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            totalPages: Math.ceil(total / parseInt(limit))
          }
        }
      });
    } catch (error) {
      console.error('관리자 문의 목록 조회 오류:', error);
      res.status(500).json({
        success: false,
        message: '서버 오류가 발생했습니다'
      });
    }
  });

  /**
   * 문의 통계 (관리자 대시보드용)
   * GET /api/admin/inquiries/stats
   * 주의: :id 라우트보다 먼저 정의해야 함
   */
  router.get('/admin/inquiries/stats', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const [
        totalCount,
        pendingCount,
        inProgressCount,
        resolvedCount,
        closedCount
      ] = await Promise.all([
        inquiriesCollection.countDocuments({}),
        inquiriesCollection.countDocuments({ status: 'pending' }),
        inquiriesCollection.countDocuments({ status: 'in_progress' }),
        inquiriesCollection.countDocuments({ status: 'resolved' }),
        inquiriesCollection.countDocuments({ status: 'closed' })
      ]);

      res.json({
        success: true,
        data: {
          total: totalCount,
          pending: pendingCount,
          inProgress: inProgressCount,
          resolved: resolvedCount,
          closed: closedCount
        }
      });
    } catch (error) {
      console.error('문의 통계 조회 오류:', error);
      res.status(500).json({
        success: false,
        message: '서버 오류가 발생했습니다'
      });
    }
  });

  /**
   * 문의 상세 조회 (관리자)
   * GET /api/admin/inquiries/:id
   */
  router.get('/admin/inquiries/:id', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: '유효하지 않은 문의 ID입니다'
        });
      }

      const inquiry = await inquiriesCollection.findOne({ _id: new ObjectId(id) });

      if (!inquiry) {
        return res.status(404).json({
          success: false,
          message: '문의를 찾을 수 없습니다'
        });
      }

      // 사용자 추가 정보 조회
      const user = await usersCollection.findOne({ _id: inquiry.userId });

      res.json({
        success: true,
        data: {
          ...inquiry,
          user: user ? {
            _id: user._id,
            name: user.name,
            email: user.email,
            tier: user.tier,
            createdAt: user.createdAt
          } : null
        }
      });
    } catch (error) {
      console.error('관리자 문의 상세 조회 오류:', error);
      res.status(500).json({
        success: false,
        message: '서버 오류가 발생했습니다'
      });
    }
  });

  /**
   * 문의에 답변 추가 (관리자)
   * POST /api/admin/inquiries/:id/messages
   * Body: { content }
   */
  router.post('/admin/inquiries/:id/messages', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const adminId = req.user.id;
      const { id } = req.params;
      const { content } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: '유효하지 않은 문의 ID입니다'
        });
      }

      if (!content || content.trim().length < 1) {
        return res.status(400).json({
          success: false,
          message: '답변 내용을 입력해주세요'
        });
      }

      const inquiry = await inquiriesCollection.findOne({ _id: new ObjectId(id) });

      if (!inquiry) {
        return res.status(404).json({
          success: false,
          message: '문의를 찾을 수 없습니다'
        });
      }

      // 관리자 정보 조회
      const admin = await usersCollection.findOne({ _id: new ObjectId(adminId) });

      const newMessage = {
        _id: new ObjectId(),
        authorId: new ObjectId(adminId),
        authorName: admin?.name || '관리자',
        authorRole: 'admin',
        content: content.trim(),
        attachments: [],
        createdAt: new Date()
      };

      // 처음 답변 시 상태를 in_progress로 변경
      const updateFields = {
        updatedAt: new Date()
      };

      if (inquiry.status === 'pending') {
        updateFields.status = 'in_progress';
      }

      await inquiriesCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $push: { messages: newMessage },
          $set: updateFields
        }
      );

      res.json({
        success: true,
        data: newMessage
      });
    } catch (error) {
      console.error('관리자 답변 추가 오류:', error);
      res.status(500).json({
        success: false,
        message: '서버 오류가 발생했습니다'
      });
    }
  });

  /**
   * 문의 상태 변경 (관리자)
   * PUT /api/admin/inquiries/:id/status
   * Body: { status }
   */
  router.put('/admin/inquiries/:id/status', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: '유효하지 않은 문의 ID입니다'
        });
      }

      if (!status || !STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          message: '유효한 상태를 선택해주세요'
        });
      }

      const inquiry = await inquiriesCollection.findOne({ _id: new ObjectId(id) });

      if (!inquiry) {
        return res.status(404).json({
          success: false,
          message: '문의를 찾을 수 없습니다'
        });
      }

      const updateFields = {
        status,
        updatedAt: new Date()
      };

      // resolved 또는 closed로 변경 시 resolvedAt 설정
      if ((status === 'resolved' || status === 'closed') && !inquiry.resolvedAt) {
        updateFields.resolvedAt = new Date();
      }

      await inquiriesCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updateFields }
      );

      res.json({
        success: true,
        message: '상태가 변경되었습니다',
        data: { status }
      });
    } catch (error) {
      console.error('상태 변경 오류:', error);
      res.status(500).json({
        success: false,
        message: '서버 오류가 발생했습니다'
      });
    }
  });

  return router;
};

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
const backendLogger = require('../lib/backendLogger');

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

// 상태 라벨 (한글)
const STATUS_LABELS = {
  pending: '대기',
  in_progress: '처리중',
  resolved: '해결',
  closed: '종료'
};

// ========================================
// SSE (Server-Sent Events) 클라이언트 관리
// ========================================
const sseClients = {
  users: new Map(),    // userId(string) -> Set<response>
  admins: new Set(),   // Set<response>
};

// SSE 이벤트 전송 헬퍼
function sendSSE(res, event, data) {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch (e) {
    console.error('SSE 전송 실패:', e);
    backendLogger.error('Inquiries', 'SSE 전송 실패', e);
  }
}

// 특정 사용자에게 알림 전송
function notifyUser(userId, event, data) {
  const userIdStr = userId.toString();
  const clients = sseClients.users.get(userIdStr);
  if (clients && clients.size > 0) {
    clients.forEach(res => sendSSE(res, event, data));
    console.log(`[SSE] 사용자 ${userIdStr}에게 ${event} 이벤트 전송 (${clients.size} 연결)`);
  }
}

// 모든 관리자에게 알림 전송
function notifyAdmins(event, data) {
  if (sseClients.admins.size > 0) {
    sseClients.admins.forEach(res => sendSSE(res, event, data));
    console.log(`[SSE] 관리자들에게 ${event} 이벤트 전송 (${sseClients.admins.size} 연결)`);
  }
}

module.exports = (db, authenticateJWT, requireRole) => {
  const inquiriesCollection = db.collection('inquiries');
  const usersCollection = db.collection('users');

  // ========================================
  // 미확인 문의 조회 헬퍼 함수
  // ========================================

  /**
   * 사용자의 미확인 메시지 개수 조회 (카카오톡 스타일)
   * 관리자가 답변했는데 사용자가 아직 안 읽은 메시지 개수
   */
  async function getUnreadCountForUser(userId) {
    const userObjectId = new ObjectId(userId);

    // aggregation으로 미확인 메시지 개수 계산
    const result = await inquiriesCollection.aggregate([
      { $match: { userId: userObjectId } },
      { $unwind: '$messages' },
      {
        $match: {
          'messages.authorRole': 'admin',
          $expr: {
            $gt: [
              '$messages.createdAt',
              { $ifNull: ['$userLastReadAt', new Date(0)] }
            ]
          }
        }
      },
      { $count: 'unreadCount' }
    ]).toArray();

    return result[0]?.unreadCount || 0;
  }

  /**
   * 사용자의 미확인 문의 ID 목록 조회
   */
  async function getUnreadIdsForUser(userId) {
    const userObjectId = new ObjectId(userId);

    const result = await inquiriesCollection.aggregate([
      { $match: { userId: userObjectId } },
      {
        $addFields: {
          lastAdminMessageAt: {
            $max: {
              $map: {
                input: { $filter: { input: '$messages', cond: { $eq: ['$$this.authorRole', 'admin'] } } },
                as: 'm',
                in: '$$m.createdAt'
              }
            }
          }
        }
      },
      {
        $match: {
          $expr: {
            $gt: [
              '$lastAdminMessageAt',
              { $ifNull: ['$userLastReadAt', new Date(0)] }
            ]
          }
        }
      },
      { $project: { _id: 1 } }
    ]).toArray();

    return result.map(r => r._id.toString());
  }

  /**
   * 관리자의 미확인 문의 개수 조회
   * 사용자가 메시지를 보냈는데 관리자가 아직 안 읽은 문의
   */
  async function getUnreadCountForAdmin() {
    const result = await inquiriesCollection.aggregate([
      {
        $addFields: {
          // 사용자가 작성한 메시지 중 가장 최근 시각
          lastUserMessageAt: {
            $max: {
              $map: {
                input: { $filter: { input: '$messages', cond: { $eq: ['$$this.authorRole', 'user'] } } },
                as: 'm',
                in: '$$m.createdAt'
              }
            }
          }
        }
      },
      {
        $match: {
          $expr: {
            $gt: [
              '$lastUserMessageAt',
              { $ifNull: ['$adminLastReadAt', new Date(0)] }
            ]
          }
        }
      },
      { $count: 'unreadCount' }
    ]).toArray();

    return result[0]?.unreadCount || 0;
  }

  /**
   * 관리자의 미확인 문의 ID 목록 조회
   */
  async function getUnreadIdsForAdmin() {
    const result = await inquiriesCollection.aggregate([
      {
        $addFields: {
          lastUserMessageAt: {
            $max: {
              $map: {
                input: { $filter: { input: '$messages', cond: { $eq: ['$$this.authorRole', 'user'] } } },
                as: 'm',
                in: '$$m.createdAt'
              }
            }
          }
        }
      },
      {
        $match: {
          $expr: {
            $gt: [
              '$lastUserMessageAt',
              { $ifNull: ['$adminLastReadAt', new Date(0)] }
            ]
          }
        }
      },
      { $project: { _id: 1 } }
    ]).toArray();

    return result.map(r => r._id.toString());
  }

  // ========================================
  // SSE 스트림 엔드포인트
  // ========================================

  /**
   * 사용자용 SSE 스트림
   * GET /api/inquiries/notifications/stream
   *
   * 인증: ?token=xxx 쿼리 파라미터 (EventSource는 헤더 설정 불가)
   */
  router.get('/inquiries/notifications/stream', authenticateJWTWithQuery, (req, res) => {
    const userId = req.user.id;
    const userIdStr = userId.toString();

    console.log(`[SSE] 사용자 ${userIdStr} 연결 시작`);

    // SSE 헤더 설정
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Accel-Buffering', 'no'); // nginx 버퍼링 비활성화
    res.flushHeaders();

    // 클라이언트 등록
    if (!sseClients.users.has(userIdStr)) {
      sseClients.users.set(userIdStr, new Set());
    }
    sseClients.users.get(userIdStr).add(res);

    // 연결 확인 이벤트
    sendSSE(res, 'connected', { userId: userIdStr, timestamp: new Date().toISOString() });

    // 초기 미확인 개수 및 ID 목록 전송
    Promise.all([
      getUnreadCountForUser(userId),
      getUnreadIdsForUser(userId)
    ]).then(([count, ids]) => {
      console.log(`[SSE] 사용자 ${userIdStr}에게 init 이벤트 전송 - count: ${count}, ids: ${JSON.stringify(ids)}`);
      sendSSE(res, 'init', { count, ids });
    }).catch(err => {
      console.error('[SSE] 초기 데이터 조회 오류:', err);
    });

    // 30초마다 keep-alive 전송
    const keepAliveInterval = setInterval(() => {
      sendSSE(res, 'ping', { timestamp: new Date().toISOString() });
    }, 30000);

    // 연결 종료 처리
    req.on('close', () => {
      console.log(`[SSE] 사용자 ${userIdStr} 연결 종료`);
      clearInterval(keepAliveInterval);
      sseClients.users.get(userIdStr)?.delete(res);
      if (sseClients.users.get(userIdStr)?.size === 0) {
        sseClients.users.delete(userIdStr);
      }
    });
  });

  /**
   * 관리자용 SSE 스트림
   * GET /api/admin/inquiries/notifications/stream
   */
  router.get('/admin/inquiries/notifications/stream', authenticateJWTWithQuery, (req, res) => {
    // 관리자 권한 확인
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: '관리자 권한이 필요합니다' });
    }

    const adminId = req.user.id;
    console.log(`[SSE] 관리자 ${adminId} 연결 시작`);

    // SSE 헤더 설정
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // 클라이언트 등록
    sseClients.admins.add(res);

    // 연결 확인 이벤트
    sendSSE(res, 'connected', { adminId, timestamp: new Date().toISOString() });

    // 초기 미확인 개수 및 ID 목록 전송
    Promise.all([
      getUnreadCountForAdmin(),
      getUnreadIdsForAdmin()
    ]).then(([count, ids]) => {
      sendSSE(res, 'init', { count, ids });
    }).catch(err => {
      console.error('[SSE] 초기 데이터 조회 오류:', err);
    });

    // 30초마다 keep-alive 전송
    const keepAliveInterval = setInterval(() => {
      sendSSE(res, 'ping', { timestamp: new Date().toISOString() });
    }, 30000);

    // 연결 종료 처리
    req.on('close', () => {
      console.log(`[SSE] 관리자 ${adminId} 연결 종료`);
      clearInterval(keepAliveInterval);
      sseClients.admins.delete(res);
    });
  });

  // ========================================
  // 사용자용 API
  // ========================================

  /**
   * 미확인 문의 개수 조회 (사용자)
   * GET /api/inquiries/unread-count
   */
  router.get('/inquiries/unread-count', authenticateJWT, async (req, res) => {
    try {
      const count = await getUnreadCountForUser(req.user.id);
      res.json({ success: true, data: { count } });
    } catch (error) {
      console.error('미확인 개수 조회 오류:', error);
      backendLogger.error('Inquiry', '미확인 개수 조회 오류', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다' });
    }
  });

  /**
   * 미확인 문의 ID 목록 조회 (사용자)
   * GET /api/inquiries/unread
   */
  router.get('/inquiries/unread', authenticateJWT, async (req, res) => {
    try {
      const ids = await getUnreadIdsForUser(req.user.id);
      res.json({ success: true, data: { ids } });
    } catch (error) {
      console.error('미확인 목록 조회 오류:', error);
      backendLogger.error('Inquiry', '미확인 목록 조회 오류', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다' });
    }
  });

  /**
   * 문의 읽음 처리 (사용자)
   * PUT /api/inquiries/:id/mark-read
   */
  router.put('/inquiries/:id/mark-read', authenticateJWT, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: '유효하지 않은 문의 ID입니다' });
      }

      const result = await inquiriesCollection.updateOne(
        { _id: new ObjectId(id), userId: new ObjectId(userId) },
        { $set: { userLastReadAt: new Date() } }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({ success: false, message: '문의를 찾을 수 없습니다' });
      }

      res.json({ success: true, message: '읽음 처리되었습니다' });
    } catch (error) {
      console.error('읽음 처리 오류:', error);
      backendLogger.error('Inquiry', '읽음 처리 오류', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다' });
    }
  });

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
      backendLogger.error('Inquiry', '문의 목록 조회 오류', error);
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
      backendLogger.error('Inquiry', '문의 상세 조회 오류', error);
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

      // SSE: 관리자들에게 새 문의 알림
      notifyAdmins('new-inquiry', {
        inquiryId: inquiryId.toString(),
        userId: userId,
        userName: user.name || '이름 없음',
        title: title.trim(),
        category
      });

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
      backendLogger.error('Inquiry', '문의 등록 오류', error);

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

      // resolved 상태에서 사용자가 메시지를 보내면 자동으로 pending으로 재접수
      const now = new Date();
      const updateFields = { updatedAt: now };
      const messagesToPush = [newMessage];

      if (inquiry.status === 'resolved') {
        updateFields.status = 'pending';
        updateFields.resolvedAt = null; // 재접수 시 resolvedAt 초기화

        // 시스템 메시지 추가 (상태 변경 기록)
        const systemMessage = {
          _id: new ObjectId(),
          authorRole: 'system',
          content: `상태가 변경되었습니다: ${STATUS_LABELS.resolved} → ${STATUS_LABELS.pending}`,
          createdAt: new Date(now.getTime() + 1) // 사용자 메시지 바로 다음에 표시
        };
        messagesToPush.push(systemMessage);
        console.log(`[Inquiry] 문의 ${id} 재접수됨 (resolved → pending)`);
      }

      await inquiriesCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $push: { messages: { $each: messagesToPush } },
          $set: updateFields
        }
      );

      // SSE: 관리자들에게 새 메시지 알림
      notifyAdmins('new-message', {
        inquiryId: id,
        userId: userId,
        userName: user?.name || '이름 없음',
        title: inquiry.title
      });

      // SSE: resolved → pending 상태 변경 시 사용자에게 알림 (UI 갱신용)
      if (inquiry.status === 'resolved') {
        notifyUser(userId, 'status-changed', {
          inquiryId: id,
          title: inquiry.title,
          status: 'pending',
          previousStatus: 'resolved'
        });
      }

      res.json({
        success: true,
        data: newMessage
      });
    } catch (error) {
      console.error('메시지 추가 오류:', error);
      backendLogger.error('Inquiry', '메시지 추가 오류', error);

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
      backendLogger.error('Inquiry', '파일 다운로드 오류', error);
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
   * 미확인 문의 개수 조회 (관리자)
   * GET /api/admin/inquiries/unread-count
   */
  router.get('/admin/inquiries/unread-count', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const count = await getUnreadCountForAdmin();
      res.json({ success: true, data: { count } });
    } catch (error) {
      console.error('관리자 미확인 개수 조회 오류:', error);
      backendLogger.error('Inquiry', '관리자 미확인 개수 조회 오류', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다' });
    }
  });

  /**
   * 미확인 문의 ID 목록 조회 (관리자)
   * GET /api/admin/inquiries/unread
   */
  router.get('/admin/inquiries/unread', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const ids = await getUnreadIdsForAdmin();
      res.json({ success: true, data: { ids } });
    } catch (error) {
      console.error('관리자 미확인 목록 조회 오류:', error);
      backendLogger.error('Inquiry', '관리자 미확인 목록 조회 오류', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다' });
    }
  });

  /**
   * 문의 읽음 처리 (관리자)
   * PUT /api/admin/inquiries/:id/mark-read
   */
  router.put('/admin/inquiries/:id/mark-read', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: '유효하지 않은 문의 ID입니다' });
      }

      const result = await inquiriesCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { adminLastReadAt: new Date() } }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({ success: false, message: '문의를 찾을 수 없습니다' });
      }

      res.json({ success: true, message: '읽음 처리되었습니다' });
    } catch (error) {
      console.error('관리자 읽음 처리 오류:', error);
      backendLogger.error('Inquiry', '관리자 읽음 처리 오류', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다' });
    }
  });

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
      backendLogger.error('Inquiry', '관리자 문의 목록 조회 오류', error);
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
      backendLogger.error('Inquiry', '문의 통계 조회 오류', error);
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
      backendLogger.error('Inquiry', '관리자 문의 상세 조회 오류', error);
      res.status(500).json({
        success: false,
        message: '서버 오류가 발생했습니다'
      });
    }
  });

  /**
   * 문의에 답변 추가 (관리자)
   * POST /api/admin/inquiries/:id/messages
   * FormData: { content, files[] }
   */
  router.post('/admin/inquiries/:id/messages', authenticateJWT, requireRole('admin'), upload.array('files', 5), async (req, res) => {
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
        authorId: new ObjectId(adminId),
        authorName: admin?.name || '관리자',
        authorRole: 'admin',
        content: content.trim(),
        attachments,
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

      // SSE: 해당 사용자에게 새 답변 알림 (messageId 포함으로 중복 방지)
      notifyUser(inquiry.userId, 'new-message', {
        inquiryId: id,
        messageId: newMessage._id.toString(),
        title: inquiry.title
      });

      res.json({
        success: true,
        data: newMessage
      });
    } catch (error) {
      console.error('관리자 답변 추가 오류:', error);
      backendLogger.error('Inquiry', '관리자 답변 추가 오류', error);
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

      // 상태가 실제로 변경되었는지 확인
      if (inquiry.status === status) {
        return res.json({
          success: true,
          message: '상태가 동일합니다',
          data: { status }
        });
      }

      const now = new Date();
      const updateFields = {
        status,
        updatedAt: now
      };

      // resolved 또는 closed로 변경 시 resolvedAt 설정
      if ((status === 'resolved' || status === 'closed') && !inquiry.resolvedAt) {
        updateFields.resolvedAt = now;
      }

      // 시스템 메시지 생성 (상태 변경 기록)
      const systemMessage = {
        _id: new ObjectId(),
        authorRole: 'system',
        content: `상태가 변경되었습니다: ${STATUS_LABELS[inquiry.status]} → ${STATUS_LABELS[status]}`,
        createdAt: now
      };

      await inquiriesCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: updateFields,
          $push: { messages: systemMessage }
        }
      );

      // SSE: 해당 사용자에게 상태 변경 알림
      notifyUser(inquiry.userId, 'status-changed', {
        inquiryId: id,
        messageId: systemMessage._id.toString(),
        title: inquiry.title,
        status,
        previousStatus: inquiry.status
      });

      res.json({
        success: true,
        message: '상태가 변경되었습니다',
        data: { status }
      });
    } catch (error) {
      console.error('상태 변경 오류:', error);
      backendLogger.error('Inquiry', '상태 변경 오류', error);
      res.status(500).json({
        success: false,
        message: '서버 오류가 발생했습니다'
      });
    }
  });

  /**
   * 문의 삭제 (관리자 전용)
   * DELETE /api/admin/inquiries/:id
   */
  router.delete('/admin/inquiries/:id', authenticateJWT, requireRole('admin'), async (req, res) => {
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

      // 문의 삭제
      await inquiriesCollection.deleteOne({ _id: new ObjectId(id) });

      res.json({
        success: true,
        message: '문의가 삭제되었습니다'
      });
    } catch (error) {
      console.error('문의 삭제 오류:', error);
      backendLogger.error('Inquiry', '문의 삭제 오류', error);
      res.status(500).json({
        success: false,
        message: '서버 오류가 발생했습니다'
      });
    }
  });

  return router;
};

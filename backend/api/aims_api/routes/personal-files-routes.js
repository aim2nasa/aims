/**
 * Personal Files API Routes
 * @since 2.0.0
 *
 * Google Drive 스타일의 개인 파일 관리 API
 * - 폴더/파일 계층 구조
 * - CRUD 작업
 * - JWT 인증
 */

const express = require('express');
const router = express.Router();
const { MongoClient, ObjectId } = require('mongodb');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const axios = require('axios');
const { checkUploadAllowed } = require('../lib/storageQuotaService');
const backendLogger = require('../lib/backendLogger');

// MongoDB 설정
const mongoUrl = process.env.MONGO_URL || 'mongodb://localhost:27017';
const dbName = 'docupload';

// 파일 저장소 기본 경로
const BASE_STORAGE_PATH = '/data/files/users';

// AIMS 표준 인증 미들웨어 (x-user-id 헤더 방식)
const authenticateToken = (req, res, next) => {
  const userId = req.headers['x-user-id'];

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: '사용자 ID가 없습니다'
    });
  }

  // AIMS 표준: req.user 객체에 userId 설정
  req.user = { userId };
  next();
};

// 사용자별 저장소 경로 생성
const getUserStoragePath = (userId) => {
  return path.join(BASE_STORAGE_PATH, userId, 'myfiles');
};

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
    const userId = req.user.userId;
    const storagePath = getUserStoragePath(userId);
    await ensureDirectoryExists(storagePath);
    cb(null, storagePath);
  },
  filename: (req, file, cb) => {
    // 파일명 UTF-8 인코딩 변환 (한글 깨짐 방지)
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(originalName);
    const basename = path.basename(originalName, ext);
    cb(null, `${basename}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB 제한
});

/**
 * 1-1. 루트 폴더 내용 조회
 * GET /api/personal-files/folders
 */
router.get('/folders', authenticateToken, async (req, res) => {
  const client = new MongoClient(mongoUrl);

  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection('personal_files');

    const userId = req.user.userId;

    // 루트 폴더 (parentId가 null인 항목들)
    const items = await collection.find({
      userId,
      parentId: null,
      isDeleted: false
    }).sort({ type: -1, name: 1 }).toArray(); // 폴더 먼저, 이름순

    res.json({
      success: true,
      data: {
        currentFolder: null,
        items,
        breadcrumbs: [{ _id: null, name: '내 보관함' }]
      }
    });

  } catch (error) {
    console.error('폴더 조회 오류:', error);
    backendLogger.error('PersonalFiles', '폴더 조회 오류', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다',
      error: error.message
    });
  } finally {
    await client.close();
  }
});

/**
 * 1-2. 특정 폴더 내용 조회
 * GET /api/personal-files/folders/:folderId
 */
router.get('/folders/:folderId', authenticateToken, async (req, res) => {
  const client = new MongoClient(mongoUrl);

  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection('personal_files');

    const { folderId } = req.params;
    const userId = req.user.userId;

    // 현재 폴더 정보
    const currentFolder = await collection.findOne({
      _id: new ObjectId(folderId),
      userId,
      isDeleted: false
    });

    if (!currentFolder) {
      return res.status(404).json({
        success: false,
        message: '폴더를 찾을 수 없습니다'
      });
    }

    // 하위 항목 조회 (폴더와 파일)
    const items = await collection.find({
      userId,
      parentId: new ObjectId(folderId),
      isDeleted: false
    }).sort({ type: -1, name: 1 }).toArray(); // 폴더 먼저, 이름순

    // Breadcrumb 경로 생성
    const breadcrumbs = [];
    let current = currentFolder;

    while (current) {
      breadcrumbs.unshift({
        _id: current._id.toString(),
        name: current.name
      });

      if (current.parentId) {
        current = await collection.findOne({ _id: current.parentId });
      } else {
        break;
      }
    }

    // 루트 추가
    breadcrumbs.unshift({ _id: null, name: '내 보관함' });

    res.json({
      success: true,
      data: {
        currentFolder,
        items,
        breadcrumbs
      }
    });

  } catch (error) {
    console.error('폴더 조회 오류:', error);
    backendLogger.error('PersonalFiles', '특정 폴더 조회 오류', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다',
      error: error.message
    });
  } finally {
    await client.close();
  }
});

/**
 * 2. 폴더 생성
 * POST /api/personal-files/folders
 * Body: { name: string, parentId?: string }
 */
router.post('/folders', authenticateToken, async (req, res) => {
  const client = new MongoClient(mongoUrl);

  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection('personal_files');

    const { name, parentId } = req.body;
    const userId = req.user.userId;

    if (!name || name.trim() === '') {
      return res.status(400).json({
        success: false,
        message: '폴더 이름을 입력해주세요'
      });
    }

    // 같은 위치에 같은 이름의 폴더 존재 확인
    const existing = await collection.findOne({
      userId,
      name: name.trim(),
      parentId: parentId ? new ObjectId(parentId) : null,
      type: 'folder',
      isDeleted: false
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: '같은 이름의 폴더가 이미 존재합니다'
      });
    }

    // 폴더 생성
    const newFolder = {
      userId,
      name: name.trim(),
      type: 'folder',
      parentId: parentId ? new ObjectId(parentId) : null,
      createdAt: new Date(),
      updatedAt: new Date(),
      isDeleted: false
    };

    const result = await collection.insertOne(newFolder);

    // SSE 알림: 폴더 생성
    try {
      await axios.post('http://localhost:3010/api/webhooks/personal-files-change', {
        userId,
        changeType: 'created',
        itemId: result.insertedId.toString(),
        itemName: newFolder.name,
        itemType: 'folder'
      });
    } catch (sseErr) {
      console.warn('[SSE] 폴더 생성 알림 실패:', sseErr.message);
    }

    res.json({
      success: true,
      data: {
        _id: result.insertedId,
        ...newFolder
      }
    });

  } catch (error) {
    console.error('폴더 생성 오류:', error);
    backendLogger.error('PersonalFiles', '폴더 생성 오류', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다',
      error: error.message
    });
  } finally {
    await client.close();
  }
});

/**
 * 3. 파일 업로드
 * POST /api/personal-files/upload
 * FormData: { file: File, parentId?: string }
 */
router.post('/upload', authenticateToken, upload.single('file'), async (req, res) => {
  const client = new MongoClient(mongoUrl);

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: '파일이 없습니다'
      });
    }

    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection('personal_files');

    const { parentId } = req.body;
    const userId = req.user.userId;

    // 쿼터 체크 (하드 리밋)
    const quotaCheck = await checkUploadAllowed(db, userId, req.file.size);
    if (!quotaCheck.allowed) {
      // 업로드된 임시 파일 삭제
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkErr) {
        console.error('임시 파일 삭제 실패:', unlinkErr);
      }
      return res.status(413).json({
        success: false,
        message: quotaCheck.message,
        error: 'QUOTA_EXCEEDED',
        quota: quotaCheck.quota,
        current_usage: quotaCheck.current_usage,
        required: quotaCheck.required
      });
    }

    // 파일명 UTF-8 인코딩 변환 (한글 깨짐 방지)
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

    // 파일 정보 DB 저장
    const newFile = {
      userId,
      name: originalName,
      type: 'file',
      mimeType: req.file.mimetype,
      size: req.file.size,
      storagePath: req.file.path,
      parentId: parentId ? new ObjectId(parentId) : null,
      createdAt: new Date(),
      updatedAt: new Date(),
      isDeleted: false
    };

    const result = await collection.insertOne(newFile);

    // SSE 알림: 파일 업로드
    try {
      await axios.post('http://localhost:3010/api/webhooks/personal-files-change', {
        userId,
        changeType: 'created',
        itemId: result.insertedId.toString(),
        itemName: newFile.name,
        itemType: 'file'
      });
    } catch (sseErr) {
      console.warn('[SSE] 파일 업로드 알림 실패:', sseErr.message);
    }

    res.json({
      success: true,
      data: {
        _id: result.insertedId,
        ...newFile
      }
    });

  } catch (error) {
    console.error('파일 업로드 오류:', error);
    backendLogger.error('PersonalFiles', '파일 업로드 오류', error);

    // 업로드 실패시 파일 삭제
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error('임시 파일 삭제 실패:', unlinkError);
      }
    }

    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다',
      error: error.message
    });
  } finally {
    await client.close();
  }
});

/**
 * 4. 항목 이름 변경
 * PUT /api/personal-files/:itemId/rename
 * Body: { newName: string }
 */
router.put('/:itemId/rename', authenticateToken, async (req, res) => {
  const client = new MongoClient(mongoUrl);

  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection('personal_files');

    const { itemId } = req.params;
    const { newName } = req.body;
    const userId = req.user.userId;

    if (!newName || newName.trim() === '') {
      return res.status(400).json({
        success: false,
        message: '새 이름을 입력해주세요'
      });
    }

    // 항목 존재 확인
    const item = await collection.findOne({
      _id: new ObjectId(itemId),
      userId,
      isDeleted: false
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: '항목을 찾을 수 없습니다'
      });
    }

    // 같은 위치에 같은 이름 존재 확인
    const existing = await collection.findOne({
      userId,
      name: newName.trim(),
      parentId: item.parentId,
      type: item.type,
      isDeleted: false,
      _id: { $ne: new ObjectId(itemId) }
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: '같은 이름이 이미 존재합니다'
      });
    }

    // 이름 변경
    await collection.updateOne(
      { _id: new ObjectId(itemId) },
      {
        $set: {
          name: newName.trim(),
          updatedAt: new Date()
        }
      }
    );

    // SSE 알림: 이름 변경
    try {
      await axios.post('http://localhost:3010/api/webhooks/personal-files-change', {
        userId,
        changeType: 'renamed',
        itemId: itemId,
        itemName: newName.trim(),
        itemType: item.type
      });
    } catch (sseErr) {
      console.warn('[SSE] 이름 변경 알림 실패:', sseErr.message);
    }

    res.json({
      success: true,
      message: '이름이 변경되었습니다'
    });

  } catch (error) {
    console.error('이름 변경 오류:', error);
    backendLogger.error('PersonalFiles', '이름 변경 오류', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다',
      error: error.message
    });
  } finally {
    await client.close();
  }
});

/**
 * 5. 항목 삭제 (소프트 삭제)
 * DELETE /api/personal-files/:itemId
 */
router.delete('/:itemId', authenticateToken, async (req, res) => {
  const client = new MongoClient(mongoUrl);

  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection('personal_files');

    const { itemId } = req.params;
    const userId = req.user.userId;

    // 항목 존재 확인
    const item = await collection.findOne({
      _id: new ObjectId(itemId),
      userId,
      isDeleted: false
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: '항목을 찾을 수 없습니다'
      });
    }

    // 소프트 삭제
    await collection.updateOne(
      { _id: new ObjectId(itemId) },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
          updatedAt: new Date()
        }
      }
    );

    // 폴더인 경우 하위 항목과 연결된 문서들도 모두 삭제
    if (item.type === 'folder') {
      // 문서 라이브러리에서 연결된 문서 삭제
      try {
        const documentIds = await collectDocumentIdsFromFolder(db, userId, new ObjectId(itemId));
        
        if (documentIds.length > 0) {
          console.log(`🗑️ 폴더 삭제: ${documentIds.length}개의 연결된 문서 삭제 시작`);
          
          // 각 문서에 대해 DELETE /api/documents/:id 호출
          for (const docId of documentIds) {
            try {
              await axios.delete(`http://localhost:3010/api/documents/${docId}`);
              console.log(`✅ 문서 삭제 완료: ${docId}`);
            } catch (docError) {
              console.warn(`⚠️ 문서 삭제 실패: ${docId}`, docError.message);
              // 개별 문서 삭제 실패해도 폴더 삭제는 계속 진행
            }
          }
        }
      } catch (error) {
        console.warn('⚠️ 문서 라이브러리 삭제 중 오류:', error.message);
        // 문서 삭제 실패해도 폴더 소프트 삭제는 진행
      }
      
      // 하위 폴더들도 재귀적으로 소프트 삭제
      await deleteChildrenRecursively(collection, userId, new ObjectId(itemId));
    }

    // SSE 알림: 항목 삭제
    try {
      await axios.post('http://localhost:3010/api/webhooks/personal-files-change', {
        userId,
        changeType: 'deleted',
        itemId: itemId,
        itemName: item.name,
        itemType: item.type
      });
    } catch (sseErr) {
      console.warn('[SSE] 항목 삭제 알림 실패:', sseErr.message);
    }

    res.json({
      success: true,
      message: '삭제되었습니다'
    });

  } catch (error) {
    console.error('삭제 오류:', error);
    backendLogger.error('PersonalFiles', '삭제 오류', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다',
      error: error.message
    });
  } finally {
    await client.close();
  }
});

/**
 * 하위 항목 재귀적으로 삭제
 */
async function deleteChildrenRecursively(collection, userId, parentId) {
  const children = await collection.find({
    userId,
    parentId,
    isDeleted: false
  }).toArray();

  for (const child of children) {
    await collection.updateOne(
      { _id: child._id },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
          updatedAt: new Date()
        }
      }
    );

    if (child.type === 'folder') {
      await deleteChildrenRecursively(collection, userId, child._id);
    }
  }
}

/**
 * 모든 부모 폴더 ID 조회 (순환 참조 방지용)
 */
async function getAllParentIds(collection, folderId) {
  const parentIds = [];
  let currentId = folderId;

  while (currentId) {
    const folder = await collection.findOne({ _id: currentId });
    if (!folder || !folder.parentId) break;

    parentIds.push(folder.parentId.toString());
    currentId = folder.parentId;
  }

  return parentIds;
}

/**
 * 폴더와 모든 하위 폴더에 연결된 문서 ID 수집
 */
async function collectDocumentIdsFromFolder(db, userId, folderId) {
  const personalFilesCollection = db.collection('personal_files');
  const filesCollection = db.collection('files');
  
  // 폴더 ID 수집 (재귀적으로 모든 하위 폴더 포함)
  const folderIds = [folderId];
  
  async function collectFolderIds(parentId) {
    const subFolders = await personalFilesCollection.find({
      userId,
      parentId,
      type: 'folder',
      isDeleted: false
    }).toArray();
    
    for (const folder of subFolders) {
      folderIds.push(folder._id);
      await collectFolderIds(folder._id);
    }
  }
  
  await collectFolderIds(folderId);
  
  // 모든 폴더 ID에 연결된 문서 찾기
  const documents = await filesCollection.find({
    customerId: userId,
    folderId: { $in: folderIds }
  }).toArray();
  
  return documents.map(doc => doc._id.toString());
}

/**
 * 6. 항목 이동
 * PUT /api/personal-files/:itemId/move
 * Body: { targetFolderId: string | null }
 */
router.put('/:itemId/move', authenticateToken, async (req, res) => {
  const client = new MongoClient(mongoUrl);

  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection('personal_files');

    const { itemId } = req.params;
    const { targetFolderId } = req.body;
    const userId = req.user.userId;

    // 이동할 항목 조회
    const item = await collection.findOne({
      _id: new ObjectId(itemId),
      userId,
      isDeleted: false
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: '항목을 찾을 수 없습니다'
      });
    }

    // 대상 폴더 유효성 검사
    const targetParentId = targetFolderId ? new ObjectId(targetFolderId) : null;

    if (targetFolderId) {
      const targetFolder = await collection.findOne({
        _id: targetParentId,
        userId,
        type: 'folder',
        isDeleted: false
      });

      if (!targetFolder) {
        return res.status(404).json({
          success: false,
          message: '대상 폴더를 찾을 수 없습니다'
        });
      }

      // 순환 참조 방지: 폴더를 자기 자신의 하위 폴더로 이동 불가
      if (item.type === 'folder') {
        const parentIds = await getAllParentIds(collection, targetParentId);
        if (parentIds.includes(itemId)) {
          return res.status(400).json({
            success: false,
            message: '폴더를 자기 자신의 하위 폴더로 이동할 수 없습니다'
          });
        }
      }
    }

    // 대상 위치에 같은 이름 존재 확인
    const existing = await collection.findOne({
      userId,
      name: item.name,
      parentId: targetParentId,
      type: item.type,
      isDeleted: false,
      _id: { $ne: new ObjectId(itemId) }
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: '대상 폴더에 같은 이름이 이미 존재합니다'
      });
    }

    // 항목 이동 (parentId 변경)
    await collection.updateOne(
      { _id: new ObjectId(itemId) },
      {
        $set: {
          parentId: targetParentId,
          updatedAt: new Date()
        }
      }
    );

    // SSE 알림: 항목 이동
    try {
      await axios.post('http://localhost:3010/api/webhooks/personal-files-change', {
        userId,
        changeType: 'moved',
        itemId: itemId,
        itemName: item.name,
        itemType: item.type
      });
    } catch (sseErr) {
      console.warn('[SSE] 항목 이동 알림 실패:', sseErr.message);
    }

    res.json({
      success: true,
      message: '이동되었습니다'
    });

  } catch (error) {
    console.error('항목 이동 오류:', error);
    backendLogger.error('PersonalFiles', '항목 이동 오류', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다',
      error: error.message
    });
  } finally {
    await client.close();
  }
});

/**
 * 7. 파일 다운로드
 * GET /api/personal-files/:fileId/download
 */
router.get('/:fileId/download', authenticateToken, async (req, res) => {
  const client = new MongoClient(mongoUrl);

  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection('personal_files');

    const { fileId } = req.params;
    const userId = req.user.userId;

    // 파일 정보 조회
    const file = await collection.findOne({
      _id: new ObjectId(fileId),
      userId,
      type: 'file',
      isDeleted: false
    });

    if (!file) {
      return res.status(404).json({
        success: false,
        message: '파일을 찾을 수 없습니다'
      });
    }

    // 파일 전송
    res.download(file.storagePath, file.name);

  } catch (error) {
    console.error('파일 다운로드 오류:', error);
    backendLogger.error('PersonalFiles', '파일 다운로드 오류', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다',
      error: error.message
    });
  } finally {
    await client.close();
  }
});

/**
 * 9. 파일/폴더 검색
 * GET /api/personal-files/search?q=검색어&type=file&dateFrom=2025-01-01&dateTo=2025-01-31&sortBy=name&sortDirection=asc
 */
router.get('/search', authenticateToken, async (req, res) => {
  const client = new MongoClient(mongoUrl);

  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection('personal_files');

    const userId = req.user.userId;
    const {
      q,           // 검색어
      type,        // 'file' | 'folder'
      dateFrom,    // 시작 날짜 (YYYY-MM-DD)
      dateTo,      // 종료 날짜 (YYYY-MM-DD)
      sortBy = 'name',      // 'name' | 'createdAt' | 'size'
      sortDirection = 'asc' // 'asc' | 'desc'
    } = req.query;

    // 기본 쿼리 (사용자 ID, 삭제되지 않은 항목)
    const query = {
      userId,
      isDeleted: false
    };

    // 검색어가 있으면 이름 검색 (대소문자 무시)
    if (q) {
      query.name = { $regex: q, $options: 'i' };
    }

    // 파일 타입 필터
    if (type) {
      query.type = type;
    }

    // 날짜 범위 필터
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) {
        query.createdAt.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        query.createdAt.$lte = new Date(dateTo);
      }
    }

    // 정렬 옵션 생성
    const sortOptions = {};
    if (sortBy === 'name') {
      sortOptions.name = sortDirection === 'desc' ? -1 : 1;
    } else if (sortBy === 'createdAt') {
      sortOptions.createdAt = sortDirection === 'desc' ? -1 : 1;
    } else if (sortBy === 'size') {
      sortOptions.size = sortDirection === 'desc' ? -1 : 1;
    }

    // 검색 실행
    const results = await collection.find(query).sort(sortOptions).toArray();

    res.json({
      success: true,
      data: {
        items: results,
        count: results.length
      }
    });

  } catch (error) {
    console.error('검색 오류:', error);
    backendLogger.error('PersonalFiles', '검색 오류', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다',
      error: error.message
    });
  } finally {
    await client.close();
  }
});

/**
 * 10. 문서 라이브러리 파일을 폴더로 이동
 * PUT /api/personal-files/documents/:documentId/move
 * Body: { targetFolderId: string | null }
 *
 * docupload.files 컬렉션의 문서에 folderId를 설정하여
 * 폴더 구조에 논리적으로 연결합니다.
 */
router.put('/documents/:documentId/move', authenticateToken, async (req, res) => {
  const client = new MongoClient(mongoUrl);

  try {
    await client.connect();
    const db = client.db(dbName);
    const filesCollection = db.collection('files');
    const foldersCollection = db.collection('personal_files');

    const { documentId } = req.params;
    const { targetFolderId } = req.body;
    const userId = req.user.userId;

    // 문서 존재 확인 (customerId를 문자열로 변환하여 userId와 비교)
    const document = await filesCollection.findOne({
      _id: new ObjectId(documentId),
      $expr: { $eq: [{ $toString: '$customerId' }, userId] }
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: '문서를 찾을 수 없거나 권한이 없습니다'
      });
    }

    // 대상 폴더 유효성 검사
    const targetParentId = targetFolderId ? new ObjectId(targetFolderId) : null;

    if (targetFolderId) {
      const targetFolder = await foldersCollection.findOne({
        _id: targetParentId,
        userId,
        type: 'folder',
        isDeleted: false
      });

      if (!targetFolder) {
        return res.status(404).json({
          success: false,
          message: '대상 폴더를 찾을 수 없습니다'
        });
      }
    }

    // 문서에 folderId 설정
    await filesCollection.updateOne(
      { _id: new ObjectId(documentId) },
      {
        $set: {
          folderId: targetParentId
        }
      }
    );

    // SSE 알림: 문서 이동
    try {
      await axios.post('http://localhost:3010/api/webhooks/personal-files-change', {
        userId,
        changeType: 'moved',
        itemId: documentId,
        itemName: document.filename || 'document',
        itemType: 'document'
      });
    } catch (sseErr) {
      console.warn('[SSE] 문서 이동 알림 실패:', sseErr.message);
    }

    res.json({
      success: true,
      message: '문서가 이동되었습니다'
    });

  } catch (error) {
    console.error('문서 이동 오류:', error);
    backendLogger.error('PersonalFiles', '문서 이동 오류', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다',
      error: error.message
    });
  } finally {
    await client.close();
  }
});

/**
 * PUT /api/personal-files/documents/:documentId/rename
 * 문서(files 컬렉션) 이름 변경
 *
 * @param {string} documentId - 문서 ID
 * @body {string} newName - 새 파일명 (확장자 포함)
 * @returns {Object} 성공/실패 응답
 */
router.put('/documents/:documentId/rename', authenticateToken, async (req, res) => {
  const client = new MongoClient(mongoUrl);

  try {
    await client.connect();
    const db = client.db(dbName);
    const filesCollection = db.collection('files');

    const { documentId } = req.params;
    const { newName } = req.body;
    const userId = req.user.userId;

    if (!newName || typeof newName !== 'string' || newName.trim() === '') {
      return res.status(400).json({
        success: false,
        message: '새 파일명을 입력해주세요'
      });
    }

    // 문서 존재 확인 (customerId를 문자열로 변환하여 userId와 비교)
    const document = await filesCollection.findOne({
      _id: new ObjectId(documentId),
      $expr: { $eq: [{ $toString: '$customerId' }, userId] }
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: '문서를 찾을 수 없거나 권한이 없습니다'
      });
    }

    // 문서 이름 업데이트 (filename과 upload.originalName 모두 업데이트)
    await filesCollection.updateOne(
      { _id: new ObjectId(documentId) },
      {
        $set: {
          filename: newName.trim(),
          'upload.originalName': newName.trim()
        }
      }
    );

    // SSE 알림: 문서 이름 변경
    try {
      await axios.post('http://localhost:3010/api/webhooks/personal-files-change', {
        userId,
        changeType: 'renamed',
        itemId: documentId,
        itemName: newName.trim(),
        itemType: 'document'
      });
    } catch (sseErr) {
      console.warn('[SSE] 문서 이름 변경 알림 실패:', sseErr.message);
    }

    res.json({
      success: true,
      message: '문서 이름이 변경되었습니다'
    });

  } catch (error) {
    console.error('문서 이름 변경 오류:', error);
    backendLogger.error('PersonalFiles', '문서 이름 변경 오류', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다',
      error: error.message
    });
  } finally {
    await client.close();
  }
});

module.exports = router;

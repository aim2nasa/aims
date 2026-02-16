/**
 * 도움말 콘텐츠 API Routes
 * @since 2025-12-18
 *
 * 공지사항, 사용 가이드, FAQ 관리
 * - aims-uix3: 사용자용 조회 API
 * - aims-admin: 관리자용 CRUD API
 */

const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const backendLogger = require('../lib/backendLogger');

// 카테고리 상수 (기본값, DB에서 동적으로 조회 가능)
const NOTICE_CATEGORIES = ['system', 'product', 'policy', 'event'];
const GUIDE_CATEGORIES = ['customer', 'document', 'contract'];

// FAQ 카테고리 라벨 매핑
const FAQ_CATEGORY_LABELS = {
  general: '일반',
  'doc-register': '고객·계약·문서 등록',
  'customer-register': '고객 등록',
  'batch-upload': '일괄 등록',
  'customer-view': '고객 조회',
  'document-view': '문서 조회',
  terminology: '용어 설명',
  autoclicker: 'AutoClicker',
  ar: 'Annual Report',
  crs: '변액리포트',
  mobile: '모바일',
  'ai-assistant': 'AI 어시스턴트',
};

// 사용 가이드 카테고리 라벨 매핑
const USAGE_GUIDE_CATEGORY_LABELS = {
  'getting-started': '시작하기',
  'doc-register': '고객·계약·문서 등록',
  'customer-register': '고객 수동등록',
  'excel-import': '고객 일괄등록',
  'batch-document': '문서 일괄등록',
  'customers-all': '전체고객보기',
  'documents-all': '전체문서보기',
  'doc-explorer': '문서 탐색기',
  terminology: '용어 설명',
  autoclicker: 'AutoClicker',
  ar: 'Annual Report (AR)',
  crs: '변액리포트 (CRS)',
  'family-contract': '가족·법인계약',
  'ai-assistant': 'AI 어시스턴트',
  mobile: '모바일 사용법',
};

// 사용 가이드 카테고리 정렬 순서
const USAGE_GUIDE_CATEGORY_ORDER = [
  'getting-started', 'doc-register', 'customer-register', 'excel-import',
  'batch-document', 'customers-all', 'documents-all', 'doc-explorer', 'terminology',
  'autoclicker', 'ar', 'crs', 'family-contract', 'ai-assistant', 'mobile'
];

module.exports = (db, authenticateJWT, requireRole) => {
  const noticesCollection = db.collection('notices');
  const usageGuidesCollection = db.collection('usage_guides');
  const faqsCollection = db.collection('faqs');

  // ========================================
  // 공지사항 API - 사용자용
  // ========================================

  /**
   * 공지사항 목록 조회 (게시된 것만)
   * GET /api/notices
   */
  router.get('/notices', async (req, res) => {
    try {
      const { category, page = 1, limit = 20 } = req.query;

      const query = { isPublished: true };
      if (category && NOTICE_CATEGORIES.includes(category)) {
        query.category = category;
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [notices, total] = await Promise.all([
        noticesCollection
          .find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .toArray(),
        noticesCollection.countDocuments(query)
      ]);

      res.json({
        success: true,
        data: {
          notices,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            totalPages: Math.ceil(total / parseInt(limit))
          }
        }
      });
    } catch (error) {
      console.error('공지사항 목록 조회 오류:', error);
      backendLogger.error('HelpContent', '공지사항 목록 조회 오류', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다' });
    }
  });

  /**
   * 공지사항 상세 조회
   * GET /api/notices/:id
   */
  router.get('/notices/:id', async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: '유효하지 않은 공지사항 ID입니다' });
      }

      const notice = await noticesCollection.findOne({
        _id: new ObjectId(id),
        isPublished: true
      });

      if (!notice) {
        return res.status(404).json({ success: false, message: '공지사항을 찾을 수 없습니다' });
      }

      res.json({ success: true, data: notice });
    } catch (error) {
      console.error('공지사항 상세 조회 오류:', error);
      backendLogger.error('HelpContent', '공지사항 상세 조회 오류', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다' });
    }
  });

  // ========================================
  // 공지사항 API - 관리자용
  // ========================================

  /**
   * 공지사항 전체 목록 조회 (관리자)
   * GET /api/admin/notices
   */
  router.get('/admin/notices', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { category, isPublished, search, page = 1, limit = 20 } = req.query;

      const query = {};
      if (category && NOTICE_CATEGORIES.includes(category)) {
        query.category = category;
      }
      if (isPublished !== undefined) {
        query.isPublished = isPublished === 'true';
      }
      if (search) {
        query.$or = [
          { title: { $regex: search, $options: 'i' } },
          { content: { $regex: search, $options: 'i' } }
        ];
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [notices, total] = await Promise.all([
        noticesCollection
          .find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .toArray(),
        noticesCollection.countDocuments(query)
      ]);

      res.json({
        success: true,
        data: {
          notices,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            totalPages: Math.ceil(total / parseInt(limit))
          }
        }
      });
    } catch (error) {
      console.error('관리자 공지사항 목록 조회 오류:', error);
      backendLogger.error('HelpContent', '관리자 공지사항 목록 조회 오류', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다' });
    }
  });

  /**
   * 공지사항 생성 (관리자)
   * POST /api/admin/notices
   */
  router.post('/admin/notices', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { title, content, category, isNew = false, isPublished = true } = req.body;
      const adminId = req.user.id;

      if (!title || !title.trim()) {
        return res.status(400).json({ success: false, message: '제목을 입력해주세요' });
      }
      if (!content || !content.trim()) {
        return res.status(400).json({ success: false, message: '내용을 입력해주세요' });
      }
      if (!category || !NOTICE_CATEGORIES.includes(category)) {
        return res.status(400).json({ success: false, message: '유효한 카테고리를 선택해주세요' });
      }

      const now = new Date();
      const newNotice = {
        title: title.trim(),
        content: content.trim(),
        category,
        isNew,
        isPublished,
        createdAt: now,
        updatedAt: now,
        createdBy: adminId
      };

      const result = await noticesCollection.insertOne(newNotice);

      res.status(201).json({
        success: true,
        data: { _id: result.insertedId, ...newNotice }
      });
    } catch (error) {
      console.error('공지사항 생성 오류:', error);
      backendLogger.error('HelpContent', '공지사항 생성 오류', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다' });
    }
  });

  /**
   * 공지사항 수정 (관리자)
   * PUT /api/admin/notices/:id
   */
  router.put('/admin/notices/:id', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;
      const { title, content, category, isNew, isPublished } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: '유효하지 않은 공지사항 ID입니다' });
      }

      const updateFields = { updatedAt: new Date() };
      if (title !== undefined) updateFields.title = title.trim();
      if (content !== undefined) updateFields.content = content.trim();
      if (category !== undefined && NOTICE_CATEGORIES.includes(category)) {
        updateFields.category = category;
      }
      if (isNew !== undefined) updateFields.isNew = isNew;
      if (isPublished !== undefined) updateFields.isPublished = isPublished;

      const result = await noticesCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updateFields }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({ success: false, message: '공지사항을 찾을 수 없습니다' });
      }

      const updated = await noticesCollection.findOne({ _id: new ObjectId(id) });
      res.json({ success: true, data: updated });
    } catch (error) {
      console.error('공지사항 수정 오류:', error);
      backendLogger.error('HelpContent', '공지사항 수정 오류', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다' });
    }
  });

  /**
   * 공지사항 삭제 (관리자)
   * DELETE /api/admin/notices/:id
   */
  router.delete('/admin/notices/:id', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: '유효하지 않은 공지사항 ID입니다' });
      }

      const result = await noticesCollection.deleteOne({ _id: new ObjectId(id) });

      if (result.deletedCount === 0) {
        return res.status(404).json({ success: false, message: '공지사항을 찾을 수 없습니다' });
      }

      res.json({ success: true, message: '공지사항이 삭제되었습니다' });
    } catch (error) {
      console.error('공지사항 삭제 오류:', error);
      backendLogger.error('HelpContent', '공지사항 삭제 오류', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다' });
    }
  });

  // ========================================
  // 사용 가이드 API - 사용자용
  // ========================================

  /**
   * 사용 가이드 카테고리 목록 조회 (DB에서 동적으로)
   * GET /api/usage-guide-categories
   */
  router.get('/usage-guide-categories', async (req, res) => {
    try {
      // DB에서 사용 중인 카테고리 distinct 조회
      const categories = await usageGuidesCollection.distinct('categoryId', { isPublished: true });

      // 카테고리별 아이템 수 집계
      const guides = await usageGuidesCollection.find({ isPublished: true }).toArray();
      const countMap = guides.reduce((acc, guide) => {
        acc[guide.categoryId] = (guide.items || []).length;
        return acc;
      }, {});

      // 카테고리 정보 생성 (라벨 포함)
      const result = categories
        .filter(cat => cat) // null 제거
        .map(category => ({
          key: category,
          label: USAGE_GUIDE_CATEGORY_LABELS[category] || category,
          count: countMap[category] || 0
        }))
        .sort((a, b) => {
          const aIdx = USAGE_GUIDE_CATEGORY_ORDER.indexOf(a.key);
          const bIdx = USAGE_GUIDE_CATEGORY_ORDER.indexOf(b.key);
          return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
        });

      res.json({ success: true, data: result });
    } catch (error) {
      console.error('사용 가이드 카테고리 조회 오류:', error);
      backendLogger.error('HelpContent', '사용 가이드 카테고리 조회 오류', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다' });
    }
  });

  /**
   * 사용 가이드 조회 (게시된 것만, 검색 지원)
   * GET /api/usage-guides
   * @query search - 검색어 (제목, 설명, 단계에서 검색)
   * @query category - 카테고리 필터
   */
  router.get('/usage-guides', async (req, res) => {
    try {
      const { search, category } = req.query;

      const query = { isPublished: true };
      if (category) {
        query.categoryId = category;
      }

      let guides = await usageGuidesCollection
        .find(query)
        .sort({ order: 1 })
        .toArray();

      // 검색어가 있으면 필터링
      if (search && search.trim()) {
        const searchLower = search.toLowerCase().trim();
        guides = guides.map(guide => {
          // 아이템 필터링: 제목, 설명, 단계에서 검색
          const filteredItems = (guide.items || []).filter(item => {
            const titleMatch = item.title?.toLowerCase().includes(searchLower);
            const descMatch = item.description?.toLowerCase().includes(searchLower);
            const stepsMatch = (item.steps || []).some(step =>
              step.toLowerCase().includes(searchLower)
            );
            return titleMatch || descMatch || stepsMatch;
          });

          return {
            ...guide,
            items: filteredItems
          };
        }).filter(guide => guide.items.length > 0); // 매칭되는 아이템이 있는 카테고리만
      }

      // 각 카테고리 내 items도 order로 정렬
      const sortedGuides = guides.map(guide => ({
        ...guide,
        items: (guide.items || []).sort((a, b) => (a.order || 0) - (b.order || 0))
      }));

      res.json({ success: true, data: sortedGuides });
    } catch (error) {
      console.error('사용 가이드 조회 오류:', error);
      backendLogger.error('HelpContent', '사용 가이드 조회 오류', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다' });
    }
  });

  // ========================================
  // 사용 가이드 API - 관리자용
  // ========================================

  /**
   * 사용 가이드 카테고리 목록 조회 (관리자용 - 모든 가이드 포함)
   * GET /api/admin/usage-guide-categories
   */
  router.get('/admin/usage-guide-categories', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      // DB에서 모든 카테고리 distinct 조회 (비공개 포함)
      const categories = await usageGuidesCollection.distinct('categoryId');

      // 카테고리별 아이템 수 집계
      const guides = await usageGuidesCollection.find({}).toArray();
      const countMap = guides.reduce((acc, guide) => {
        acc[guide.categoryId] = (guide.items || []).length;
        return acc;
      }, {});

      // 카테고리 정보 생성
      const result = categories
        .filter(cat => cat)
        .map(category => ({
          key: category,
          label: USAGE_GUIDE_CATEGORY_LABELS[category] || category,
          count: countMap[category] || 0
        }))
        .sort((a, b) => {
          const aIdx = USAGE_GUIDE_CATEGORY_ORDER.indexOf(a.key);
          const bIdx = USAGE_GUIDE_CATEGORY_ORDER.indexOf(b.key);
          return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
        });

      res.json({ success: true, data: result });
    } catch (error) {
      console.error('관리자 사용 가이드 카테고리 조회 오류:', error);
      backendLogger.error('HelpContent', '관리자 사용 가이드 카테고리 조회 오류', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다' });
    }
  });

  /**
   * 사용 가이드 전체 조회 (관리자)
   * GET /api/admin/usage-guides
   */
  router.get('/admin/usage-guides', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const guides = await usageGuidesCollection
        .find({})
        .sort({ order: 1 })
        .toArray();

      res.json({ success: true, data: guides });
    } catch (error) {
      console.error('관리자 사용 가이드 조회 오류:', error);
      backendLogger.error('HelpContent', '관리자 사용 가이드 조회 오류', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다' });
    }
  });

  /**
   * 사용 가이드 카테고리 생성 (관리자)
   * POST /api/admin/usage-guides
   */
  router.post('/admin/usage-guides', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { categoryId, categoryTitle, categoryIcon, colorClass, order = 0, isPublished = true } = req.body;
      const adminId = req.user.id;

      if (!categoryId || !categoryTitle) {
        return res.status(400).json({ success: false, message: '카테고리 ID와 제목은 필수입니다' });
      }

      // 중복 체크
      const existing = await usageGuidesCollection.findOne({ categoryId });
      if (existing) {
        return res.status(400).json({ success: false, message: '이미 존재하는 카테고리 ID입니다' });
      }

      const now = new Date();
      const newGuide = {
        categoryId,
        categoryTitle,
        categoryIcon: categoryIcon || '',
        colorClass: colorClass || categoryId,
        order,
        items: [],
        isPublished,
        createdAt: now,
        updatedAt: now,
        createdBy: adminId
      };

      const result = await usageGuidesCollection.insertOne(newGuide);

      res.status(201).json({
        success: true,
        data: { _id: result.insertedId, ...newGuide }
      });
    } catch (error) {
      console.error('사용 가이드 카테고리 생성 오류:', error);
      backendLogger.error('HelpContent', '사용 가이드 카테고리 생성 오류', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다' });
    }
  });

  /**
   * 사용 가이드 카테고리 수정 (관리자)
   * PUT /api/admin/usage-guides/:id
   */
  router.put('/admin/usage-guides/:id', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;
      const { categoryTitle, categoryIcon, colorClass, order, items, isPublished } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: '유효하지 않은 가이드 ID입니다' });
      }

      const updateFields = { updatedAt: new Date() };
      if (categoryTitle !== undefined) updateFields.categoryTitle = categoryTitle;
      if (categoryIcon !== undefined) updateFields.categoryIcon = categoryIcon;
      if (colorClass !== undefined) updateFields.colorClass = colorClass;
      if (order !== undefined) updateFields.order = order;
      if (items !== undefined) updateFields.items = items;
      if (isPublished !== undefined) updateFields.isPublished = isPublished;

      const result = await usageGuidesCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updateFields }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({ success: false, message: '가이드를 찾을 수 없습니다' });
      }

      const updated = await usageGuidesCollection.findOne({ _id: new ObjectId(id) });
      res.json({ success: true, data: updated });
    } catch (error) {
      console.error('사용 가이드 수정 오류:', error);
      backendLogger.error('HelpContent', '사용 가이드 수정 오류', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다' });
    }
  });

  /**
   * 사용 가이드 카테고리 삭제 (관리자)
   * DELETE /api/admin/usage-guides/:id
   */
  router.delete('/admin/usage-guides/:id', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: '유효하지 않은 가이드 ID입니다' });
      }

      const result = await usageGuidesCollection.deleteOne({ _id: new ObjectId(id) });

      if (result.deletedCount === 0) {
        return res.status(404).json({ success: false, message: '가이드를 찾을 수 없습니다' });
      }

      res.json({ success: true, message: '가이드 카테고리가 삭제되었습니다' });
    } catch (error) {
      console.error('사용 가이드 삭제 오류:', error);
      backendLogger.error('HelpContent', '사용 가이드 삭제 오류', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다' });
    }
  });

  /**
   * 사용 가이드 항목 추가 (관리자)
   * POST /api/admin/usage-guides/:id/items
   */
  router.post('/admin/usage-guides/:id/items', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;
      const { itemId, title, description, steps, order = 0 } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: '유효하지 않은 가이드 ID입니다' });
      }

      if (!itemId || !title) {
        return res.status(400).json({ success: false, message: '항목 ID와 제목은 필수입니다' });
      }

      const guide = await usageGuidesCollection.findOne({ _id: new ObjectId(id) });
      if (!guide) {
        return res.status(404).json({ success: false, message: '가이드를 찾을 수 없습니다' });
      }

      // 중복 체크
      if (guide.items?.some(item => item.id === itemId)) {
        return res.status(400).json({ success: false, message: '이미 존재하는 항목 ID입니다' });
      }

      const newItem = {
        id: itemId,
        title,
        description: description || '',
        steps: steps || [],
        order
      };

      await usageGuidesCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $push: { items: newItem },
          $set: { updatedAt: new Date() }
        }
      );

      const updated = await usageGuidesCollection.findOne({ _id: new ObjectId(id) });
      res.status(201).json({ success: true, data: updated });
    } catch (error) {
      console.error('가이드 항목 추가 오류:', error);
      backendLogger.error('HelpContent', '가이드 항목 추가 오류', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다' });
    }
  });

  /**
   * 사용 가이드 항목 수정 (관리자)
   * PUT /api/admin/usage-guides/:id/items/:itemId
   */
  router.put('/admin/usage-guides/:id/items/:itemId', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { id, itemId } = req.params;
      const { title, description, steps, order } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: '유효하지 않은 가이드 ID입니다' });
      }

      const guide = await usageGuidesCollection.findOne({ _id: new ObjectId(id) });
      if (!guide) {
        return res.status(404).json({ success: false, message: '가이드를 찾을 수 없습니다' });
      }

      const itemIndex = guide.items?.findIndex(item => item.id === itemId);
      if (itemIndex === -1 || itemIndex === undefined) {
        return res.status(404).json({ success: false, message: '항목을 찾을 수 없습니다' });
      }

      // 항목 업데이트
      const updatedItems = [...guide.items];
      if (title !== undefined) updatedItems[itemIndex].title = title;
      if (description !== undefined) updatedItems[itemIndex].description = description;
      if (steps !== undefined) updatedItems[itemIndex].steps = steps;
      if (order !== undefined) updatedItems[itemIndex].order = order;

      await usageGuidesCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            items: updatedItems,
            updatedAt: new Date()
          }
        }
      );

      const updated = await usageGuidesCollection.findOne({ _id: new ObjectId(id) });
      res.json({ success: true, data: updated });
    } catch (error) {
      console.error('가이드 항목 수정 오류:', error);
      backendLogger.error('HelpContent', '가이드 항목 수정 오류', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다' });
    }
  });

  /**
   * 사용 가이드 항목 삭제 (관리자)
   * DELETE /api/admin/usage-guides/:id/items/:itemId
   */
  router.delete('/admin/usage-guides/:id/items/:itemId', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { id, itemId } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: '유효하지 않은 가이드 ID입니다' });
      }

      const result = await usageGuidesCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $pull: { items: { id: itemId } },
          $set: { updatedAt: new Date() }
        }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({ success: false, message: '가이드를 찾을 수 없습니다' });
      }

      res.json({ success: true, message: '항목이 삭제되었습니다' });
    } catch (error) {
      console.error('가이드 항목 삭제 오류:', error);
      backendLogger.error('HelpContent', '가이드 항목 삭제 오류', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다' });
    }
  });

  /**
   * 사용 가이드 카테고리 순서 일괄 업데이트 (관리자)
   * PUT /api/admin/usage-guides/reorder
   */
  router.put('/admin/usage-guides/reorder', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { orders } = req.body; // [{ id: string, order: number }, ...]

      if (!Array.isArray(orders)) {
        return res.status(400).json({ success: false, message: '순서 배열이 필요합니다' });
      }

      const bulkOps = orders.map(({ id, order }) => ({
        updateOne: {
          filter: { _id: new ObjectId(id) },
          update: { $set: { order, updatedAt: new Date() } }
        }
      }));

      await usageGuidesCollection.bulkWrite(bulkOps);

      res.json({ success: true, message: '순서가 업데이트되었습니다' });
    } catch (error) {
      console.error('사용 가이드 순서 업데이트 오류:', error);
      backendLogger.error('HelpContent', '사용 가이드 순서 업데이트 오류', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다' });
    }
  });

  // ========================================
  // FAQ API - 사용자용
  // ========================================

  /**
   * FAQ 카테고리 목록 조회 (DB에서 동적으로)
   * GET /api/faq-categories
   */
  router.get('/faq-categories', async (req, res) => {
    try {
      // DB에서 사용 중인 카테고리 distinct 조회
      const categories = await faqsCollection.distinct('category', { isPublished: true });

      // 카테고리별 FAQ 수 집계
      const counts = await faqsCollection.aggregate([
        { $match: { isPublished: true } },
        { $group: { _id: '$category', count: { $sum: 1 } } }
      ]).toArray();

      const countMap = counts.reduce((acc, c) => {
        acc[c._id] = c.count;
        return acc;
      }, {});

      // 카테고리 정보 생성 (라벨 포함)
      const result = categories
        .filter(cat => cat) // null 제거
        .map(category => ({
          key: category,
          label: FAQ_CATEGORY_LABELS[category] || category,
          count: countMap[category] || 0
        }))
        .sort((a, b) => {
          // 정렬 순서 (세분화된 카테고리 포함)
          const order = ['general', 'import-data', 'import-file', 'customer', 'document', 'contract', 'account', 'term-customer', 'term-doc', 'term-contract', 'term-system'];
          const aIdx = order.indexOf(a.key);
          const bIdx = order.indexOf(b.key);
          // 정렬 순서에 없는 카테고리는 맨 뒤로
          return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
        });

      res.json({ success: true, data: result });
    } catch (error) {
      console.error('FAQ 카테고리 조회 오류:', error);
      backendLogger.error('HelpContent', 'FAQ 카테고리 조회 오류', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다' });
    }
  });

  /**
   * FAQ 목록 조회 (게시된 것만)
   * GET /api/faqs
   */
  router.get('/faqs', async (req, res) => {
    try {
      const { category } = req.query;

      const query = { isPublished: true };
      if (category) {
        query.category = category; // DB에 있는 모든 카테고리 허용
      }

      const faqs = await faqsCollection
        .find(query)
        .sort({ order: 1 })
        .toArray();

      res.json({ success: true, data: faqs });
    } catch (error) {
      console.error('FAQ 목록 조회 오류:', error);
      backendLogger.error('HelpContent', 'FAQ 목록 조회 오류', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다' });
    }
  });

  // ========================================
  // FAQ API - 관리자용
  // ========================================

  /**
   * FAQ 카테고리 목록 조회 (관리자용 - 모든 FAQ 포함)
   * GET /api/admin/faq-categories
   */
  router.get('/admin/faq-categories', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      // DB에서 모든 카테고리 distinct 조회 (비공개 포함)
      const categories = await faqsCollection.distinct('category');

      // 카테고리별 FAQ 수 집계
      const counts = await faqsCollection.aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } }
      ]).toArray();

      const countMap = counts.reduce((acc, c) => {
        acc[c._id] = c.count;
        return acc;
      }, {});

      // 카테고리 정보 생성
      const result = categories
        .filter(cat => cat)
        .map(category => ({
          key: category,
          label: FAQ_CATEGORY_LABELS[category] || category,
          count: countMap[category] || 0
        }))
        .sort((a, b) => {
          // 정렬 순서 (세분화된 카테고리 포함)
          const order = ['general', 'import-data', 'import-file', 'customer', 'document', 'contract', 'account', 'term-customer', 'term-doc', 'term-contract', 'term-system'];
          const aIdx = order.indexOf(a.key);
          const bIdx = order.indexOf(b.key);
          // 정렬 순서에 없는 카테고리는 맨 뒤로
          return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
        });

      res.json({ success: true, data: result });
    } catch (error) {
      console.error('관리자 FAQ 카테고리 조회 오류:', error);
      backendLogger.error('HelpContent', '관리자 FAQ 카테고리 조회 오류', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다' });
    }
  });

  /**
   * FAQ 전체 목록 조회 (관리자)
   * GET /api/admin/faqs
   */
  router.get('/admin/faqs', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { category, isPublished, search } = req.query;

      const query = {};
      if (category) {
        query.category = category; // DB에 있는 모든 카테고리 허용
      }
      if (isPublished !== undefined) {
        query.isPublished = isPublished === 'true';
      }
      if (search) {
        query.$or = [
          { question: { $regex: search, $options: 'i' } },
          { answer: { $regex: search, $options: 'i' } }
        ];
      }

      const faqs = await faqsCollection
        .find(query)
        .sort({ order: 1 })
        .toArray();

      res.json({ success: true, data: faqs });
    } catch (error) {
      console.error('관리자 FAQ 목록 조회 오류:', error);
      backendLogger.error('HelpContent', '관리자 FAQ 목록 조회 오류', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다' });
    }
  });

  /**
   * FAQ 생성 (관리자)
   * POST /api/admin/faqs
   */
  router.post('/admin/faqs', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { question, answer, category, order = 0, isPublished = true } = req.body;
      const adminId = req.user.id;

      if (!question || !question.trim()) {
        return res.status(400).json({ success: false, message: '질문을 입력해주세요' });
      }
      if (!answer || !answer.trim()) {
        return res.status(400).json({ success: false, message: '답변을 입력해주세요' });
      }
      if (!category || !category.trim()) {
        return res.status(400).json({ success: false, message: '카테고리를 선택해주세요' });
      }

      const now = new Date();
      const newFaq = {
        question: question.trim(),
        answer: answer.trim(),
        category,
        order,
        isPublished,
        createdAt: now,
        updatedAt: now,
        createdBy: adminId
      };

      const result = await faqsCollection.insertOne(newFaq);

      res.status(201).json({
        success: true,
        data: { _id: result.insertedId, ...newFaq }
      });
    } catch (error) {
      console.error('FAQ 생성 오류:', error);
      backendLogger.error('HelpContent', 'FAQ 생성 오류', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다' });
    }
  });

  /**
   * FAQ 수정 (관리자)
   * PUT /api/admin/faqs/:id
   */
  router.put('/admin/faqs/:id', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;
      const { question, answer, category, order, isPublished } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: '유효하지 않은 FAQ ID입니다' });
      }

      const updateFields = { updatedAt: new Date() };
      if (question !== undefined) updateFields.question = question.trim();
      if (answer !== undefined) updateFields.answer = answer.trim();
      if (category !== undefined) {
        updateFields.category = category; // DB에 있는 모든 카테고리 허용
      }
      if (order !== undefined) updateFields.order = order;
      if (isPublished !== undefined) updateFields.isPublished = isPublished;

      const result = await faqsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updateFields }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({ success: false, message: 'FAQ를 찾을 수 없습니다' });
      }

      const updated = await faqsCollection.findOne({ _id: new ObjectId(id) });
      res.json({ success: true, data: updated });
    } catch (error) {
      console.error('FAQ 수정 오류:', error);
      backendLogger.error('HelpContent', 'FAQ 수정 오류', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다' });
    }
  });

  /**
   * FAQ 삭제 (관리자)
   * DELETE /api/admin/faqs/:id
   */
  router.delete('/admin/faqs/:id', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: '유효하지 않은 FAQ ID입니다' });
      }

      const result = await faqsCollection.deleteOne({ _id: new ObjectId(id) });

      if (result.deletedCount === 0) {
        return res.status(404).json({ success: false, message: 'FAQ를 찾을 수 없습니다' });
      }

      res.json({ success: true, message: 'FAQ가 삭제되었습니다' });
    } catch (error) {
      console.error('FAQ 삭제 오류:', error);
      backendLogger.error('HelpContent', 'FAQ 삭제 오류', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다' });
    }
  });

  /**
   * FAQ 순서 일괄 업데이트 (관리자)
   * PUT /api/admin/faqs/reorder
   */
  router.put('/admin/faqs/reorder', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { orders } = req.body; // [{ id: string, order: number }, ...]

      if (!Array.isArray(orders)) {
        return res.status(400).json({ success: false, message: '순서 배열이 필요합니다' });
      }

      const bulkOps = orders.map(({ id, order }) => ({
        updateOne: {
          filter: { _id: new ObjectId(id) },
          update: { $set: { order, updatedAt: new Date() } }
        }
      }));

      await faqsCollection.bulkWrite(bulkOps);

      res.json({ success: true, message: '순서가 업데이트되었습니다' });
    } catch (error) {
      console.error('FAQ 순서 업데이트 오류:', error);
      backendLogger.error('HelpContent', 'FAQ 순서 업데이트 오류', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다' });
    }
  });

  return router;
};

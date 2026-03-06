/**
 * Document Types Service Unit Tests
 * @since 2026-02-05
 *
 * 테스트 범위:
 * 1. updateDocumentType - 문서 유형 수동 변경
 * 2. autoClassifyDocument - 문서 유형 자동 분류
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  updateDocumentType,
  autoClassifyDocument,
} from '../documentTypesService';

// Mock api
vi.mock('@/shared/lib/api', () => ({
  api: {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
}));

import { api } from '@/shared/lib/api';

const mockApi = api as {
  get: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

describe('documentTypesService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =============================================================================
  // 1. updateDocumentType 테스트
  // =============================================================================

  describe('updateDocumentType', () => {
    it('문서 유형을 수동으로 변경해야 함', async () => {
      mockApi.patch.mockResolvedValue({
        success: true,
        data: {
          documentId: 'doc-123',
          type: 'contract',
          typeLabel: '계약서',
        },
      });

      const result = await updateDocumentType('doc-123', 'contract');

      expect(mockApi.patch).toHaveBeenCalledWith('/api/documents/doc-123/type', {
        type: 'contract',
      });
      expect(result.documentId).toBe('doc-123');
      expect(result.type).toBe('contract');
      expect(result.typeLabel).toBe('계약서');
    });

    it('unspecified로 변경할 수 있어야 함', async () => {
      mockApi.patch.mockResolvedValue({
        success: true,
        data: {
          documentId: 'doc-456',
          type: 'unspecified',
          typeLabel: '미지정',
        },
      });

      const result = await updateDocumentType('doc-456', 'unspecified');

      expect(result.type).toBe('unspecified');
    });
  });

  // =============================================================================
  // 2. autoClassifyDocument 테스트
  // =============================================================================

  describe('autoClassifyDocument', () => {
    it('자동 분류를 수행하고 적용해야 함 (autoApply=true)', async () => {
      mockApi.post.mockResolvedValue({
        success: true,
        data: {
          documentId: 'doc-123',
          currentType: 'unspecified',
          type: 'contract',
          suggestedType: 'contract',
          confidence: 0.85,
          matchedKeywords: ['계약', '당사자', '조항'],
          autoApplied: true,
          applied: true,
        },
      });

      const result = await autoClassifyDocument('doc-123');

      expect(mockApi.post).toHaveBeenCalledWith('/api/documents/doc-123/auto-classify', {
        autoApply: true,
      });
      expect(result.autoApplied).toBe(true);
      expect(result.confidence).toBe(0.85);
      expect(result.matchedKeywords).toContain('계약');
    });

    it('자동 분류만 수행하고 적용하지 않아야 함 (autoApply=false)', async () => {
      mockApi.post.mockResolvedValue({
        success: true,
        data: {
          documentId: 'doc-123',
          currentType: 'unspecified',
          type: null,
          suggestedType: 'proposal',
          confidence: 0.72,
          matchedKeywords: ['제안'],
          autoApplied: false,
          applied: false,
        },
      });

      const result = await autoClassifyDocument('doc-123', false);

      expect(mockApi.post).toHaveBeenCalledWith('/api/documents/doc-123/auto-classify', {
        autoApply: false,
      });
      expect(result.autoApplied).toBe(false);
      expect(result.applied).toBe(false);
    });

    it('매칭되는 유형이 없을 때 null을 반환해야 함', async () => {
      mockApi.post.mockResolvedValue({
        success: true,
        data: {
          documentId: 'doc-789',
          currentType: 'unspecified',
          type: null,
          suggestedType: null,
          confidence: 0,
          matchedKeywords: [],
          autoApplied: false,
          applied: false,
        },
      });

      const result = await autoClassifyDocument('doc-789');

      expect(result.suggestedType).toBeNull();
      expect(result.confidence).toBe(0);
      expect(result.matchedKeywords).toEqual([]);
    });
  });
});

/**
 * Document Types Service Unit Tests
 * @since 2026-02-05
 *
 * 테스트 범위:
 * 1. getDocumentTypes - 문서 유형 목록 조회
 * 2. toDropdownOptions - 드롭다운 옵션 변환
 * 3. updateDocumentType - 문서 유형 수동 변경
 * 4. autoClassifyDocument - 문서 유형 자동 분류
 * 5. getTypeLabel - 유형 value로 label 찾기
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getDocumentTypes,
  toDropdownOptions,
  updateDocumentType,
  autoClassifyDocument,
  getTypeLabel,
  type DocumentType,
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

  // 테스트용 문서 유형 데이터
  const mockDocumentTypes: DocumentType[] = [
    {
      _id: '1',
      value: 'unspecified',
      label: '미지정',
      description: '기본 유형',
      isSystem: true,
      order: 0,
    },
    {
      _id: '2',
      value: 'annual_report',
      label: '연간 보고서',
      description: 'AR 문서',
      isSystem: true,
      order: 1,
    },
    {
      _id: '3',
      value: 'contract',
      label: '계약서',
      description: '계약 문서',
      isSystem: false,
      order: 2,
    },
    {
      _id: '4',
      value: 'proposal',
      label: '제안서',
      description: '제안 문서',
      isSystem: false,
      order: 3,
    },
  ];

  // =============================================================================
  // 1. getDocumentTypes 테스트
  // =============================================================================

  describe('getDocumentTypes', () => {
    it('기본값으로 시스템 유형 포함하여 조회해야 함', async () => {
      mockApi.get.mockResolvedValue({
        success: true,
        data: mockDocumentTypes,
      });

      const result = await getDocumentTypes();

      expect(mockApi.get).toHaveBeenCalledWith('/api/document-types?includeSystem=true');
      expect(result).toEqual(mockDocumentTypes);
    });

    it('시스템 유형 제외하여 조회해야 함', async () => {
      mockApi.get.mockResolvedValue({
        success: true,
        data: mockDocumentTypes.filter((dt) => !dt.isSystem),
      });

      const result = await getDocumentTypes(false);

      expect(mockApi.get).toHaveBeenCalledWith('/api/document-types?includeSystem=false');
      expect(result).toHaveLength(2);
    });

    it('빈 결과를 처리해야 함', async () => {
      mockApi.get.mockResolvedValue({
        success: true,
        data: [],
      });

      const result = await getDocumentTypes();

      expect(result).toEqual([]);
    });
  });

  // =============================================================================
  // 2. toDropdownOptions 테스트
  // =============================================================================

  describe('toDropdownOptions', () => {
    it('annual_report를 제외해야 함', () => {
      const result = toDropdownOptions(mockDocumentTypes);

      const values = result.map((opt) => opt.value);
      expect(values).not.toContain('annual_report');
    });

    it('unspecified (시스템 유형)는 포함해야 함', () => {
      const result = toDropdownOptions(mockDocumentTypes);

      const values = result.map((opt) => opt.value);
      expect(values).toContain('unspecified');
    });

    it('order 순서로 정렬해야 함', () => {
      const result = toDropdownOptions(mockDocumentTypes);

      expect(result[0].value).toBe('unspecified'); // order: 0
      expect(result[1].value).toBe('contract'); // order: 2
      expect(result[2].value).toBe('proposal'); // order: 3
    });

    it('value와 label만 포함해야 함', () => {
      const result = toDropdownOptions(mockDocumentTypes);

      result.forEach((opt) => {
        expect(Object.keys(opt)).toEqual(['value', 'label']);
      });
    });

    it('빈 배열을 처리해야 함', () => {
      const result = toDropdownOptions([]);

      expect(result).toEqual([]);
    });

    it('모든 항목이 시스템 유형이어도 unspecified만 포함해야 함', () => {
      const systemOnlyTypes: DocumentType[] = [
        {
          _id: '1',
          value: 'unspecified',
          label: '미지정',
          isSystem: true,
          order: 0,
        },
        {
          _id: '2',
          value: 'annual_report',
          label: '연간 보고서',
          isSystem: true,
          order: 1,
        },
      ];

      const result = toDropdownOptions(systemOnlyTypes);

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe('unspecified');
    });
  });

  // =============================================================================
  // 3. updateDocumentType 테스트
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
  // 4. autoClassifyDocument 테스트
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

  // =============================================================================
  // 5. getTypeLabel 테스트
  // =============================================================================

  describe('getTypeLabel', () => {
    it('value로 label을 찾아야 함', () => {
      const result = getTypeLabel(mockDocumentTypes, 'contract');

      expect(result).toBe('계약서');
    });

    it('unspecified → 미지정', () => {
      const result = getTypeLabel(mockDocumentTypes, 'unspecified');

      expect(result).toBe('미지정');
    });

    it('null value → 미지정', () => {
      const result = getTypeLabel(mockDocumentTypes, null);

      expect(result).toBe('미지정');
    });

    it('undefined value → 미지정', () => {
      const result = getTypeLabel(mockDocumentTypes, undefined);

      expect(result).toBe('미지정');
    });

    it('빈 문자열 value → 미지정', () => {
      const result = getTypeLabel(mockDocumentTypes, '');

      expect(result).toBe('미지정');
    });

    it('존재하지 않는 value → value 그대로 반환', () => {
      const result = getTypeLabel(mockDocumentTypes, 'unknown_type');

      expect(result).toBe('unknown_type');
    });

    it('빈 문서 유형 배열에서 조회 → value 그대로 반환', () => {
      const result = getTypeLabel([], 'contract');

      expect(result).toBe('contract');
    });
  });
});

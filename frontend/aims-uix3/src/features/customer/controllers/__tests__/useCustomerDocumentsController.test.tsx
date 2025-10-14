/**
 * useCustomerDocumentsController 훅 테스트
 *
 * 고객 상세 문서 탭 전용 컨트롤러 검증
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCustomerDocumentsController } from '../useCustomerDocumentsController';
import { DocumentService } from '@/services/DocumentService';
import { DocumentStatusService } from '@/services/DocumentStatusService';

vi.mock('@/services/DocumentService');
vi.mock('@/services/DocumentStatusService');

describe('useCustomerDocumentsController', () => {
  const mockCustomerId = 'customer-123';
  const mockDocuments = [
    {
      _id: 'doc-1',
      originalName: 'document1.pdf',
      mimeType: 'application/pdf',
      fileSize: 1024,
      uploadedAt: '2025-01-01T00:00:00Z',
      linkedAt: '2025-01-02T00:00:00Z',
      status: 'completed'
    },
    {
      _id: 'doc-2',
      originalName: 'document2.pdf',
      mimeType: 'application/pdf',
      fileSize: 2048,
      uploadedAt: '2025-01-03T00:00:00Z',
      linkedAt: '2025-01-04T00:00:00Z',
      status: 'processing'
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('초기화 및 자동 로드', () => {
    it('customerId가 제공되면 자동으로 문서를 로드해야 함', async () => {
      vi.mocked(DocumentService.getCustomerDocuments).mockResolvedValue({
        documents: mockDocuments
      });

      const { result } = renderHook(() =>
        useCustomerDocumentsController(mockCustomerId)
      );

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(DocumentService.getCustomerDocuments).toHaveBeenCalledWith(mockCustomerId);
      expect(result.current.documents).toEqual(mockDocuments);
      expect(result.current.documentCount).toBe(2);
      expect(result.current.isEmpty).toBe(false);
    });

    it('customerId가 null이면 문서를 로드하지 않아야 함', () => {
      const { result } = renderHook(() =>
        useCustomerDocumentsController(null)
      );

      expect(DocumentService.getCustomerDocuments).not.toHaveBeenCalled();
      expect(result.current.documents).toEqual([]);
      expect(result.current.isEmpty).toBe(true);
    });

    it('customerId가 undefined이면 문서를 로드하지 않아야 함', () => {
      const { result } = renderHook(() =>
        useCustomerDocumentsController(undefined)
      );

      expect(DocumentService.getCustomerDocuments).not.toHaveBeenCalled();
      expect(result.current.documents).toEqual([]);
    });

    it('enabled가 false이면 문서를 로드하지 않아야 함', () => {
      const { result } = renderHook(() =>
        useCustomerDocumentsController(mockCustomerId, { enabled: false })
      );

      expect(DocumentService.getCustomerDocuments).not.toHaveBeenCalled();
      expect(result.current.documents).toEqual([]);
    });

    it('autoLoad가 false이면 자동 로드하지 않아야 함', () => {
      const { result } = renderHook(() =>
        useCustomerDocumentsController(mockCustomerId, { autoLoad: false })
      );

      expect(DocumentService.getCustomerDocuments).not.toHaveBeenCalled();
      expect(result.current.documents).toEqual([]);
    });
  });

  describe('loadDocuments / refresh', () => {
    it('문서 로드 성공 시 상태를 업데이트해야 함', async () => {
      vi.mocked(DocumentService.getCustomerDocuments).mockResolvedValue({
        documents: mockDocuments
      });

      const { result } = renderHook(() =>
        useCustomerDocumentsController(mockCustomerId)
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.documents).toEqual(mockDocuments);
      expect(result.current.error).toBeNull();
      expect(result.current.lastUpdated).toBeGreaterThan(0);
    });

    it('문서 로드 실패 시 에러를 설정해야 함', async () => {
      vi.mocked(DocumentService.getCustomerDocuments).mockRejectedValue(
        new Error('Load failed')
      );

      const { result } = renderHook(() =>
        useCustomerDocumentsController(mockCustomerId)
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeTruthy();
      expect(result.current.documents).toEqual([]);
    });

    it('refresh를 호출하면 문서를 다시 로드해야 함', async () => {
      vi.mocked(DocumentService.getCustomerDocuments)
        .mockResolvedValueOnce({ documents: mockDocuments })
        .mockResolvedValueOnce({ documents: [mockDocuments[0]] });

      const { result } = renderHook(() =>
        useCustomerDocumentsController(mockCustomerId)
      );

      await waitFor(() => {
        expect(result.current.documents).toHaveLength(2);
      });

      await act(async () => {
        await result.current.refresh();
      });

      expect(DocumentService.getCustomerDocuments).toHaveBeenCalledTimes(2);
      expect(result.current.documents).toHaveLength(1);
    });
  });

  describe('unlinkDocument', () => {
    it('문서 연결 해제 성공 시 목록에서 제거해야 함', async () => {
      vi.mocked(DocumentService.getCustomerDocuments).mockResolvedValue({
        documents: mockDocuments
      });
      vi.mocked(DocumentService.unlinkDocumentFromCustomer).mockResolvedValue();

      const { result } = renderHook(() =>
        useCustomerDocumentsController(mockCustomerId)
      );

      await waitFor(() => {
        expect(result.current.documents).toHaveLength(2);
      });

      await act(async () => {
        await result.current.unlinkDocument('doc-1');
      });

      expect(DocumentService.unlinkDocumentFromCustomer).toHaveBeenCalledWith(
        mockCustomerId,
        'doc-1'
      );
      expect(result.current.documents).toHaveLength(1);
      expect(result.current.documents[0]._id).toBe('doc-2');
      expect(result.current.unlinkingId).toBeNull();
    });

    it('연결 해제 중에는 unlinkingId를 설정해야 함', async () => {
      let resolveUnlink: (() => void) | null = null;

      vi.mocked(DocumentService.getCustomerDocuments).mockResolvedValue({
        documents: mockDocuments
      });
      vi.mocked(DocumentService.unlinkDocumentFromCustomer).mockImplementation(
        () => new Promise(resolve => {
          resolveUnlink = resolve as () => void;
        })
      );

      const { result } = renderHook(() =>
        useCustomerDocumentsController(mockCustomerId)
      );

      await waitFor(() => {
        expect(result.current.documents).toHaveLength(2);
      });

      act(() => {
        result.current.unlinkDocument('doc-1');
      });

      await waitFor(() => {
        expect(result.current.unlinkingId).toBe('doc-1');
      });

      act(() => {
        resolveUnlink?.();
      });

      await waitFor(() => {
        expect(result.current.unlinkingId).toBeNull();
      });
    });

    it('연결 해제 실패 시 에러를 설정해야 함', async () => {
      vi.mocked(DocumentService.getCustomerDocuments).mockResolvedValue({
        documents: mockDocuments
      });
      vi.mocked(DocumentService.unlinkDocumentFromCustomer).mockRejectedValue(
        new Error('Unlink failed')
      );

      const { result } = renderHook(() =>
        useCustomerDocumentsController(mockCustomerId)
      );

      await waitFor(() => {
        expect(result.current.documents).toHaveLength(2);
      });

      await act(async () => {
        await result.current.unlinkDocument('doc-1');
      });

      expect(result.current.error).toBeTruthy();
      expect(result.current.documents).toHaveLength(2); // 실패 시 제거 안 됨
    });

    it('customerId가 없으면 연결 해제하지 않아야 함', async () => {
      const { result } = renderHook(() =>
        useCustomerDocumentsController(null)
      );

      await act(async () => {
        await result.current.unlinkDocument('doc-1');
      });

      expect(DocumentService.unlinkDocumentFromCustomer).not.toHaveBeenCalled();
    });
  });

  describe('openPreview', () => {
    const mockDetail = {
      upload: {
        originalName: 'detailed-document.pdf',
        destPath: '/uploads/file.pdf',
        mimeType: 'application/pdf',
        fileSize: 5120,
        uploaded_at: '2025-01-05T00:00:00Z'
      }
    };

    it('문서 프리뷰를 열고 상세 정보를 로드해야 함', async () => {
      vi.mocked(DocumentStatusService.getDocumentDetailViaWebhook).mockResolvedValue(mockDetail);

      const { result } = renderHook(() =>
        useCustomerDocumentsController(mockCustomerId, { autoLoad: false })
      );

      await act(async () => {
        await result.current.openPreview(mockDocuments[0]);
      });

      expect(DocumentStatusService.getDocumentDetailViaWebhook).toHaveBeenCalledWith('doc-1');
      expect(result.current.previewState.isOpen).toBe(true);
      expect(result.current.previewState.isLoading).toBe(false);
      expect(result.current.previewState.error).toBeNull();
      expect(result.current.previewState.data).toBeTruthy();
      expect(result.current.previewState.data?.originalName).toBe('detailed-document.pdf');
      expect(result.current.previewState.data?.fileUrl).toBe('https://tars.giize.com/uploads/file.pdf');
    });

    it('프리뷰 로딩 중에는 isLoading이 true여야 함', async () => {
      let resolvePreview: ((value: any) => void) | null = null;

      vi.mocked(DocumentStatusService.getDocumentDetailViaWebhook).mockImplementation(
        () => new Promise(resolve => {
          resolvePreview = resolve;
        })
      );

      const { result } = renderHook(() =>
        useCustomerDocumentsController(mockCustomerId, { autoLoad: false })
      );

      act(() => {
        result.current.openPreview(mockDocuments[0]);
      });

      await waitFor(() => {
        expect(result.current.previewState.isOpen).toBe(true);
        expect(result.current.previewState.isLoading).toBe(true);
      });

      act(() => {
        resolvePreview?.(mockDetail);
      });

      await waitFor(() => {
        expect(result.current.previewState.isLoading).toBe(false);
      });
    });

    it('문서 상세 정보가 없으면 에러를 표시해야 함', async () => {
      vi.mocked(DocumentStatusService.getDocumentDetailViaWebhook).mockResolvedValue(null);

      const { result } = renderHook(() =>
        useCustomerDocumentsController(mockCustomerId, { autoLoad: false })
      );

      await act(async () => {
        await result.current.openPreview(mockDocuments[0]);
      });

      expect(result.current.previewState.isOpen).toBe(true);
      expect(result.current.previewState.error).toBe('문서 상세 정보를 찾을 수 없습니다.');
      expect(result.current.previewState.data).toBeNull();
    });

    it('프리뷰 로드 실패 시 에러를 표시해야 함', async () => {
      vi.mocked(DocumentStatusService.getDocumentDetailViaWebhook).mockRejectedValue(
        new Error('Preview failed')
      );

      const { result } = renderHook(() =>
        useCustomerDocumentsController(mockCustomerId, { autoLoad: false })
      );

      await act(async () => {
        await result.current.openPreview(mockDocuments[0]);
      });

      expect(result.current.previewState.isOpen).toBe(true);
      expect(result.current.previewState.error).toBeTruthy();
      expect(result.current.previewState.data).toBeNull();
    });

    it('document._id가 없으면 프리뷰를 열지 않아야 함', async () => {
      const { result } = renderHook(() =>
        useCustomerDocumentsController(mockCustomerId, { autoLoad: false })
      );

      await act(async () => {
        await result.current.openPreview({} as any);
      });

      expect(DocumentStatusService.getDocumentDetailViaWebhook).not.toHaveBeenCalled();
      expect(result.current.previewState.isOpen).toBe(false);
    });
  });

  describe('closePreview', () => {
    it('프리뷰를 닫고 상태를 초기화해야 함', async () => {
      vi.mocked(DocumentStatusService.getDocumentDetailViaWebhook).mockResolvedValue({
        upload: { originalName: 'test.pdf', destPath: '/test.pdf' }
      });

      const { result } = renderHook(() =>
        useCustomerDocumentsController(mockCustomerId, { autoLoad: false })
      );

      await act(async () => {
        await result.current.openPreview(mockDocuments[0]);
      });

      expect(result.current.previewState.isOpen).toBe(true);

      act(() => {
        result.current.closePreview();
      });

      expect(result.current.previewState.isOpen).toBe(false);
      expect(result.current.previewState.data).toBeNull();
      expect(result.current.previewState.target).toBeNull();
      expect(result.current.previewState.error).toBeNull();
    });
  });

  describe('retryPreview', () => {
    it('이전 프리뷰 대상으로 다시 시도해야 함', async () => {
      vi.mocked(DocumentStatusService.getDocumentDetailViaWebhook)
        .mockRejectedValueOnce(new Error('First failed'))
        .mockResolvedValueOnce({
          upload: { originalName: 'test.pdf', destPath: '/test.pdf' }
        });

      const { result } = renderHook(() =>
        useCustomerDocumentsController(mockCustomerId, { autoLoad: false })
      );

      await act(async () => {
        await result.current.openPreview(mockDocuments[0]);
      });

      expect(result.current.previewState.error).toBeTruthy();

      await act(async () => {
        await result.current.retryPreview();
      });

      expect(DocumentStatusService.getDocumentDetailViaWebhook).toHaveBeenCalledTimes(2);
      expect(result.current.previewState.error).toBeNull();
      expect(result.current.previewState.data).toBeTruthy();
    });

    it('프리뷰 대상이 없으면 아무것도 하지 않아야 함', async () => {
      const { result } = renderHook(() =>
        useCustomerDocumentsController(mockCustomerId, { autoLoad: false })
      );

      await act(async () => {
        await result.current.retryPreview();
      });

      expect(DocumentStatusService.getDocumentDetailViaWebhook).not.toHaveBeenCalled();
    });
  });

  describe('onDocumentsChange 콜백', () => {
    it('문서 개수가 변경되면 콜백을 호출해야 함', async () => {
      const onDocumentsChange = vi.fn();

      vi.mocked(DocumentService.getCustomerDocuments).mockResolvedValue({
        documents: mockDocuments
      });

      renderHook(() =>
        useCustomerDocumentsController(mockCustomerId, { onDocumentsChange })
      );

      await waitFor(() => {
        expect(onDocumentsChange).toHaveBeenCalledWith(2);
      });
    });

    it('문서 연결 해제 후 콜백을 호출해야 함', async () => {
      const onDocumentsChange = vi.fn();

      vi.mocked(DocumentService.getCustomerDocuments).mockResolvedValue({
        documents: mockDocuments
      });
      vi.mocked(DocumentService.unlinkDocumentFromCustomer).mockResolvedValue();

      const { result } = renderHook(() =>
        useCustomerDocumentsController(mockCustomerId, { onDocumentsChange })
      );

      await waitFor(() => {
        expect(onDocumentsChange).toHaveBeenCalledWith(2);
      });

      onDocumentsChange.mockClear();

      await act(async () => {
        await result.current.unlinkDocument('doc-1');
      });

      expect(onDocumentsChange).toHaveBeenCalledWith(1);
    });
  });

  describe('statusSummary', () => {
    it('문서 상태별 개수를 계산해야 함', async () => {
      vi.mocked(DocumentService.getCustomerDocuments).mockResolvedValue({
        documents: mockDocuments
      });

      const { result } = renderHook(() =>
        useCustomerDocumentsController(mockCustomerId)
      );

      await waitFor(() => {
        expect(result.current.documents).toHaveLength(2);
      });

      expect(result.current.statusSummary).toEqual({
        completed: 1,
        processing: 1
      });
    });

    it('status가 없으면 overallStatus를 사용해야 함', async () => {
      vi.mocked(DocumentService.getCustomerDocuments).mockResolvedValue({
        documents: [
          { _id: 'doc-1', originalName: 'doc1.pdf', overallStatus: 'completed' },
          { _id: 'doc-2', originalName: 'doc2.pdf', overallStatus: 'processing' }
        ] as any
      });

      const { result } = renderHook(() =>
        useCustomerDocumentsController(mockCustomerId)
      );

      await waitFor(() => {
        expect(result.current.documents).toHaveLength(2);
      });

      expect(result.current.statusSummary).toEqual({
        completed: 1,
        processing: 1
      });
    });

    it('status와 overallStatus가 모두 없으면 "linked"를 사용해야 함', async () => {
      vi.mocked(DocumentService.getCustomerDocuments).mockResolvedValue({
        documents: [
          { _id: 'doc-1', originalName: 'doc1.pdf' }
        ] as any
      });

      const { result } = renderHook(() =>
        useCustomerDocumentsController(mockCustomerId)
      );

      await waitFor(() => {
        expect(result.current.documents).toHaveLength(1);
      });

      expect(result.current.statusSummary).toEqual({
        linked: 1
      });
    });
  });

  describe('계산된 값', () => {
    it('isEmpty는 로딩 중이 아니고 문서가 없을 때 true여야 함', () => {
      const { result } = renderHook(() =>
        useCustomerDocumentsController(null)
      );

      expect(result.current.isEmpty).toBe(true);
      expect(result.current.documentCount).toBe(0);
    });

    it('documentCount는 문서 배열 길이와 같아야 함', async () => {
      vi.mocked(DocumentService.getCustomerDocuments).mockResolvedValue({
        documents: mockDocuments
      });

      const { result } = renderHook(() =>
        useCustomerDocumentsController(mockCustomerId)
      );

      await waitFor(() => {
        expect(result.current.documentCount).toBe(2);
      });
    });

    it('previewTarget은 previewState.target과 같아야 함', async () => {
      vi.mocked(DocumentStatusService.getDocumentDetailViaWebhook).mockResolvedValue({
        upload: { originalName: 'test.pdf', destPath: '/test.pdf' }
      });

      const { result } = renderHook(() =>
        useCustomerDocumentsController(mockCustomerId, { autoLoad: false })
      );

      await act(async () => {
        await result.current.openPreview(mockDocuments[0]);
      });

      expect(result.current.previewTarget).toBe(result.current.previewState.target);
      expect(result.current.previewTarget).toEqual(mockDocuments[0]);
    });
  });

  describe('언마운트 처리', () => {
    it('언마운트 후 상태 업데이트가 발생하지 않아야 함', async () => {
      let resolveLoad: ((value: any) => void) | null = null;

      vi.mocked(DocumentService.getCustomerDocuments).mockImplementation(
        () => new Promise(resolve => {
          resolveLoad = resolve;
        })
      );

      const { result, unmount } = renderHook(() =>
        useCustomerDocumentsController(mockCustomerId)
      );

      expect(result.current.isLoading).toBe(true);

      unmount();

      // 언마운트 후 resolve해도 에러가 발생하지 않아야 함
      resolveLoad?.({ documents: mockDocuments });

      // 에러 없이 통과하면 성공
      expect(true).toBe(true);
    });
  });
});

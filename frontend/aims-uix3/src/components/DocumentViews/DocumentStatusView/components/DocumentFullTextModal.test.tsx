/**
 * Document Full Text Modal Unit Tests
 * @since 2025-11-01
 *
 * 테스트 범위:
 * 1. 모달 열기/닫기
 * 2. Portal 렌더링
 * 3. API 호출 및 full_text 표시
 * 4. ESC 키로 닫기
 * 5. 접근성
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DocumentFullTextModal from './DocumentFullTextModal';
import type { Document } from '../../../../types/documentStatus';

// Mock DocumentStatusService
vi.mock('../../../../services/DocumentStatusService', () => ({
  DocumentStatusService: {
    extractFilename: (doc: Document) => doc.filename || '테스트파일.pdf'
  }
}));

describe('DocumentFullTextModal', () => {
  const mockDocument: Document = {
    _id: 'doc456',
    filename: '계약서.pdf',
    uploaded_at: '2025-11-01T10:00:00Z',
    originalName: '계약서.pdf',
    meta: {
      full_text: '이것은 전체 텍스트 내용입니다.'
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe('모달 열기/닫기', () => {
    it('visible=false일 때 렌더링되지 않아야 한다', () => {
      render(
        <DocumentFullTextModal
          visible={false}
          onClose={vi.fn()}
          document={mockDocument}
        />
      );

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('visible=true일 때 렌더링되어야 한다', () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            raw: {
              meta: { full_text: 'API 전체 텍스트' }
            }
          }
        })
      } as Response);

      render(
        <DocumentFullTextModal
          visible={true}
          onClose={vi.fn()}
          document={mockDocument}
        />
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('document=null일 때 렌더링되지 않아야 한다', () => {
      render(
        <DocumentFullTextModal
          visible={true}
          onClose={vi.fn()}
          document={null}
        />
      );

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('Portal 렌더링', () => {
    it('모달이 document.body에 직접 렌더링되어야 한다', () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            raw: { meta: { full_text: '테스트' } }
          }
        })
      } as Response);

      render(
        <DocumentFullTextModal
          visible={true}
          onClose={vi.fn()}
          document={mockDocument}
        />
      );

      const backdrop = screen.getByRole('presentation');
      expect(backdrop.parentElement).toBe(document.body);
    });
  });

  describe('API 호출 및 전체 텍스트 표시', () => {
    it('모달 열릴 때 API를 호출하여 full_text를 가져와야 한다', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            raw: {
              meta: { full_text: 'API에서 가져온 전체 텍스트 내용' }
            }
          }
        })
      } as Response);

      render(
        <DocumentFullTextModal
          visible={true}
          onClose={vi.fn()}
          document={mockDocument}
        />
      );

      // 로딩 상태 확인
      expect(screen.getByText('전체 텍스트를 불러오는 중...')).toBeInTheDocument();

      // API 호출 확인
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/documents/doc456/status',
          { headers: { 'x-user-id': 'tester' } }
        );
      });

      // 전체 텍스트 표시 확인
      await waitFor(() => {
        expect(screen.getByText('API에서 가져온 전체 텍스트 내용')).toBeInTheDocument();
      });
    });

    it('API 실패 시 로컬 데이터로 폴백해야 한다', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));

      render(
        <DocumentFullTextModal
          visible={true}
          onClose={vi.fn()}
          document={mockDocument}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('이것은 전체 텍스트 내용입니다.')).toBeInTheDocument();
      });
    });

    it('문서 ID가 없으면 에러 메시지를 표시해야 한다', async () => {
      const docWithoutId: Document = {
        ...mockDocument,
        _id: undefined as unknown as string
      };

      render(
        <DocumentFullTextModal
          visible={true}
          onClose={vi.fn()}
          document={docWithoutId}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('문서 ID를 찾을 수 없습니다.')).toBeInTheDocument();
      });
    });

    it('OCR full_text 우선순위 테스트', async () => {
      const docWithOcr: Document = {
        _id: 'doc789',
        filename: 'ocr-doc.pdf',
        uploaded_at: '2025-11-01',
        originalName: 'ocr-doc.pdf',
        ocr: {
          full_text: 'OCR로 추출된 텍스트'
        }
      };

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            raw: {
              meta: null,
              ocr: { full_text: 'OCR로 추출된 텍스트' }
            }
          }
        })
      } as Response);

      render(
        <DocumentFullTextModal
          visible={true}
          onClose={vi.fn()}
          document={docWithOcr}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('OCR로 추출된 텍스트')).toBeInTheDocument();
      });
    });
  });

  describe('ESC 키로 닫기', () => {
    it('ESC 키 입력 시 onClose가 호출되어야 한다', async () => {
      const handleClose = vi.fn();
      const user = userEvent.setup();

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { raw: { meta: { full_text: '테스트' } } }
        })
      } as Response);

      render(
        <DocumentFullTextModal
          visible={true}
          onClose={handleClose}
          document={mockDocument}
        />
      );

      await user.keyboard('{Escape}');

      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('닫기 버튼', () => {
    it('닫기 버튼 클릭 시 onClose가 호출되어야 한다', async () => {
      const handleClose = vi.fn();
      const user = userEvent.setup();

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { raw: { meta: { full_text: '테스트' } } }
        })
      } as Response);

      render(
        <DocumentFullTextModal
          visible={true}
          onClose={handleClose}
          document={mockDocument}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('테스트')).toBeInTheDocument();
      });

      const closeButton = screen.getByText('닫기');
      await user.click(closeButton);

      expect(handleClose).toHaveBeenCalled();
    });

  });

  describe('접근성', () => {
    it('role="dialog" 속성이 있어야 한다', () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { raw: { meta: { full_text: '테스트' } } }
        })
      } as Response);

      render(
        <DocumentFullTextModal
          visible={true}
          onClose={vi.fn()}
          document={mockDocument}
        />
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-label', '문서 전체 텍스트');
    });

    it('파일명이 모달 제목으로 표시되어야 한다', () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { raw: { meta: { full_text: '테스트' } } }
        })
      } as Response);

      render(
        <DocumentFullTextModal
          visible={true}
          onClose={vi.fn()}
          document={mockDocument}
        />
      );

      expect(screen.getByText('계약서.pdf')).toBeInTheDocument();
    });
  });
});

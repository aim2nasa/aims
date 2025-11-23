/**
 * Document Summary Modal Unit Tests
 * @since 2025-11-01
 *
 * 테스트 범위:
 * 1. 모달 열기/닫기
 * 2. Portal 렌더링
 * 3. API 호출 및 summary 표시
 * 4. ESC 키로 닫기
 * 5. 드래그 기능
 * 6. 접근성
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DocumentSummaryModal from './DocumentSummaryModal';
import type { Document } from '../../../../types/documentStatus';

// Mock DocumentStatusService
vi.mock('../../../../services/DocumentStatusService', () => ({
  DocumentStatusService: {
    extractFilename: (doc: Document) => doc.filename || '테스트파일.pdf'
  }
}));

describe('DocumentSummaryModal', () => {
  const mockDocument: Document = {
    _id: 'doc123',
    filename: '보험청구서.pdf',
    uploaded_at: '2025-11-01T10:00:00Z',
    originalName: '보험청구서.pdf',
    meta: {
      summary: '이것은 테스트 요약입니다.',
      full_text: '전체 텍스트 내용...'
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe('모달 열기/닫기', () => {
    it('visible=false일 때 렌더링되지 않아야 한다', () => {
      render(
        <DocumentSummaryModal
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
              meta: { summary: 'API 요약' }
            }
          }
        })
      } as Response);

      render(
        <DocumentSummaryModal
          visible={true}
          onClose={vi.fn()}
          document={mockDocument}
        />
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('document=null일 때 렌더링되지 않아야 한다', () => {
      render(
        <DocumentSummaryModal
          visible={true}
          onClose={vi.fn()}
          document={null}
        />
      );

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('Portal 렌더링', () => {
    it('모달이 document.body에 Portal로 렌더링되어야 한다', () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            raw: { meta: { summary: '테스트' } }
          }
        })
      } as Response);

      render(
        <DocumentSummaryModal
          visible={true}
          onClose={vi.fn()}
          document={mockDocument}
        />
      );

      const backdrop = screen.getByRole('presentation');
      expect(backdrop.parentElement).toBe(document.body);
    });
  });

  describe('API 호출 및 요약 표시', () => {
    it('모달 열릴 때 API를 호출하여 summary를 가져와야 한다', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            raw: {
              meta: { summary: 'API에서 가져온 요약 내용' }
            }
          }
        })
      } as Response);

      render(
        <DocumentSummaryModal
          visible={true}
          onClose={vi.fn()}
          document={mockDocument}
        />
      );

      // 로딩 상태 확인
      expect(screen.getByText('요약을 불러오는 중...')).toBeInTheDocument();

      // API 호출 확인
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/documents/doc123/status',
          { headers: { 'x-user-id': 'tester' } }
        );
      });

      // 요약 내용 표시 확인
      await waitFor(() => {
        expect(screen.getByText('API에서 가져온 요약 내용')).toBeInTheDocument();
      });
    });

    it('API 실패 시 로컬 데이터로 폴백해야 한다', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));

      render(
        <DocumentSummaryModal
          visible={true}
          onClose={vi.fn()}
          document={mockDocument}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('이것은 테스트 요약입니다.')).toBeInTheDocument();
      });
    });

    it('문서 ID가 없으면 에러 메시지를 표시해야 한다', async () => {
      const docWithoutId: Document = {
        ...mockDocument,
        _id: undefined as unknown as string
      };

      render(
        <DocumentSummaryModal
          visible={true}
          onClose={vi.fn()}
          document={docWithoutId}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('문서 ID를 찾을 수 없습니다.')).toBeInTheDocument();
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
          data: { raw: { meta: { summary: '테스트' } } }
        })
      } as Response);

      render(
        <DocumentSummaryModal
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
          data: { raw: { meta: { summary: '테스트' } } }
        })
      } as Response);

      render(
        <DocumentSummaryModal
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
          data: { raw: { meta: { summary: '테스트' } } }
        })
      } as Response);

      render(
        <DocumentSummaryModal
          visible={true}
          onClose={vi.fn()}
          document={mockDocument}
        />
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-label', '문서 요약');
    });

    it('파일명이 모달 제목으로 표시되어야 한다', () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { raw: { meta: { summary: '테스트' } } }
        })
      } as Response);

      render(
        <DocumentSummaryModal
          visible={true}
          onClose={vi.fn()}
          document={mockDocument}
        />
      );

      expect(screen.getByText('보험청구서.pdf')).toBeInTheDocument();
    });
  });
});

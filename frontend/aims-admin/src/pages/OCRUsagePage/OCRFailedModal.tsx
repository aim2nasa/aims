/**
 * OCR 실패 문서 목록 모달
 * @since 2025-12-14
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '@/shared/ui/Modal';
import { ocrUsageApi } from '@/features/dashboard/ocrUsageApi';
import type { FailedOCRDocument } from '@/features/dashboard/ocrUsageApi';
import './OCRFailedModal.css';

interface OCRFailedModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string | null;
  userName?: string | null;
}

const formatDateTime = (dateStr: string) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).replace(/\. /g, '.').replace(/, /g, ' ');
};

const parseErrorBody = (errorBody: string): string => {
  if (!errorBody) return '';
  try {
    const parsed = JSON.parse(errorBody);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return errorBody;
  }
};

export const OCRFailedModal = ({ isOpen, onClose, userId, userName }: OCRFailedModalProps) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'ocr-usage', 'failed-documents', userId],
    queryFn: () => ocrUsageApi.getFailedDocuments(userId || undefined),
    enabled: isOpen,
  });

  const handleRowClick = (docId: string) => {
    setExpandedId(expandedId === docId ? null : docId);
  };

  const title = userName
    ? `OCR 실패 문서 - ${userName}`
    : 'OCR 실패 문서 목록';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="lg">
      <div className="ocr-failed-modal">
        {isLoading && (
          <div className="ocr-failed-modal__loading">데이터를 불러오는 중...</div>
        )}

        {isError && (
          <div className="ocr-failed-modal__error">데이터를 불러오는데 실패했습니다.</div>
        )}

        {data && (
          <>
            <div className="ocr-failed-modal__summary">
              전체 <strong>{data.total_count}</strong>건의 실패 문서
            </div>

            {data.documents.length === 0 ? (
              <div className="ocr-failed-modal__empty">실패한 문서가 없습니다.</div>
            ) : (
              <div className="ocr-failed-modal__table-container">
                <table className="ocr-failed-modal__table">
                  <thead>
                    <tr>
                      <th>문서명</th>
                      {!userId && <th>소유자</th>}
                      <th>고객명</th>
                      <th>오류 코드</th>
                      <th>오류 메시지</th>
                      <th>실패 시간</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.documents.map((doc: FailedOCRDocument) => (
                      <>
                        <tr
                          key={doc._id}
                          className={`ocr-failed-modal__row ${expandedId === doc._id ? 'ocr-failed-modal__row--expanded' : ''}`}
                          onClick={() => handleRowClick(doc._id)}
                        >
                          <td className="ocr-failed-modal__doc-name" title={doc.originalName}>
                            {doc.originalName}
                          </td>
                          {!userId && (
                            <td className="ocr-failed-modal__owner">{doc.ownerName}</td>
                          )}
                          <td className="ocr-failed-modal__customer">{doc.customerName}</td>
                          <td className="ocr-failed-modal__status-code">{doc.statusCode || '-'}</td>
                          <td className="ocr-failed-modal__status-msg">{doc.statusMessage || '-'}</td>
                          <td className="ocr-failed-modal__time">{formatDateTime(doc.failed_at)}</td>
                        </tr>
                        {expandedId === doc._id && doc.errorBody && (
                          <tr key={`${doc._id}-detail`} className="ocr-failed-modal__detail-row">
                            <td colSpan={userId ? 5 : 6}>
                              <div className="ocr-failed-modal__error-detail">
                                <div className="ocr-failed-modal__error-detail-header">
                                  에러 상세 정보
                                </div>
                                <pre className="ocr-failed-modal__error-body">
                                  {parseErrorBody(doc.errorBody)}
                                </pre>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};

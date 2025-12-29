/**
 * 임베딩 실패 문서 목록 모달
 * @since 2025-12-29
 */

import { useState, Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '@/shared/ui/Modal';
import { embedUsageApi } from '@/features/dashboard/embedUsageApi';
import type { FailedEmbedDocument } from '@/features/dashboard/embedUsageApi';
import './EmbedFailedModal.css';

interface EmbedFailedModalProps {
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

export const EmbedFailedModal = ({ isOpen, onClose, userId, userName }: EmbedFailedModalProps) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'embed', 'failed-documents', userId],
    queryFn: () => embedUsageApi.getFailedDocuments(userId || undefined),
    enabled: isOpen,
  });

  const handleRowClick = (docId: string) => {
    setExpandedId(expandedId === docId ? null : docId);
  };

  const title = userName
    ? `임베딩 실패 문서 - ${userName}`
    : '임베딩 실패 문서 목록';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="lg">
      <div className="embed-failed-modal">
        {isLoading && (
          <div className="embed-failed-modal__loading">데이터를 불러오는 중...</div>
        )}

        {isError && (
          <div className="embed-failed-modal__error">데이터를 불러오는데 실패했습니다.</div>
        )}

        {data && (
          <>
            <div className="embed-failed-modal__summary">
              전체 <strong>{data.total_count}</strong>건의 실패 문서
            </div>

            {data.documents.length === 0 ? (
              <div className="embed-failed-modal__empty">실패한 문서가 없습니다.</div>
            ) : (
              <div className="embed-failed-modal__table-container">
                <table className="embed-failed-modal__table">
                  <thead>
                    <tr>
                      <th>문서명</th>
                      {!userId && <th>소유자</th>}
                      <th>고객명</th>
                      <th>상태</th>
                      <th>실패 시간</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.documents.map((doc: FailedEmbedDocument) => (
                      <Fragment key={doc._id}>
                        <tr
                          className={`embed-failed-modal__row ${expandedId === doc._id ? 'embed-failed-modal__row--expanded' : ''}`}
                          onClick={() => handleRowClick(doc._id)}
                        >
                          <td className="embed-failed-modal__doc-name" title={doc.originalName}>
                            {doc.originalName}
                          </td>
                          {!userId && (
                            <td className="embed-failed-modal__owner">{doc.ownerName}</td>
                          )}
                          <td className="embed-failed-modal__customer">{doc.customerName}</td>
                          <td className="embed-failed-modal__status">{doc.status}</td>
                          <td className="embed-failed-modal__time">{formatDateTime(doc.failed_at)}</td>
                        </tr>
                        {expandedId === doc._id && doc.errorMessage && (
                          <tr className="embed-failed-modal__detail-row">
                            <td colSpan={userId ? 4 : 5}>
                              <div className="embed-failed-modal__error-detail">
                                <div className="embed-failed-modal__error-detail-header">
                                  에러 상세 정보
                                </div>
                                <pre className="embed-failed-modal__error-body">
                                  {doc.errorMessage}
                                </pre>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
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

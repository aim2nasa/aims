/**
 * 관리자 문의 상세 페이지
 * @since 2025-12-18
 */

import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  inquiriesApi,
  CATEGORY_LABELS,
  STATUS_LABELS,
  type InquiryStatus,
} from '@/features/inquiries/api';
import { Button } from '@/shared/ui/Button/Button';
import './InquiryDetailPage.css';

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).replace(/\. /g, '.').replace(/:/g, ':');
};

export const InquiryDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [replyContent, setReplyContent] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 문의 상세 조회
  const { data: inquiry, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'inquiry', id],
    queryFn: () => inquiriesApi.getInquiry(id!),
    enabled: !!id,
  });

  // 답변 등록
  const replyMutation = useMutation({
    mutationFn: (content: string) => inquiriesApi.addReply(id!, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'inquiry', id] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'inquiries'] });
      setReplyContent('');
    },
  });

  // 상태 변경
  const statusMutation = useMutation({
    mutationFn: (status: InquiryStatus) => inquiriesApi.updateStatus(id!, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'inquiry', id] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'inquiries'] });
    },
  });

  // 스크롤 to bottom
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [inquiry?.messages]);

  const handleSubmitReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyContent.trim()) return;
    replyMutation.mutate(replyContent);
  };

  const handleStatusChange = (status: InquiryStatus) => {
    if (window.confirm(`상태를 "${STATUS_LABELS[status]}"(으)로 변경하시겠습니까?`)) {
      statusMutation.mutate(status);
    }
  };

  if (isLoading) {
    return <div className="inquiry-detail-page__loading">데이터를 불러오는 중...</div>;
  }

  if (isError) {
    return (
      <div className="inquiry-detail-page__error">
        <p>데이터를 불러오는데 실패했습니다.</p>
        <p>{error instanceof Error ? error.message : '알 수 없는 오류'}</p>
        <Button onClick={() => refetch()}>다시 시도</Button>
      </div>
    );
  }

  if (!inquiry) {
    return (
      <div className="inquiry-detail-page__error">
        <p>문의를 찾을 수 없습니다.</p>
        <Button onClick={() => navigate('/inquiries')}>목록으로</Button>
      </div>
    );
  }

  return (
    <div className="inquiry-detail-page">
      <div className="inquiry-detail-page__header">
        <button
          className="inquiry-detail-page__back"
          onClick={() => navigate('/inquiries')}
        >
          ← 목록으로
        </button>
        <h1 className="inquiry-detail-page__title">{inquiry.title}</h1>
        <div className="inquiry-detail-page__meta">
          <span className={`status-badge status-badge--${inquiry.status}`}>
            {STATUS_LABELS[inquiry.status]}
          </span>
          <span className={`category-badge category-badge--${inquiry.category}`}>
            {CATEGORY_LABELS[inquiry.category]}
          </span>
        </div>
      </div>

      <div className="inquiry-detail-page__content">
        <div className="inquiry-detail-page__main">
          {/* 문의자 정보 */}
          <div className="inquiry-detail-page__user-info">
            <h3>문의자 정보</h3>
            <div className="user-info-card">
              <div className="user-info-card__row">
                <span className="user-info-card__label">이름</span>
                <span className="user-info-card__value">{inquiry.userName}</span>
              </div>
              <div className="user-info-card__row">
                <span className="user-info-card__label">이메일</span>
                <span className="user-info-card__value">{inquiry.userEmail}</span>
              </div>
              {inquiry.user && (
                <>
                  <div className="user-info-card__row">
                    <span className="user-info-card__label">티어</span>
                    <span className="user-info-card__value">
                      {typeof inquiry.user.tier === 'object' && inquiry.user.tier
                        ? inquiry.user.tier.tier_id || '-'
                        : inquiry.user.tier || '-'}
                    </span>
                  </div>
                  <div className="user-info-card__row">
                    <span className="user-info-card__label">가입일</span>
                    <span className="user-info-card__value">{formatDate(inquiry.user.createdAt)}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 메시지 스레드 */}
          <div className="inquiry-detail-page__messages">
            <h3>대화 내역</h3>
            <div className="messages-container">
              {inquiry.messages.map((message) => (
                <div
                  key={message._id}
                  className={`message-item message-item--${message.authorRole}`}
                >
                  <div className="message-item__header">
                    <span className="message-item__author">
                      {message.authorRole === 'admin' ? '관리자' : inquiry.userName}
                    </span>
                    <span className="message-item__date">
                      {formatDate(message.createdAt)}
                    </span>
                  </div>
                  <div className="message-item__content">
                    {message.content}
                  </div>
                  {message.attachments && message.attachments.length > 0 && (
                    <div className="message-item__attachments">
                      {message.attachments.map((attachment, idx) => {
                        const isImage = attachment.mimeType?.startsWith('image/');
                        const attachmentUrl = inquiriesApi.getAttachmentUrl(inquiry._id, attachment.filename);

                        if (isImage) {
                          return (
                            <a
                              key={idx}
                              href={attachmentUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="message-item__image"
                            >
                              <img src={attachmentUrl} alt={attachment.originalName} />
                            </a>
                          );
                        }

                        return (
                          <a
                            key={idx}
                            href={attachmentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="message-item__attachment"
                          >
                            📎 {attachment.originalName}
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* 답변 입력 */}
          {inquiry.status !== 'closed' && (
            <form className="inquiry-detail-page__reply" onSubmit={handleSubmitReply}>
              <h3>답변 작성</h3>
              <textarea
                className="inquiry-detail-page__reply-input"
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="답변 내용을 입력하세요..."
                rows={5}
              />
              <div className="inquiry-detail-page__reply-actions">
                <Button
                  type="submit"
                  variant="primary"
                  disabled={replyMutation.isPending || !replyContent.trim()}
                >
                  {replyMutation.isPending ? '전송 중...' : '답변 전송'}
                </Button>
              </div>
            </form>
          )}
        </div>

        {/* 사이드바 - 상태 관리 */}
        <div className="inquiry-detail-page__sidebar">
          <div className="status-panel">
            <h3>상태 관리</h3>
            <div className="status-panel__info">
              <div className="status-panel__row">
                <span>등록일</span>
                <span>{formatDate(inquiry.createdAt)}</span>
              </div>
              <div className="status-panel__row">
                <span>최근 활동</span>
                <span>{formatDate(inquiry.updatedAt)}</span>
              </div>
              {inquiry.resolvedAt && (
                <div className="status-panel__row">
                  <span>해결일</span>
                  <span>{formatDate(inquiry.resolvedAt)}</span>
                </div>
              )}
            </div>
            <div className="status-panel__actions">
              <button
                className={`status-button status-button--pending ${inquiry.status === 'pending' ? 'status-button--active' : ''}`}
                onClick={() => handleStatusChange('pending')}
                disabled={statusMutation.isPending || inquiry.status === 'pending'}
              >
                대기중
              </button>
              <button
                className={`status-button status-button--in_progress ${inquiry.status === 'in_progress' ? 'status-button--active' : ''}`}
                onClick={() => handleStatusChange('in_progress')}
                disabled={statusMutation.isPending || inquiry.status === 'in_progress'}
              >
                처리중
              </button>
              <button
                className={`status-button status-button--resolved ${inquiry.status === 'resolved' ? 'status-button--active' : ''}`}
                onClick={() => handleStatusChange('resolved')}
                disabled={statusMutation.isPending || inquiry.status === 'resolved'}
              >
                해결됨
              </button>
              <button
                className={`status-button status-button--closed ${inquiry.status === 'closed' ? 'status-button--active' : ''}`}
                onClick={() => handleStatusChange('closed')}
                disabled={statusMutation.isPending || inquiry.status === 'closed'}
              >
                종료
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * 관리자 문의 상세 페이지
 * @since 2025-12-18
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useInquiryNotificationContext } from '@/App';
import {
  inquiriesApi,
  CATEGORY_LABELS,
  STATUS_LABELS,
  type InquiryStatus,
} from '@/features/inquiries/api';
import { Button } from '@/shared/ui/Button/Button';
import './InquiryDetailPage.css';

// 줌/팬 설정
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.2;

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

const formatTime = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

export const InquiryDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { unreadIds, markAsRead } = useInquiryNotificationContext();
  const [replyContent, setReplyContent] = useState('');
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 이미지 줌/팬 상태
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // 문의 상세 조회
  const { data: inquiry, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'inquiry', id],
    queryFn: () => inquiriesApi.getInquiry(id!),
    enabled: !!id,
  });

  // 진입 시 읽음 처리
  useEffect(() => {
    if (id && unreadIds.has(id)) {
      markAsRead(id);
    }
  }, [id, unreadIds, markAsRead]);

  // 답변 등록
  const replyMutation = useMutation({
    mutationFn: ({ content, files }: { content: string; files?: File[] }) =>
      inquiriesApi.addReply(id!, content, files),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'inquiry', id] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'inquiries'] });
      setReplyContent('');
      setReplyFiles([]);
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
    replyMutation.mutate({ content: replyContent, files: replyFiles.length > 0 ? replyFiles : undefined });
  };

  // Enter 키로 답변 전송 (Shift+Enter는 줄바꿈)
  const handleReplyKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!replyContent.trim() || replyMutation.isPending) return;
      replyMutation.mutate({ content: replyContent, files: replyFiles.length > 0 ? replyFiles : undefined });
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setReplyFiles(prev => [...prev, ...newFiles].slice(0, 5)); // 최대 5개
    }
    e.target.value = ''; // 같은 파일 다시 선택 가능하도록
  };

  const handleRemoveFile = (index: number) => {
    setReplyFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleStatusChange = (status: InquiryStatus) => {
    if (window.confirm(`상태를 "${STATUS_LABELS[status]}"(으)로 변경하시겠습니까?`)) {
      statusMutation.mutate(status);
    }
  };

  // 이미지 미리보기 열기 (줌/팬 초기화)
  const openPreview = useCallback((url: string) => {
    setPreviewImage(url);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // 이미지 미리보기 닫기
  const closePreview = useCallback(() => {
    setPreviewImage(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // 마우스 휠로 줌
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    setZoom(prev => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev + delta)));
  }, []);

  // 드래그 시작
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom <= 1) return; // 확대 상태에서만 팬 가능
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  }, [zoom, pan]);

  // 드래그 중
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({ x: dragStartRef.current.panX + dx, y: dragStartRef.current.panY + dy });
  }, [isDragging]);

  // 드래그 종료
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // 줌 리셋 (더블클릭)
  const handleDoubleClick = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

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
        <div className="inquiry-detail-page__header-top">
          <button
            type="button"
            className="inquiry-detail-page__back"
            onClick={() => navigate('/inquiries')}
          >
            ← 목록으로
          </button>
          <div className="inquiry-detail-page__header-info">
            <span className="inquiry-detail-page__date-info">
              등록: {formatDate(inquiry.createdAt)}
            </span>
            <span className="inquiry-detail-page__date-info">
              최근: {formatDate(inquiry.updatedAt)}
            </span>
          </div>
        </div>
        <div className="inquiry-detail-page__header-main">
          <div className="inquiry-detail-page__title-row">
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
          <div className="inquiry-detail-page__status-actions">
            <span className="inquiry-detail-page__user-brief">
              {inquiry.userName} ({inquiry.userEmail})
            </span>
            <div className="status-buttons-inline">
              <button
                type="button"
                className={`status-btn status-btn--pending ${inquiry.status === 'pending' ? 'status-btn--active' : ''}`}
                onClick={() => handleStatusChange('pending')}
                disabled={statusMutation.isPending || inquiry.status === 'pending'}
              >
                대기
              </button>
              <button
                type="button"
                className={`status-btn status-btn--in_progress ${inquiry.status === 'in_progress' ? 'status-btn--active' : ''}`}
                onClick={() => handleStatusChange('in_progress')}
                disabled={statusMutation.isPending || inquiry.status === 'in_progress'}
              >
                처리중
              </button>
              <button
                type="button"
                className={`status-btn status-btn--resolved ${inquiry.status === 'resolved' || inquiry.status === 'closed' ? 'status-btn--active' : ''}`}
                onClick={() => handleStatusChange('resolved')}
                disabled={statusMutation.isPending || inquiry.status === 'resolved' || inquiry.status === 'closed'}
              >
                해결
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="inquiry-detail-page__content">

          {/* 메시지 스레드 - 카카오톡 스타일 */}
          <div className="messages-container">
              {inquiry.messages.map((message) => (
                <div
                  key={message._id}
                  className={`message-item message-item--${message.authorRole}`}
                >
                  {/* 아바타 (사용자만 표시) */}
                  <div className="message-item__avatar">
                    {message.authorRole === 'user' ? inquiry.userName.charAt(0) : '관'}
                  </div>

                  {/* 말풍선 컨테이너 */}
                  <div className="message-item__bubble">
                    {/* 작성자 이름 (사용자만 표시) */}
                    <span className="message-item__author">{inquiry.userName}</span>

                    {/* 메시지 내용 */}
                    <div className="message-item__content">
                      {message.content}
                    </div>

                    {/* 첨부파일 */}
                    {message.attachments && message.attachments.length > 0 && (
                      <div className="message-item__attachments">
                        {message.attachments.map((attachment, idx) => {
                          const isImage = attachment.mimeType?.startsWith('image/');
                          const attachmentUrl = inquiriesApi.getAttachmentUrl(inquiry._id, attachment.filename);

                          if (isImage) {
                            return (
                              <button
                                key={idx}
                                type="button"
                                className="message-item__image"
                                onClick={() => openPreview(attachmentUrl)}
                              >
                                <img src={attachmentUrl} alt={attachment.originalName} />
                              </button>
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

                  {/* 시간 표시 */}
                  <span className="message-item__date">
                    {formatTime(message.createdAt)}
                  </span>
                </div>
              ))}
              <div ref={messagesEndRef} />
          </div>

          {/* 답변 입력 */}
          {inquiry.status !== 'closed' && (
            <form className="inquiry-reply-form" onSubmit={handleSubmitReply}>
              <textarea
                className="inquiry-detail-page__reply-input"
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="답변 내용을 입력하세요..."
                rows={5}
                onKeyDown={handleReplyKeyDown}
              />
              {/* 첨부파일 목록 */}
              {replyFiles.length > 0 && (
                <div className="inquiry-detail-page__files">
                  {replyFiles.map((file, idx) => {
                    const isImage = file.type.startsWith('image/');
                    return (
                      <div key={idx} className={`inquiry-detail-page__file-item ${isImage ? 'inquiry-detail-page__file-item--image' : ''}`}>
                        {isImage ? (
                          <img
                            src={URL.createObjectURL(file)}
                            alt={file.name}
                            className="inquiry-detail-page__file-thumbnail"
                            onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)}
                          />
                        ) : (
                          <span className="inquiry-detail-page__file-name">{file.name}</span>
                        )}
                        <button
                          type="button"
                          className="inquiry-detail-page__file-remove"
                          onClick={() => handleRemoveFile(idx)}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="inquiry-detail-page__reply-actions">
                {/* 숨겨진 파일 input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,.pdf"
                  onChange={handleFileSelect}
                  className="inquiry-detail-page__file-input"
                  aria-label="첨부파일 선택"
                />
                {/* 첨부파일 버튼 */}
                <button
                  type="button"
                  className="inquiry-attach-btn"
                  onClick={() => fileInputRef.current?.click()}
                >
                  첨부
                </button>
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

      {/* 이미지 미리보기 모달 */}
      {previewImage && (
        <div
          className="image-preview-modal"
          onClick={closePreview}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* 상단 툴바 - 화면에 고정 */}
          <div className="image-preview-modal__toolbar" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setZoom(prev => Math.max(MIN_ZOOM, prev - ZOOM_STEP))} title="축소">−</button>
            <span className="zoom-level">{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom(prev => Math.min(MAX_ZOOM, prev + ZOOM_STEP))} title="확대">+</button>
            <span className="divider" />
            <button type="button" className="reset-btn" onClick={handleDoubleClick}>리셋</button>
            <button type="button" className="close-btn" onClick={closePreview} title="닫기">✕</button>
          </div>

          {/* 이미지 콘텐츠 */}
          <div
            className={`image-preview-modal__content ${isDragging ? 'image-preview-modal__content--dragging' : ''}`}
            onClick={(e) => e.stopPropagation()}
            onWheel={handleWheel}
          >
            <img
              src={previewImage}
              alt="미리보기"
              style={{
                transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
              }}
              onMouseDown={handleMouseDown}
              onDoubleClick={handleDoubleClick}
              draggable={false}
            />
          </div>

          {/* 하단 힌트 - 화면에 고정 */}
          <div className="image-preview-modal__hint">
            스크롤: 확대/축소 | 드래그: 이동 | 더블클릭: 원래 크기
          </div>
        </div>
      )}
    </div>
  );
};

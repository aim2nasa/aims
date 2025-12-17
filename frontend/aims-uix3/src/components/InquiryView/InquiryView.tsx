/**
 * 1:1 문의 뷰
 * CenterPaneView 패턴 적용
 * @since 2025-12-18
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getInquiries,
  getInquiry,
  createInquiry,
  addMessage,
  getAttachmentUrl,
  formatFileSize,
  type InquiryStatus,
  type InquiryCategory,
  CATEGORY_LABELS,
  STATUS_LABELS,
} from '@/entities/inquiry';
import { CenterPaneView } from '../CenterPaneView/CenterPaneView';
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../SFSymbol';
import { formatDateTime } from '@/shared/lib/timeUtils';
import './InquiryView.css';

interface InquiryViewProps {
  visible: boolean;
  onClose: () => void;
}

type ViewMode = 'list' | 'create' | 'detail';

export default function InquiryView({ visible, onClose }: InquiryViewProps) {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedInquiryId, setSelectedInquiryId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<InquiryStatus | ''>('');

  // 문의 작성 폼 상태
  const [category, setCategory] = useState<InquiryCategory>('question');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 메시지 추가 상태
  const [newMessage, setNewMessage] = useState('');
  const [messageFiles, setMessageFiles] = useState<File[]>([]);
  const messageFileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 문의 목록 조회
  const { data: inquiriesData, isLoading: isListLoading } = useQuery({
    queryKey: ['inquiries', statusFilter],
    queryFn: () => getInquiries({ status: statusFilter || undefined, limit: 50 }),
    enabled: visible && viewMode === 'list',
  });

  // 문의 상세 조회
  const { data: inquiryDetail, isLoading: isDetailLoading } = useQuery({
    queryKey: ['inquiry', selectedInquiryId],
    queryFn: () => getInquiry(selectedInquiryId!),
    enabled: visible && viewMode === 'detail' && !!selectedInquiryId,
  });

  // 문의 생성
  const createMutation = useMutation({
    mutationFn: createInquiry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inquiries'] });
      resetCreateForm();
      setViewMode('list');
    },
  });

  // 메시지 추가
  const addMessageMutation = useMutation({
    mutationFn: ({ inquiryId, content, files }: { inquiryId: string; content: string; files?: File[] }) =>
      addMessage(inquiryId, { content, files }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inquiry', selectedInquiryId] });
      setNewMessage('');
      setMessageFiles([]);
    },
  });

  // 스크롤 to bottom
  useEffect(() => {
    if (viewMode === 'detail' && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [inquiryDetail?.messages, viewMode]);

  const resetCreateForm = () => {
    setCategory('question');
    setTitle('');
    setContent('');
    setFiles([]);
  };

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>, isMessage = false) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (isMessage) {
      setMessageFiles(prev => [...prev, ...selectedFiles].slice(0, 5));
    } else {
      setFiles(prev => [...prev, ...selectedFiles].slice(0, 5));
    }
    e.target.value = '';
  }, []);

  const handleRemoveFile = useCallback((index: number, isMessage = false) => {
    if (isMessage) {
      setMessageFiles(prev => prev.filter((_, i) => i !== index));
    } else {
      setFiles(prev => prev.filter((_, i) => i !== index));
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleFileDrop = useCallback((e: React.DragEvent, isMessage = false) => {
    e.preventDefault();
    e.stopPropagation();
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (isMessage) {
      setMessageFiles(prev => [...prev, ...droppedFiles].slice(0, 5));
    } else {
      setFiles(prev => [...prev, ...droppedFiles].slice(0, 5));
    }
  }, []);

  const handleSubmitInquiry = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    createMutation.mutate({ category, title, content, files: files.length > 0 ? files : undefined });
  }, [category, title, content, files, createMutation]);

  const handleSubmitMessage = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedInquiryId) return;
    addMessageMutation.mutate({
      inquiryId: selectedInquiryId,
      content: newMessage,
      files: messageFiles.length > 0 ? messageFiles : undefined,
    });
  }, [newMessage, messageFiles, selectedInquiryId, addMessageMutation]);

  const handleInquiryClick = useCallback((inquiryId: string) => {
    setSelectedInquiryId(inquiryId);
    setViewMode('detail');
  }, []);

  const handleBackToList = useCallback(() => {
    setViewMode('list');
    setSelectedInquiryId(null);
  }, []);

  // 상태별 카운트 계산
  const statusCounts = {
    pending: inquiriesData?.inquiries.filter(i => i.status === 'pending').length ?? 0,
    in_progress: inquiriesData?.inquiries.filter(i => i.status === 'in_progress').length ?? 0,
    resolved: inquiriesData?.inquiries.filter(i => i.status === 'resolved').length ?? 0,
    closed: inquiriesData?.inquiries.filter(i => i.status === 'closed').length ?? 0,
    all: inquiriesData?.inquiries.length ?? 0,
  };

  // 동적 타이틀
  const getTitle = () => {
    if (viewMode === 'create') return '새 문의 작성';
    if (viewMode === 'detail' && inquiryDetail) return inquiryDetail.title;
    return '1:1 문의';
  };

  // 뒤로가기 버튼 (작성/상세 뷰에서)
  const titleLeftAccessory = (viewMode === 'create' || viewMode === 'detail') ? (
    <button type="button" className="inquiry-back-button" onClick={handleBackToList}>
      <SFSymbol name="chevron-left" size={SFSymbolSize.FOOTNOTE} weight={SFSymbolWeight.MEDIUM} />
      목록
    </button>
  ) : undefined;

  // 새 문의 버튼 (목록 뷰에서)
  const titleAccessory = viewMode === 'list' ? (
    <button
      type="button"
      className="inquiry-create-button"
      onClick={() => setViewMode('create')}
    >
      <SFSymbol name="plus" size={SFSymbolSize.CAPTION_1} weight={SFSymbolWeight.SEMIBOLD} />
      새 문의
    </button>
  ) : undefined;

  // 목록 뷰 컨텐츠
  const renderListContent = () => (
    <div className="inquiry-container">
      {/* 필터 헤더 */}
      <div className="inquiry-result-header">
        <div className="inquiry-result-count">
          <button
            type="button"
            className={`inquiry-filter-button ${statusFilter === '' ? 'active' : ''}`}
            onClick={() => setStatusFilter('')}
          >
            전체({statusCounts.all})
          </button>
          <span className="inquiry-filter-separator">/</span>
          <button
            type="button"
            className={`inquiry-filter-button ${statusFilter === 'pending' ? 'active' : ''}`}
            onClick={() => setStatusFilter('pending')}
          >
            대기({statusCounts.pending})
          </button>
          <span className="inquiry-filter-separator">/</span>
          <button
            type="button"
            className={`inquiry-filter-button ${statusFilter === 'in_progress' ? 'active' : ''}`}
            onClick={() => setStatusFilter('in_progress')}
          >
            처리중({statusCounts.in_progress})
          </button>
          <span className="inquiry-filter-separator">/</span>
          <button
            type="button"
            className={`inquiry-filter-button ${statusFilter === 'resolved' ? 'active' : ''}`}
            onClick={() => setStatusFilter('resolved')}
          >
            해결({statusCounts.resolved})
          </button>
        </div>
      </div>

      {/* 목록 */}
      {isListLoading ? (
        <div className="inquiry-loading">로딩 중...</div>
      ) : inquiriesData?.inquiries.length === 0 ? (
        <div className="inquiry-empty">
          <div className="inquiry-empty-icon">
            <SFSymbol name="envelope" size={SFSymbolSize.LARGE_TITLE} weight={SFSymbolWeight.LIGHT} />
          </div>
          <p className="inquiry-empty-title">등록된 문의가 없습니다</p>
          <p className="inquiry-empty-desc">문의 사항이 있으시면 새 문의를 등록해주세요</p>
          <button type="button" className="inquiry-empty-button" onClick={() => setViewMode('create')}>
            <SFSymbol name="plus" size={SFSymbolSize.FOOTNOTE} weight={SFSymbolWeight.MEDIUM} />
            첫 문의 등록하기
          </button>
        </div>
      ) : (
        <div className="inquiry-list">
          {/* 헤더 */}
          <div className="inquiry-list-header">
            <span>상태</span>
            <span>유형</span>
            <span>제목</span>
            <span>등록일</span>
            <span>메시지</span>
          </div>
          {/* 행들 */}
          {inquiriesData?.inquiries.map((inquiry) => (
            <button
              key={inquiry._id}
              type="button"
              className="inquiry-row"
              onClick={() => handleInquiryClick(inquiry._id)}
            >
              <span className={`inquiry-status-badge inquiry-status-badge--${inquiry.status}`}>
                {STATUS_LABELS[inquiry.status]}
              </span>
              <span className={`inquiry-category-badge inquiry-category-badge--${inquiry.category}`}>
                {CATEGORY_LABELS[inquiry.category]}
              </span>
              <span className="inquiry-row-title">{inquiry.title}</span>
              <span className="inquiry-row-date">{formatDateTime(inquiry.createdAt)}</span>
              <span className="inquiry-row-messages">
                <SFSymbol name="message" size={SFSymbolSize.CAPTION_1} weight={SFSymbolWeight.MEDIUM} />
                {inquiry.messages?.length || 0}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  // 작성 뷰 컨텐츠
  const renderCreateContent = () => (
    <div className="inquiry-container">
      <form className="inquiry-create-form" onSubmit={handleSubmitInquiry}>
        <div className="inquiry-form-field">
          <label className="inquiry-form-label" htmlFor="inquiry-category">문의 유형</label>
          <select
            id="inquiry-category"
            className="inquiry-form-select"
            value={category}
            onChange={(e) => setCategory(e.target.value as InquiryCategory)}
          >
            <option value="bug">버그 신고</option>
            <option value="feature">기능 제안</option>
            <option value="question">사용 문의</option>
            <option value="other">기타</option>
          </select>
        </div>

        <div className="inquiry-form-field">
          <label className="inquiry-form-label" htmlFor="inquiry-title">제목</label>
          <input
            id="inquiry-title"
            type="text"
            className="inquiry-form-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="문의 제목을 입력하세요"
            required
          />
        </div>

        <div className="inquiry-form-field">
          <label className="inquiry-form-label" htmlFor="inquiry-content">내용</label>
          <textarea
            id="inquiry-content"
            className="inquiry-form-textarea"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="문의 내용을 입력해주세요"
            required
          />
        </div>

        <div className="inquiry-form-field">
          <label className="inquiry-form-label">
            첨부파일
            <span className="inquiry-form-label-hint">(최대 5개)</span>
          </label>
          <div
            className="inquiry-file-drop"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDrop={(e) => handleFileDrop(e)}
          >
            <SFSymbol name="arrow-up-doc" size={SFSymbolSize.TITLE_2} weight={SFSymbolWeight.LIGHT} />
            <span className="inquiry-file-drop-text">파일을 끌어다 놓거나 클릭</span>
            <span className="inquiry-file-drop-hint">이미지, PDF, 문서</span>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx"
              onChange={(e) => handleFileSelect(e)}
              className="visually-hidden"
              aria-label="첨부파일 선택"
            />
          </div>
          {files.length > 0 && (
            <ul className="inquiry-file-list">
              {files.map((file, index) => (
                <li key={index} className="inquiry-file-item">
                  <SFSymbol name="doc" size={SFSymbolSize.CAPTION_1} weight={SFSymbolWeight.MEDIUM} />
                  <span>{file.name} ({formatFileSize(file.size)})</span>
                  <button
                    type="button"
                    className="inquiry-file-remove"
                    onClick={() => handleRemoveFile(index)}
                    title="파일 삭제"
                    aria-label="파일 삭제"
                  >
                    <SFSymbol name="xmark" size={SFSymbolSize.CAPTION_2} weight={SFSymbolWeight.MEDIUM} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="inquiry-form-actions">
          <button
            type="button"
            className="inquiry-form-cancel"
            onClick={() => { resetCreateForm(); setViewMode('list'); }}
          >
            취소
          </button>
          <button
            type="submit"
            className="inquiry-form-submit"
            disabled={createMutation.isPending || !title.trim() || !content.trim()}
          >
            {createMutation.isPending ? '등록 중...' : '문의 등록'}
          </button>
        </div>
      </form>
    </div>
  );

  // 상세 뷰 컨텐츠
  const renderDetailContent = () => (
    <div className="inquiry-container">
      {isDetailLoading ? (
        <div className="inquiry-loading">로딩 중...</div>
      ) : inquiryDetail ? (
        <div className="inquiry-detail">
          {/* 정보 */}
          <div className="inquiry-detail-info">
            <div className="inquiry-detail-info-item">
              <span className={`inquiry-status-badge inquiry-status-badge--${inquiryDetail.status}`}>
                {STATUS_LABELS[inquiryDetail.status]}
              </span>
              <span className={`inquiry-category-badge inquiry-category-badge--${inquiryDetail.category}`}>
                {CATEGORY_LABELS[inquiryDetail.category]}
              </span>
            </div>
            <div className="inquiry-detail-info-item">
              <span className="inquiry-detail-info-label">등록일</span>
              <span className="inquiry-detail-info-value">{formatDateTime(inquiryDetail.createdAt)}</span>
            </div>
            <div className="inquiry-detail-info-item">
              <span className="inquiry-detail-info-label">메시지</span>
              <span className="inquiry-detail-info-value">{inquiryDetail.messages.length}개</span>
            </div>
          </div>

          {/* 메시지 목록 - 카카오톡 스타일 */}
          <div className="inquiry-messages">
            {inquiryDetail.messages.map((message) => (
              <div
                key={message._id}
                className={`inquiry-message inquiry-message--${message.authorRole}`}
              >
                {/* 아바타 (관리자만 표시) */}
                <div className="inquiry-message-avatar">
                  {message.authorRole === 'admin' ? '관' : '나'}
                </div>

                {/* 말풍선 컨테이너 */}
                <div className="inquiry-message-bubble">
                  {/* 작성자 이름 (관리자만 표시) */}
                  <span className="inquiry-message-author">관리자</span>

                  {/* 메시지 내용 */}
                  <div className="inquiry-message-content">{message.content}</div>

                  {/* 첨부파일 */}
                  {message.attachments && message.attachments.length > 0 && (
                    <div className="inquiry-message-attachments">
                      {message.attachments.map((attachment, idx) => {
                        const isImage = attachment.mimeType?.startsWith('image/');
                        const attachmentUrl = getAttachmentUrl(inquiryDetail._id, attachment.filename);

                        if (isImage) {
                          return (
                            <a
                              key={idx}
                              href={attachmentUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inquiry-message-image"
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
                            className="inquiry-message-attachment"
                          >
                            <SFSymbol name="paperclip" size={SFSymbolSize.CAPTION_2} weight={SFSymbolWeight.MEDIUM} />
                            {attachment.originalName}
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 시간 표시 */}
                <span className="inquiry-message-date">
                  {formatDateTime(message.createdAt).split(' ')[1]}
                </span>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* 답변 입력 */}
          {inquiryDetail.status !== 'closed' ? (
            <form className="inquiry-reply-form" onSubmit={handleSubmitMessage}>
              <textarea
                className="inquiry-reply-input"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="추가 문의 내용을 입력하세요..."
                onDragOver={handleDragOver}
                onDrop={(e) => handleFileDrop(e, true)}
              />
              <div className="inquiry-reply-actions">
                {messageFiles.length > 0 ? (
                  <ul className="inquiry-reply-files">
                    {messageFiles.map((file, index) => (
                      <li key={index}>
                        <span>{file.name}</span>
                        <button type="button" onClick={() => handleRemoveFile(index, true)} title="파일 삭제" aria-label="파일 삭제">
                          <SFSymbol name="xmark" size={SFSymbolSize.CAPTION_2} weight={SFSymbolWeight.MEDIUM} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div />
                )}
                <div className="inquiry-reply-buttons">
                  <button
                    type="button"
                    className="inquiry-attach-btn"
                    onClick={() => messageFileInputRef.current?.click()}
                    title="파일 첨부"
                    aria-label="파일 첨부"
                  >
                    <SFSymbol name="paperclip" size={SFSymbolSize.BODY} weight={SFSymbolWeight.MEDIUM} />
                  </button>
                  <input
                    ref={messageFileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.pdf,.doc,.docx"
                    onChange={(e) => handleFileSelect(e, true)}
                    className="visually-hidden"
                    aria-label="첨부파일 선택"
                  />
                  <button
                    type="submit"
                    className="inquiry-send-btn"
                    disabled={addMessageMutation.isPending || !newMessage.trim()}
                  >
                    {addMessageMutation.isPending ? '전송 중...' : '전송'}
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <div className="inquiry-closed-notice">
              <SFSymbol name="lock" size={SFSymbolSize.BODY} weight={SFSymbolWeight.MEDIUM} />
              이 문의는 종료되었습니다
            </div>
          )}
        </div>
      ) : (
        <div className="inquiry-loading">문의를 찾을 수 없습니다</div>
      )}
    </div>
  );

  // 1:1 문의 아이콘 (SFSymbol에 정의되지 않아 직접 SVG 사용)
  const inquiryIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="inquiry-title-icon">
      <path d="M12 3C6.5 3 2 6.58 2 11c0 2.13 1.02 4.05 2.67 5.47L4 21l4.88-2.33C9.86 18.89 10.91 19 12 19c5.5 0 10-3.58 10-8s-4.5-8-10-8z" opacity="0.85"/>
    </svg>
  );

  return (
    <CenterPaneView
      visible={visible}
      title={getTitle()}
      titleIcon={inquiryIcon}
      titleLeftAccessory={titleLeftAccessory}
      titleAccessory={titleAccessory}
      onClose={onClose}
    >
      {viewMode === 'list' && renderListContent()}
      {viewMode === 'create' && renderCreateContent()}
      {viewMode === 'detail' && renderDetailContent()}
    </CenterPaneView>
  );
}

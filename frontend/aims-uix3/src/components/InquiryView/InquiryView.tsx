/**
 * 1:1 문의 뷰
 * CenterPaneView 패턴 적용
 * @since 2025-12-18
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SortIndicator } from '@/shared/ui/SortIndicator';
import {
  getInquiries,
  getInquiry,
  createInquiry,
  addMessage,
  getAttachmentUrl,
  formatFileSize,
  type InquiryStatus,
  type InquiryCategory,
  type Inquiry,
  CATEGORY_LABELS,
  STATUS_LABELS,
} from '@/entities/inquiry';
import { CenterPaneView } from '../CenterPaneView/CenterPaneView';
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../SFSymbol';
import Tooltip from '../../shared/ui/Tooltip';
import { BackButton } from '@/shared/ui/BackButton';
import { Dropdown } from '../../shared/ui/Dropdown';
import { formatDateTime } from '@/shared/lib/timeUtils';
import './InquiryView.list.css';
import './InquiryView.form.css';
import './InquiryView.messages.css';
import './InquiryView.extras.css';

// 줌/팬 설정
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.2;

interface InquiryViewProps {
  visible: boolean;
  onClose: () => void;
  /** 미확인 문의 ID Set */
  unreadIds?: Set<string>;
  /** 읽음 처리 함수 */
  onMarkAsRead?: (inquiryId: string) => Promise<void>;
  /** 현재 보고 있는 문의 ID 변경 시 콜백 (카카오톡 스타일: 열린 채팅방은 카운트 증가 안함) */
  onViewingInquiryChange?: (inquiryId: string | null) => void;
}

type ViewMode = 'list' | 'create' | 'detail';

// 정렬 가능한 필드
type SortField = 'status' | 'category' | 'title' | 'createdAt' | 'messageCount';
type SortDirection = 'asc' | 'desc';

export default function InquiryView({
  visible,
  onClose,
  unreadIds = new Set(),
  onMarkAsRead,
  onViewingInquiryChange,
}: InquiryViewProps) {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedInquiryId, setSelectedInquiryId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<InquiryStatus | ''>('');

  // 정렬 상태
  const [sortField, setSortField] = useState<SortField | null>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

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

  // 이미지 미리보기 상태
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

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

  // 상세 화면 진입 시 읽음 처리
  // 주의: unreadIds를 의존성에서 제외하여 새 메시지 수신 시 자동 읽음 처리 방지
  // visible 추가: 화면을 닫았다가 다시 열 때도 읽음 처리 필요
  useEffect(() => {
    if (visible && viewMode === 'detail' && selectedInquiryId && unreadIds.has(selectedInquiryId) && onMarkAsRead) {
      onMarkAsRead(selectedInquiryId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, viewMode, selectedInquiryId, onMarkAsRead]);

  // 카카오톡 스타일: 현재 보고 있는 문의 ID를 부모에게 알림
  // 열린 채팅방에 새 메시지가 오면 카운트 증가 안함
  useEffect(() => {
    if (!onViewingInquiryChange) return;

    if (visible && viewMode === 'detail' && selectedInquiryId) {
      onViewingInquiryChange(selectedInquiryId);
    } else {
      onViewingInquiryChange(null);
    }
  }, [visible, viewMode, selectedInquiryId, onViewingInquiryChange]);

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

  // Enter 키로 메시지 전송 (Shift+Enter는 줄바꿈)
  const handleMessageKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!newMessage.trim() || !selectedInquiryId || addMessageMutation.isPending) return;
      addMessageMutation.mutate({
        inquiryId: selectedInquiryId,
        content: newMessage,
        files: messageFiles.length > 0 ? messageFiles : undefined,
      });
    }
  }, [newMessage, messageFiles, selectedInquiryId, addMessageMutation]);

  const handleInquiryClick = useCallback((inquiryId: string) => {
    setSelectedInquiryId(inquiryId);
    setViewMode('detail');
  }, []);

  const handleBackToList = useCallback(() => {
    setViewMode('list');
    setSelectedInquiryId(null);
  }, []);

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
    if (zoom <= 1) return;
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

  // 상태별 카운트 계산
  const statusCounts = {
    pending: inquiriesData?.inquiries.filter(i => i.status === 'pending').length ?? 0,
    in_progress: inquiriesData?.inquiries.filter(i => i.status === 'in_progress').length ?? 0,
    resolved: inquiriesData?.inquiries.filter(i => i.status === 'resolved').length ?? 0,
    closed: inquiriesData?.inquiries.filter(i => i.status === 'closed').length ?? 0,
    all: inquiriesData?.inquiries.length ?? 0,
  };

  // 정렬 핸들러
  const handleColumnSort = useCallback((field: SortField) => {
    if (sortField === field) {
      // 같은 필드 클릭: 방향 토글
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // 다른 필드 클릭: 해당 필드로 변경, 기본 내림차순
      setSortField(field);
      setSortDirection('desc');
    }
  }, [sortField]);

  // 정렬된 문의 목록
  const sortedInquiries = useMemo(() => {
    const inquiries = inquiriesData?.inquiries || [];
    if (!sortField) return inquiries;

    return [...inquiries].sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      switch (sortField) {
        case 'status':
          // 상태 우선순위: pending > in_progress > resolved > closed
          const statusOrder: Record<InquiryStatus, number> = { pending: 0, in_progress: 1, resolved: 2, closed: 3 };
          aVal = statusOrder[a.status];
          bVal = statusOrder[b.status];
          break;
        case 'category':
          aVal = a.category;
          bVal = b.category;
          break;
        case 'title':
          aVal = a.title.toLowerCase();
          bVal = b.title.toLowerCase();
          break;
        case 'createdAt':
          aVal = new Date(a.createdAt).getTime();
          bVal = new Date(b.createdAt).getTime();
          break;
        case 'messageCount':
          aVal = a.messages?.length || 0;
          bVal = b.messages?.length || 0;
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [inquiriesData?.inquiries, sortField, sortDirection]);

  // 정렬 아이콘 렌더링 → 공유 SortIndicator 컴포넌트 사용
  const renderSortIndicator = (field: SortField) => {
    return <SortIndicator field={field} currentSortField={sortField} sortDirection={sortDirection} />;
  };

  // 동적 타이틀
  const getTitle = () => {
    if (viewMode === 'create') return '새 문의 작성';
    // detail 모드에서도 헤더는 '1:1 문의'로 유지 (제목은 본문에 표시)
    return '1:1 문의';
  };

  // 뒤로가기 버튼 (작성 뷰에서만 헤더에 표시, 상세 뷰는 본문에 표시)
  const inquiryBackButton = viewMode === 'create' ? (
    <BackButton label="목록" onClick={handleBackToList} />
  ) : undefined;

  // titleAccessory 제거 - 새 문의 버튼은 필터 줄에 배치

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
        <button
          type="button"
          className="inquiry-create-button"
          onClick={() => setViewMode('create')}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          새 문의
        </button>
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
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            첫 문의 등록하기
          </button>
        </div>
      ) : (
        <div className="inquiry-list">
          {/* 헤더 */}
          <div className="inquiry-list-header">
            <div
              className="inquiry-header-sortable"
              onClick={() => handleColumnSort('status')}
            >
              <span>상태</span>
              {renderSortIndicator('status')}
            </div>
            <div
              className="inquiry-header-sortable"
              onClick={() => handleColumnSort('category')}
            >
              <span>유형</span>
              {renderSortIndicator('category')}
            </div>
            <div
              className="inquiry-header-sortable"
              onClick={() => handleColumnSort('title')}
            >
              <span>제목</span>
              {renderSortIndicator('title')}
            </div>
            <div
              className="inquiry-header-sortable"
              onClick={() => handleColumnSort('createdAt')}
            >
              <span>등록일</span>
              {renderSortIndicator('createdAt')}
            </div>
            <div
              className="inquiry-header-sortable"
              onClick={() => handleColumnSort('messageCount')}
            >
              <span>메시지</span>
              {renderSortIndicator('messageCount')}
            </div>
          </div>
          {/* 행들 */}
          {sortedInquiries.map((inquiry) => {
            const isUnread = unreadIds.has(inquiry._id);
            return (
              <button
                key={inquiry._id}
                type="button"
                className={`inquiry-row ${isUnread ? 'inquiry-row--unread' : ''}`}
                onClick={() => handleInquiryClick(inquiry._id)}
              >
                <span className={`inquiry-status-badge inquiry-status-badge--${inquiry.status}`}>
                  {STATUS_LABELS[inquiry.status]}
                </span>
                <span className={`inquiry-category-badge inquiry-category-badge--${inquiry.category}`}>
                  {CATEGORY_LABELS[inquiry.category]}
                </span>
                <span className="inquiry-row-title">
                  {isUnread && <span className="inquiry-row-unread-dot" />}
                  {inquiry.title}
                </span>
                <span className="inquiry-row-date">{formatDateTime(inquiry.createdAt)}</span>
                <span className="inquiry-row-messages">
                  <SFSymbol name="message" size={SFSymbolSize.CAPTION_1} weight={SFSymbolWeight.MEDIUM} />
                  {inquiry.messages?.length || 0}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  // 작성 뷰 컨텐츠
  const renderCreateContent = () => (
    <div className="inquiry-container">
      <form className="inquiry-create-form" onSubmit={handleSubmitInquiry}>
        <div className="inquiry-form-field">
          <label className="inquiry-form-label">문의 유형</label>
          <Dropdown
            value={category}
            onChange={(value) => setCategory(value as InquiryCategory)}
            options={[
              { value: 'bug', label: '버그 신고' },
              { value: 'feature', label: '기능 제안' },
              { value: 'question', label: '사용 문의' },
              { value: 'other', label: '기타' },
            ]}
            aria-label="문의 유형 선택"
          />
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
              {files.map((file, index) => {
                const isImage = file.type.startsWith('image/');
                return (
                  <li key={index} className={`inquiry-file-item ${isImage ? 'inquiry-file-item--image' : ''}`}>
                    {isImage ? (
                      <img
                        src={URL.createObjectURL(file)}
                        alt={file.name}
                        className="inquiry-file-thumbnail"
                        onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)}
                      />
                    ) : (
                      <>
                        <SFSymbol name="doc" size={SFSymbolSize.CAPTION_1} weight={SFSymbolWeight.MEDIUM} />
                        <span>{file.name} ({formatFileSize(file.size)})</span>
                      </>
                    )}
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
                );
              })}
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
          {/* 상단 바: 목록 버튼 + 배지 + 메타정보 */}
          <div className="inquiry-detail-topbar">
            <button type="button" className="inquiry-detail-back" onClick={handleBackToList}>
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" className="inquiry-back-icon">
                <path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              목록
            </button>
            <div className="inquiry-detail-meta">
              <span className={`inquiry-status-badge inquiry-status-badge--${inquiryDetail.status}`}>
                {STATUS_LABELS[inquiryDetail.status]}
              </span>
              <span className={`inquiry-category-badge inquiry-category-badge--${inquiryDetail.category}`}>
                {CATEGORY_LABELS[inquiryDetail.category]}
              </span>
              <span className="inquiry-detail-date">{formatDateTime(inquiryDetail.createdAt)}</span>
            </div>
          </div>

          {/* 문의 제목 */}
          <h2 className="inquiry-detail-title">{inquiryDetail.title}</h2>

          {/* 메시지 목록 - 카카오톡 스타일 */}
          <div className="inquiry-messages">
            {inquiryDetail.messages.map((message) => (
              // 시스템 메시지는 중앙 정렬로 표시
              message.authorRole === 'system' ? (
                <div key={message._id} className="inquiry-message inquiry-message--system">
                  <div className="inquiry-system-message">
                    <span>{message.content}</span>
                  </div>
                </div>
              ) : (
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
                            <button
                              key={idx}
                              type="button"
                              className="inquiry-message-image"
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
                            className="inquiry-message-attachment"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                            </svg>
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
              )
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* 해결됨 배너 */}
          {inquiryDetail.status === 'resolved' && (
            <div className="inquiry-resolved-banner">
              <SFSymbol name="checkmark.circle.fill" size={SFSymbolSize.BODY} weight={SFSymbolWeight.MEDIUM} />
              <span>문의가 해결되었습니다. 추가 문의 시 자동으로 다시 접수됩니다.</span>
            </div>
          )}

          {/* 답변 입력 */}
          {inquiryDetail.status !== 'closed' ? (
            <form className="inquiry-reply-form" onSubmit={handleSubmitMessage}>
              <textarea
                className="inquiry-reply-input"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={inquiryDetail.status === 'resolved' ? '추가 문의가 있으시면 입력하세요...' : '추가 문의 내용을 입력하세요...'}
                onKeyDown={handleMessageKeyDown}
                onDragOver={handleDragOver}
                onDrop={(e) => handleFileDrop(e, true)}
              />
              {/* 첨부파일 프리뷰 */}
              {messageFiles.length > 0 && (
                <div className="inquiry-reply-file-previews">
                  {messageFiles.map((file, index) => {
                    const isImage = file.type.startsWith('image/');
                    return (
                      <div key={index} className={`inquiry-reply-file-item ${isImage ? 'inquiry-reply-file-item--image' : ''}`}>
                        {isImage ? (
                          <img
                            src={URL.createObjectURL(file)}
                            alt={file.name}
                            className="inquiry-reply-file-thumbnail"
                            onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)}
                          />
                        ) : (
                          <span className="inquiry-reply-file-name">{file.name}</span>
                        )}
                        <button
                          type="button"
                          className="inquiry-reply-file-remove"
                          onClick={() => handleRemoveFile(index, true)}
                          title="파일 삭제"
                          aria-label="파일 삭제"
                        >
                          <SFSymbol name="xmark" size={SFSymbolSize.CAPTION_2} weight={SFSymbolWeight.MEDIUM} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="inquiry-reply-actions">
                <div className="inquiry-reply-buttons">
                  <Tooltip content="파일 첨부">
                    <button
                      type="button"
                      className="inquiry-attach-btn"
                      onClick={() => messageFileInputRef.current?.click()}
                      aria-label="파일 첨부"
                    >
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                      </svg>
                    </button>
                  </Tooltip>
                  <input
                    ref={messageFileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.pdf,.doc,.docx"
                    onChange={(e) => handleFileSelect(e, true)}
                    className="visually-hidden"
                    aria-label="첨부파일 선택"
                  />
                  <Tooltip content="전송">
                    <button
                      type="submit"
                      className="inquiry-send-btn"
                      disabled={addMessageMutation.isPending || !newMessage.trim()}
                      aria-label="전송"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                      </svg>
                    </button>
                  </Tooltip>
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
    <span className="menu-icon-purple">
      <SFSymbol name="bubble-left-fill" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} />
    </span>
  );

  return (
    <>
      <CenterPaneView
        visible={visible}
        suppressAutoBackButton
        title={getTitle()}
        titleIcon={inquiryIcon}
        titleAccessory={inquiryBackButton}
        onClose={onClose}
      >
        {viewMode === 'list' && renderListContent()}
        {viewMode === 'create' && renderCreateContent()}
        {viewMode === 'detail' && renderDetailContent()}
      </CenterPaneView>

      {/* 이미지 미리보기 모달 */}
      {previewImage && (
        <div
          className="inquiry-image-preview-modal"
          onClick={closePreview}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* 상단 툴바 - 화면에 고정 */}
          <div className="inquiry-image-preview-modal__toolbar" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setZoom(prev => Math.max(MIN_ZOOM, prev - ZOOM_STEP))} title="축소">−</button>
            <span className="zoom-level">{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom(prev => Math.min(MAX_ZOOM, prev + ZOOM_STEP))} title="확대">+</button>
            <span className="divider" />
            <button type="button" className="reset-btn" onClick={handleDoubleClick}>리셋</button>
            <button type="button" className="close-btn" onClick={closePreview} title="닫기">✕</button>
          </div>

          {/* 이미지 콘텐츠 */}
          <div
            className={`inquiry-image-preview-modal__content ${isDragging ? 'inquiry-image-preview-modal__content--dragging' : ''}`}
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
          <div className="inquiry-image-preview-modal__hint">
            스크롤: 확대/축소 | 드래그: 이동 | 더블클릭: 원래 크기
          </div>
        </div>
      )}
    </>
  );
}

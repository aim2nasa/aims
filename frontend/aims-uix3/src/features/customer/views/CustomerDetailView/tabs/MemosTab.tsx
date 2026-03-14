/**
 * AIMS UIX-3 Customer Detail - Memos Tab
 * @since 2025-12-10
 * @version 3.0.0 - customer_memos 컬렉션 기반 카드형 UI
 *
 * 고객 메모 탭
 * - useMemoController를 통한 customer_memos 컬렉션 CRUD
 * - 날짜별 그룹핑, 시간 라벨, 카드형 UI
 * - 더보기(⋯) 메뉴 → 수정/삭제
 * - Enter = 줄바꿈, Ctrl+Enter = 저장
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { Customer } from '@/entities/customer/model';
import type { CustomerMemo } from '@/entities/customer/model';
import { useMemoController } from '@/features/customer/controllers/useMemoController';
import { useAppleConfirmController } from '@/controllers/useAppleConfirmController';
import { AppleConfirmModal } from '@/components/DocumentViews/DocumentRegistrationView/AppleConfirmModal/AppleConfirmModal';
import SFSymbol, {
  SFSymbolSize,
  SFSymbolWeight,
} from '../../../../../components/SFSymbol';
import { formatDate, formatTime } from '@/shared/lib/timeUtils';
import './MemosTab.css';

interface MemosTabProps {
  customer: Customer;
}

/**
 * 메모를 날짜별로 그룹핑
 * created_at 기준, KST 날짜로 그룹화
 */
function groupMemosByDate(memos: CustomerMemo[]): Map<string, CustomerMemo[]> {
  const groups = new Map<string, CustomerMemo[]>();

  for (const memo of memos) {
    const dateKey = formatDate(memo.created_at); // "YYYY.MM.DD" (KST)
    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey)!.push(memo);
  }

  return groups;
}

/**
 * 시간만 추출 (HH:mm)
 */
function getTimeLabel(timestamp: string): string {
  const fullTime = formatTime(timestamp); // "HH:mm:ss"
  return fullTime.substring(0, 5); // "HH:mm"
}

/**
 * 날짜 축약 (MM.DD)
 */
function getShortDate(dateKey: string): string {
  // "YYYY.MM.DD" → "MM.DD"
  return dateKey.substring(5);
}

export const MemosTab: React.FC<MemosTabProps> = ({ customer }) => {
  // 컨트롤러
  const {
    memos,
    isLoading,
    isSaving,
    error,
    createMemo,
    updateMemo,
    deleteMemo,
    clearError,
  } = useMemoController(customer._id);

  // 삭제 확인 모달
  const confirmController = useAppleConfirmController();

  // 입력 상태
  const [inputValue, setInputValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 수정 상태
  const [editingMemoId, setEditingMemoId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  // 더보기 메뉴 상태
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // 고객 전환 시 로컬 상태 초기화
  useEffect(() => {
    setInputValue('');
    setEditingMemoId(null);
    setEditValue('');
    setOpenMenuId(null);
  }, [customer._id]);

  // 더보기 메뉴 외부 클릭 시 닫기
  useEffect(() => {
    if (!openMenuId) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openMenuId]);

  // 수정 모드 진입 시 포커스
  useEffect(() => {
    if (editingMemoId && editTextareaRef.current) {
      editTextareaRef.current.focus();
      // 커서를 끝으로 이동
      const len = editTextareaRef.current.value.length;
      editTextareaRef.current.setSelectionRange(len, len);
    }
  }, [editingMemoId]);

  // 날짜별 그룹핑 (memos는 이미 최신순 정렬)
  const groupedMemos = useMemo(() => groupMemosByDate(memos), [memos]);

  // 메모 추가
  const handleCreate = useCallback(async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isSaving) return;

    const success = await createMemo(trimmed);
    if (success) {
      setInputValue('');
    }
  }, [inputValue, isSaving, createMemo]);

  // 입력 영역 키보드 핸들러
  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleCreate();
    }
  }, [handleCreate]);

  // 수정 시작
  const handleEditStart = useCallback((memo: CustomerMemo) => {
    setEditingMemoId(memo._id);
    setEditValue(memo.content);
    setOpenMenuId(null);
  }, []);

  // 수정 저장
  const handleEditSave = useCallback(async () => {
    if (!editingMemoId) return;

    const trimmed = editValue.trim();
    if (!trimmed || isSaving) return;

    const success = await updateMemo(editingMemoId, trimmed);
    if (success) {
      setEditingMemoId(null);
      setEditValue('');
    }
  }, [editingMemoId, editValue, isSaving, updateMemo]);

  // 수정 취소
  const handleEditCancel = useCallback(() => {
    setEditingMemoId(null);
    setEditValue('');
  }, []);

  // 수정 키보드 핸들러
  const handleEditKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleEditSave();
    } else if (e.key === 'Escape') {
      handleEditCancel();
    }
  }, [handleEditSave, handleEditCancel]);

  // 삭제
  const handleDelete = useCallback(async (memo: CustomerMemo) => {
    setOpenMenuId(null);

    const contentPreview = memo.content.length > 30
      ? memo.content.substring(0, 30) + '...'
      : memo.content;

    const confirmed = await confirmController.actions.openModal({
      title: '메모 삭제',
      message: `이 메모를 삭제하시겠습니까?\n\n"${contentPreview}"`,
      confirmText: '삭제',
      confirmStyle: 'destructive',
      showCancel: true,
    });

    if (confirmed) {
      await deleteMemo(memo._id);
    }
  }, [confirmController.actions, deleteMemo]);

  // 더보기 메뉴 토글
  const handleMenuToggle = useCallback((memoId: string) => {
    setOpenMenuId(prev => prev === memoId ? null : memoId);
  }, []);

  return (
    <div className="memo-tab">
      {/* 헤더 */}
      <div className="memo-tab__header">
        <div className="memo-tab__title">
          <SFSymbol
            name="note.text"
            size={SFSymbolSize.CAPTION_1}
            weight={SFSymbolWeight.REGULAR}
          />
          <span>메모</span>
        </div>
      </div>

      {/* 입력 영역 - 항상 열려있음 */}
      <div className="memo-input">
        <textarea
          ref={textareaRef}
          className="memo-input__textarea"
          placeholder="전화 상담 후 메모를 남겨보세요... (Ctrl+Enter로 저장)"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleInputKeyDown}
          disabled={isSaving}
          rows={2}
        />
        {inputValue.trim().length > 0 && (
          <button
            type="button"
            className="memo-input__save"
            onClick={handleCreate}
            disabled={isSaving}
          >
            {isSaving ? '저장 중...' : '저장'}
          </button>
        )}
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div className="memo-tab__error" onClick={clearError}>
          {error}
        </div>
      )}

      {/* 메모 리스트 */}
      <div className="memo-list">
        {isLoading ? (
          <div className="memo-tab__empty">불러오는 중...</div>
        ) : memos.length === 0 ? (
          <div className="memo-tab__empty">전화 상담 후 메모를 남겨보세요</div>
        ) : (
          Array.from(groupedMemos.entries()).map(([dateKey, dateMemos]) => (
            <div key={dateKey} className="memo-date-group">
              {/* 날짜 구분선 */}
              <div className="memo-date-header">
                <span className="memo-date-header__text">{dateKey}</span>
                <span className="memo-date-header__line" />
              </div>

              {/* 해당 날짜의 메모들 */}
              {dateMemos.map((memo) => (
                <div key={memo._id} className="memo-card">
                  {/* 시간 라벨 */}
                  <span
                    className="memo-card__time"
                    data-date={getShortDate(dateKey)}
                  >
                    {getTimeLabel(memo.created_at)}
                  </span>

                  {/* 메모 내용 */}
                  <div className="memo-card__body">
                    {editingMemoId === memo._id ? (
                      /* 수정 모드 */
                      <div className="memo-card__edit">
                        <textarea
                          ref={editTextareaRef}
                          className="memo-card__edit-textarea"
                          placeholder="메모 내용을 입력하세요"
                          aria-label="메모 수정"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={handleEditKeyDown}
                          disabled={isSaving}
                          rows={2}
                        />
                        <div className="memo-card__edit-actions">
                          <button
                            type="button"
                            className="memo-card__edit-cancel"
                            onClick={handleEditCancel}
                            disabled={isSaving}
                          >
                            취소
                          </button>
                          <button
                            type="button"
                            className="memo-card__edit-save"
                            onClick={handleEditSave}
                            disabled={isSaving || editValue.trim().length === 0}
                          >
                            {isSaving ? '저장 중...' : '저장'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* 표시 모드 */
                      <p className="memo-card__content">{memo.content}</p>
                    )}
                  </div>

                  {/* 더보기 메뉴 */}
                  {editingMemoId !== memo._id && (
                    <div className="memo-card__more-wrapper">
                      <button
                        type="button"
                        className="memo-card__more"
                        onClick={() => handleMenuToggle(memo._id)}
                        aria-label="메모 더보기 메뉴"
                      >
                        &#x22EF;
                      </button>

                      {openMenuId === memo._id && (
                        <div ref={menuRef} className="memo-card__menu">
                          <button
                            type="button"
                            className="memo-card__menu-item"
                            onClick={() => handleEditStart(memo)}
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            className="memo-card__menu-item memo-card__menu-item--destructive"
                            onClick={() => handleDelete(memo)}
                          >
                            삭제
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* 삭제 확인 모달 */}
      <AppleConfirmModal
        state={confirmController.state}
        actions={confirmController.actions}
      />
    </div>
  );
};

export default MemosTab;

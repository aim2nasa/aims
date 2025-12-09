/**
 * AIMS UIX-3 Customer Detail - Memos Tab
 * @since 2025-12-10
 * @version 1.0.0
 *
 * 고객 메모 탭
 * - 메모 목록 표시
 * - 메모 추가/수정/삭제
 */

import React, { useState, useCallback, useEffect } from 'react';
import type { Customer, CustomerMemo } from '@/entities/customer/model';
import { useMemoController } from '@/features/customer/controllers/useMemoController';
import { formatDateTime } from '@/shared/lib/timeUtils';
import SFSymbol, {
  SFSymbolSize,
  SFSymbolWeight,
} from '../../../../../components/SFSymbol';
import { useAppleConfirmController } from '@/controllers/useAppleConfirmController';
import { AppleConfirmModal } from '../../../../../components/DocumentViews/DocumentRegistrationView/AppleConfirmModal/AppleConfirmModal';
import './MemosTab.css';

interface MemosTabProps {
  customer: Customer;
  onMemoCountChange?: (count: number) => void;
}

export const MemosTab: React.FC<MemosTabProps> = ({
  customer,
  onMemoCountChange,
}) => {
  const confirmController = useAppleConfirmController();
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

  // 새 메모 입력 상태
  const [newMemoContent, setNewMemoContent] = useState('');
  // 수정 중인 메모 상태
  const [editingMemoId, setEditingMemoId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');

  // 메모 개수 변경 시 부모에게 알림
  useEffect(() => {
    onMemoCountChange?.(memos.length);
  }, [memos.length, onMemoCountChange]);

  /**
   * 새 메모 추가
   */
  const handleCreateMemo = useCallback(async () => {
    if (!newMemoContent.trim()) return;

    const success = await createMemo(newMemoContent);
    if (success) {
      setNewMemoContent('');
    }
  }, [newMemoContent, createMemo]);

  /**
   * Enter 키로 메모 추가
   */
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleCreateMemo();
    }
  }, [handleCreateMemo]);

  /**
   * 메모 수정 시작
   */
  const handleStartEdit = useCallback((memo: CustomerMemo) => {
    setEditingMemoId(memo._id);
    setEditingContent(memo.content);
  }, []);

  /**
   * 메모 수정 취소
   */
  const handleCancelEdit = useCallback(() => {
    setEditingMemoId(null);
    setEditingContent('');
  }, []);

  /**
   * 메모 수정 저장
   */
  const handleSaveEdit = useCallback(async () => {
    if (!editingMemoId || !editingContent.trim()) return;

    const success = await updateMemo(editingMemoId, editingContent);
    if (success) {
      setEditingMemoId(null);
      setEditingContent('');
    }
  }, [editingMemoId, editingContent, updateMemo]);

  /**
   * 메모 삭제
   */
  const handleDelete = useCallback(async (memoId: string) => {
    const confirmed = await confirmController.actions.openModal({
      title: '메모 삭제',
      message: '선택한 메모를 삭제하시겠습니까?',
      confirmText: '삭제',
      cancelText: '취소',
      confirmStyle: 'destructive',
      showCancel: true,
      iconType: 'warning',
    });

    if (!confirmed) return;

    await deleteMemo(memoId);
  }, [confirmController.actions, deleteMemo]);

  // 로딩 상태
  if (isLoading) {
    return (
      <div className="memos-state">
        <SFSymbol
          name="arrow.trianglehead.2.clockwise"
          size={SFSymbolSize.Body}
          weight={SFSymbolWeight.Regular}
          className="memos-state__spinner"
        />
        <span>메모 불러오는 중...</span>
      </div>
    );
  }

  // 에러 상태
  if (error) {
    return (
      <div className="memos-state memos-state--error">
        <SFSymbol
          name="exclamationmark.triangle"
          size={SFSymbolSize.Body}
          weight={SFSymbolWeight.Regular}
        />
        <span>{error}</span>
        <button type="button" className="memos-retry" onClick={clearError}>
          닫기
        </button>
      </div>
    );
  }

  return (
    <div className="memos-tab">
      {/* 헤더 */}
      <div className="memos-header">
        <div className="memos-header__title">
          <SFSymbol
            name="note.text"
            size={SFSymbolSize.Body}
            weight={SFSymbolWeight.Regular}
          />
          <span>메모</span>
          {memos.length > 0 && (
            <span className="memos-header__count">{memos.length}</span>
          )}
        </div>
      </div>

      {/* 새 메모 입력 */}
      <div className="memos-input">
        <textarea
          className="memos-input__textarea"
          placeholder="메모를 입력하세요... (Enter로 저장)"
          title="새 메모 입력"
          value={newMemoContent}
          onChange={(e) => setNewMemoContent(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSaving}
          rows={2}
        />
        <button
          type="button"
          className="memos-input__button"
          onClick={handleCreateMemo}
          disabled={!newMemoContent.trim() || isSaving}
        >
          {isSaving ? '저장 중...' : '추가'}
        </button>
      </div>

      {/* 메모 목록 */}
      {memos.length === 0 ? (
        <div className="memos-state memos-state--empty">
          <SFSymbol
            name="note.text"
            size={SFSymbolSize.Body}
            weight={SFSymbolWeight.Regular}
          />
          <span>등록된 메모가 없습니다</span>
        </div>
      ) : (
        <div className="memos-list">
          {memos.map((memo) => (
            <div key={memo._id} className="memos-item">
              {editingMemoId === memo._id ? (
                /* 수정 모드 */
                <div className="memos-item__edit">
                  <textarea
                    className="memos-item__edit-textarea"
                    title="메모 수정"
                    value={editingContent}
                    onChange={(e) => setEditingContent(e.target.value)}
                    autoFocus
                    rows={3}
                  />
                  <div className="memos-item__edit-actions">
                    <button
                      type="button"
                      className="memos-item__edit-button memos-item__edit-button--save"
                      onClick={handleSaveEdit}
                      disabled={!editingContent.trim() || isSaving}
                    >
                      저장
                    </button>
                    <button
                      type="button"
                      className="memos-item__edit-button memos-item__edit-button--cancel"
                      onClick={handleCancelEdit}
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                /* 보기 모드 */
                <>
                  <div className="memos-item__content">{memo.content}</div>
                  <div className="memos-item__footer">
                    <span className="memos-item__date">
                      {formatDateTime(memo.created_at)}
                      {memo.updated_at && memo.updated_at !== memo.created_at && (
                        <span className="memos-item__edited"> (수정됨)</span>
                      )}
                    </span>
                    {memo.is_mine && (
                      <div className="memos-item__actions">
                        <button
                          type="button"
                          className="memos-item__action"
                          onClick={() => handleStartEdit(memo)}
                          title="수정"
                        >
                          <SFSymbol
                            name="pencil"
                            size={SFSymbolSize.Caption1}
                            weight={SFSymbolWeight.Regular}
                          />
                        </button>
                        <button
                          type="button"
                          className="memos-item__action memos-item__action--danger"
                          onClick={() => handleDelete(memo._id)}
                          title="삭제"
                        >
                          <SFSymbol
                            name="trash"
                            size={SFSymbolSize.Caption1}
                            weight={SFSymbolWeight.Regular}
                          />
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 확인 모달 */}
      <AppleConfirmModal
        state={confirmController.state}
        actions={confirmController.actions}
      />
    </div>
  );
};

export default MemosTab;

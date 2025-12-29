/**
 * 문서 유형 관리 페이지
 * @since 2025-12-29
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '@/shared/hooks/useDebounce';
import {
  documentTypesApi,
  type DocumentType,
} from '@/features/document-types/api';
import { Button } from '@/shared/ui/Button/Button';
import { Modal } from '@/shared/ui/Modal/Modal';
import './DocumentTypesPage.css';

interface DocumentTypeFormData {
  value: string;
  label: string;
  description: string;
}

const initialFormData: DocumentTypeFormData = {
  value: '',
  label: '',
  description: '',
};

export const DocumentTypesPage = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<DocumentType | null>(null);
  const [formData, setFormData] = useState<DocumentTypeFormData>(initialFormData);

  const debouncedSearch = useDebounce(search, 300);

  // 문서 유형 목록 조회
  const { data: documentTypes, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'document-types', debouncedSearch],
    queryFn: () =>
      documentTypesApi.getDocumentTypes({
        search: debouncedSearch || undefined,
      }),
  });

  // 문서 유형 생성
  const createMutation = useMutation({
    mutationFn: documentTypesApi.createDocumentType,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'document-types'] });
      closeModal();
    },
  });

  // 문서 유형 수정
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<DocumentTypeFormData> }) =>
      documentTypesApi.updateDocumentType(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'document-types'] });
      closeModal();
    },
  });

  // 문서 유형 삭제
  const deleteMutation = useMutation({
    mutationFn: documentTypesApi.deleteDocumentType,
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'document-types'] });
      if (response.affectedDocuments > 0) {
        alert(`삭제 완료: ${response.affectedDocuments}개 문서가 "미지정"으로 변경되었습니다.`);
      }
    },
  });

  const openCreateModal = () => {
    setEditingType(null);
    setFormData(initialFormData);
    setIsModalOpen(true);
  };

  const openEditModal = (docType: DocumentType) => {
    setEditingType(docType);
    setFormData({
      value: docType.value,
      label: docType.label,
      description: docType.description || '',
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingType(null);
    setFormData(initialFormData);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.label.trim()) {
      alert('유형 이름을 입력해주세요.');
      return;
    }

    if (editingType) {
      // 수정 시 value는 변경하지 않음
      updateMutation.mutate({
        id: editingType._id,
        data: {
          label: formData.label,
          description: formData.description,
        },
      });
    } else {
      if (!formData.value.trim()) {
        alert('유형 코드를 입력해주세요.');
        return;
      }
      const valueRegex = /^[a-z0-9_]+$/;
      if (!valueRegex.test(formData.value.trim())) {
        alert('유형 코드는 영문 소문자, 숫자, 언더스코어(_)만 사용할 수 있습니다.');
        return;
      }
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (docType: DocumentType) => {
    if (docType.isSystem) {
      alert('시스템 기본 유형은 삭제할 수 없습니다.');
      return;
    }

    const warningMessage = docType.documentCount && docType.documentCount > 0
      ? `"${docType.label}" 유형을 삭제하시겠습니까?\n\n이 유형을 사용하는 ${docType.documentCount}개 문서가 "미지정"으로 변경됩니다.`
      : `"${docType.label}" 유형을 삭제하시겠습니까?`;

    if (window.confirm(warningMessage)) {
      deleteMutation.mutate(docType._id);
    }
  };

  if (isLoading) {
    return <div className="document-types-page__loading">데이터를 불러오는 중...</div>;
  }

  if (isError) {
    return (
      <div className="document-types-page__error">
        <p>데이터를 불러오는데 실패했습니다.</p>
        <p>{error instanceof Error ? error.message : '알 수 없는 오류'}</p>
        <Button onClick={() => refetch()}>다시 시도</Button>
      </div>
    );
  }

  return (
    <div className="document-types-page">
      <div className="document-types-page__header">
        <div>
          <h1 className="document-types-page__title">문서 유형 관리</h1>
          <p className="document-types-page__subtitle">
            모든 사용자가 공유하는 문서 분류 유형을 관리합니다
          </p>
        </div>
        <div className="document-types-page__actions">
          <Button onClick={openCreateModal}>새 유형 추가</Button>
          <span className="document-types-page__count">총 {documentTypes?.length || 0}개</span>
        </div>
      </div>

      <div className="document-types-page__filters">
        <input
          type="text"
          className="document-types-page__search"
          placeholder="유형 코드, 이름, 설명 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="document-types-page__table-container">
        <table className="document-types-page__table">
          <thead>
            <tr>
              <th style={{ width: '60px' }}>순서</th>
              <th style={{ width: '140px' }}>유형 코드</th>
              <th style={{ width: '140px' }}>유형 이름</th>
              <th>설명</th>
              <th style={{ width: '100px' }}>사용 문서</th>
              <th style={{ width: '80px' }}>시스템</th>
              <th style={{ width: '120px' }}>액션</th>
            </tr>
          </thead>
          <tbody>
            {documentTypes?.sort((a, b) => a.order - b.order).map((docType) => (
              <tr key={docType._id} className={docType.isSystem ? 'document-types-page__row--system' : ''}>
                <td className="document-types-page__order">{docType.order}</td>
                <td className="document-types-page__value">
                  <code>{docType.value}</code>
                </td>
                <td className="document-types-page__label">{docType.label}</td>
                <td className="document-types-page__description">{docType.description || '-'}</td>
                <td className="document-types-page__count-cell">
                  {docType.documentCount || 0}
                </td>
                <td>
                  {docType.isSystem ? (
                    <span className="document-types-page__badge document-types-page__badge--system">
                      시스템
                    </span>
                  ) : (
                    <span className="document-types-page__badge document-types-page__badge--custom">
                      사용자
                    </span>
                  )}
                </td>
                <td>
                  <div className="document-types-page__action-buttons">
                    <button
                      className="document-types-page__action-btn document-types-page__action-btn--edit"
                      onClick={() => openEditModal(docType)}
                    >
                      수정
                    </button>
                    {!docType.isSystem && (
                      <button
                        className="document-types-page__action-btn document-types-page__action-btn--delete"
                        onClick={() => handleDelete(docType)}
                        disabled={deleteMutation.isPending}
                      >
                        삭제
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {documentTypes?.length === 0 && (
          <div className="document-types-page__empty">
            문서 유형이 없습니다.
          </div>
        )}
      </div>

      {/* 문서 유형 생성/수정 모달 */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingType ? '문서 유형 수정' : '새 문서 유형'}
        size="md"
      >
        <form onSubmit={handleSubmit} className="document-types-page__form">
          <div className="document-types-page__form-row">
            <label className="document-types-page__form-label">
              유형 코드 <span className="document-types-page__form-required">*</span>
            </label>
            <input
              type="text"
              className="document-types-page__form-input"
              value={formData.value}
              onChange={(e) => setFormData({ ...formData, value: e.target.value.toLowerCase() })}
              placeholder="영문 소문자, 숫자, 언더스코어 (예: custom_type)"
              disabled={!!editingType} // 수정 시 코드 변경 불가
            />
            {editingType && (
              <span className="document-types-page__form-hint">
                유형 코드는 변경할 수 없습니다
              </span>
            )}
          </div>

          <div className="document-types-page__form-row">
            <label className="document-types-page__form-label">
              유형 이름 <span className="document-types-page__form-required">*</span>
            </label>
            <input
              type="text"
              className="document-types-page__form-input"
              value={formData.label}
              onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              placeholder="사용자에게 표시될 이름 (예: 사용자 정의 문서)"
            />
          </div>

          <div className="document-types-page__form-row">
            <label className="document-types-page__form-label">설명</label>
            <textarea
              className="document-types-page__form-textarea"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="문서 유형에 대한 설명 (선택사항)"
              rows={3}
            />
          </div>

          <div className="document-types-page__form-actions">
            <Button type="button" variant="secondary" onClick={closeModal}>
              취소
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {editingType ? '수정' : '등록'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default DocumentTypesPage;

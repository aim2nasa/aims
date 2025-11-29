/**
 * QuickFamilyAssignPanel Component
 * @since 2025-11-29
 * @version 1.0.0
 *
 * 빠른 가족 등록 패널
 * - 가족관계 미설정 고객 선택 시 표시
 * - 후보 고객 검색 및 선택
 * - 관계 유형 선택 및 등록
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { RelationshipService, type CreateRelationshipData } from '@/services/relationshipService';
import { useCustomerDocument } from '@/hooks/useCustomerDocument';
import type { Customer } from '@/entities/customer/model';
import Button from '@/shared/ui/Button';
import './QuickFamilyAssignPanel.css';

interface QuickFamilyAssignPanelProps {
  /** 선택된 가족관계 미설정 고객 */
  customer: Customer;
  /** 등록 완료 시 콜백 */
  onComplete: () => void;
  /** 패널 닫기 */
  onClose: () => void;
}

/** 가족 관계 유형 */
const FAMILY_RELATIONSHIP_TYPES = [
  { value: 'spouse', label: '배우자', icon: '❤️', description: '결혼 관계' },
  { value: 'parent', label: '부모', icon: '👨‍👩', description: '상위 세대' },
  { value: 'child', label: '자녀', icon: '👶', description: '하위 세대' },
];

/**
 * QuickFamilyAssignPanel - 빠른 가족 등록 패널
 */
export const QuickFamilyAssignPanel: React.FC<QuickFamilyAssignPanelProps> = ({
  customer,
  onComplete,
  onClose,
}) => {
  // Document에서 고객 목록 가져오기
  const { customers: allCustomers } = useCustomerDocument();

  // 상태 관리
  const [familyCustomerIds, setFamilyCustomerIds] = useState<Set<string>>(new Set());
  const [selectedCandidate, setSelectedCandidate] = useState<Customer | null>(null);
  const [relationshipType, setRelationshipType] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [candidatesLoading, setCandidatesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 이미 가족 관계가 있는 고객 ID 로드
  useEffect(() => {
    const loadFamilyCustomers = async () => {
      setCandidatesLoading(true);
      try {
        const { relationships } = await RelationshipService.getAllRelationshipsWithCustomers();

        const familyIds = new Set<string>();
        relationships.forEach(rel => {
          if (rel.relationship_info?.relationship_category === 'family') {
            // from_customer ID 추가
            if (typeof rel.from_customer === 'string') {
              familyIds.add(rel.from_customer);
            } else if (rel.from_customer && typeof rel.from_customer === 'object' && '_id' in rel.from_customer) {
              familyIds.add(rel.from_customer._id);
            }
            // to_customer ID 추가
            if (typeof rel.related_customer === 'string') {
              familyIds.add(rel.related_customer);
            } else if (rel.related_customer && typeof rel.related_customer === 'object' && '_id' in rel.related_customer) {
              familyIds.add(rel.related_customer._id);
            }
          }
        });

        setFamilyCustomerIds(familyIds);
      } catch (err) {
        console.error('[QuickFamilyAssignPanel] 가족 관계 로드 실패:', err);
        setError('후보 목록을 불러오는데 실패했습니다.');
      } finally {
        setCandidatesLoading(false);
      }
    };

    loadFamilyCustomers();
  }, []);

  // 후보 고객 필터링
  const candidates = useMemo(() => {
    return allCustomers.filter(c => {
      // 자기 자신 제외
      if (c._id === customer._id) return false;
      // 개인 고객만
      if (c.insurance_info?.customer_type !== '개인') return false;
      // 이미 가족 관계가 있는 고객 제외
      if (familyCustomerIds.has(c._id)) return false;
      // 검색어 필터
      if (searchQuery) {
        const name = c.personal_info?.name || '';
        return name.toLowerCase().includes(searchQuery.toLowerCase());
      }
      return true;
    });
  }, [allCustomers, customer._id, familyCustomerIds, searchQuery]);

  // 관계 유형 라벨 가져오기
  const getRelationshipLabel = useCallback((type: string): string => {
    const found = FAMILY_RELATIONSHIP_TYPES.find(t => t.value === type);
    return found?.label || type;
  }, []);

  // 관계 등록
  const handleSubmit = useCallback(async () => {
    if (!selectedCandidate || !relationshipType) return;

    setLoading(true);
    setError(null);

    try {
      const relationshipData: CreateRelationshipData = {
        relationship_type: relationshipType,
        relationship_category: 'family',
        strength: 'strong',
        relationship_details: {
          description: `가족 관계 - ${getRelationshipLabel(relationshipType)}`,
          contact_frequency: 'weekly',
          influence_level: 'high',
        },
        insurance_relevance: {
          is_beneficiary: false,
          cross_selling_opportunity: true,
          referral_potential: 'high',
        },
      };

      await RelationshipService.createRelationship(
        customer._id,
        selectedCandidate._id,
        relationshipData
      );

      // 성공 시 이벤트 발생 (트리 자동 새로고침)
      window.dispatchEvent(new CustomEvent('relationshipChanged'));
      onComplete();
    } catch (err) {
      console.error('[QuickFamilyAssignPanel] 가족 관계 등록 실패:', err);
      setError('가족 관계 등록에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  }, [customer._id, selectedCandidate, relationshipType, getRelationshipLabel, onComplete]);

  // 후보 선택
  const handleCandidateSelect = useCallback((candidate: Customer) => {
    setSelectedCandidate(candidate);
    setRelationshipType(null); // 관계 유형 초기화
    setError(null);
  }, []);

  // 후보 선택 취소
  const handleCandidateDeselect = useCallback(() => {
    setSelectedCandidate(null);
    setRelationshipType(null);
    setError(null);
  }, []);

  return (
    <div className="quick-family-assign-panel">
      {/* 헤더 */}
      <div className="quick-family-assign-panel__header">
        <h3 className="quick-family-assign-panel__title">빠른 가족 등록</h3>
        <button
          type="button"
          className="quick-family-assign-panel__close"
          onClick={onClose}
          aria-label="패널 닫기"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
          </svg>
        </button>
      </div>

      {/* 선택된 고객 정보 */}
      <div className="quick-family-assign-panel__selected-customer">
        <span className="quick-family-assign-panel__label">선택된 고객</span>
        <span className="quick-family-assign-panel__customer-name">
          {customer.personal_info?.name || '이름없음'}
        </span>
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div className="quick-family-assign-panel__error">
          {error}
        </div>
      )}

      {/* 후보 선택 상태에 따른 UI */}
      {!selectedCandidate ? (
        <>
          {/* 검색 */}
          <div className="quick-family-assign-panel__search">
            <input
              type="text"
              placeholder="후보 고객 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="quick-family-assign-panel__search-input"
              aria-label="후보 고객 검색"
            />
            {searchQuery && (
              <button
                type="button"
                className="quick-family-assign-panel__search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="검색어 지우기"
              >
                ×
              </button>
            )}
          </div>

          {/* 후보 목록 */}
          <div className="quick-family-assign-panel__candidates">
            <span className="quick-family-assign-panel__label">
              후보 고객 ({candidates.length}명)
            </span>
            {candidatesLoading ? (
              <div className="quick-family-assign-panel__loading">
                로딩 중...
              </div>
            ) : candidates.length === 0 ? (
              <div className="quick-family-assign-panel__empty">
                {searchQuery
                  ? '검색 결과가 없습니다.'
                  : '등록 가능한 후보 고객이 없습니다.'}
              </div>
            ) : (
              <ul className="quick-family-assign-panel__candidate-list">
                {candidates.slice(0, 50).map((candidate) => (
                  <li
                    key={candidate._id}
                    className="quick-family-assign-panel__candidate-item"
                    onClick={() => handleCandidateSelect(candidate)}
                  >
                    <span className="quick-family-assign-panel__candidate-icon">
                      <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                        <circle cx="10" cy="10" r="10" opacity="0.15" />
                        <circle cx="10" cy="7" r="3" />
                        <path d="M10 11c-3 0-5 2-5 4v2h10v-2c0-2-2-4-5-4z" />
                      </svg>
                    </span>
                    <span className="quick-family-assign-panel__candidate-name">
                      {candidate.personal_info?.name || '이름없음'}
                    </span>
                  </li>
                ))}
                {candidates.length > 50 && (
                  <li className="quick-family-assign-panel__more">
                    +{candidates.length - 50}명 더 있음 (검색으로 찾아주세요)
                  </li>
                )}
              </ul>
            )}
          </div>
        </>
      ) : (
        <>
          {/* 선택된 후보 */}
          <div className="quick-family-assign-panel__selected-candidate">
            <span className="quick-family-assign-panel__label">가족으로 등록할 고객</span>
            <div className="quick-family-assign-panel__selected-candidate-info">
              <span className="quick-family-assign-panel__candidate-name--selected">
                {selectedCandidate.personal_info?.name || '이름없음'}
              </span>
              <button
                type="button"
                className="quick-family-assign-panel__change-btn"
                onClick={handleCandidateDeselect}
              >
                변경
              </button>
            </div>
          </div>

          {/* 관계 유형 선택 */}
          <div className="quick-family-assign-panel__relationship-types">
            <span className="quick-family-assign-panel__label">관계 유형</span>
            <div className="quick-family-assign-panel__type-buttons">
              {FAMILY_RELATIONSHIP_TYPES.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  className={`quick-family-assign-panel__type-btn ${
                    relationshipType === type.value ? 'selected' : ''
                  }`}
                  onClick={() => setRelationshipType(type.value)}
                >
                  <span className="quick-family-assign-panel__type-icon">{type.icon}</span>
                  <span className="quick-family-assign-panel__type-label">{type.label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* 액션 버튼 */}
      <div className="quick-family-assign-panel__actions">
        <Button variant="ghost" onClick={onClose} disabled={loading}>
          취소
        </Button>
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={!selectedCandidate || !relationshipType || loading}
        >
          {loading ? '등록 중...' : '등록'}
        </Button>
      </div>
    </div>
  );
};

export default QuickFamilyAssignPanel;

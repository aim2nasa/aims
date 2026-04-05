/**
 * QuickFamilyAssignPanel Component
 * @since 2025-11-29
 * @version 2.0.0
 *
 * 빠른 가족 등록 패널 (CustomerSelectorModal 스타일 UI 임베드)
 * - 검색, 초성 필터, 정렬 가능한 테이블 UI
 * - 가족관계 미설정 고객만 표시
 * - 관계 유형 선택 및 등록
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { RelationshipService, type CreateRelationshipData, type Relationship } from '@/services/relationshipService';
import { CustomerService } from '@/services/customerService';
import { CustomerUtils, type Customer } from '@/entities/customer/model';
import Button from '@/shared/ui/Button';
import { SFSymbol } from '../../../SFSymbol/SFSymbol';
import { SFSymbolSize, SFSymbolWeight } from '../../../SFSymbol/SFSymbol.types';
import { formatDate } from '@/shared/lib/timeUtils';
import { errorReporter } from '@/shared/lib/errorReporter';
import { SortIndicator } from '@/shared/ui/SortIndicator';
import './QuickFamilyAssignPanel.css';

/** 패널 모드 */
type PanelMode = 'family' | 'corporate';

interface QuickFamilyAssignPanelProps {
  /** 선택된 고객 (가족관계 미설정 개인 또는 관계자 미설정 법인) */
  customer: Customer;
  /** 등록 완료 시 콜백 */
  onComplete: () => void;
  /** 패널 닫기 */
  onClose: () => void;
  /** 패널 모드: 가족 등록 또는 법인 구성원 등록 */
  mode?: PanelMode;
  /** 📊 부모 뷰에서 이미 로드한 고객 목록 (중복 API 호출 방지) */
  initialCustomers?: Customer[];
  /** 📊 부모 뷰에서 이미 로드한 관계 데이터 (중복 API 호출 방지) */
  initialRelationships?: Relationship[];
}

/** 가족 관계 유형 */
const FAMILY_RELATIONSHIP_TYPES = [
  { value: 'spouse', label: '배우자', icon: '❤️', description: '결혼 관계' },
  { value: 'parent', label: '부모', icon: '👨‍👩', description: '상위 세대' },
  { value: 'child', label: '자녀', icon: '👶', description: '하위 세대' },
];

/** 법인 관계자 유형 */
const CORPORATE_RELATIONSHIP_TYPES = [
  { value: 'ceo', label: '대표', icon: '👔', description: '법인의 대표이사' },
  { value: 'executive', label: '임원', icon: '🎯', description: '법인의 임원' },
  { value: 'employee', label: '직원', icon: '👤', description: '법인의 일반 직원' },
];

/**
 * QuickFamilyAssignPanel - 빠른 가족 등록 패널 (테이블 UI 임베드 버전)
 */
export const QuickFamilyAssignPanel: React.FC<QuickFamilyAssignPanelProps> = ({
  customer,
  onComplete,
  onClose,
  mode = 'family',
  initialCustomers,
  initialRelationships,
}) => {
  // 모드별 설정
  const isCorporateMode = mode === 'corporate';
  const relationshipTypes = isCorporateMode ? CORPORATE_RELATIONSHIP_TYPES : FAMILY_RELATIONSHIP_TYPES;
  const panelTitle = isCorporateMode ? '빠른 구성원 등록' : '빠른 가족 등록';
  const relationshipCategory = isCorporateMode ? 'corporate' : 'family';

  // 로드 상태 추적 (중복 로드 방지)
  const hasLoadedRef = useRef(false);

  // 역할 모드: 선택된 고객이 대표인지 구성원인지
  // 'representative': 선택된 고객이 가족 대표 → 테이블에서 구성원 선택
  // 'member': 선택된 고객이 구성원 → 테이블에서 가족 대표 선택
  // 법인 모드에서는 항상 'representative' (법인이 from_customer)
  const [roleMode, setRoleMode] = useState<'representative' | 'member'>('representative');

  // 직접 입력 관계 유형 (법인 모드에서만 사용)
  const [customRelationType, setCustomRelationType] = useState('');

  // 상태 관리
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [familyCustomerIds, setFamilyCustomerIds] = useState<Set<string>>(new Set());
  const [familyRepresentativeIds, setFamilyRepresentativeIds] = useState<Set<string>>(new Set());
  const [_corporateEmployeeIds, setCorporateEmployeeIds] = useState<Set<string>>(new Set());
  const [selectedCandidate, setSelectedCandidate] = useState<Customer | null>(null);
  const [relationshipType, setRelationshipType] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [candidatesLoading, setCandidatesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 초성 필터 상태
  const [selectedInitial, setSelectedInitial] = useState<string | null>(null);
  const [initialType, setInitialType] = useState<'korean' | 'alphabet' | 'number'>('korean');

  // 정렬 상태
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  // 고객 데이터 및 가족 관계 로드 (마운트 시 1회만 실행)
  useEffect(() => {
    // 이미 로드했으면 스킵
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    const loadAllData = async () => {
      try {
        // 📊 부모 뷰에서 데이터를 전달받았으면 API 호출 생략 (-2.7MB)
        let customersList: Customer[];
        let relationshipsList: Relationship[];

        if (initialCustomers && initialRelationships) {
          customersList = initialCustomers;
          relationshipsList = initialRelationships;
        } else {
          const [customersResponse, relationshipsResponse] = await Promise.all([
            CustomerService.getCustomers({ limit: 10000, page: 1 }),
            RelationshipService.getAllRelationshipsWithCustomers()
          ]);
          customersList = customersResponse.customers;
          relationshipsList = relationshipsResponse.relationships;
        }

        // 고객 목록 설정
        setAllCustomers(customersList);
        setCustomersLoading(false);

        // 가족 관계 ID 추출
        const familyIds = new Set<string>(); // 가족 관계에 포함된 모든 고객
        const representativeIds = new Set<string>(); // 가족 대표 (family_representative 필드)
        const employeeIds = new Set<string>(); // 법인 관계자 (corporate)

        relationshipsList.forEach(rel => {
          const category = rel.relationship_info?.relationship_category;

          // from_customer ID 추출
          let fromId = '';
          if (typeof rel.from_customer === 'string') {
            fromId = rel.from_customer;
          } else if (rel.from_customer && typeof rel.from_customer === 'object' && '_id' in rel.from_customer) {
            fromId = rel.from_customer._id;
          }

          // related_customer ID 추출
          let toId = '';
          if (typeof rel.related_customer === 'string') {
            toId = rel.related_customer;
          } else if (rel.related_customer && typeof rel.related_customer === 'object' && '_id' in rel.related_customer) {
            toId = rel.related_customer._id;
          }

          if (category === 'family') {
            // family_representative ID 추출 (진짜 가족 대표!)
            let repId = '';
            const familyRep = (rel as { family_representative?: string | { _id: string } }).family_representative;
            if (typeof familyRep === 'string') {
              repId = familyRep;
            } else if (familyRep && typeof familyRep === 'object' && '_id' in familyRep) {
              repId = familyRep._id;
            }

            // 모든 가족 구성원을 familyIds에 추가
            if (fromId) familyIds.add(fromId);
            if (toId) familyIds.add(toId);

            // 가족 대표 추가
            if (repId) {
              representativeIds.add(repId);
            }
          } else if (category === 'corporate' || category === 'professional') {
            // 법인 관계자 추가 (개인 고객만)
            if (toId) employeeIds.add(toId);
          }
        });

        console.log('[QuickFamilyAssignPanel] 관계 데이터:', {
          familyCount: familyIds.size,
          representativeCount: representativeIds.size,
          employeeCount: employeeIds.size
        });

        setFamilyCustomerIds(familyIds);
        setFamilyRepresentativeIds(representativeIds);
        setCorporateEmployeeIds(employeeIds);
        setCandidatesLoading(false);
      } catch (err) {
        console.error('[QuickFamilyAssignPanel] 데이터 로드 실패:', err);
        errorReporter.reportApiError(err as Error, { component: 'QuickFamilyAssignPanel.loadAllData' });
        setError('데이터를 불러오는데 실패했습니다.');
        setCustomersLoading(false);
        setCandidatesLoading(false);
      }
    };

    loadAllData();
  }, []);

  // 한글 초성 추출 함수
  const getInitialConsonant = (name: string): string => {
    if (!name) return '';
    const firstChar = name.charAt(0);
    const code = firstChar.charCodeAt(0);

    if (code >= 0xAC00 && code <= 0xD7A3) {
      const initialIndex = Math.floor((code - 0xAC00) / 588);
      const initials = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
      return initials[initialIndex] || '';
    }

    if (code >= 0x3131 && code <= 0x314E) {
      return firstChar;
    }

    return '';
  };

  // 알파벳 초성 추출 함수
  const getAlphabetInitial = (name: string): string => {
    if (!name) return '';
    const firstChar = name.charAt(0).toUpperCase();
    if (firstChar >= 'A' && firstChar <= 'Z') {
      return firstChar;
    }
    return '';
  };

  // 숫자 초성 추출 함수
  const getNumberInitial = (name: string): string => {
    if (!name) return '';
    const firstChar = name.charAt(0);
    if (firstChar >= '0' && firstChar <= '9') {
      return firstChar;
    }
    return '';
  };

  // 이름의 초성 추출
  const getNameInitial = (name: string, type: 'korean' | 'alphabet' | 'number'): string => {
    if (type === 'korean') return getInitialConsonant(name);
    if (type === 'alphabet') return getAlphabetInitial(name);
    if (type === 'number') return getNumberInitial(name);
    return '';
  };

  // 검색 중인지 여부
  const isSearching = searchQuery.trim().length > 0;

  // 후보 고객 필터링 및 정렬
  const candidates = useMemo(() => {
    let filtered = allCustomers.filter(c => {
      // 자기 자신 제외
      if (c._id === customer._id) return false;
      // 개인 고객만 (법인 구성원 후보는 개인 고객)
      if (c.insurance_info?.customer_type !== '개인') return false;

      if (isCorporateMode) {
        // 법인 모드: 이미 법인 관계자인 고객 제외 (같은 법인의 구성원으로 추가된 경우)
        // 여기서는 모든 개인 고객을 보여주고, 같은 법인에 이미 등록된 관계자는 추후 체크
        // (현재는 단순히 corporateEmployeeIds에 없는 개인 고객만 표시)
        // if (corporateEmployeeIds.has(c._id)) return false; // 다른 법인에 등록되어 있어도 추가 가능
        return true;
      } else {
        // 가족 모드
        if (roleMode === 'representative') {
          // 대표 모드: 가족 관계가 없는 고객만 (구성원으로 추가할 후보)
          if (familyCustomerIds.has(c._id)) return false;
        } else {
          // 구성원 모드: 가족 대표인 고객만 표시 (대표로 선택할 후보)
          if (!familyRepresentativeIds.has(c._id)) return false;
        }
      }

      return true;
    });

    // 검색어 필터
    if (isSearching) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(c => {
        const name = c.personal_info?.name?.toLowerCase() || '';
        const phone = c.personal_info?.mobile_phone?.replace(/-/g, '') || '';
        return name.includes(query) || phone.includes(query);
      });
    }

    // 초성 필터 적용
    if (selectedInitial && !isSearching) {
      filtered = filtered.filter(c => {
        const name = c.personal_info?.name || '';
        return getNameInitial(name, initialType) === selectedInitial;
      });
    }

    // 정렬 적용
    if (sortConfig) {
      filtered = [...filtered].sort((a, b) => {
        let aValue: string = '';
        let bValue: string = '';

        switch (sortConfig.key) {
          case 'name':
            aValue = a.personal_info?.name || '';
            bValue = b.personal_info?.name || '';
            break;
          case 'birth':
            aValue = a.personal_info?.birth_date || '';
            bValue = b.personal_info?.birth_date || '';
            break;
          case 'gender':
            aValue = a.personal_info?.gender || '';
            bValue = b.personal_info?.gender || '';
            break;
          case 'phone':
            aValue = a.personal_info?.mobile_phone || '';
            bValue = b.personal_info?.mobile_phone || '';
            break;
          case 'address':
            aValue = CustomerUtils.getAddressText(a);
            bValue = CustomerUtils.getAddressText(b);
            break;
        }

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    } else {
      // 기본 정렬: 이름순
      filtered.sort((a, b) => {
        const nameA = a.personal_info?.name || '';
        const nameB = b.personal_info?.name || '';
        return nameA.localeCompare(nameB, 'ko-KR');
      });
    }

    return filtered;
  }, [allCustomers, customer._id, familyCustomerIds, familyRepresentativeIds, roleMode, searchQuery, isSearching, selectedInitial, initialType, sortConfig, isCorporateMode]);

  // 정렬 핸들러
  const handleSort = useCallback((key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  }, [sortConfig]);

  // 관계 유형 라벨 가져오기
  const getRelationshipLabel = useCallback((type: string): string => {
    const types = isCorporateMode ? CORPORATE_RELATIONSHIP_TYPES : FAMILY_RELATIONSHIP_TYPES;
    const found = types.find(t => t.value === type);
    return found?.label || type;
  }, [isCorporateMode]);

  // 관계 등록
  const handleSubmit = useCallback(async () => {
    // 직접 입력 모드에서는 customRelationType 사용
    const finalRelationType = relationshipType === 'custom' ? customRelationType : relationshipType;
    if (!selectedCandidate || !finalRelationType) return;

    setLoading(true);
    setError(null);

    try {
      const categoryLabel = isCorporateMode ? '법인 관계자' : '가족 관계';
      const relationshipData: CreateRelationshipData = {
        relationship_type: finalRelationType,
        relationship_category: relationshipCategory,
        strength: 'strong',
        relationship_details: {
          description: `${categoryLabel} - ${getRelationshipLabel(finalRelationType)}`,
          contact_frequency: isCorporateMode ? 'monthly' : 'weekly',
          influence_level: 'high',
        },
        insurance_relevance: {
          is_beneficiary: false,
          cross_selling_opportunity: true,
          referral_potential: 'high',
        },
      };

      // 역할 모드에 따라 from_customer와 related_customer 결정
      // 법인 모드: 법인(customer)이 from, 개인(selectedCandidate)이 related
      // 가족 모드:
      //   representative: 선택된 고객(customer)이 대표 → customer가 from
      //   member: 선택된 고객(customer)이 구성원 → selectedCandidate가 from (대표)
      const fromCustomerId = isCorporateMode
        ? customer._id  // 법인이 항상 from
        : (roleMode === 'representative' ? customer._id : selectedCandidate._id);
      const relatedCustomerId = isCorporateMode
        ? selectedCandidate._id  // 개인 관계자가 related
        : (roleMode === 'representative' ? selectedCandidate._id : customer._id);

      await RelationshipService.createRelationship(
        fromCustomerId,
        relatedCustomerId,
        relationshipData
      );

      // relationshipChanged는 RelationshipService.createRelationship() 내부에서 호출됨
      onComplete();
    } catch (err) {
      const errorMsg = isCorporateMode ? '구성원 등록에 실패했습니다.' : '가족 관계 등록에 실패했습니다.';
      console.error('[QuickFamilyAssignPanel] 관계 등록 실패:', err);
      errorReporter.reportApiError(err as Error, { component: 'QuickFamilyAssignPanel.handleRegister', payload: { customerId: customer._id } });
      setError(`${errorMsg} 다시 시도해주세요.`);
    } finally {
      setLoading(false);
    }
  }, [customer._id, selectedCandidate, relationshipType, customRelationType, roleMode, isCorporateMode, relationshipCategory, getRelationshipLabel, onComplete]);

  // 후보 선택
  const handleCandidateSelect = useCallback((candidate: Customer) => {
    setSelectedCandidate(candidate);
    setError(null);
  }, []);

  // 선택 초기화
  const handleReset = useCallback(() => {
    setSelectedCandidate(null);
    setRelationshipType(null);
    setSearchQuery('');
    setSelectedInitial(null);
    setError(null);
  }, []);

  const isDataLoading = customersLoading || candidatesLoading;

  return (
    <div className="quick-family-assign-panel">
      {/* 헤더 */}
      <div className="quick-family-assign-panel__header">
        <h3 className="quick-family-assign-panel__title">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" className="quick-family-assign-panel__title-icon">
            <path d="M5.52.359A.5.5 0 0 1 6 0h4a.5.5 0 0 1 .474.658L8.694 6H12.5a.5.5 0 0 1 .395.807l-7 9a.5.5 0 0 1-.873-.454L6.823 9.5H3.5a.5.5 0 0 1-.48-.641l2.5-8.5z"/>
          </svg>
          {panelTitle}
        </h3>
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

      {/* 선택된 고객 정보 + 역할 선택 (가족 모드에서만) */}
      <div className="quick-family-assign-panel__selected-customer">
        <div className="quick-family-assign-panel__customer-info">
          <span className="quick-family-assign-panel__label">{isCorporateMode ? '선택된 법인' : '선택된 고객'}</span>
          <span className="quick-family-assign-panel__customer-name">
            {customer.personal_info?.name || '이름없음'}
          </span>
        </div>
        {/* 가족 모드에서만 역할 선택 표시 */}
        {!isCorporateMode && (
          <div className="quick-family-assign-panel__role-selector">
            <button
              type="button"
              className={`quick-family-assign-panel__role-btn ${roleMode === 'representative' ? 'active' : ''}`}
              onClick={() => {
                setRoleMode('representative');
                setSelectedCandidate(null);
                setRelationshipType(null);
              }}
              title="이 고객을 가족 대표로 설정"
            >
              <span className="role-icon">👑</span>
              <span className="role-text">가족 대표</span>
            </button>
            <button
              type="button"
              className={`quick-family-assign-panel__role-btn ${roleMode === 'member' ? 'active' : ''}`}
              onClick={() => {
                setRoleMode('member');
                setSelectedCandidate(null);
                setRelationshipType(null);
              }}
              title="이 고객을 가족 구성원으로 설정"
            >
              <span className="role-icon">👤</span>
              <span className="role-text">가족 구성원</span>
            </button>
          </div>
        )}
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div className="quick-family-assign-panel__error">
          {error}
        </div>
      )}

      {/* 검색 입력 */}
      <div className="quick-family-assign-panel__search">
        <div className="quick-family-assign-panel__search-wrapper">
          <SFSymbol
            name="magnifyingglass"
            size={SFSymbolSize.FOOTNOTE}
            weight={SFSymbolWeight.MEDIUM}
            className="quick-family-assign-panel__search-icon"
            decorative
          />
          <input
            type="text"
            className="quick-family-assign-panel__search-input"
            placeholder="이름 또는 전화번호로 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
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
      </div>

      {/* 초성 인덱스 (검색 중이 아닐 때만 표시) */}
      {!isSearching && (
        <div className="quick-family-assign-panel__initials">
          {/* 초성 타입 토글 버튼 */}
          <button
            type="button"
            className="quick-family-assign-panel__initial-type-toggle"
            onClick={() => {
              const nextType = initialType === 'korean' ? 'alphabet' : initialType === 'alphabet' ? 'number' : 'korean';
              setInitialType(nextType);
              setSelectedInitial(null);
            }}
            title="초성 타입 전환 (한글/영문/숫자)"
            aria-label="초성 타입 전환"
          >
            <svg
              className="quick-family-assign-panel__globe-icon"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="12" cy="12" r="10" fill="none" strokeWidth="2" />
              <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" fill="none" strokeWidth="2" />
            </svg>
            <span className="quick-family-assign-panel__initial-type-label">
              {initialType === 'korean' ? 'ㄱㄴ' : initialType === 'alphabet' ? 'AB' : '12'}
            </span>
          </button>

          {/* 초성 버튼들 */}
          {initialType === 'korean' && ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'].map(initial => (
            <button
              type="button"
              key={initial}
              className={`quick-family-assign-panel__initial ${selectedInitial === initial ? 'active' : ''}`}
              onClick={() => setSelectedInitial(selectedInitial === initial ? null : initial)}
              title={`${initial}로 시작하는 고객`}
            >
              {initial}
            </button>
          ))}
          {initialType === 'alphabet' && ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'].map(initial => (
            <button
              type="button"
              key={initial}
              className={`quick-family-assign-panel__initial ${selectedInitial === initial ? 'active' : ''}`}
              onClick={() => setSelectedInitial(selectedInitial === initial ? null : initial)}
              title={`${initial}로 시작하는 고객`}
            >
              {initial}
            </button>
          ))}
          {initialType === 'number' && ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map(initial => (
            <button
              type="button"
              key={initial}
              className={`quick-family-assign-panel__initial ${selectedInitial === initial ? 'active' : ''}`}
              onClick={() => setSelectedInitial(selectedInitial === initial ? null : initial)}
              title={`${initial}로 시작하는 고객`}
            >
              {initial}
            </button>
          ))}

          {/* 필터 상태 표시 */}
          {selectedInitial && (
            <button
              type="button"
              className="quick-family-assign-panel__filter-clear"
              onClick={() => setSelectedInitial(null)}
              title="초성 필터 해제"
              aria-label="초성 필터 해제"
            >
              <SFSymbol
                name="xmark.circle.fill"
                size={SFSymbolSize.CAPTION_1}
                weight={SFSymbolWeight.MEDIUM}
                decorative
              />
            </button>
          )}
        </div>
      )}

      {/* 역할 모드 안내 */}
      <div className="quick-family-assign-panel__mode-guide">
        {isCorporateMode ? (
          <>
            <span className="mode-icon">🏢</span>
            <span className="mode-text">
              <strong>{customer.personal_info?.name}</strong>의 <strong>구성원</strong>을 아래에서 선택하세요
            </span>
          </>
        ) : roleMode === 'representative' ? (
          <>
            <span className="mode-icon">👑</span>
            <span className="mode-text">
              <strong>{customer.personal_info?.name}</strong>님을 가족 대표로, 아래에서 <strong>구성원</strong>을 선택하세요
            </span>
          </>
        ) : (
          <>
            <span className="mode-icon">👤</span>
            <span className="mode-text">
              <strong>{customer.personal_info?.name}</strong>님을 구성원으로, 아래에서 <strong>가족 대표</strong>를 선택하세요
            </span>
          </>
        )}
      </div>

      {/* 고객 테이블 */}
      <div className="quick-family-assign-panel__table-container">
        {isDataLoading ? (
          <div className="quick-family-assign-panel__loading">
            로딩 중...
          </div>
        ) : (
          <>
            {/* 테이블 헤더 */}
            <div className="quick-family-assign-panel__table-header">
              <div className="header-name sortable" onClick={() => handleSort('name')}>
                <span>이름</span>
                <SortIndicator field="name" currentSortField={sortConfig?.key ?? null} sortDirection={sortConfig?.direction} />
              </div>
              <div className="header-birth sortable" onClick={() => handleSort('birth')}>
                <span>생년월일</span>
                <SortIndicator field="birth" currentSortField={sortConfig?.key ?? null} sortDirection={sortConfig?.direction} />
              </div>
              <div className="header-gender sortable" onClick={() => handleSort('gender')}>
                <span>성별</span>
                <SortIndicator field="gender" currentSortField={sortConfig?.key ?? null} sortDirection={sortConfig?.direction} />
              </div>
              <div className="header-phone sortable" onClick={() => handleSort('phone')}>
                <span>전화</span>
                <SortIndicator field="phone" currentSortField={sortConfig?.key ?? null} sortDirection={sortConfig?.direction} />
              </div>
              <div className="header-address sortable" onClick={() => handleSort('address')}>
                <span>주소</span>
                <SortIndicator field="address" currentSortField={sortConfig?.key ?? null} sortDirection={sortConfig?.direction} />
              </div>
            </div>

            {/* 테이블 바디 */}
            <div className="quick-family-assign-panel__table-body">
              {candidates.length === 0 ? (
                <div className="quick-family-assign-panel__empty">
                  {isSearching ? '검색 결과가 없습니다' : '등록 가능한 후보 고객이 없습니다.'}
                </div>
              ) : (
                candidates.map(candidate => {
                  const birthDate = candidate.personal_info?.birth_date;
                  const birthDisplay = birthDate
                    ? formatDate(birthDate)
                    : '-';
                  const gender = candidate.personal_info?.gender;
                  const genderDisplay = gender === 'M' ? '남' : gender === 'F' ? '여' : '-';

                  return (
                    <div
                      key={candidate._id}
                      className={`quick-family-assign-panel__table-row ${
                        selectedCandidate?._id === candidate._id ? 'selected' : ''
                      }`}
                      onClick={() => handleCandidateSelect(candidate)}
                    >
                      <div className="cell-name">{candidate.personal_info?.name || '이름 없음'}</div>
                      <div className="cell-birth">{birthDisplay}</div>
                      <div className="cell-gender">{genderDisplay}</div>
                      <div className="cell-phone">{candidate.personal_info?.mobile_phone || '-'}</div>
                      <div className="cell-address">{CustomerUtils.getAddressText(candidate)}</div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="quick-family-assign-panel__table-footer">
              후보 고객 {candidates.length}명
            </div>
          </>
        )}
      </div>

      {/* 관계 유형 선택 */}
      <div className="quick-family-assign-panel__relationship-section">
        <span className="quick-family-assign-panel__label">
          {isCorporateMode
            ? `${selectedCandidate?.personal_info?.name || '?'}의 직책은`
            : (roleMode === 'representative'
              ? `${customer.personal_info?.name}의 ${selectedCandidate?.personal_info?.name || '?'}은(는)`
              : `${selectedCandidate?.personal_info?.name || '?'}의 ${customer.personal_info?.name}은(는)`)
          }
        </span>
        <div className="quick-family-assign-panel__type-buttons">
          {relationshipTypes.map((type) => (
            <button
              key={type.value}
              type="button"
              className={`quick-family-assign-panel__type-btn ${
                relationshipType === type.value ? 'selected' : ''
              }`}
              onClick={() => {
                setRelationshipType(type.value);
                setCustomRelationType('');
              }}
              disabled={!selectedCandidate}
            >
              <span className="quick-family-assign-panel__type-icon">{type.icon}</span>
              <span className="quick-family-assign-panel__type-label">{type.label}</span>
            </button>
          ))}
          {/* 법인 모드에서만 직접 입력 옵션 */}
          {isCorporateMode && (
            <button
              type="button"
              className={`quick-family-assign-panel__type-btn ${
                relationshipType === 'custom' ? 'selected' : ''
              }`}
              onClick={() => setRelationshipType('custom')}
              disabled={!selectedCandidate}
            >
              <span className="quick-family-assign-panel__type-icon">✏️</span>
              <span className="quick-family-assign-panel__type-label">직접입력</span>
            </button>
          )}
        </div>
        {/* 직접 입력 필드 */}
        {isCorporateMode && relationshipType === 'custom' && (
          <div className="quick-family-assign-panel__custom-input">
            <input
              type="text"
              className="quick-family-assign-panel__custom-input-field"
              placeholder="관계 직접 입력 (예: 고문, 계약직)"
              value={customRelationType}
              onChange={(e) => setCustomRelationType(e.target.value)}
              aria-label="관계 유형 직접 입력"
            />
          </div>
        )}
      </div>

      {/* 액션 버튼 */}
      <div className="quick-family-assign-panel__actions">
        <Button
          variant="ghost"
          onClick={selectedCandidate ? handleReset : onClose}
          disabled={loading}
        >
          {selectedCandidate ? '초기화' : '닫기'}
        </Button>
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={!selectedCandidate || !relationshipType || (relationshipType === 'custom' && !customRelationType.trim()) || loading}
        >
          {loading ? '등록 중...' : '등록'}
        </Button>
      </div>
    </div>
  );
};


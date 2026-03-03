/**
 * CustomerRelationshipView Component
 * @since 1.0.0
 * @version 2.0.0
 *
 * 🍎 고객 관계별보기 View - 애플 디자인 철학 준수
 * - Progressive Disclosure
 * - 서브틀한 기본 상태
 * - 트리 구조로 가족/법인 관계 표시
 */

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import CenterPaneView from '../../CenterPaneView/CenterPaneView';
import SFSymbol, { SFSymbolSize, SFSymbolWeight } from '../../SFSymbol';
import Tooltip from '@/shared/ui/Tooltip';
import Button from '@/shared/ui/Button';
import { Modal } from '@/shared/ui';
import { RelationshipService, type Relationship } from '../../../services/relationshipService';
import { useCustomerDocument } from '@/hooks/useCustomerDocument';
import type { Customer } from '@/entities/customer/model';
import { QuickFamilyAssignPanel } from './QuickFamilyAssignPanel';
import { errorReporter } from '@/shared/lib/errorReporter';
import './CustomerRelationshipView.css';
import { InitialFilterBar, calculateInitialCounts, filterByInitial, type InitialType } from '@/shared/ui/InitialFilterBar';
import { usePersistedState } from '@/hooks/usePersistedState';

// 역관계 변환 맵 (A→B 관계를 B→A 관계로 변환) - 대표자 기준 표시용
const REVERSE_RELATION_MAP: Record<string, string> = {
  parent: 'child',      // A의 부모 B → B의 자녀 A
  child: 'parent',      // A의 자녀 B → B의 부모 A
  spouse: 'spouse',     // 대칭
  sibling: 'sibling',   // 대칭
  grandparent: 'grandchild',
  grandchild: 'grandparent',
};

interface CustomerRelationshipViewProps {
  /** View 표시 여부 */
  visible: boolean;
  /** View 닫기 핸들러 */
  onClose: () => void;
  /** 고객 선택 핸들러 (null이면 RightPane 닫기) */
  onCustomerSelect?: (customerId: string | null, customer?: Customer) => void;
  /** 고객 더블클릭 핸들러 (전체보기) */
  onCustomerDoubleClick?: (customerId: string) => void;
  /** 뷰 이동 핸들러 */
  onNavigate?: (viewKey: string) => void;
}

interface FamilyGroup {
  representative: Customer;
  members: Customer[];
  relations: Array<{
    key: string;
    fromName: string;
    toName: string;
    relationLabel: string;
    fromCustomer: Customer;
    toCustomer: Customer;
  }>;
}

interface StructuredData {
  가족그룹: Record<string, FamilyGroup>;
  법인: Record<string, CorporateGroup>;
  가족관계미설정: Customer[]; // 가족관계가 없는 개인 고객들
  법인관계자미설정: Customer[]; // 관계자가 없는 법인 고객들
}

interface CorporateGroup {
  company: Customer;
  employees: Customer[];
}

interface PopulatedRelationship extends Omit<Relationship, 'from_customer' | 'related_customer' | 'family_representative'> {
  from_customer: Customer;
  related_customer: Customer;
  family_representative?: Customer;
}

/**
 * CustomerRelationshipView React 컴포넌트
 */
export const CustomerRelationshipView: React.FC<CustomerRelationshipViewProps> = ({
  visible,
  onClose,
  onCustomerSelect,
  onCustomerDoubleClick,
  onNavigate
}) => {
  // Document-View 패턴: CustomerDocument 구독
  const {
    customers: allCustomers,
    isLoading: customersLoading,
    loadCustomers,
  } = useCustomerDocument();

  const [relationships, setRelationships] = useState<PopulatedRelationship[]>([]);
  const [relationshipsLoading, setRelationshipsLoading] = useState(false);

  // 클릭/더블클릭 구분을 위한 타이머 ref
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 검색어 상태
  const [searchQuery, setSearchQuery] = useState<string>('');

  // 트리 뷰 모드: 대표만 보기 → 관계만 보기 → 전체 보기 (순환)
  type ViewMode = 'representative' | 'consonant' | 'relationships' | 'all';
  const [viewMode, setViewMode] = useState<ViewMode>('representative');

  // 빠른 가족 등록 패널용 상태
  const [selectedUnassignedCustomer, setSelectedUnassignedCustomer] = useState<Customer | null>(null);

  // 빠른 구성원 등록 패널용 상태 (법인)
  const [selectedUnassignedCorporate, setSelectedUnassignedCorporate] = useState<Customer | null>(null);

  // 도움말 모달 상태
  const [helpModalVisible, setHelpModalVisible] = useState(false);

  // 초성 필터 상태 (F5 이후에도 유지)
  const [initialType, setInitialType] = usePersistedState<InitialType>('customer-relationship-initial-type', 'korean');
  const [selectedInitial, setSelectedInitial] = usePersistedState<string | null>('customer-relationship-selected-initial', null);

  // 미설정 고객 숨기기: 'relationships' 모드일 때 자동 적용
  const hideUnassigned = viewMode === 'relationships';

  // LocalStorage에서 트리 확장 상태 복원
  // 기본 viewMode가 'representative'이므로 'no-family-relationship'은 닫힌 상태
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('aims_relationship_expanded_nodes');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // 'representative' 모드 기본값이므로 'no-family-relationship' 제외
          const filtered = parsed.filter((node: string) => node !== 'no-family-relationship');
          return new Set(filtered);
        }
      }
    } catch (error) {
      console.error('[CustomerRelationshipView] 확장 상태 복원 실패:', error);
      errorReporter.reportApiError(error as Error, { component: 'CustomerRelationshipView.restoreExpandedNodes' });
    }
    return new Set(['family', 'corporate']);
  });

  // 트리 확장 상태 변경 시 LocalStorage에 저장
  useEffect(() => {
    try {
      const array = Array.from(expandedNodes);
      localStorage.setItem('aims_relationship_expanded_nodes', JSON.stringify(array));
    } catch (error) {
      console.error('[CustomerRelationshipView] 확장 상태 저장 실패:', error);
      errorReporter.reportApiError(error as Error, { component: 'CustomerRelationshipView.saveExpandedNodes' });
    }
  }, [expandedNodes]);

  const documentCustomerMap = useMemo(() => {
    const map = new Map<string, Customer>();
    allCustomers.forEach(customer => {
      if (customer?._id) {
        map.set(customer._id, customer);
      }
    });
    return map;
  }, [allCustomers]);

  const resolvedCustomerMap = useMemo(() => {
    const map = new Map<string, Customer>(documentCustomerMap);
    relationships.forEach(relationship => {
      const { from_customer, related_customer, family_representative } = relationship;
      if (from_customer?._id) {
        map.set(from_customer._id, from_customer);
      }
      if (related_customer?._id) {
        map.set(related_customer._id, related_customer);
      }
      if (family_representative?._id) {
        map.set(family_representative._id, family_representative);
      }
    });
    return map;
  }, [documentCustomerMap, relationships]);

  // 초기 데이터 로드 (visible일 때만)
  useEffect(() => {
    if (!visible) return;
    if (import.meta.env.DEV) {
      console.log('[CustomerRelationshipView] Document 구독 및 초기 데이터 로드');
    }
    loadCustomers({ limit: 10000, page: 1, status: 'all' });
  }, [visible, loadCustomers]);

  const loadRelationshipsData = useCallback(async () => {
    try {
      setRelationshipsLoading(true);
      const data = await RelationshipService.getAllRelationshipsWithCustomers();

      const combinedCustomerMap = new Map(documentCustomerMap);
      data.customers.forEach(customer => {
        if (customer?._id) {
          combinedCustomerMap.set(customer._id, customer);
        }
      });

      const resolveCustomer = (value: string | Customer | undefined): Customer | undefined => {
        if (!value) {
          return undefined;
        }

        if (typeof value === 'string') {
          return combinedCustomerMap.get(value);
        }

        if (value._id) {
          combinedCustomerMap.set(value._id, value);
        }
        return value;
      };

      const populated = data.relationships
        .map<PopulatedRelationship | null>((relationship) => {
          const fromCustomer = resolveCustomer(relationship.from_customer);
          const toCustomer = resolveCustomer(relationship.related_customer);

          if (!fromCustomer || !toCustomer) {
            return null;
          }

          const representative = resolveCustomer(relationship.family_representative);

          const { family_representative: _ignored, ...rest } = relationship;

          const populatedRelationship: PopulatedRelationship = {
            ...rest,
            from_customer: fromCustomer,
            related_customer: toCustomer
          };

          if (representative) {
            populatedRelationship.family_representative = representative;
          }

          return populatedRelationship;
        })
        .filter((relationship): relationship is PopulatedRelationship => relationship !== null);

      setRelationships(populated);
    } catch (error) {
      console.error('관계 데이터 로드 실패:', error);
      errorReporter.reportApiError(error as Error, { component: 'CustomerRelationshipView.loadRelationshipsData' });
    } finally {
      setRelationshipsLoading(false);
    }
  }, [documentCustomerMap]);

  // 관계 데이터 로드 (고객 데이터 로드 후)
  useEffect(() => {
    if (relationships.length === 0 && allCustomers.length > 0) {
      loadRelationshipsData();
    }
  }, [allCustomers.length, relationships.length, loadRelationshipsData]);

  // relationshipChanged 이벤트 수신하여 관계 데이터 새로고침
  // Note: refresh() 호출은 불필요 - 관계 변경은 고객 데이터에 영향 없음
  useEffect(() => {
    const handleRelationshipChange = async () => {
      if (import.meta.env.DEV) {
        console.log('[CustomerRelationshipView] relationshipChanged 이벤트 수신 - 관계 데이터 새로고침');
      }
      // 관계 데이터만 새로고침
      await loadRelationshipsData();
    };

    window.addEventListener('relationshipChanged', handleRelationshipChange);
    return () => {
      window.removeEventListener('relationshipChanged', handleRelationshipChange);
    };
  }, [loadRelationshipsData]);

  // customerChanged 이벤트 수신하여 관계 데이터만 새로고침 (고객 추가/수정/삭제 시)
  // Note: refresh() 호출은 불필요 - CustomerRelationshipView는 useCustomerDocument 훅을 통해
  // CustomerDocument를 구독하므로 고객 데이터는 Document-View 패턴으로 자동 업데이트됨
  // refresh()를 추가하면 중복 API 호출로 인한 경쟁 조건(race condition) 발생
  useEffect(() => {
    const handleCustomerChange = async () => {
      if (import.meta.env.DEV) {
        console.log('[CustomerRelationshipView] customerChanged 이벤트 수신 - 관계 데이터 새로고침');
      }
      // 관계 데이터만 새로고침 (고객 데이터는 Document-View 패턴으로 자동 업데이트)
      await loadRelationshipsData();
    };

    window.addEventListener('customerChanged', handleCustomerChange);
    return () => {
      window.removeEventListener('customerChanged', handleCustomerChange);
    };
  }, [loadRelationshipsData]);

  const loading = customersLoading || relationshipsLoading;
  // 데이터 구조화
  const structuredData = useMemo((): StructuredData => {
    if (!relationships.length && documentCustomerMap.size === 0) {
      return { 가족그룹: {}, 법인: {}, 가족관계미설정: [], 법인관계자미설정: [] };
    }

    const mergedCustomerMap = new Map(resolvedCustomerMap);

    if (mergedCustomerMap.size === 0) {
      return { 가족그룹: {}, 법인: {}, 가족관계미설정: [], 법인관계자미설정: [] };
    }

    const result: StructuredData = {
      가족그룹: {},
      법인: {},
      가족관계미설정: [],
      법인관계자미설정: []
    };

    const familyNetworks = new Map<string, Set<string>>();
    const processed = new Set<string>();
    const customersInFamilyRelationship = new Set<string>(); // 가족관계가 있는 고객 ID 추적

    relationships.forEach(relationship => {
      const category = relationship.relationship_info?.relationship_category;
      const fromCustomer = relationship.from_customer;
      const toCustomer = relationship.related_customer;
      const fromId = fromCustomer?._id;
      const toId = toCustomer?._id;

      if (!fromId || !toId) {
        return;
      }

      if (category === 'family' &&
          fromCustomer?.insurance_info?.customer_type === '개인' &&
          toCustomer?.insurance_info?.customer_type === '개인') {
        if (!familyNetworks.has(fromId)) {
          familyNetworks.set(fromId, new Set());
        }
        if (!familyNetworks.has(toId)) {
          familyNetworks.set(toId, new Set());
        }

        familyNetworks.get(fromId)!.add(toId);
        familyNetworks.get(toId)!.add(fromId);

        // 가족관계가 있는 고객으로 표시
        customersInFamilyRelationship.add(fromId);
        customersInFamilyRelationship.add(toId);
      }
    });

    familyNetworks.forEach((_, customerId) => {
      if (processed.has(customerId)) {
        return;
      }

      const familyGroupIds = new Set<string>();
      const stack = [customerId];

      while (stack.length > 0) {
        const currentId = stack.pop()!;
        if (familyGroupIds.has(currentId)) {
          continue;
        }

        familyGroupIds.add(currentId);
        processed.add(currentId);

        const connections = familyNetworks.get(currentId);
        if (connections) {
          connections.forEach(nextId => {
            if (!familyGroupIds.has(nextId)) {
              stack.push(nextId);
            }
          });
        }
      }

      const familyMembers = Array.from(familyGroupIds)
        .map(id => mergedCustomerMap.get(id))
        .filter((member): member is Customer => Boolean(member));

      if (familyMembers.length < 2) {
        return;
      }

      const groupRelationships = relationships.filter(rel => {
        const fromId = rel.from_customer?._id;
        const toId = rel.related_customer?._id;
        return !!fromId && !!toId && familyGroupIds.has(fromId) && familyGroupIds.has(toId);
      });

      let representative = familyMembers[0]!;
      const relationshipWithRep = groupRelationships.find(rel => {
        const rep = rel.family_representative;
        const repId = typeof rep === 'object' ? rep?._id : undefined;
        return repId ? familyGroupIds.has(repId) : false;
      });

      if (relationshipWithRep?.family_representative?._id) {
        const matched = mergedCustomerMap.get(relationshipWithRep.family_representative._id);
        if (matched) {
          representative = matched;
        }
      }

      const typeLabels: Record<string, string> = {
        spouse: '배우자',
        parent: '부모',
        child: '자녀',
        sibling: '형제자매',
        grandparent: '조부모',
        grandchild: '손자녀'
      };

      const familyRelations: FamilyGroup['relations'] = [];
      groupRelationships.forEach(rel => {
        if (rel.relationship_info?.relationship_category !== 'family') {
          return;
        }

        const fromCustomer = rel.from_customer?._id
          ? mergedCustomerMap.get(rel.from_customer._id)
          : undefined;
        const toCustomer = rel.related_customer?._id
          ? mergedCustomerMap.get(rel.related_customer._id)
          : undefined;

        if (!fromCustomer || !toCustomer) {
          return;
        }

        const relationType = rel.relationship_info?.relationship_type || 'relation';
        const relationKey = `${fromCustomer._id}-${toCustomer._id}-${relationType}`;

        if (familyRelations.some(relation => relation.key === relationKey)) {
          return;
        }

        const relationLabel = typeLabels[relationType] || relationType;

        familyRelations.push({
          key: relationKey,
          fromName: fromCustomer.personal_info?.name || '이름없음',
          toName: toCustomer.personal_info?.name || '이름없음',
          relationLabel,
          fromCustomer,
          toCustomer
        });
      });

      const repId = representative?._id;
      if (!repId) {
        return;
      }
      result.가족그룹[repId] = {
        representative,
        members: familyMembers,
        relations: familyRelations
      };
    });

    relationships.forEach(relationship => {
      const category = relationship.relationship_info?.relationship_category;
      if (category !== 'professional' && category !== 'corporate') {
        return;
      }

      const fromCustomer = relationship.from_customer;
      const toCustomer = relationship.related_customer;

      let company: Customer | undefined;
      let employee: Customer | undefined;

      if (fromCustomer?.insurance_info?.customer_type === '법인' &&
          toCustomer?.insurance_info?.customer_type !== '법인') {
        company = mergedCustomerMap.get(fromCustomer._id);
        employee = toCustomer?._id ? mergedCustomerMap.get(toCustomer._id) : undefined;
      } else if (toCustomer?.insurance_info?.customer_type === '법인' &&
                 fromCustomer?.insurance_info?.customer_type !== '법인') {
        company = mergedCustomerMap.get(toCustomer._id);
        employee = fromCustomer?._id ? mergedCustomerMap.get(fromCustomer._id) : undefined;
      }

      if (!company || !employee) {
        return;
      }

      const companyKey = company._id;
      const corporateGroup =
        result.법인[companyKey] ??
        (result.법인[companyKey] = { company, employees: [] });

      if (!corporateGroup.employees.some(e => e._id === employee._id)) {
        corporateGroup.employees.push(employee);
      }
    });

    // 가족관계가 없는 개인 고객 찾기
    const noFamilyRelationshipCustomers: Customer[] = [];
    mergedCustomerMap.forEach((customer) => {
      // 개인 고객이고 가족관계가 없는 경우
      if (
        customer.insurance_info?.customer_type === '개인' &&
        !customersInFamilyRelationship.has(customer._id)
      ) {
        noFamilyRelationshipCustomers.push(customer);
      }
    });

    // 이름순 정렬
    noFamilyRelationshipCustomers.sort((a, b) => {
      const nameA = a.personal_info?.name || '';
      const nameB = b.personal_info?.name || '';
      return nameA.localeCompare(nameB, 'ko');
    });

    result.가족관계미설정 = noFamilyRelationshipCustomers;

    // 관계자가 없는 법인 고객 찾기
    const corporateIdsWithRelationship = new Set(Object.keys(result.법인));
    const noCorporateRelationshipCustomers: Customer[] = [];
    mergedCustomerMap.forEach((customer) => {
      // 법인 고객이고 관계자가 없는 경우
      if (
        customer.insurance_info?.customer_type === '법인' &&
        !corporateIdsWithRelationship.has(customer._id)
      ) {
        noCorporateRelationshipCustomers.push(customer);
      }
    });

    // 이름순 정렬
    noCorporateRelationshipCustomers.sort((a, b) => {
      const nameA = a.personal_info?.name || '';
      const nameB = b.personal_info?.name || '';
      return nameA.localeCompare(nameB, 'ko');
    });

    result.법인관계자미설정 = noCorporateRelationshipCustomers;

    return result;
  }, [documentCustomerMap, relationships, resolvedCustomerMap]);

  // 관계 유형 레이블 조회 헬퍼 함수
  // perspectiveId 기준에서 targetId가 어떤 관계인지 반환
  const getRelationshipLabel = useCallback((targetId: string, perspectiveId?: string): string => {
    const typeLabels: Record<string, string> = {
      spouse: '배우자',
      parent: '부모',
      child: '자녀',
      sibling: '형제자매',
      grandparent: '조부모',
      grandchild: '손자녀',
      ceo: '대표',
      executive: '임원',
      employee: '직원',
      friend: '친구',
      colleague: '동료',
    };

    if (!perspectiveId) {
      // perspectiveId가 없으면 해당 고객이 포함된 아무 관계나 찾기
      const relationship = relationships.find(rel => {
        const fromId = typeof rel.from_customer === 'object' ? rel.from_customer._id : rel.from_customer;
        const toId = typeof rel.related_customer === 'object' ? rel.related_customer._id : rel.related_customer;
        return fromId === targetId || toId === targetId;
      });

      if (!relationship) return '';
      if (relationship.display_relationship_label) return relationship.display_relationship_label;
      const relationType = relationship.relationship_info?.relationship_type;
      return relationType ? (typeLabels[relationType] || relationType) : '';
    }

    // 1단계: perspectiveId → targetId 방향의 관계 찾기 (기준점에서 대상을 보는 관계)
    let relationship = relationships.find(rel => {
      const fromId = typeof rel.from_customer === 'object' ? rel.from_customer._id : rel.from_customer;
      const toId = typeof rel.related_customer === 'object' ? rel.related_customer._id : rel.related_customer;
      return fromId === perspectiveId && toId === targetId;
    });

    if (relationship) {
      if (relationship.display_relationship_label) return relationship.display_relationship_label;
      const relationType = relationship.relationship_info?.relationship_type;
      return relationType ? (typeLabels[relationType] || relationType) : '';
    }

    // 2단계: targetId → perspectiveId 방향의 관계 찾기 (역방향이므로 역관계로 변환)
    relationship = relationships.find(rel => {
      const fromId = typeof rel.from_customer === 'object' ? rel.from_customer._id : rel.from_customer;
      const toId = typeof rel.related_customer === 'object' ? rel.related_customer._id : rel.related_customer;
      return fromId === targetId && toId === perspectiveId;
    });

    if (relationship) {
      // 역방향 관계이므로 역관계로 변환
      const relationType = relationship.relationship_info?.relationship_type;
      if (!relationType) return '';
      const reversedType = REVERSE_RELATION_MAP[relationType] || relationType;
      return typeLabels[reversedType] || reversedType;
    }

    return '';
  }, [relationships]);

  // 초성 필터가 적용된 데이터 계산
  const filteredStructuredData = useMemo(() => {
    if (!selectedInitial) {
      return structuredData;
    }

    const filtered: StructuredData = {
      가족그룹: {},
      법인: {},
      가족관계미설정: [],
      법인관계자미설정: []
    };

    // 가족 그룹 필터링 (대표자 이름 기준)
    Object.entries(structuredData.가족그룹).forEach(([groupId, groupData]) => {
      const repName = groupData.representative.personal_info?.name || '';
      const filteredReps = filterByInitial([groupData.representative], selectedInitial, (c) => c.personal_info?.name || '');
      if (filteredReps.length > 0) {
        filtered.가족그룹[groupId] = groupData;
      }
    });

    // 법인 그룹 필터링 (회사명 기준)
    Object.entries(structuredData.법인).forEach(([companyId, groupData]) => {
      const companyName = groupData.company.personal_info?.name || '';
      const filteredCompanies = filterByInitial([groupData.company], selectedInitial, (c) => c.personal_info?.name || '');
      if (filteredCompanies.length > 0) {
        filtered.법인[companyId] = groupData;
      }
    });

    // 가족관계 미설정 필터링
    filtered.가족관계미설정 = filterByInitial(
      structuredData.가족관계미설정,
      selectedInitial,
      (c) => c.personal_info?.name || ''
    );

    // 법인관계자 미설정 필터링
    filtered.법인관계자미설정 = filterByInitial(
      structuredData.법인관계자미설정,
      selectedInitial,
      (c) => c.personal_info?.name || ''
    );

    return filtered;
  }, [structuredData, selectedInitial]);

  // 초성 카운트 계산 (전체 고객 기준)
  const initialCounts = useMemo(() => {
    const allNames: string[] = [];

    // 가족 그룹 대표자 이름 수집
    Object.values(structuredData.가족그룹).forEach(group => {
      const name = group.representative.personal_info?.name;
      if (name) allNames.push(name);
    });

    // 법인 회사명 수집
    Object.values(structuredData.법인).forEach(group => {
      const name = group.company.personal_info?.name;
      if (name) allNames.push(name);
    });

    // 가족관계 미설정 고객 이름 수집 (숨기기 모드일 때 제외)
    if (!hideUnassigned) {
      structuredData.가족관계미설정.forEach(customer => {
        const name = customer.personal_info?.name;
        if (name) allNames.push(name);
      });
    }

    // 법인관계자 미설정 고객 이름 수집 (숨기기 모드일 때 제외)
    if (!hideUnassigned) {
      structuredData.법인관계자미설정.forEach(customer => {
        const name = customer.personal_info?.name;
        if (name) allNames.push(name);
      });
    }

    // calculateInitialCounts expects array of objects with a getter function
    return calculateInitialCounts(allNames.map(name => ({ name })), (item) => item.name);
  }, [structuredData, hideUnassigned]);

  const corporateEntries = Object.entries(filteredStructuredData.법인);
  const noFamilyRelationshipCustomers = filteredStructuredData.가족관계미설정 || [];
  const noCorporateRelationshipCustomers = filteredStructuredData.법인관계자미설정 || [];

  // 검색어 필터링 및 자동 트리 펼치기
  useEffect(() => {
    if (!searchQuery.trim()) {
      return;
    }

    const query = searchQuery.toLowerCase().trim();
    const newExpandedNodes = new Set<string>(['family', 'corporate']);

    // 가족관계 미설정 고객 검색 (숨기기 모드가 아닐 때만)
    if (!hideUnassigned) {
      newExpandedNodes.add('no-family-relationship');
      const hasNoFamilyMatch = structuredData.가족관계미설정.some(customer => {
        const customerName = customer.personal_info?.name || '';
        return customerName.toLowerCase().includes(query);
      });

      if (hasNoFamilyMatch) {
        newExpandedNodes.add('no-family-relationship');
      }
    }

    // 가족 그룹 검색
    for (const [groupId, groupData] of Object.entries(structuredData.가족그룹)) {
      const groupKey = `family-${groupId}`;

      // 대표자 이름 확인
      const representativeName = (groupData.representative.personal_info?.name || '').toLowerCase();
      if (representativeName.includes(query)) {
        newExpandedNodes.add('family');
        newExpandedNodes.add(groupKey);
        continue;
      }

      // 구성원 이름 확인
      for (const member of groupData.members) {
        const memberName = (member.personal_info?.name || '').toLowerCase();
        if (memberName.includes(query)) {
          newExpandedNodes.add('family');
          newExpandedNodes.add(groupKey);
          break;
        }
      }
    }

    // 법인 그룹 검색
    for (const [companyId, groupData] of Object.entries(structuredData.법인)) {
      const companyKey = `corporate-${companyId}`;

      // 회사명 확인
      const companyName = (groupData.company.personal_info?.name || '').toLowerCase();
      if (companyName.includes(query)) {
        newExpandedNodes.add('corporate');
        newExpandedNodes.add(companyKey);
        continue;
      }

      // 직원 이름 확인
      for (const employee of groupData.employees) {
        const employeeName = (employee.personal_info?.name || '').toLowerCase();
        if (employeeName.includes(query)) {
          newExpandedNodes.add('corporate');
          newExpandedNodes.add(companyKey);
          break;
        }
      }
    }

    setExpandedNodes(newExpandedNodes);
    // 검색 시 뷰 모드를 'all'로 변경
    setViewMode('all');
  }, [searchQuery, structuredData, hideUnassigned]);

  const toggleNode = useCallback((nodeKey: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeKey)) {
        newSet.delete(nodeKey);
      } else {
        newSet.add(nodeKey);
      }
      return newSet;
    });
    // 수동으로 노드를 토글하면 뷰 모드를 'all'로 변경
    if (viewMode !== 'all') {
      setViewMode('all');
    }
  }, [viewMode]);

  // 뷰 모드 순환 토글: 대표만 보기 → 관계만 보기 → 전체 보기 → 대표만 보기
  const toggleViewMode = useCallback(() => {
    let newExpandedNodes: Set<string>;

    if (viewMode === 'representative' || viewMode === 'consonant') {
      // 대표만 보기 → 관계만 보기 (미설정 숨기고 관계 그룹만 펼침)
      newExpandedNodes = new Set<string>(['family', 'corporate']);

      Object.keys(structuredData.가족그룹).forEach(groupId => {
        newExpandedNodes.add(`family-${groupId}`);
      });

      Object.keys(structuredData.법인).forEach(companyId => {
        newExpandedNodes.add(`corporate-${companyId}`);
      });

      setViewMode('relationships');
    } else if (viewMode === 'relationships') {
      // 관계만 보기 → 전체 보기 (미설정 포함 모두 펼침)
      newExpandedNodes = new Set<string>(['family', 'corporate', 'no-family-relationship']);

      Object.keys(structuredData.가족그룹).forEach(groupId => {
        newExpandedNodes.add(`family-${groupId}`);
      });

      Object.keys(structuredData.법인).forEach(companyId => {
        newExpandedNodes.add(`corporate-${companyId}`);
      });

      setViewMode('all');
    } else {
      // 전체 보기 → 대표만 보기
      newExpandedNodes = new Set<string>(['family', 'corporate']);
      setViewMode('representative');
    }

    setExpandedNodes(newExpandedNodes);
  }, [viewMode, structuredData]);

  // 싱글클릭 핸들러 (더블클릭과 구분하기 위해 딜레이)
  const handleCustomerClick = useCallback((customerId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const customer = resolvedCustomerMap.get(customerId);
    if (customer) {
      // 기존 타이머가 있으면 취소
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
      }
      // 300ms 후에 싱글클릭 실행 (더블클릭이면 취소됨)
      clickTimerRef.current = setTimeout(() => {
        // 빠른 등록 패널 모두 닫기 (상호 배타적)
        setSelectedUnassignedCustomer(null);
        setSelectedUnassignedCorporate(null);
        onCustomerSelect?.(customerId, customer);
        clickTimerRef.current = null;
      }, 300);
    }
  }, [resolvedCustomerMap, onCustomerSelect]);

  // 더블클릭 핸들러 (싱글클릭 타이머 취소 후 전체보기)
  const handleCustomerDoubleClick = useCallback((customerId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // 싱글클릭 타이머 취소
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    onCustomerDoubleClick?.(customerId);
  }, [onCustomerDoubleClick]);

  // 검색어 하이라이트 함수
  const highlightText = useCallback((text: string) => {
    if (!searchQuery.trim()) {
      return text;
    }

    const query = searchQuery.toLowerCase().trim();
    const lowerText = text.toLowerCase();
    const index = lowerText.indexOf(query);

    if (index === -1) {
      return text;
    }

    const before = text.substring(0, index);
    const match = text.substring(index, index + searchQuery.length);
    const after = text.substring(index + searchQuery.length);

    return (
      <>
        {before}
        <span className="search-highlight">{match}</span>
        {after}
      </>
    );
  }, [searchQuery]);

  if (loading) {
    return (
      <CenterPaneView
        visible={visible}
        title="관계별 고객 보기"
        titleIcon={<span className="menu-icon-pink"><SFSymbol name="heart-fill" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} /></span>}
        onClose={onClose}
        marginTop={7}
        marginBottom={7}
        marginLeft={7}
        marginRight={7}
        className="customer-relationship-view"
      >
        <div className="relationship-loading">
          <div className="loading-spinner" />
          <div className="loading-text">고객 관계 데이터를 불러오는 중...</div>
        </div>
      </CenterPaneView>
    );
  }

  const hasNoData = hideUnassigned
    ? (Object.keys(filteredStructuredData.가족그룹).length === 0 && corporateEntries.length === 0)
    : (Object.keys(filteredStructuredData.가족그룹).length === 0 && corporateEntries.length === 0 && noFamilyRelationshipCustomers.length === 0 && noCorporateRelationshipCustomers.length === 0);

  return (
    <>
    <CenterPaneView
      visible={visible}
      title="관계별 고객 보기"
      titleIcon={<span className="menu-icon-pink"><SFSymbol name="heart-fill" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} /></span>}
      onClose={onClose}
      marginTop={7}
      marginBottom={7}
      marginLeft={7}
      marginRight={7}
      className="customer-relationship-view"
      titleAccessory={
        <Tooltip content="도움말" placement="bottom">
          <button
            type="button"
            className="help-icon-button"
            onClick={() => setHelpModalVisible(true)}
            aria-label="도움말"
          >
            <SFSymbol name="questionmark.circle" size={SFSymbolSize.BODY} weight={SFSymbolWeight.REGULAR} />
          </button>
        </Tooltip>
      }
    >
      {hasNoData ? (
        <div className="relationship-empty">
          <svg width="48" height="48" viewBox="0 0 16 16" fill="currentColor" opacity="0.3">
            <circle cx="8" cy="5" r="2.5"/>
            <path d="M8 9c-2.5 0-4.5 1.5-4.5 3v1.5h9V12c0-1.5-2-3-4.5-3z"/>
          </svg>
          <div>등록된 고객 관계가 없습니다</div>
          {onNavigate && (
            <Button variant="primary" onClick={() => onNavigate('customers-register')} style={{ marginTop: '16px' }}>
              새 고객 등록
            </Button>
          )}
        </div>
      ) : (
        <div className="relationship-view__content">
          <div className="relationship-tree">
          {/* 헤더: 제목 + 검색 + 새로고침 */}
          <div className="relationship-header">
            <div className="relationship-title">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" className="relationship-title__icon">
                <path d="M6 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-5 6s-1 0-1-1 1-4 6-4 6 3 6 4-1 1-1 1H1zM11 3.5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 1-.5-.5zm.5 2.5a.5.5 0 0 0 0 1h4a.5.5 0 0 0 0-1h-4zm0 3a.5.5 0 0 0 0 1h4a.5.5 0 0 0 0-1h-4z"/>
              </svg>
              고객 관계 현황
            </div>
            <div className="relationship-header-actions">
              {/* 트리 뷰 모드 전환 버튼 */}
              <div className="relationship-tree-controls" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Tooltip content={
                  viewMode === 'representative' ? "관계만 보기" :
                  viewMode === 'consonant' ? "관계만 보기" :
                  viewMode === 'relationships' ? "전체 보기" :
                  "대표만 보기"
                }>
                  <div style={{ display: 'inline-flex', width: '24px', height: '24px', position: 'relative' }}>
                    <button
                      type="button"
                      className="tree-control-button"
                      onClick={toggleViewMode}
                      aria-label={
                        viewMode === 'representative' ? "관계만 보기" :
                        viewMode === 'consonant' ? "관계만 보기" :
                        viewMode === 'relationships' ? "전체 보기" :
                        "대표만 보기"
                      }
                      style={{ position: 'relative' }}
                    >
                      {/* 대표만 보기 - 작은 트리 */}
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        style={{
                          display: (viewMode === 'representative' || viewMode === 'consonant') ? 'block' : 'none',
                          position: 'absolute',
                          top: '50%',
                          left: '50%',
                          transform: 'translate(-50%, -50%)'
                        }}
                      >
                        <circle cx="8" cy="5" r="1.5" fill="currentColor"/>
                        <line x1="8" y1="6.5" x2="8" y2="8.5" strokeWidth="1.5"/>
                        <line x1="8" y1="8.5" x2="5" y2="11" strokeWidth="1.5"/>
                        <line x1="8" y1="8.5" x2="11" y2="11" strokeWidth="1.5"/>
                        <circle cx="5" cy="11" r="1.5" fill="currentColor"/>
                        <circle cx="11" cy="11" r="1.5" fill="currentColor"/>
                      </svg>

                      {/* 관계만 보기 - 연결된 두 그룹 */}
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        style={{
                          display: viewMode === 'relationships' ? 'block' : 'none',
                          position: 'absolute',
                          top: '50%',
                          left: '50%',
                          transform: 'translate(-50%, -50%)'
                        }}
                      >
                        <circle cx="5" cy="4" r="1.5" fill="currentColor"/>
                        <circle cx="11" cy="4" r="1.5" fill="currentColor"/>
                        <line x1="6.5" y1="4" x2="9.5" y2="4" strokeWidth="1.5"/>
                        <line x1="5" y1="5.5" x2="5" y2="8" strokeWidth="1.5"/>
                        <line x1="11" y1="5.5" x2="11" y2="8" strokeWidth="1.5"/>
                        <line x1="5" y1="8" x2="3" y2="10.5" strokeWidth="1.5"/>
                        <line x1="5" y1="8" x2="7" y2="10.5" strokeWidth="1.5"/>
                        <line x1="11" y1="8" x2="9" y2="10.5" strokeWidth="1.5"/>
                        <line x1="11" y1="8" x2="13" y2="10.5" strokeWidth="1.5"/>
                        <circle cx="3" cy="10.5" r="1" fill="currentColor"/>
                        <circle cx="7" cy="10.5" r="1" fill="currentColor"/>
                        <circle cx="9" cy="10.5" r="1" fill="currentColor"/>
                        <circle cx="13" cy="10.5" r="1" fill="currentColor"/>
                      </svg>

                      {/* 전체 보기 - 큰 트리 */}
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        style={{
                          display: viewMode === 'all' ? 'block' : 'none',
                          position: 'absolute',
                          top: '50%',
                          left: '50%',
                          transform: 'translate(-50%, -50%)'
                        }}
                      >
                        <circle cx="8" cy="3" r="1.5" fill="currentColor"/>
                        <line x1="8" y1="4.5" x2="8" y2="6.5" strokeWidth="1.5"/>
                        <line x1="8" y1="6.5" x2="4" y2="8" strokeWidth="1.5"/>
                        <line x1="8" y1="6.5" x2="12" y2="8" strokeWidth="1.5"/>
                        <circle cx="4" cy="8" r="1.5" fill="currentColor"/>
                        <circle cx="12" cy="8" r="1.5" fill="currentColor"/>
                        <line x1="4" y1="9.5" x2="4" y2="11" strokeWidth="1.5"/>
                        <line x1="4" y1="11" x2="2" y2="13" strokeWidth="1.5"/>
                        <line x1="4" y1="11" x2="6" y2="13" strokeWidth="1.5"/>
                        <line x1="12" y1="9.5" x2="12" y2="11" strokeWidth="1.5"/>
                        <line x1="12" y1="11" x2="10" y2="13" strokeWidth="1.5"/>
                        <line x1="12" y1="11" x2="14" y2="13" strokeWidth="1.5"/>
                        <circle cx="2" cy="13" r="1" fill="currentColor"/>
                        <circle cx="6" cy="13" r="1" fill="currentColor"/>
                        <circle cx="10" cy="13" r="1" fill="currentColor"/>
                        <circle cx="14" cy="13" r="1" fill="currentColor"/>
                      </svg>
                    </button>
                  </div>
                </Tooltip>
                <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                  {viewMode === 'representative' ? "대표만 보기" :
                   viewMode === 'consonant' ? "대표만 보기" :
                   viewMode === 'relationships' ? "관계만 보기" :
                   "전체 보기"}
                </span>
              </div>
              <div className="relationship-search">
                <input
                  type="text"
                  className="relationship-search-input"
                  placeholder="고객 이름 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="고객 이름 검색"
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="relationship-search-clear"
                    onClick={() => setSearchQuery('')}
                    aria-label="검색어 지우기"
                  >
                    <SFSymbol
                      name="xmark.circle.fill"
                      size={SFSymbolSize.CAPTION_1}
                      weight={SFSymbolWeight.MEDIUM}
                    />
                  </button>
                )}
              </div>
            </div>
          </div>
          {/* 초성 필터 바 */}
          <InitialFilterBar
            initialType={initialType}
            onInitialTypeChange={setInitialType}
            selectedInitial={selectedInitial}
            onSelectedInitialChange={setSelectedInitial}
            initialCounts={initialCounts}
            countLabel="명"
            targetLabel="고객/그룹"
            className="relationship-initial-filter"
          />
          {/* 가족 관계 섹션 - 가족 그룹 또는 가족관계 미설정 고객이 있을 때 표시 */}
          {(Object.keys(filteredStructuredData.가족그룹).length > 0 || (!hideUnassigned && noFamilyRelationshipCustomers.length > 0)) && (
            <div className="tree-section">
              <div
                className="tree-node tree-node--root"
                onClick={() => toggleNode('family')}
              >
                <span className={`tree-node__icon ${expandedNodes.has('family') ? 'expanded' : ''}`}>
                  {expandedNodes.has('family') ? '📂' : '📁'}
                </span>
                <div className="tree-node__content">
                  <span className="tree-node__label tree-node__label--family">가족</span>
                  <span className="tree-node__badge">
                    {Object.keys(filteredStructuredData.가족그룹).length}
                  </span>
                </div>
              </div>

              {expandedNodes.has('family') && (
                <div className="tree-children">
                  {/* 가족 그룹 목록 (초성 필터는 상단 InitialFilterBar로 처리) */}
                  {Object.entries(filteredStructuredData.가족그룹)
                    .sort(([, a], [, b]) => {
                      const nameA = a.representative.personal_info?.name || '';
                      const nameB = b.representative.personal_info?.name || '';
                      return nameA.localeCompare(nameB, 'ko');
                    })
                    .map(([groupId, groupData]) => {
                      const representativeName = groupData.representative.personal_info?.name || '이름없음';
                      const groupKey = `family-${groupId}`;
                      const relationKey = `${groupKey}-relations`;

                      return (
                        <div key={groupKey} className="tree-group">
                          <div
                            className="tree-node tree-node--group"
                            onClick={() => toggleNode(groupKey)}
                          >
                            <span className={`tree-node__icon ${expandedNodes.has(groupKey) ? 'expanded' : ''}`}>
                              {expandedNodes.has(groupKey) ? '📂' : '📁'}
                            </span>
                            <div className="tree-node__content">
                              <span
                                className="tree-node__label tree-node__label--clickable"
                                onClick={(e) => handleCustomerClick(groupData.representative._id, e)}
                                onDoubleClick={(e) => handleCustomerDoubleClick(groupData.representative._id, e)}
                              >
                                👑 {highlightText(representativeName)} (대표)
                              </span>
                              {groupData.relations.length > 0 && (
                                <span
                                  className="tree-node__relation-toggle"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleNode(relationKey);
                                  }}
                                >
                                  {expandedNodes.has(relationKey) ? '🔗' : '🔗'}
                                </span>
                              )}
                              <span className="tree-node__badge tree-node__badge--success">
                                {groupData.members.length}
                              </span>
                            </div>
                          </div>

                          {expandedNodes.has(groupKey) && (
                            <div className="tree-children">
                              {/* 가족 구성원 - 들여쓰기 적용 */}
                              {groupData.members
                                .filter(member => member._id !== groupData.representative._id)
                                .sort((a, b) => (a.personal_info?.name || '').localeCompare(b.personal_info?.name || '', 'ko'))
                                .map((member) => (
                                  <div key={member._id} className="tree-node tree-node--leaf tree-node--member">
                                    <span className="tree-node__icon">
                                      <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="customer-icon--personal">
                                        <circle cx="10" cy="10" r="10" opacity="0.2" />
                                        <circle cx="10" cy="7" r="3" />
                                        <path d="M10 11c-3 0-5 2-5 4v2h10v-2c0-2-2-4-5-4z" />
                                      </svg>
                                    </span>
                                    <span
                                      className="tree-node__label tree-node__label--clickable"
                                      onClick={(e) => handleCustomerClick(member._id, e)}
                                      onDoubleClick={(e) => handleCustomerDoubleClick(member._id, e)}
                                    >
                                      {highlightText(member.personal_info?.name || '이름없음')}
                                      {(() => {
                                        const label = getRelationshipLabel(member._id, groupData.representative._id);
                                        return label ? ` (${label})` : '';
                                      })()}
                                    </span>
                                  </div>
                                ))}

                              {/* 관계 정보 - 🔗 클릭 시에만 표시 */}
                              {expandedNodes.has(relationKey) && groupData.relations.length > 0 && (
                                <div className="relation-list">
                                  {groupData.relations.map((relation) => {
                                    // A → B: A의 입장에서 B는 어떤 관계인지 표시
                                    // relationLabel은 이미 A→B 관계를 나타냄 (from의 입장에서 to의 관계)
                                    const relationFromA = `${relation.fromName}의 ${relation.relationLabel}`;

                                    // 아이콘도 relationLabel(A→B 관계)에 맞춰 표시
                                    const getRelationIcon = (label: string) => {
                                      switch (label) {
                                        case '배우자': return '❤️';       // 대칭 관계 (하트)
                                        case '자녀': return '👶';         // A의 자녀
                                        case '부모': return '👨‍👩';       // A의 부모 = 부모 세대
                                        case '형제자매': return '👫';     // 대칭 관계
                                        default: return '👥';
                                      }
                                    };

                                    const icon = getRelationIcon(relation.relationLabel);

                                    return (
                                      <div
                                        key={relation.key}
                                        className="relation-item"
                                        title={relationFromA}
                                      >
                                        <span className="relation-item__icon">{icon}</span>
                                        <span className="relation-item__text">
                                          {relation.fromName} → {relation.toName}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                  {/* 가족관계 미설정 섹션 - 가족 폴더 내 최하단 (숨기기 모드 시 미표시) */}
                  {!hideUnassigned && noFamilyRelationshipCustomers.length > 0 && (
                    <div className="tree-group">
                      <div
                        className="tree-node tree-node--group"
                        onClick={() => toggleNode('no-family-relationship')}
                      >
                        <span className="tree-node__icon">
                          ⚠️
                        </span>
                        <div className="tree-node__content">
                          <span className="tree-node__label tree-node__label--no-relationship">
                            가족관계 미설정
                          </span>
                          <span className="tree-node__badge tree-node__badge--warning">
                            {noFamilyRelationshipCustomers.length}
                          </span>
                        </div>
                      </div>

                      {expandedNodes.has('no-family-relationship') && (
                        <div className="tree-children">
                          {noFamilyRelationshipCustomers.map((customer) => (
                            <div key={customer._id} className="tree-node tree-node--leaf">
                              <span className="tree-node__icon">
                                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="customer-icon--personal" style={{ opacity: 0.5 }}>
                                  <circle cx="10" cy="10" r="10" opacity="0.2" />
                                  <circle cx="10" cy="7" r="3" />
                                  <path d="M10 11c-3 0-5 2-5 4v2h10v-2c0-2-2-4-5-4z" />
                                </svg>
                              </span>
                              <span
                                className={`tree-node__label tree-node__label--clickable ${selectedUnassignedCustomer?._id === customer._id ? "tree-node__label--selected" : ""}`}
                                onClick={(e) => { e.stopPropagation(); onCustomerSelect?.(null, undefined); setSelectedUnassignedCorporate(null); setSelectedUnassignedCustomer(customer); }}
                              >
                                {highlightText(customer.personal_info?.name || '이름없음')}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 법인 관계 섹션 - 법인 그룹 또는 관계자 미설정 법인이 있을 때 표시 */}
          {(corporateEntries.length > 0 || (!hideUnassigned && noCorporateRelationshipCustomers.length > 0)) && (
            <div className="tree-section">
              <div
                className="tree-node tree-node--root"
                onClick={() => toggleNode('corporate')}
              >
                <span className={`tree-node__icon ${expandedNodes.has('corporate') ? 'expanded' : ''}`}>
                  {expandedNodes.has('corporate') ? '📂' : '📁'}
                </span>
                <div className="tree-node__content">
                  <span className="tree-node__label tree-node__label--corporate">법인</span>
                  <span className="tree-node__badge">{corporateEntries.length}</span>
                </div>
              </div>

              {expandedNodes.has('corporate') && (
                <div className="tree-children">
                  {corporateEntries
                    .sort(([, a], [, b]) => {
                      const nameA = a.company.personal_info?.name || '';
                      const nameB = b.company.personal_info?.name || '';
                      return nameA.localeCompare(nameB, 'ko');
                    })
                    .map(([companyId, groupData]) => {
                      const companyName = groupData.company.personal_info?.name || '회사명없음';
                      const companyKey = `corporate-${companyId}`;

                      return (
                        <div key={companyKey} className="tree-group">
                          <div
                            className="tree-node tree-node--group"
                            onClick={() => toggleNode(companyKey)}
                          >
                            <span className={`tree-node__icon ${expandedNodes.has(companyKey) ? 'expanded' : ''}`}>
                              {expandedNodes.has(companyKey) ? '📂' : '📁'}
                            </span>
                            <div className="tree-node__content">
                              <span
                                className="tree-node__label tree-node__label--clickable"
                                onClick={(e) => handleCustomerClick(groupData.company._id, e)}
                                onDoubleClick={(e) => handleCustomerDoubleClick(groupData.company._id, e)}
                              >
                                {highlightText(companyName)}
                              </span>
                              <span className="tree-node__badge">{groupData.employees.length}</span>
                            </div>
                          </div>

                          {expandedNodes.has(companyKey) && (
                            <div className="tree-children">
                              {groupData.employees
                                .sort((a, b) => (a.personal_info?.name || '').localeCompare(b.personal_info?.name || '', 'ko'))
                                .map((employee) => (
                                  <div key={`${companyId}-${employee._id}`} className="tree-node tree-node--leaf">
                                    <span className="tree-node__icon">
                                      <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="customer-icon--personal">
                                        <circle cx="10" cy="10" r="10" opacity="0.2" />
                                        <circle cx="10" cy="7" r="3" />
                                        <path d="M10 11c-3 0-5 2-5 4v2h10v-2c0-2-2-4-5-4z" />
                                      </svg>
                                    </span>
                                    <span
                                      className="tree-node__label tree-node__label--clickable"
                                      onClick={(e) => handleCustomerClick(employee._id, e)}
                                      onDoubleClick={(e) => handleCustomerDoubleClick(employee._id, e)}
                                    >
                                      {highlightText(employee.personal_info?.name || '이름없음')}
                                      {(() => {
                                        const label = getRelationshipLabel(employee._id, companyId);
                                        return label ? ` (${label})` : '';
                                      })()}
                                    </span>
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      );
                    })
				}

                  {/* 관계자 미설정 섹션 - 법인 폴더 내 최하단 (숨기기 모드 시 미표시) */}
                  {!hideUnassigned && noCorporateRelationshipCustomers.length > 0 && (
                    <div className="tree-group">
                      <div
                        className="tree-node tree-node--group"
                        onClick={() => toggleNode('no-corporate-relationship')}
                      >
                        <span className="tree-node__icon">
                          ⚠️
                        </span>
                        <div className="tree-node__content">
                          <span className="tree-node__label tree-node__label--no-relationship">
                            관계자 미설정
                          </span>
                          <span className="tree-node__badge tree-node__badge--warning">
                            {noCorporateRelationshipCustomers.length}
                          </span>
                        </div>
                      </div>

                      {expandedNodes.has('no-corporate-relationship') && (
                        <div className="tree-children">
                          {noCorporateRelationshipCustomers.map((customer) => (
                            <div key={customer._id} className="tree-node tree-node--leaf">
                              <span className="tree-node__icon">
                                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="customer-icon--corporate" style={{ opacity: 0.5 }}>
                                  <rect x="2" y="4" width="16" height="14" rx="2" opacity="0.2" />
                                  <rect x="5" y="7" width="4" height="3" rx="0.5" />
                                  <rect x="11" y="7" width="4" height="3" rx="0.5" />
                                  <rect x="5" y="12" width="4" height="3" rx="0.5" />
                                  <rect x="11" y="12" width="4" height="3" rx="0.5" />
                                </svg>
                              </span>
                              <span
                                className={`tree-node__label tree-node__label--clickable ${selectedUnassignedCorporate?._id === customer._id ? "tree-node__label--selected" : ""}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onCustomerSelect?.(null, undefined);
                                  setSelectedUnassignedCustomer(null);
                                  setSelectedUnassignedCorporate(customer);
                                }}
                              >
                                {highlightText(customer.personal_info?.name || '회사명없음')}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          </div>

          {/* 빠른 가족 등록 패널 */}
          {selectedUnassignedCustomer && (
            <div className="relationship-view__panel">
              <QuickFamilyAssignPanel
                customer={selectedUnassignedCustomer}
                onComplete={() => {
                  setSelectedUnassignedCustomer(null);
                }}
                onClose={() => setSelectedUnassignedCustomer(null)}
              />
            </div>
          )}

          {/* 빠른 구성원 등록 패널 (법인) */}
          {selectedUnassignedCorporate && (
            <div className="relationship-view__panel">
              <QuickFamilyAssignPanel
                customer={selectedUnassignedCorporate}
                mode="corporate"
                onComplete={() => {
                  setSelectedUnassignedCorporate(null);
                }}
                onClose={() => setSelectedUnassignedCorporate(null)}
              />
            </div>
          )}
        </div>
      )}
    </CenterPaneView>

    {/* 도움말 모달 */}
    <Modal
      visible={helpModalVisible}
      onClose={() => setHelpModalVisible(false)}
      title="💕 관계별 고객 보기 사용법"
      size="md"
    >
      <div className="help-modal-content">
        <div className="help-modal-section">
          <p><strong>👨‍👩‍👧‍👦 가족 관계</strong></p>
          <ul>
            <li>가족 폴더 클릭 → 가족 그룹 표시</li>
            <li><strong>👑 표시</strong> = 가족 대표</li>
            <li>이름 클릭 → <strong>상세 정보</strong></li>
          </ul>
        </div>

        <div className="help-modal-section">
          <p><strong>🏢 법인 관계</strong></p>
          <ul>
            <li>법인 폴더 클릭 → 소속 <strong>직원/임원</strong> 표시</li>
            <li>괄호 안에 <strong>직책</strong> (대표, 임원, 직원)</li>
          </ul>
        </div>

        <div className="help-modal-section">
          <p><strong>⚠️ 미설정 고객</strong></p>
          <ul>
            <li>가족/법인 관계가 없는 고객 목록</li>
            <li>클릭 → <strong>빠른 등록 패널</strong>에서 관계 설정</li>
          </ul>
        </div>

        <div className="help-modal-section">
          <p><strong>💡 활용</strong></p>
          <ul>
            <li>가족 보험 설계 → <strong>가족 그룹</strong>에서 확인</li>
            <li>법인 단체보험 → <strong>법인 폴더</strong>에서 파악</li>
          </ul>
        </div>
      </div>
    </Modal>
    </>
  );
};

export default CustomerRelationshipView;

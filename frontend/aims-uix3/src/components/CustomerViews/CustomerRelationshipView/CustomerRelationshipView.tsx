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

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import CenterPaneView from '../../CenterPaneView/CenterPaneView';
import SFSymbol, { SFSymbolSize, SFSymbolWeight } from '../../SFSymbol';
import RefreshButton from '../../RefreshButton/RefreshButton';
import Tooltip from '@/shared/ui/Tooltip';
import { RelationshipService, type Relationship } from '../../../services/relationshipService';
import { useCustomerDocument } from '@/hooks/useCustomerDocument';
import type { Customer } from '@/entities/customer/model';
import './CustomerRelationshipView.css';

interface CustomerRelationshipViewProps {
  /** View 표시 여부 */
  visible: boolean;
  /** View 닫기 핸들러 */
  onClose: () => void;
  /** 고객 선택 핸들러 */
  onCustomerSelect?: (customerId: string, customer?: Customer) => void;
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
  onCustomerSelect
}) => {
  // Document-View 패턴: CustomerDocument 구독
  const {
    customers: allCustomers,
    isLoading: customersLoading,
    loadCustomers,
    refresh,
  } = useCustomerDocument();

  const [relationships, setRelationships] = useState<PopulatedRelationship[]>([]);
  const [relationshipsLoading, setRelationshipsLoading] = useState(false);

  // 검색어 상태
  const [searchQuery, setSearchQuery] = useState<string>('');

  // LocalStorage에서 트리 확장 상태 복원
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('aims_relationship_expanded_nodes');
      if (saved) {
        const parsed = JSON.parse(saved);
        return new Set(Array.isArray(parsed) ? parsed : ['family', 'corporate']);
      }
    } catch (error) {
      console.error('[CustomerRelationshipView] 확장 상태 복원 실패:', error);
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

  // 초기 데이터 로드
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log('[CustomerRelationshipView] Document 구독 및 초기 데이터 로드');
    }
    loadCustomers({ limit: 10000 });
  }, [loadCustomers]);

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

  // relationshipChanged 이벤트 수신하여 데이터 새로고침
  useEffect(() => {
    const handleRelationshipChange = async () => {
      if (import.meta.env.DEV) {
        console.log('[CustomerRelationshipView] relationshipChanged 이벤트 수신 - 데이터 새로고침');
      }
      // refresh()로 캐시 무시하고 서버에서 최신 데이터 강제 로드
      await refresh({ limit: 10000 });
      await loadRelationshipsData();
    };

    window.addEventListener('relationshipChanged', handleRelationshipChange);
    return () => {
      window.removeEventListener('relationshipChanged', handleRelationshipChange);
    };
  }, [refresh, loadRelationshipsData]);

  const loading = customersLoading || relationshipsLoading;
  // 데이터 구조화
  const structuredData = useMemo((): StructuredData => {
    if (!relationships.length && documentCustomerMap.size === 0) {
      return { 가족그룹: {}, 법인: {} };
    }

    const mergedCustomerMap = new Map(resolvedCustomerMap);

    if (mergedCustomerMap.size === 0) {
      return { 가족그룹: {}, 법인: {} };
    }

    const result: StructuredData = {
      가족그룹: {},
      법인: {}
    };

    const familyNetworks = new Map<string, Set<string>>();
    const processed = new Set<string>();

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

    return result;
  }, [documentCustomerMap, relationships, resolvedCustomerMap]);

  // 검색어 필터링 및 자동 트리 펼치기
  useEffect(() => {
    if (!searchQuery.trim()) {
      return;
    }

    const query = searchQuery.toLowerCase().trim();
    const newExpandedNodes = new Set<string>(['family', 'corporate']);

    // 가족 그룹 검색
    Object.entries(structuredData.가족그룹).forEach(([groupId, groupData]) => {
      const groupKey = `family-${groupId}`;

      // 대표자 이름 확인
      const representativeName = groupData.representative.personal_info?.name || '';
      if (representativeName.toLowerCase().includes(query)) {
        newExpandedNodes.add('family');
        newExpandedNodes.add(groupKey);
        return;
      }

      // 구성원 이름 확인
      const hasMatch = groupData.members.some(member => {
        const memberName = member.personal_info?.name || '';
        return memberName.toLowerCase().includes(query);
      });

      if (hasMatch) {
        newExpandedNodes.add('family');
        newExpandedNodes.add(groupKey);
      }
    });

    // 법인 그룹 검색
    Object.entries(structuredData.법인).forEach(([companyId, groupData]) => {
      const companyKey = `corporate-${companyId}`;

      // 회사명 확인
      const companyName = groupData.company.personal_info?.name || '';
      if (companyName.toLowerCase().includes(query)) {
        newExpandedNodes.add('corporate');
        newExpandedNodes.add(companyKey);
        return;
      }

      // 직원 이름 확인
      const hasMatch = groupData.employees.some(employee => {
        const employeeName = employee.personal_info?.name || '';
        return employeeName.toLowerCase().includes(query);
      });

      if (hasMatch) {
        newExpandedNodes.add('corporate');
        newExpandedNodes.add(companyKey);
      }
    });

    setExpandedNodes(newExpandedNodes);
  }, [searchQuery, structuredData]);

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
  }, []);

  // 전체 펼치기
  const expandAll = useCallback(() => {
    const allNodes = new Set<string>(['family', 'corporate']);

    // 가족 그룹 노드 추가
    Object.keys(structuredData.가족그룹).forEach(groupId => {
      allNodes.add(`family-${groupId}`);
    });

    // 법인 그룹 노드 추가
    Object.keys(structuredData.법인).forEach(companyId => {
      allNodes.add(`corporate-${companyId}`);
    });

    setExpandedNodes(allNodes);
  }, [structuredData]);

  // 전체 접기
  const collapseAll = useCallback(() => {
    setExpandedNodes(new Set());
  }, []);

  // 대표만 보기 (가족/법인 루트만 펼침, 각 그룹은 접힌 상태)
  const expandToRepresentatives = useCallback(() => {
    // 가족/법인 섹션만 펼치고, 각 그룹은 접어서 대표자만 보이게 함
    const representativeNodes = new Set<string>(['family', 'corporate']);
    setExpandedNodes(representativeNodes);
  }, []);

  const handleCustomerClick = useCallback((customerId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const customer = resolvedCustomerMap.get(customerId);
    if (customer) {
      onCustomerSelect?.(customerId, customer);
    }
  }, [resolvedCustomerMap, onCustomerSelect]);

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
        title="관계별 보기"
        titleIcon={<SFSymbol name="person-2" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} />}
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

  const familyEntries = Object.entries(structuredData.가족그룹);
  const corporateEntries = Object.entries(structuredData.법인);
  const hasNoData = familyEntries.length === 0 && corporateEntries.length === 0;

  return (
    <CenterPaneView
      visible={visible}
      title="관계별 보기"
      titleIcon={<SFSymbol name="person-2" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} />}
      onClose={onClose}
      marginTop={7}
      marginBottom={7}
      marginLeft={7}
      marginRight={7}
      className="customer-relationship-view"
    >
      {hasNoData ? (
        <div className="relationship-empty">
          <svg width="48" height="48" viewBox="0 0 16 16" fill="currentColor" opacity="0.3">
            <circle cx="8" cy="5" r="2.5"/>
            <path d="M8 9c-2.5 0-4.5 1.5-4.5 3v1.5h9V12c0-1.5-2-3-4.5-3z"/>
          </svg>
          <div>등록된 고객 관계가 없습니다</div>
        </div>
      ) : (
        <div className="relationship-tree">
          {/* 헤더: 제목 + 검색 + 새로고침 */}
          <div className="relationship-header">
            <div className="relationship-title">고객 관계 현황</div>
            <div className="relationship-header-actions">
              {/* 트리 전체 펼치기/접기 버튼 */}
              <div className="relationship-tree-controls">
                <Tooltip content="전체 펼치기">
                  <button
                    type="button"
                    className="tree-control-button"
                    onClick={expandAll}
                    aria-label="전체 펼치기"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M4 2l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/>
                    </svg>
                  </button>
                </Tooltip>
                <Tooltip content="대표만 보기">
                  <button
                    type="button"
                    className="tree-control-button"
                    onClick={expandToRepresentatives}
                    aria-label="대표만 보기"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </Tooltip>
                <Tooltip content="전체 접기">
                  <button
                    type="button"
                    className="tree-control-button"
                    onClick={collapseAll}
                    aria-label="전체 접기"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 10l4-4 4 4" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M4 14l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/>
                    </svg>
                  </button>
                </Tooltip>
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
              <RefreshButton
                onClick={async () => {
                  await refresh({ limit: 10000 });
                  await loadRelationshipsData();
                }}
                loading={loading}
                tooltip="관계 데이터 새로고침"
                size="small"
              />
            </div>
          </div>
          {/* 가족 관계 섹션 */}
          {familyEntries.length > 0 && (
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
                  <span className="tree-node__badge">{familyEntries.length}</span>
                </div>
              </div>

              {expandedNodes.has('family') && (
                <div className="tree-children">
                  {familyEntries
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
                            {/* 가족 구성원 */}
                            {groupData.members
                              .filter(member => member._id !== groupData.representative._id)
                              .sort((a, b) => (a.personal_info?.name || '').localeCompare(b.personal_info?.name || '', 'ko'))
                              .map((member) => (
                                <div key={member._id} className="tree-node tree-node--leaf">
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
                                  >
                                    {highlightText(member.personal_info?.name || '이름없음')}
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
                    })
				}
                </div>
              )}
            </div>
          )}

          {/* 법인 관계 섹션 */}
          {corporateEntries.length > 0 && (
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
                                    >
                                      {highlightText(employee.personal_info?.name || '이름없음')}
                                    </span>
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      );
                    })
				}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </CenterPaneView>
  );
};

export default CustomerRelationshipView;

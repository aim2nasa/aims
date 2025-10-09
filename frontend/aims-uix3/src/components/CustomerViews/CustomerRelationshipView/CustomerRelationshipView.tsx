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
import SFSymbol, { SFSymbolSize, SFSymbolWeight } from '../../SFSymbol/SFSymbol';
import { RelationshipService } from '../../../services/relationshipService';
import { useCustomersController } from '@/features/customer/controllers/useCustomersController';
import type { Customer } from '@/entities/customer/model';
import './CustomerRelationshipView.css';

interface CustomerRelationshipViewProps {
  /** View 표시 여부 */
  visible: boolean;
  /** View 닫기 핸들러 */
  onClose: () => void;
  /** 고객 선택 핸들러 */
  onCustomerSelect?: (customerId: string) => void;
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
  법인: Record<string, string[]>;
}

/**
 * CustomerRelationshipView React 컴포넌트
 */
export const CustomerRelationshipView: React.FC<CustomerRelationshipViewProps> = ({
  visible,
  onClose,
  onCustomerSelect
}) => {
  // Controller 패턴 사용 (자동 캐싱)
  const {
    customers: allCustomers,
    isLoading: customersLoading,
  } = useCustomersController({
    initialLimit: 10000,
    autoLoad: true, // 앱 시작 시 한 번만 로드 (캐싱됨)
  });

  const [relationships, setRelationships] = useState<any[]>([]);
  const [relationshipsLoading, setRelationshipsLoading] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['family', 'corporate']));

  // 관계 데이터 로드 (visible이 true가 될 때마다 새로고침)
  useEffect(() => {
    if (visible && allCustomers.length > 0) {
      loadRelationshipsData();
    }
  }, [visible, allCustomers.length]);

  const loadRelationshipsData = async () => {
    try {
      setRelationshipsLoading(true);
      const data = await RelationshipService.getAllRelationshipsWithCustomers();
      setRelationships(data.relationships);
    } catch (error) {
      console.error('관계 데이터 로드 실패:', error);
    } finally {
      setRelationshipsLoading(false);
    }
  };

  const loading = customersLoading || relationshipsLoading;
  const customers = allCustomers;

  // 데이터 구조화
  const structuredData = useMemo((): StructuredData => {
    if (!customers.length || !relationships.length) {
      return { 가족그룹: {}, 법인: {} };
    }

    const result: StructuredData = {
      가족그룹: {},
      법인: {}
    };

    // 가족 관계 네트워크 구축
    const familyNetworks = new Map<string, Set<string>>();
    const processed = new Set<string>();

    // 1단계: 가족 관계 매핑 구축
    relationships.forEach(relationship => {
      const category = relationship.relationship_info?.relationship_category;
      const fromCustomer = relationship.from_customer;
      const toCustomer = relationship.related_customer;

      if (category === 'family' &&
          fromCustomer?.insurance_info?.customer_type === '개인' &&
          toCustomer?.insurance_info?.customer_type === '개인') {

        const fromId = fromCustomer._id;
        const toId = toCustomer._id;

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

    // 2단계: 가족 그룹별로 구성원 수집
    familyNetworks.forEach((connections, customerId) => {
      if (processed.has(customerId)) return;

      const familyGroup = new Set<string>();
      const stack = [customerId];

      while (stack.length > 0) {
        const currentId = stack.pop()!;
        if (familyGroup.has(currentId)) continue;

        familyGroup.add(currentId);
        processed.add(currentId);

        const currentConnections = familyNetworks.get(currentId);
        if (currentConnections) {
          currentConnections.forEach(connectedId => {
            if (!familyGroup.has(connectedId)) {
              stack.push(connectedId);
            }
          });
        }
      }

      const familyMembers = Array.from(familyGroup)
        .map(id => customers.find(c => c._id === id))
        .filter((c): c is Customer => c !== undefined);

      if (familyMembers.length < 2) return;

      // 대표자 선정
      const groupRelationships = relationships.filter(rel => {
        const fromId = rel.from_customer?._id || rel.from_customer;
        const toId = rel.related_customer?._id || rel.related_customer;
        return familyGroup.has(fromId) && familyGroup.has(toId);
      });

      let representative = familyMembers[0];

      if (groupRelationships.length > 0) {
        const relationshipWithRep = groupRelationships.find(rel => rel.family_representative);
        if (relationshipWithRep) {
          const repId = relationshipWithRep.family_representative._id || relationshipWithRep.family_representative;
          representative = familyMembers.find(member => member._id === repId) || representative;
        }
      }

      const repName = representative.personal_info?.name || '이름없음';

      // 관계 수집
      const familyRelations: FamilyGroup['relations'] = [];
      const typeLabels: Record<string, string> = {
        spouse: '배우자',
        parent: '부모',
        child: '자녀'
      };

      relationships.forEach(relationship => {
        const category = relationship.relationship_info?.relationship_category;
        const relationshipType = relationship.relationship_info?.relationship_type;
        const fromCustomer = relationship.from_customer;
        const toCustomer = relationship.related_customer;

        if (category === 'family' &&
            familyGroup.has(fromCustomer._id) && familyGroup.has(toCustomer._id) &&
            fromCustomer?.insurance_info?.customer_type === '개인' &&
            toCustomer?.insurance_info?.customer_type === '개인') {

          const relationLabel = typeLabels[relationshipType] || relationshipType;
          const fromName = fromCustomer.personal_info?.name || '이름없음';
          const toName = toCustomer.personal_info?.name || '이름없음';

          const relationKey = `${fromName}-${toName}-${relationLabel}`;
          if (!familyRelations.some(r => r.key === relationKey)) {
            familyRelations.push({
              key: relationKey,
              fromName,
              toName,
              relationLabel,
              fromCustomer,
              toCustomer
            });
          }
        }
      });

      result.가족그룹[repName] = {
        representative,
        members: familyMembers,
        relations: familyRelations
      };
    });

    // 법인 관계 처리
    relationships.forEach(relationship => {
      const category = relationship.relationship_info?.relationship_category;
      const fromCustomer = relationship.from_customer;
      const toCustomer = relationship.related_customer;

      if (category === 'professional' || category === 'corporate') {
        let companyName: string | undefined;
        let employeeName: string | undefined;

        if (fromCustomer?.insurance_info?.customer_type === '법인' &&
            toCustomer?.insurance_info?.customer_type === '개인') {
          companyName = fromCustomer.personal_info?.name || '회사명없음';
          employeeName = toCustomer.personal_info?.name || '직원명없음';
        } else if (fromCustomer?.insurance_info?.customer_type === '개인' &&
                   toCustomer?.insurance_info?.customer_type === '법인') {
          companyName = toCustomer.personal_info?.name || '회사명없음';
          employeeName = fromCustomer.personal_info?.name || '직원명없음';
        }

        if (companyName && employeeName) {
          if (!result.법인[companyName]) {
            result.법인[companyName] = [];
          }

          if (!result.법인[companyName].includes(employeeName)) {
            result.법인[companyName].push(employeeName);
          }
        }
      }
    });

    return result;
  }, [customers, relationships]);

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

  const handleCustomerClick = useCallback((customerId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onCustomerSelect?.(customerId);
  }, [onCustomerSelect]);

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

  const familyGroups = Object.entries(structuredData.가족그룹);
  const corporateEntries = Object.entries(structuredData.법인);
  const hasNoData = familyGroups.length === 0 && corporateEntries.length === 0;

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
          {/* 가족 관계 섹션 */}
          {familyGroups.length > 0 && (
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
                  <span className="tree-node__badge">{familyGroups.length}</span>
                </div>
              </div>

              {expandedNodes.has('family') && (
                <div className="tree-children">
                  {familyGroups
                    .sort(([a], [b]) => a.localeCompare(b, 'ko'))
                    .map(([repName, groupData]) => (
                      <div key={`family-${repName}`} className="tree-group">
                        <div
                          className="tree-node tree-node--group"
                          onClick={() => toggleNode(`family-${repName}`)}
                        >
                          <span className={`tree-node__icon ${expandedNodes.has(`family-${repName}`) ? 'expanded' : ''}`}>
                            {expandedNodes.has(`family-${repName}`) ? '📂' : '📁'}
                          </span>
                          <div className="tree-node__content">
                            <span
                              className="tree-node__label tree-node__label--clickable"
                              onClick={(e) => handleCustomerClick(groupData.representative._id, e)}
                            >
                              👑 {repName} (대표)
                            </span>
                            <span className="tree-node__badge tree-node__badge--success">
                              {groupData.members.length}
                            </span>
                          </div>
                        </div>

                        {expandedNodes.has(`family-${repName}`) && (
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
                                    {member.personal_info?.name || '이름없음'}
                                  </span>
                                </div>
                              ))}

                            {/* 관계 정보 */}
                            {groupData.relations.length > 0 ? (
                              groupData.relations.map((relation) => (
                                <div key={relation.key} className="tree-node tree-node--relation">
                                  <span className="tree-node__relation-badge">{relation.relationLabel}</span>
                                  <span className="tree-node__label">
                                    {relation.fromName} → {relation.toName}
                                  </span>
                                </div>
                              ))
                            ) : (
                              <div className="tree-node tree-node--empty">
                                <span className="tree-node__icon">💔</span>
                                <span className="tree-node__label">가족 관계 없음 (0)</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
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
                    .sort(([a], [b]) => a.localeCompare(b, 'ko'))
                    .map(([companyName, employees]) => {
                      const company = customers.find(c => c.personal_info?.name === companyName);

                      return (
                        <div key={`corporate-${companyName}`} className="tree-group">
                          <div
                            className="tree-node tree-node--group"
                            onClick={() => toggleNode(`corporate-${companyName}`)}
                          >
                            <span className={`tree-node__icon ${expandedNodes.has(`corporate-${companyName}`) ? 'expanded' : ''}`}>
                              {expandedNodes.has(`corporate-${companyName}`) ? '📂' : '📁'}
                            </span>
                            <div className="tree-node__content">
                              <span
                                className="tree-node__label tree-node__label--clickable"
                                onClick={(e) => company && handleCustomerClick(company._id, e)}
                              >
                                {companyName}
                              </span>
                              <span className="tree-node__badge">{employees.length}</span>
                            </div>
                          </div>

                          {expandedNodes.has(`corporate-${companyName}`) && (
                            <div className="tree-children">
                              {employees
                                .sort((a, b) => a.localeCompare(b, 'ko'))
                                .map((employeeName) => {
                                  const employee = customers.find(c => c.personal_info?.name === employeeName);

                                  return (
                                    <div key={`${companyName}-${employeeName}`} className="tree-node tree-node--leaf">
                                      <span className="tree-node__icon">
                                        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="customer-icon--personal">
                                          <circle cx="10" cy="10" r="10" opacity="0.2" />
                                          <circle cx="10" cy="7" r="3" />
                                          <path d="M10 11c-3 0-5 2-5 4v2h10v-2c0-2-2-4-5-4z" />
                                        </svg>
                                      </span>
                                      <span
                                        className="tree-node__label tree-node__label--clickable"
                                        onClick={(e) => employee && handleCustomerClick(employee._id, e)}
                                      >
                                        {employeeName}
                                      </span>
                                    </div>
                                  );
                                })}
                            </div>
                          )}
                        </div>
                      );
                    })}
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

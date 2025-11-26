/**
 * CustomerManagementView Component
 * @since 1.0.0
 *
 * 고객 관리 대시보드
 * 통계, 빠른 액션, 최근 활동을 포함
 */

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import CenterPaneView from '../../CenterPaneView/CenterPaneView';
import SFSymbol, { SFSymbolSize, SFSymbolWeight } from '../../SFSymbol';
import { StatCard } from '@/shared/ui/StatCard';
import { UsageGuide } from '@/shared/ui/UsageGuide';
import type { GuideSection } from '@/shared/ui/UsageGuide';
import { getCustomers } from '@/services/customerService';
import { getAllRelationshipsWithCustomers } from '@/services/relationshipService';
import { FileTypePieChart } from '@/shared/ui/FileTypePieChart';
import type { FileTypeData } from '@/shared/ui/FileTypePieChart';
import { Dropdown } from '@/shared/ui/Dropdown';
import './CustomerManagementView.css';

type ActivityPeriod = '1week' | '1month' | '3months' | '6months' | '1year';

interface CustomerManagementViewProps {
  /** View 표시 여부 */
  visible: boolean;
  /** View 닫기 핸들러 */
  onClose: () => void;
  /** 메뉴 네비게이션 핸들러 */
  onNavigate?: (menuKey: string) => void;
}

/**
 * CustomerManagementView React 컴포넌트
 *
 * 고객 관리 대시보드 - Mock 데이터 사용 (Phase 1)
 * Phase 2에서 실제 API 연동 예정
 *
 * @example
 * ```tsx
 * <CustomerManagementView
 *   visible={isVisible}
 *   onClose={handleClose}
 * />
 * ```
 */
export const CustomerManagementView: React.FC<CustomerManagementViewProps> = ({
  visible,
  onClose,
  onNavigate,
}) => {
  // 최근 활동 기간 선택 상태
  const [activityPeriod, setActivityPeriod] = useState<ActivityPeriod>('1month');

  // 고객 목록 조회 (통계 계산용)
  const {
    data: customersData,
    isLoading: isCustomersLoading,
    isError: isCustomersError,
  } = useQuery({
    queryKey: ['allCustomers'],
    queryFn: () =>
      getCustomers({
        limit: 1000, // 통계 계산을 위해 많은 수 가져오기
      }),
  });

  // 관계 데이터 조회 (관계 매핑 통계용)
  const {
    data: relationshipsData,
    isLoading: isRelationshipsLoading,
  } = useQuery({
    queryKey: ['allRelationships'],
    queryFn: getAllRelationshipsWithCustomers,
    staleTime: 5 * 60 * 1000, // 5분간 캐시 유지
  });

  // 고객 통계 계산
  const stats = useMemo(() => {
    if (!customersData?.customers) {
      return {
        totalCustomers: 0,
        activeCustomers: 0,
        recentRegistrations: 0,
        relationshipsMapped: 0,
        familyRelationships: 0,
        corporateRelationships: 0,
        personalCustomers: 0,
        corporateCustomers: 0,
        maleCustomers: 0,
        femaleCustomers: 0,
        unknownGenderCustomers: 0,
        under30: 0,
        thirties: 0,
        forties: 0,
        fifties: 0,
        over60: 0,
        unknownAge: 0,
        regionCounts: {} as Record<string, number>,
      };
    }

    const customers = customersData.customers;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 연령 계산 헬퍼
    const getAge = (birthDate: string | undefined) => {
      if (!birthDate) return null;
      const birth = new Date(birthDate);
      const age = now.getFullYear() - birth.getFullYear();
      const monthDiff = now.getMonth() - birth.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
        return age - 1;
      }
      return age;
    };

    // 지역 추출 헬퍼 (주소에서 시/도 추출)
    const extractRegion = (address: string | undefined): string => {
      if (!address) return '미상';

      // 주소에서 첫 번째 공백 전까지 추출 (시/도 이름)
      const firstSpace = address.indexOf(' ');
      if (firstSpace === -1) return '미상';

      const region = address.substring(0, firstSpace).trim();

      // 유효한 시/도 이름인지 확인
      const validRegions = [
        '서울특별시', '서울',
        '부산광역시', '부산',
        '대구광역시', '대구',
        '인천광역시', '인천',
        '광주광역시', '광주',
        '대전광역시', '대전',
        '울산광역시', '울산',
        '세종특별자치시', '세종',
        '경기도', '경기',
        '강원도', '강원',
        '충청북도', '충북',
        '충청남도', '충남',
        '전라북도', '전북',
        '전라남도', '전남',
        '경상북도', '경북',
        '경상남도', '경남',
        '제주특별자치도', '제주'
      ];

      // 짧은 이름을 전체 이름으로 정규화
      const normalized = region
        .replace('서울', '서울특별시')
        .replace('부산', '부산광역시')
        .replace('대구', '대구광역시')
        .replace('인천', '인천광역시')
        .replace('광주', '광주광역시')
        .replace('대전', '대전광역시')
        .replace('울산', '울산광역시')
        .replace('세종', '세종특별자치시')
        .replace('경기', '경기도')
        .replace('강원', '강원도')
        .replace('충북', '충청북도')
        .replace('충남', '충청남도')
        .replace('전북', '전라북도')
        .replace('전남', '전라남도')
        .replace('경북', '경상북도')
        .replace('경남', '경상남도')
        .replace('제주', '제주특별자치도');

      return validRegions.includes(normalized) ? normalized : '미상';
    };

    let maleCount = 0;
    let femaleCount = 0;
    let unknownGenderCount = 0;
    let under30Count = 0;
    let thirtiesCount = 0;
    let fortiesCount = 0;
    let fiftiesCount = 0;
    let over60Count = 0;
    let unknownAgeCount = 0;
    const regionCounts: Record<string, number> = {};

    customers.forEach(customer => {
      // 성별 통계
      const gender = customer.personal_info?.gender;
      if (gender === 'M') {
        maleCount++;
      } else if (gender === 'F') {
        femaleCount++;
      } else {
        unknownGenderCount++;
      }

      // 연령대 통계
      const birthDate = customer.personal_info?.birth_date;
      const age = birthDate ? getAge(birthDate) : null;
      if (age === null) {
        unknownAgeCount++;
      } else if (age < 30) {
        under30Count++;
      } else if (age >= 30 && age < 40) {
        thirtiesCount++;
      } else if (age >= 40 && age < 50) {
        fortiesCount++;
      } else if (age >= 50 && age < 60) {
        fiftiesCount++;
      } else {
        over60Count++;
      }

      // 지역별 통계
      const address = customer.personal_info?.address?.address1;
      const region = extractRegion(address);
      regionCounts[region] = (regionCounts[region] || 0) + 1;
    });

    // 관계 매핑된 고객 수 및 카테고리별 그룹 수 계산 (관계별 보기와 동일한 방식)
    let relationshipsMappedCount = 0;
    let familyGroupsCount = 0;
    let corporateGroupsCount = 0;

    if (relationshipsData?.relationships) {
      const customersWithRelationships = new Set<string>();
      const familyNetworks = new Map<string, Set<string>>();
      const processed = new Set<string>();
      const corporateCompanies = new Set<string>();
      const familyGroupRepresentatives = new Set<string>(); // 가족 그룹 대표자 ID 저장

      // 1. 가족 그룹 네트워크 구축
      relationshipsData.relationships.forEach(rel => {
        const category = rel.relationship_info?.relationship_category;
        const fromCustomer = rel.from_customer;
        const toCustomer = rel.related_customer;
        const fromId = typeof fromCustomer === 'string' ? fromCustomer : fromCustomer?._id;
        const toId = typeof toCustomer === 'string' ? toCustomer : toCustomer?._id;

        if (!fromId || !toId) return;

        // 가족 관계 네트워크 구축 (개인 고객 간)
        if (category === 'family' &&
            typeof fromCustomer === 'object' && fromCustomer?.insurance_info?.customer_type === '개인' &&
            typeof toCustomer === 'object' && toCustomer?.insurance_info?.customer_type === '개인') {
          if (!familyNetworks.has(fromId)) {
            familyNetworks.set(fromId, new Set());
          }
          if (!familyNetworks.has(toId)) {
            familyNetworks.set(toId, new Set());
          }
          familyNetworks.get(fromId)!.add(toId);
          familyNetworks.get(toId)!.add(fromId);
        }

        // 법인 관계 확인 (관계별 보기와 동일: 법인-직원 관계만)
        if ((category === 'professional' || category === 'corporate')) {
          // 한쪽이 법인이고 다른 쪽이 법인이 아닌 경우만 처리
          if (typeof fromCustomer === 'object' && fromCustomer?.insurance_info?.customer_type === '법인' &&
              typeof toCustomer === 'object' && toCustomer?.insurance_info?.customer_type !== '법인') {
            corporateCompanies.add(fromId);
          } else if (typeof toCustomer === 'object' && toCustomer?.insurance_info?.customer_type === '법인' &&
                     typeof fromCustomer === 'object' && fromCustomer?.insurance_info?.customer_type !== '법인') {
            corporateCompanies.add(toId);
          }
        }

        // 관계가 있는 모든 고객 추적
        customersWithRelationships.add(fromId);
        customersWithRelationships.add(toId);
      });

      // 2. 가족 그룹 개수 계산 (관계별 보기와 동일: 대표자 기준)
      familyNetworks.forEach((_, customerId) => {
        if (processed.has(customerId)) return;

        const familyGroupIds = new Set<string>();
        const stack = [customerId];

        while (stack.length > 0) {
          const currentId = stack.pop()!;
          if (familyGroupIds.has(currentId)) continue;

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

        // 2명 이상인 가족 그룹만 처리
        if (familyGroupIds.size >= 2) {
          // 관계별 보기와 동일: family_representative 찾기
          const groupRelationships = relationshipsData.relationships.filter(rel => {
            const fromId = typeof rel.from_customer === 'string' ? rel.from_customer : rel.from_customer?._id;
            const toId = typeof rel.related_customer === 'string' ? rel.related_customer : rel.related_customer?._id;
            return !!fromId && !!toId && familyGroupIds.has(fromId) && familyGroupIds.has(toId);
          });

          // family_representative가 설정된 관계 찾기
          const relationshipWithRep = groupRelationships.find(rel => {
            const rep = rel.family_representative;
            if (!rep) return false;
            const repId = typeof rep === 'object' ? rep._id : rep;
            return repId && familyGroupIds.has(repId);
          });

          // 대표자 결정: family_representative가 있으면 사용, 없으면 첫 번째 멤버
          let representativeId: string;
          if (relationshipWithRep?.family_representative) {
            const rep = relationshipWithRep.family_representative;
            representativeId = typeof rep === 'object' ? rep._id : rep;
          } else {
            representativeId = Array.from(familyGroupIds)[0]!;
          }

          // 대표자 ID를 저장 (관계별 보기와 동일)
          familyGroupRepresentatives.add(representativeId);
        }
      });

      // 가족 그룹 개수 = 대표자 개수
      familyGroupsCount = familyGroupRepresentatives.size;

      // 3. 법인 그룹 개수 = 법인 고객 개수
      corporateGroupsCount = corporateCompanies.size;

      relationshipsMappedCount = customersWithRelationships.size;
    }

    return {
      totalCustomers: customers.length,
      activeCustomers: customers.filter(c => c.meta?.status === 'active').length,
      recentRegistrations: customers.filter(c => {
        const createdAt = c.meta?.created_at ? new Date(c.meta.created_at) : null;
        return createdAt && createdAt >= thirtyDaysAgo;
      }).length,
      relationshipsMapped: relationshipsMappedCount,
      familyRelationships: familyGroupsCount,
      corporateRelationships: corporateGroupsCount,
      personalCustomers: customers.filter(c => c.insurance_info?.customer_type !== '법인').length,
      corporateCustomers: customers.filter(c => c.insurance_info?.customer_type === '법인').length,
      maleCustomers: maleCount,
      femaleCustomers: femaleCount,
      unknownGenderCustomers: unknownGenderCount,
      under30: under30Count,
      thirties: thirtiesCount,
      forties: fortiesCount,
      fifties: fiftiesCount,
      over60: over60Count,
      unknownAge: unknownAgeCount,
      regionCounts,
    };
  }, [customersData, relationshipsData]);

  // 파이 차트 데이터 준비
  const customerTypePieData: FileTypeData[] = useMemo(() => {
    return [
      {
        label: '개인',
        count: stats.personalCustomers,
        color: 'var(--color-primary-500)'
      },
      {
        label: '법인',
        count: stats.corporateCustomers,
        color: 'var(--color-warning)'
      }
    ];
  }, [stats]);

  // 성별 파이 차트
  const genderPieData: FileTypeData[] = useMemo(() => {
    const data: FileTypeData[] = [
      {
        label: '남성',
        count: stats.maleCustomers,
        color: 'var(--color-primary-500)'
      },
      {
        label: '여성',
        count: stats.femaleCustomers,
        color: 'var(--color-ios-purple)'
      }
    ];
    // 미상이 있을 경우에만 추가
    if (stats.unknownGenderCustomers > 0) {
      data.push({
        label: '미상',
        count: stats.unknownGenderCustomers,
        color: 'var(--color-text-tertiary)'
      });
    }
    return data;
  }, [stats]);

  // 연령대 파이 차트
  const agePieData: FileTypeData[] = useMemo(() => {
    const data: FileTypeData[] = [];
    if (stats.under30 > 0) {
      data.push({
        label: '20대 이하',
        count: stats.under30,
        color: 'var(--color-ios-blue)'
      });
    }
    if (stats.thirties > 0) {
      data.push({
        label: '30대',
        count: stats.thirties,
        color: 'var(--color-success)'
      });
    }
    if (stats.forties > 0) {
      data.push({
        label: '40대',
        count: stats.forties,
        color: 'var(--color-warning)'
      });
    }
    if (stats.fifties > 0) {
      data.push({
        label: '50대',
        count: stats.fifties,
        color: 'var(--color-ios-orange)'
      });
    }
    if (stats.over60 > 0) {
      data.push({
        label: '60대 이상',
        count: stats.over60,
        color: 'var(--color-ios-purple)'
      });
    }
    if (stats.unknownAge > 0) {
      data.push({
        label: '미상',
        count: stats.unknownAge,
        color: 'var(--color-text-tertiary)'
      });
    }
    return data;
  }, [stats]);

  // 지역별 파이 차트
  const regionPieData: FileTypeData[] = useMemo(() => {
    // 지역별 색상 매핑 (17개 시/도 + 미상)
    const regionColors: Record<string, string> = {
      '서울특별시': 'var(--color-ios-blue)',
      '부산광역시': 'var(--color-ios-cyan)',
      '대구광역시': 'var(--color-ios-purple)',
      '인천광역시': 'var(--color-ios-teal)',
      '광주광역시': 'var(--color-ios-green)',
      '대전광역시': 'var(--color-ios-orange)',
      '울산광역시': 'var(--color-ios-pink)',
      '세종특별자치시': 'var(--color-ios-indigo)',
      '경기도': 'var(--color-primary-500)',
      '강원도': 'var(--color-success)',
      '충청북도': 'var(--color-warning)',
      '충청남도': '#FFB340',
      '전라북도': '#FF6B6B',
      '전라남도': '#4ECDC4',
      '경상북도': '#9B59B6',
      '경상남도': '#3498DB',
      '제주특별자치도': '#E67E22',
      '미상': 'var(--color-text-tertiary)'
    };

    // regionCounts를 배열로 변환하고, 미상은 마지막으로
    const entries = Object.entries(stats.regionCounts);
    const unknown = entries.filter(([region]) => region === '미상');
    const known = entries.filter(([region]) => region !== '미상').sort((a, b) => b[1] - a[1]);
    const sortedEntries = [...known, ...unknown];

    return sortedEntries.map(([region, count]) => ({
      label: region.replace('특별시', '').replace('광역시', '').replace('특별자치시', '').replace('특별자치도', '').replace('도', ''),
      count,
      color: regionColors[region] || 'var(--color-text-tertiary)'
    }));
  }, [stats]);

  // 최근 활동 데이터 - 기간별 필터링 및 정렬
  const recentCustomers = useMemo(() => {
    if (!customersData?.customers) return [];

    const now = new Date();
    let cutoffDate: Date;

    // 기간에 따른 기준 날짜 계산
    switch (activityPeriod) {
      case '1week':
        cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '1month':
        cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '3months':
        cutoffDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '6months':
        cutoffDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
        break;
      case '1year':
        cutoffDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
    }

    // 각 고객의 최신 활동 시간 계산 및 정렬
    const sorted = [...customersData.customers]
      .map(customer => {
        const created = customer.meta?.created_at ? new Date(customer.meta.created_at).getTime() : 0;
        const updated = customer.meta?.updated_at ? new Date(customer.meta.updated_at).getTime() : 0;
        const latest = Math.max(created, updated);
        return { customer, latest };
      })
      .filter(({ latest }) => {
        // 기간 필터링
        return latest >= cutoffDate.getTime();
      })
      .sort((a, b) => b.latest - a.latest) // 내림차순 (최신이 위로)
      .map(({ customer }) => customer);

    return sorted;
  }, [customersData, activityPeriod]);

  // 사용 가이드 섹션
  const guideSections: GuideSection[] = [
    {
      icon: (
        <SFSymbol
          name="person-fill-badge-plus"
          size={SFSymbolSize.CALLOUT}
          weight={SFSymbolWeight.MEDIUM}
          style={{ color: 'var(--color-success)' }}
        />
      ),
      title: '고객 등록',
      description: '새로운 고객 정보를 시스템에 등록하고 관리합니다. 개인 정보, 연락처, 보험 정보 등을 체계적으로 기록할 수 있습니다.',
      ...(onNavigate && { onClick: () => onNavigate('customers-register') }),
    },
    {
      icon: (
        <SFSymbol
          name="list-bullet"
          size={SFSymbolSize.CALLOUT}
          weight={SFSymbolWeight.MEDIUM}
          style={{ color: 'var(--color-success)' }}
        />
      ),
      title: '전체 고객 보기',
      description: '등록된 모든 고객을 검색하고 조회합니다. 이름, 전화번호, 이메일로 빠르게 검색하고 정렬할 수 있습니다.',
      ...(onNavigate && { onClick: () => onNavigate('customers-all') }),
    },
    {
      icon: (
        <SFSymbol
          name="location"
          size={SFSymbolSize.CALLOUT}
          weight={SFSymbolWeight.MEDIUM}
          style={{ color: 'var(--color-warning)' }}
        />
      ),
      title: '지역별 고객 보기',
      description: '고객을 지역별로 분류하여 확인합니다. 시/도, 시/군/구 단위로 고객 분포를 파악하고 지역별 관리가 가능합니다.',
      ...(onNavigate && { onClick: () => onNavigate('customers-regional') }),
    },
    {
      icon: (
        <SFSymbol
          name="person-2"
          size={SFSymbolSize.CALLOUT}
          weight={SFSymbolWeight.MEDIUM}
          style={{ color: 'var(--color-ios-purple)' }}
        />
      ),
      title: '관계별 고객 보기',
      description: '고객 간의 관계를 시각화하여 관리합니다. 가족 관계, 지인 관계 등을 연결하여 효율적인 고객 관리가 가능합니다.',
      ...(onNavigate && { onClick: () => onNavigate('customers-relationship') }),
    },
  ];

  return (
    <CenterPaneView
      visible={visible}
      title="고객 관리"
      titleIcon={<SFSymbol name="person" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} />}
      onClose={onClose}
      marginTop={5}
      marginBottom={5}
      marginLeft={5}
      marginRight={5}
      className="customer-management-view"
    >
      <div className="customer-management-view__content">
        {/* 통계 섹션 */}
        <section className="customer-management-view__section">
          <h2 className="customer-management-view__section-title">
            <svg width="14" height="14" viewBox="0 0 20 20">
              <rect x="2" y="12" width="4" height="6" rx="1" fill="var(--color-primary-500)"/>
              <rect x="8" y="7" width="4" height="11" rx="1" fill="var(--color-primary-500)"/>
              <rect x="14" y="3" width="4" height="15" rx="1" fill="var(--color-primary-500)"/>
            </svg>
            고객 통계
          </h2>
          <div className="customer-management-view__stats-grid">
            <StatCard
              title="전체 고객"
              value={stats.totalCustomers}
              icon={<SFSymbol name="person.3.fill" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} />}
              color="primary"
              isLoading={isCustomersLoading}
              {...(isCustomersError && { error: '통계 조회 실패' })}
            />
            <StatCard
              title="활성 고객"
              value={stats.activeCustomers}
              icon={
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <circle cx="8" cy="6" r="3"/>
                  <path d="M8 10c-3 0-5 2-5 4v2h10v-2c0-2-2-4-5-4z"/>
                  <circle cx="16" cy="16" r="3.5" fill="var(--color-success)"/>
                  <path d="M14.5 16l1 1 2.5-2.5" stroke="var(--color-text-inverse)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
              }
              color="success"
              isLoading={isCustomersLoading}
              {...(isCustomersError && { error: '통계 조회 실패' })}
            />
            <StatCard
              title="최근 등록"
              value={stats.recentRegistrations}
              icon={
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <circle cx="8" cy="6" r="3"/>
                  <path d="M8 10c-3 0-5 2-5 4v2h10v-2c0-2-2-4-5-4z"/>
                  <circle cx="15" cy="15" r="4" fill="var(--color-warning)"/>
                  <path d="M15 13v4M13 15h4" stroke="var(--color-text-inverse)" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              }
              color="warning"
              isLoading={isCustomersLoading}
              {...(isCustomersError && { error: '통계 조회 실패' })}
            />
            <div className="stat-card-wrapper">
              <StatCard
                title="관계"
                value={stats.familyRelationships + stats.corporateRelationships}
                icon={<SFSymbol name="person.2.fill" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} />}
                color="success"
                isLoading={isCustomersLoading || isRelationshipsLoading}
                {...(isCustomersError && { error: '통계 조회 실패' })}
              />
              {!isCustomersLoading && !isRelationshipsLoading && !isCustomersError && (
                <div className="stat-card-details">
                  <span className="stat-card-detail-item">
                    <span className="stat-card-detail-label">가족:</span>
                    <span className="stat-card-detail-value">{stats.familyRelationships}</span>
                  </span>
                  <span className="stat-card-detail-separator">•</span>
                  <span className="stat-card-detail-item">
                    <span className="stat-card-detail-label">법인:</span>
                    <span className="stat-card-detail-value">{stats.corporateRelationships}</span>
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 파이 차트 그리드 */}
          {stats.totalCustomers > 0 && (
            <div className="customer-management-view__pie-charts-grid">
              <div className="pie-chart-item">
                <h3 className="pie-chart-title">고객 유형</h3>
                <FileTypePieChart
                  data={customerTypePieData}
                  size={150}
                  innerRadius={38}
                />
              </div>
              <div className="pie-chart-item">
                <h3 className="pie-chart-title">성별 분포</h3>
                <FileTypePieChart
                  data={genderPieData}
                  size={150}
                  innerRadius={38}
                />
              </div>
              <div className="pie-chart-item">
                <h3 className="pie-chart-title">연령대 분포</h3>
                <FileTypePieChart
                  data={agePieData}
                  size={150}
                  innerRadius={38}
                />
              </div>
              <div className="pie-chart-item">
                <h3 className="pie-chart-title">지역별 가입</h3>
                <FileTypePieChart
                  data={regionPieData}
                  size={150}
                  innerRadius={38}
                />
              </div>
            </div>
          )}
        </section>

        {/* 사용 가이드 */}
        <UsageGuide
          title="고객관리 사용 가이드"
          sections={guideSections}
          defaultExpanded={true}
        />

        {/* 최근 활동 섹션 */}
        <section className="customer-management-view__section">
          <div className="customer-management-view__section-header">
            <h2 className="customer-management-view__section-title">
              <svg width="14" height="14" viewBox="0 0 20 20">
                <circle cx="10" cy="10" r="9" fill="var(--color-success)"/>
                <path d="M10 5v5l3.5 3.5" stroke="var(--color-text-inverse)" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
              </svg>
              최근 활동 ({recentCustomers.length}개)
            </h2>
            <Dropdown
              value={activityPeriod}
              options={[
                { value: '1week', label: '최근 1주일' },
                { value: '1month', label: '최근 1개월' },
                { value: '3months', label: '최근 3개월' },
                { value: '6months', label: '최근 6개월' },
                { value: '1year', label: '최근 1년' },
              ]}
              onChange={(value) => setActivityPeriod(value as ActivityPeriod)}
              aria-label="활동 기간 선택"
            />
          </div>
          <div className="customer-management-view__recent-activity">
            {isCustomersLoading && (
              <div className="recent-activity-loading">
                <div className="loading-spinner" />
                <p>고객 목록을 불러오는 중...</p>
              </div>
            )}

            {isCustomersError && (
              <div className="recent-activity-error">최근 활동 조회 실패</div>
            )}

            {!isCustomersLoading && !isCustomersError && recentCustomers.length === 0 && (
              <div className="recent-activity-empty">최근 활동이 없습니다</div>
            )}

            {!isCustomersLoading && !isCustomersError && recentCustomers.length > 0 && (
              <div className="recent-activity-table">
                {/* 헤더 */}
                <div className="customer-recent-activity-header">
                  <div className="recent-header-activity">활동</div>
                  <div className="recent-header-icon"></div>
                  <div className="recent-header-name">이름</div>
                  <div className="recent-header-phone">연락처</div>
                  <div className="recent-header-address">주소</div>
                  <div className="recent-header-time">시간</div>
                </div>

                {/* 데이터 행 */}
                {recentCustomers.map((customer) => {
                  const customerType = customer.insurance_info?.customer_type || '개인';
                  const customerTypeIcon = customerType === '법인' ? (
                    <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" className="customer-type-icon-corporate">
                      <circle cx="10" cy="10" r="10" opacity="0.2" />
                      <path d="M6 5h2v2H6V5zm0 3h2v2H6V8zm0 3h2v2H6v-2zm3-6h2v2H9V5zm0 3h2v2H9V8zm0 3h2v2H9v-2zm3-6h2v2h-2V5zm0 3h2v2h-2V8zm0 3h2v2h-2v-2zM5 14h10v2H5v-2z" />
                    </svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" className="customer-type-icon-personal">
                      <circle cx="10" cy="10" r="10" opacity="0.2" />
                      <circle cx="10" cy="7" r="3" />
                      <path d="M10 11c-3 0-5 2-5 4v2h10v-2c0-2-2-4-5-4z" />
                    </svg>
                  );

                  const phone = customer.personal_info?.mobile_phone || '-';

                  const address = customer.personal_info?.address;
                  let shortAddress = '-';
                  if (address?.address1) {
                    const fullAddress = `${address.address1} ${address.address2 || ''}`.trim();
                    shortAddress = fullAddress.length > 30 ? fullAddress.substring(0, 27) + '...' : fullAddress;
                  }

                  const createdAt = customer.meta?.created_at ? new Date(customer.meta.created_at) : null;
                  const updatedAt = customer.meta?.updated_at ? new Date(customer.meta.updated_at) : null;

                  // 활동 타입 결정 (등록 vs 수정)
                  const isModified = updatedAt && createdAt && updatedAt.getTime() - createdAt.getTime() > 60000;
                  const displayTime = isModified ? updatedAt : createdAt;

                  const activityIcon = isModified ? (
                    <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" className="activity-icon-edit">
                      <path d="M16.5 2.5l1 1-11 11-2.5.5.5-2.5 11-11zm-1-1l1-1 2 2-1 1-2-2z" />
                    </svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" className="activity-icon-new">
                      <circle cx="8" cy="6" r="2.5"/>
                      <path d="M8 9c-2.5 0-4 1.5-4 3v1.5h8V12c0-1.5-1.5-3-4-3z"/>
                      <circle cx="15" cy="15" r="3.5" />
                      <path d="M15 13.5v3M13.5 15h3" stroke="var(--color-text-inverse)" strokeWidth="1.2" strokeLinecap="round"/>
                    </svg>
                  );

                  const activityText = isModified ? '정보 수정' : '고객 등록';

                  const formatTime = (date: Date | null) => {
                    if (!date) return '-';
                    const now = new Date();
                    const diff = now.getTime() - date.getTime();
                    const minutes = Math.floor(diff / 60000);
                    const hours = Math.floor(diff / 3600000);
                    const days = Math.floor(diff / 86400000);

                    if (minutes < 1) return '방금 전';
                    if (minutes < 60) return `${minutes}분 전`;
                    if (hours < 24) return `${hours}시간 전`;
                    if (days < 30) return `${days}일 전`;

                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const day = String(date.getDate()).padStart(2, '0');
                    return `${month}.${day}`;
                  };

                  return (
                    <div key={customer._id} className="customer-recent-activity-row">
                      <div className="recent-cell-activity">
                        {activityIcon}
                        <span className="activity-text">{activityText}</span>
                      </div>
                      <div className="recent-cell-icon">{customerTypeIcon}</div>
                      <div className="recent-cell-name">{customer.personal_info?.name || '이름 없음'}</div>
                      <div className="recent-cell-phone">{phone}</div>
                      <div className="recent-cell-address">{shortAddress}</div>
                      <div className="recent-cell-time">{formatTime(displayTime)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </CenterPaneView>
  );
};

export default CustomerManagementView

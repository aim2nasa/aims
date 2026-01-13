/**
 * Breadcrumb Utilities
 * @since 2025-12-11
 *
 * 메뉴 키를 기반으로 Breadcrumb 경로 생성
 */

import type { BreadcrumbItem } from '@/shared/ui/Breadcrumb';

/**
 * 메뉴 키와 라벨 매핑
 */
const MENU_LABELS: Record<string, { parent?: string; label: string }> = {
  // 빠른 작업
  'quick-actions': { label: '빠른 작업' },
  'customers-register': { parent: 'quick-actions', label: '고객 수동 등록' },
  'documents-register': { parent: 'quick-actions', label: '고객·계약·문서 등록' },
  'contracts-import': { parent: 'quick-actions', label: '고객·계약 일괄등록' },
  'batch-document-upload': { parent: 'quick-actions', label: '문서 일괄등록' },

  // 고객
  'customers': { label: '고객' },
  'customers-all': { parent: 'customers', label: '전체 고객 보기' },
  'customers-regional': { parent: 'customers', label: '지역별 고객 보기' },
  'customers-relationship': { parent: 'customers', label: '관계별 고객 보기' },
  'customers-full-detail': { parent: 'customers', label: '고객 상세' },

  // 계약
  'contracts': { label: '계약' },
  'contracts-all': { parent: 'contracts', label: '전체 계약 보기' },

  // 문서
  'documents': { label: '문서' },
  'documents-library': { parent: 'documents', label: '전체 문서 보기' },
  'documents-explorer': { parent: 'documents', label: '문서 탐색기' },
  'documents-search': { parent: 'documents', label: '상세 문서검색' },
  'documents-my-files': { parent: 'documents', label: '내 파일' },

  // 기타
  'account-settings': { label: '계정 설정' },
  'dsd': { label: '대시보드' },
};

/**
 * 메뉴 키로부터 Breadcrumb 항목 배열 생성
 *
 * @param activeView - 현재 활성화된 뷰 키
 * @param customerName - 고객 이름 (선택적, 고객 상세 뷰에서 사용)
 * @returns Breadcrumb 항목 배열
 *
 * @example
 * ```ts
 * // 전체 고객 보기
 * getBreadcrumbItems('customers-all')
 * // => [{ key: 'customers', label: '고객' }, { key: 'customers-all', label: '전체 고객 보기' }]
 *
 * // 고객 상세 (with customer name)
 * getBreadcrumbItems('customers-all', '홍길동')
 * // => [{ key: 'customers', label: '고객' }, { key: 'customers-all', label: '전체 고객 보기' }, { key: 'customer-detail', label: '홍길동' }]
 * ```
 */
export function getBreadcrumbItems(
  activeView: string | null,
  customerName?: string
): BreadcrumbItem[] {
  if (!activeView) return [];

  const menuInfo = MENU_LABELS[activeView];
  if (!menuInfo) return [];

  const items: BreadcrumbItem[] = [];

  // 부모 메뉴 추가
  if (menuInfo.parent) {
    const parentInfo = MENU_LABELS[menuInfo.parent];
    if (parentInfo) {
      items.push({
        key: menuInfo.parent,
        label: parentInfo.label,
        clickable: true,
      });
    }
  }

  // 현재 메뉴 추가
  items.push({
    key: activeView,
    label: menuInfo.label,
    clickable: !!customerName, // 고객 이름이 있으면 클릭 가능
  });

  // 고객 이름 추가 (RightPane에 고객 상세가 열려있을 때)
  if (customerName) {
    items.push({
      key: 'customer-detail',
      label: customerName,
      clickable: false,
    });
  }

  return items;
}

/**
 * Breadcrumb 키에서 메뉴 키 추출
 * (customer-detail은 제외하고 실제 메뉴 키만 반환)
 */
export function getMenuKeyFromBreadcrumb(breadcrumbKey: string): string | null {
  if (breadcrumbKey === 'customer-detail') return null;
  return MENU_LABELS[breadcrumbKey] ? breadcrumbKey : null;
}

export default {
  getBreadcrumbItems,
  getMenuKeyFromBreadcrumb,
};

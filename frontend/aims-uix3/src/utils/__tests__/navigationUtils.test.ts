/**
 * navigationUtils 테스트
 */

import { describe, it, expect } from 'vitest';
import {
  getAllNavigableKeys,
  isNavigableKey,
  getMenuDepth,
  getParentKey,
  getChildKeys,
} from '../navigationUtils';
import type { MenuItem } from '../../components/CustomMenu/CustomMenu';
import { flattenForCollapsed } from '../../components/CustomMenu/menuUtils';

// 테스트용 메뉴 데이터
const mockMenuItems: MenuItem[] = [
  {
    key: 'home',
    label: '홈',
    icon: 'HomeIcon',
    tooltipTitle: '홈',
  },
  {
    key: 'customers',
    label: '고객',
    icon: 'UsersIcon',
    tooltipTitle: '고객',
    children: [
      {
        key: 'customer-list',
        label: '고객 목록',
        icon: 'ListIcon',
        tooltipTitle: '고객 목록',
      },
      {
        key: 'customer-add',
        label: '고객 추가',
        icon: 'PlusIcon',
        tooltipTitle: '고객 추가',
      },
    ],
  },
  {
    key: 'documents',
    label: '문서',
    icon: 'FileIcon',
    tooltipTitle: '문서',
    children: [
      {
        key: 'document-list',
        label: '문서 목록',
        icon: 'ListIcon',
        tooltipTitle: '문서 목록',
      },
      {
        key: 'document-upload',
        label: '문서 업로드',
        icon: 'UploadIcon',
        tooltipTitle: '문서 업로드',
        children: [
          {
            key: 'document-upload-single',
            label: '단일 업로드',
            icon: 'FileIcon',
            tooltipTitle: '단일 업로드',
          },
          {
            key: 'document-upload-bulk',
            label: '대량 업로드',
            icon: 'FolderIcon',
            tooltipTitle: '대량 업로드',
          },
        ],
      },
    ],
  },
  {
    key: 'settings',
    label: '설정',
    icon: 'SettingsIcon',
    tooltipTitle: '설정',
  },
];

describe('navigationUtils', () => {
  describe('getAllNavigableKeys', () => {
    it('collapsed 모드에서는 최상위 메뉴만 반환해야 함', () => {
      const keys = getAllNavigableKeys(mockMenuItems, true, []);

      expect(keys).toEqual(['home', 'customers', 'documents', 'settings']);
    });

    it('펼쳐진 메뉴의 서브메뉴를 포함해야 함', () => {
      const keys = getAllNavigableKeys(mockMenuItems, false, ['customers']);

      expect(keys).toEqual([
        'home',
        'customers',
        'customer-list',
        'customer-add',
        'documents',
        'settings',
      ]);
    });

    it('여러 메뉴가 펼쳐진 경우 모두 포함해야 함', () => {
      const keys = getAllNavigableKeys(mockMenuItems, false, ['customers', 'documents']);

      expect(keys).toEqual([
        'home',
        'customers',
        'customer-list',
        'customer-add',
        'documents',
        'document-list',
        'document-upload',
        'settings',
      ]);
    });

    it('중첩된 서브메뉴도 펼쳐진 경우 포함해야 함', () => {
      const keys = getAllNavigableKeys(mockMenuItems, false, [
        'documents',
        'document-upload',
      ]);

      expect(keys).toEqual([
        'home',
        'customers',
        'documents',
        'document-list',
        'document-upload',
        'document-upload-single',
        'document-upload-bulk',
        'settings',
      ]);
    });

    it('빈 메뉴 배열은 빈 배열을 반환해야 함', () => {
      const keys = getAllNavigableKeys([], false, []);

      expect(keys).toEqual([]);
    });

    it('expandedKeys가 비어있으면 최상위 메뉴만 반환해야 함', () => {
      const keys = getAllNavigableKeys(mockMenuItems, false, []);

      expect(keys).toEqual(['home', 'customers', 'documents', 'settings']);
    });
  });

  describe('isNavigableKey', () => {
    it('네비게이션 가능한 키는 true를 반환해야 함', () => {
      const navigableKeys = ['home', 'customers', 'settings'];

      expect(isNavigableKey('home', navigableKeys)).toBe(true);
      expect(isNavigableKey('customers', navigableKeys)).toBe(true);
      expect(isNavigableKey('settings', navigableKeys)).toBe(true);
    });

    it('네비게이션 불가능한 키는 false를 반환해야 함', () => {
      const navigableKeys = ['home', 'customers', 'settings'];

      expect(isNavigableKey('document-list', navigableKeys)).toBe(false);
      expect(isNavigableKey('non-existent', navigableKeys)).toBe(false);
    });

    it('빈 배열에서는 항상 false를 반환해야 함', () => {
      expect(isNavigableKey('home', [])).toBe(false);
    });
  });

  describe('getMenuDepth', () => {
    it('최상위 메뉴의 깊이는 0이어야 함', () => {
      expect(getMenuDepth(mockMenuItems, 'home')).toBe(0);
      expect(getMenuDepth(mockMenuItems, 'customers')).toBe(0);
      expect(getMenuDepth(mockMenuItems, 'documents')).toBe(0);
      expect(getMenuDepth(mockMenuItems, 'settings')).toBe(0);
    });

    it('1단계 서브메뉴의 깊이는 1이어야 함', () => {
      expect(getMenuDepth(mockMenuItems, 'customer-list')).toBe(1);
      expect(getMenuDepth(mockMenuItems, 'customer-add')).toBe(1);
      expect(getMenuDepth(mockMenuItems, 'document-list')).toBe(1);
      expect(getMenuDepth(mockMenuItems, 'document-upload')).toBe(1);
    });

    it('2단계 서브메뉴의 깊이는 2여야 함', () => {
      expect(getMenuDepth(mockMenuItems, 'document-upload-single')).toBe(2);
      expect(getMenuDepth(mockMenuItems, 'document-upload-bulk')).toBe(2);
    });

    it('존재하지 않는 키는 -1을 반환해야 함', () => {
      expect(getMenuDepth(mockMenuItems, 'non-existent')).toBe(-1);
    });

    it('빈 메뉴 배열에서는 -1을 반환해야 함', () => {
      expect(getMenuDepth([], 'home')).toBe(-1);
    });
  });

  describe('getParentKey', () => {
    it('최상위 메뉴의 부모는 null이어야 함', () => {
      expect(getParentKey(mockMenuItems, 'home')).toBe(null);
      expect(getParentKey(mockMenuItems, 'customers')).toBe(null);
      expect(getParentKey(mockMenuItems, 'documents')).toBe(null);
      expect(getParentKey(mockMenuItems, 'settings')).toBe(null);
    });

    it('1단계 서브메뉴의 부모 키를 반환해야 함', () => {
      expect(getParentKey(mockMenuItems, 'customer-list')).toBe('customers');
      expect(getParentKey(mockMenuItems, 'customer-add')).toBe('customers');
      expect(getParentKey(mockMenuItems, 'document-list')).toBe('documents');
      expect(getParentKey(mockMenuItems, 'document-upload')).toBe('documents');
    });

    it('2단계 서브메뉴의 부모 키를 반환해야 함', () => {
      expect(getParentKey(mockMenuItems, 'document-upload-single')).toBe('document-upload');
      expect(getParentKey(mockMenuItems, 'document-upload-bulk')).toBe('document-upload');
    });

    it('존재하지 않는 키는 null을 반환해야 함', () => {
      expect(getParentKey(mockMenuItems, 'non-existent')).toBe(null);
    });

    it('빈 메뉴 배열에서는 null을 반환해야 함', () => {
      expect(getParentKey([], 'home')).toBe(null);
    });
  });

  describe('getChildKeys', () => {
    it('자식이 있는 메뉴의 자식 키를 반환해야 함', () => {
      expect(getChildKeys(mockMenuItems, 'customers')).toEqual([
        'customer-list',
        'customer-add',
      ]);

      expect(getChildKeys(mockMenuItems, 'documents')).toEqual([
        'document-list',
        'document-upload',
      ]);
    });

    it('중첩된 서브메뉴의 자식 키를 반환해야 함', () => {
      expect(getChildKeys(mockMenuItems, 'document-upload')).toEqual([
        'document-upload-single',
        'document-upload-bulk',
      ]);
    });

    it('자식이 없는 메뉴는 빈 배열을 반환해야 함', () => {
      expect(getChildKeys(mockMenuItems, 'home')).toEqual([]);
      expect(getChildKeys(mockMenuItems, 'settings')).toEqual([]);
      expect(getChildKeys(mockMenuItems, 'customer-list')).toEqual([]);
    });

    it('존재하지 않는 키는 빈 배열을 반환해야 함', () => {
      expect(getChildKeys(mockMenuItems, 'non-existent')).toEqual([]);
    });

    it('빈 메뉴 배열에서는 빈 배열을 반환해야 함', () => {
      expect(getChildKeys([], 'home')).toEqual([]);
    });
  });
});

/**
 * M-7 리팩토링 호환성 테스트 (Nav #12~#15)
 *
 * CustomMenu.tsx의 실제 메뉴 구조와 동등한 독립 mock 배열 사용.
 * Phase 2에서 flattenForCollapsed 구현 후 manualFlattenForCollapsed를 교체 예정.
 *
 * ⚠️ CustomMenu.tsx의 메뉴 항목 추가/삭제 시 이 mock도 함께 업데이트 필요
 */
describe('M-7 getAllNavigableKeys 호환성', () => {
  // 실제 CustomMenu menuItemsSource와 동등한 구조 (isDevMode=false)
  const realMenuMock: MenuItem[] = [
    { key: 'autoclicker', label: '메트 PDF 자동 받기', icon: 'icon', tooltipTitle: '메트 PDF 자동 받기' },
    {
      key: 'quick-actions', label: '빠른 작업', icon: 'icon', tooltipTitle: '빠른 작업',
      children: [
        { key: 'documents-register', label: '고객·계약·문서 등록', icon: 'icon', tooltipTitle: '고객·계약·문서 등록' },
        { key: 'customers-register', label: '고객 수동등록', icon: 'icon', tooltipTitle: '고객 수동등록' },
        { key: 'contracts-import', label: '고객 일괄등록', icon: 'icon', tooltipTitle: '엑셀 파일에서 고객 정보를 일괄 등록합니다' },
        { key: 'batch-document-upload', label: '문서 일괄등록', icon: 'icon', tooltipTitle: '폴더별로 정리된 문서를 고객에게 일괄 등록합니다' },
      ],
    },
    {
      key: 'customers', label: '고객', icon: 'icon', tooltipTitle: '고객',
      children: [
        { key: 'customers-all', label: '전체 고객 보기', icon: 'icon', tooltipTitle: '모든 고객을 보여줍니다' },
        { key: 'customers-regional', label: '지역별 고객 보기', icon: 'icon', tooltipTitle: '지역별로 고객을 분류하여 보여줍니다' },
        { key: 'customers-relationship', label: '관계별 고객 보기', icon: 'icon', tooltipTitle: '가족 관계별로 고객을 분류하여 보여줍니다' },
      ],
    },
    {
      key: 'documents', label: '문서', icon: 'icon', tooltipTitle: '문서',
      children: [
        { key: 'documents-explorer', label: '고객별 문서함', icon: 'icon', tooltipTitle: '고객별로 문서를 모아 볼 수 있습니다' },
        { key: 'documents-search', label: '상세 문서검색', icon: 'icon', tooltipTitle: '상세 문서검색' },
        { key: 'documents-library', label: '전체 문서 보기', icon: 'icon', tooltipTitle: '모든 문서를 보여줍니다' },
      ],
    },
    {
      key: 'help', label: '도움말', icon: 'icon', tooltipTitle: '도움말',
      children: [
        { key: 'help-notice', label: '공지사항', icon: 'icon', tooltipTitle: '공지사항' },
        { key: 'help-guide', label: '사용 가이드', icon: 'icon', tooltipTitle: '사용 가이드' },
        { key: 'help-faq', label: '자주 묻는 질문', icon: 'icon', tooltipTitle: '자주 묻는 질문' },
        { key: 'help-inquiry', label: '1:1 문의', icon: 'icon', tooltipTitle: '1:1 문의' },
      ],
    },
  ];

  // isDevMode=true용 (contracts 포함)
  const realMenuMockWithContracts: MenuItem[] = [
    ...realMenuMock.slice(0, 3), // autoclicker, quick-actions, customers
    {
      key: 'contracts', label: '계약', icon: 'icon', tooltipTitle: '계약',
      children: [
        { key: 'contracts-all', label: '전체 계약 보기', icon: 'icon', tooltipTitle: '모든 계약을 보여줍니다' },
      ],
    },
    ...realMenuMock.slice(3), // documents, help
  ];

  it('#12: collapsed=true, isDevMode=false, hasSearchResults=false', () => {
    const flatItems = flattenForCollapsed(realMenuMock, true);
    const keys = getAllNavigableKeys(flatItems, true, []);
    expect(keys).toEqual([
      'autoclicker',
      'quick-actions',
      'documents-register',
      'customers-register',
      'contracts-import',
      'batch-document-upload',
      'customers',
      'customers-all',
      'customers-regional',
      'customers-relationship',
      'documents',
      'documents-explorer',
      'documents-search',
      'documents-library',
      'help',
      'help-notice',
      'help-guide',
      'help-faq',
      'help-inquiry',
    ]);
  });

  it('#13: expanded, expandedKeys=[\'quick-actions\'], isDevMode=false', () => {
    const keys = getAllNavigableKeys(realMenuMock, false, ['quick-actions']);
    expect(keys).toEqual([
      'autoclicker',
      'quick-actions',
      'documents-register',
      'customers-register',
      'contracts-import',
      'batch-document-upload',
      'customers',
      'documents',
      'help',
    ]);
  });

  it('#14: expanded, expandedKeys=[], isDevMode=false', () => {
    const keys = getAllNavigableKeys(realMenuMock, false, []);
    expect(keys).toEqual([
      'autoclicker',
      'quick-actions',
      'customers',
      'documents',
      'help',
    ]);
  });

  it('#15: collapsed=true, isDevMode=true, hasSearchResults=false', () => {
    const flatItems = flattenForCollapsed(realMenuMockWithContracts, true);
    const keys = getAllNavigableKeys(flatItems, true, []);
    expect(keys).toEqual([
      'autoclicker',
      'quick-actions',
      'documents-register',
      'customers-register',
      'contracts-import',
      'batch-document-upload',
      'customers',
      'customers-all',
      'customers-regional',
      'customers-relationship',
      'contracts',
      'contracts-all',
      'documents',
      'documents-explorer',
      'documents-search',
      'documents-library',
      'help',
      'help-notice',
      'help-guide',
      'help-faq',
      'help-inquiry',
    ]);
  });
});

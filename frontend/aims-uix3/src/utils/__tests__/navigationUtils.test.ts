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

// 테스트용 메뉴 데이터
const mockMenuItems: MenuItem[] = [
  {
    key: 'home',
    label: '홈',
    icon: 'HomeIcon',
  },
  {
    key: 'customers',
    label: '고객',
    icon: 'UsersIcon',
    children: [
      {
        key: 'customer-list',
        label: '고객 목록',
        icon: 'ListIcon',
      },
      {
        key: 'customer-add',
        label: '고객 추가',
        icon: 'PlusIcon',
      },
    ],
  },
  {
    key: 'documents',
    label: '문서',
    icon: 'FileIcon',
    children: [
      {
        key: 'document-list',
        label: '문서 목록',
        icon: 'ListIcon',
      },
      {
        key: 'document-upload',
        label: '문서 업로드',
        icon: 'UploadIcon',
        children: [
          {
            key: 'document-upload-single',
            label: '단일 업로드',
            icon: 'FileIcon',
          },
          {
            key: 'document-upload-bulk',
            label: '대량 업로드',
            icon: 'FolderIcon',
          },
        ],
      },
    ],
  },
  {
    key: 'settings',
    label: '설정',
    icon: 'SettingsIcon',
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

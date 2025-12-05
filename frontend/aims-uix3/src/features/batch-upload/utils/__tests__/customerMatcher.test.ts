/**
 * 고객명 매칭 유틸리티 테스트
 * @since 2025-12-05
 */

import { describe, test, expect } from 'vitest'
import {
  normalizeName,
  matchFolderToCustomer,
  matchFoldersToCustomers,
  calculateMatchingStats,
  groupFilesByFolder,
  createFolderMappings,
  type CustomerForMatching,
} from '../customerMatcher'

/**
 * 테스트용 고객 데이터
 */
const mockCustomers: CustomerForMatching[] = [
  { _id: 'c1', personal_info: { name: '홍길동' } },
  { _id: 'c2', personal_info: { name: '김철수' } },
  { _id: 'c3', personal_info: { name: '이영희' } },
  { _id: 'c4', personal_info: { name: '박민수' } },
  { _id: 'c5', personal_info: { name: '  최지영  ' } }, // 공백 포함
]

/**
 * 테스트용 File 객체 생성 헬퍼 (webkitRelativePath 포함)
 */
function createMockFileWithPath(relativePath: string, size = 1024): File {
  const name = relativePath.split('/').pop() || 'file'
  const file = new File(['x'.repeat(size)], name, { type: 'application/octet-stream' })
  Object.defineProperty(file, 'webkitRelativePath', {
    value: relativePath,
    writable: false,
  })
  return file
}

describe('customerMatcher', () => {
  describe('normalizeName', () => {
    test('이름 양쪽 공백을 제거한다', () => {
      expect(normalizeName('  홍길동  ')).toBe('홍길동')
      expect(normalizeName('김철수')).toBe('김철수')
    })

    test('빈 문자열을 처리한다', () => {
      expect(normalizeName('')).toBe('')
      expect(normalizeName('   ')).toBe('')
    })
  })

  describe('matchFolderToCustomer', () => {
    test('정확히 일치하는 고객을 찾는다', () => {
      const result = matchFolderToCustomer('홍길동', mockCustomers)
      expect(result).not.toBeNull()
      expect(result?._id).toBe('c1')
      expect(result?.personal_info?.name).toBe('홍길동')
    })

    test('폴더명 공백은 트림 후 비교한다', () => {
      const result = matchFolderToCustomer('  홍길동  ', mockCustomers)
      expect(result).not.toBeNull()
      expect(result?._id).toBe('c1')
    })

    test('고객명 공백도 트림 후 비교한다', () => {
      // 고객 데이터에 공백이 있어도 매칭됨
      const result = matchFolderToCustomer('최지영', mockCustomers)
      expect(result).not.toBeNull()
      expect(result?._id).toBe('c5')
    })

    test('부분 일치는 매칭하지 않는다', () => {
      expect(matchFolderToCustomer('홍길', mockCustomers)).toBeNull()
      expect(matchFolderToCustomer('길동', mockCustomers)).toBeNull()
      expect(matchFolderToCustomer('홍길동님', mockCustomers)).toBeNull()
    })

    test('대소문자를 구분한다 (영문 이름의 경우)', () => {
      const customersWithEnglish: CustomerForMatching[] = [
        { _id: 'e1', personal_info: { name: 'John Smith' } },
      ]
      expect(matchFolderToCustomer('John Smith', customersWithEnglish)).not.toBeNull()
      expect(matchFolderToCustomer('john smith', customersWithEnglish)).toBeNull()
      expect(matchFolderToCustomer('JOHN SMITH', customersWithEnglish)).toBeNull()
    })

    test('일치하는 고객이 없으면 null을 반환한다', () => {
      expect(matchFolderToCustomer('존재하지않는이름', mockCustomers)).toBeNull()
    })

    test('빈 폴더명은 null을 반환한다', () => {
      expect(matchFolderToCustomer('', mockCustomers)).toBeNull()
      expect(matchFolderToCustomer('   ', mockCustomers)).toBeNull()
    })

    test('고객 목록이 비어있으면 null을 반환한다', () => {
      expect(matchFolderToCustomer('홍길동', [])).toBeNull()
    })

    test('personal_info가 없는 고객은 건너뛴다', () => {
      const customersWithMissing: CustomerForMatching[] = [
        { _id: 'x1' }, // personal_info 없음
        { _id: 'x2', personal_info: {} }, // name 없음
        { _id: 'c1', personal_info: { name: '홍길동' } },
      ]
      const result = matchFolderToCustomer('홍길동', customersWithMissing)
      expect(result?._id).toBe('c1')
    })
  })

  describe('matchFoldersToCustomers', () => {
    test('여러 폴더를 한 번에 매칭한다', () => {
      const folderNames = ['홍길동', '김철수', '존재하지않음']
      const result = matchFoldersToCustomers(folderNames, mockCustomers)

      expect(result.size).toBe(3)
      expect(result.get('홍길동')?._id).toBe('c1')
      expect(result.get('김철수')?._id).toBe('c2')
      expect(result.get('존재하지않음')).toBeNull()
    })

    test('빈 폴더 배열은 빈 맵을 반환한다', () => {
      const result = matchFoldersToCustomers([], mockCustomers)
      expect(result.size).toBe(0)
    })
  })

  describe('calculateMatchingStats', () => {
    test('매칭 통계를 정확히 계산한다', () => {
      const mappings = new Map<string, CustomerForMatching | null>([
        ['홍길동', mockCustomers[0]],
        ['김철수', mockCustomers[1]],
        ['미매칭1', null],
        ['미매칭2', null],
      ])

      const stats = calculateMatchingStats(mappings)

      expect(stats.total).toBe(4)
      expect(stats.matched).toBe(2)
      expect(stats.unmatched).toBe(2)
      expect(stats.matchRate).toBe(50)
    })

    test('모두 매칭되면 100%', () => {
      const mappings = new Map<string, CustomerForMatching | null>([
        ['홍길동', mockCustomers[0]],
        ['김철수', mockCustomers[1]],
      ])

      const stats = calculateMatchingStats(mappings)
      expect(stats.matchRate).toBe(100)
    })

    test('모두 미매칭이면 0%', () => {
      const mappings = new Map<string, CustomerForMatching | null>([
        ['미매칭1', null],
        ['미매칭2', null],
      ])

      const stats = calculateMatchingStats(mappings)
      expect(stats.matchRate).toBe(0)
    })

    test('빈 맵은 0%', () => {
      const mappings = new Map<string, CustomerForMatching | null>()
      const stats = calculateMatchingStats(mappings)
      expect(stats.total).toBe(0)
      expect(stats.matchRate).toBe(0)
    })
  })

  describe('groupFilesByFolder', () => {
    test('파일을 최상위 폴더별로 그룹화한다', () => {
      const files = [
        createMockFileWithPath('홍길동/보험증권.pdf'),
        createMockFileWithPath('홍길동/청구서.pdf'),
        createMockFileWithPath('김철수/계약서.docx'),
        createMockFileWithPath('김철수/하위폴더/첨부.jpg'),
      ]

      const groups = groupFilesByFolder(files)

      expect(groups.size).toBe(2)
      expect(groups.get('홍길동')?.length).toBe(2)
      expect(groups.get('김철수')?.length).toBe(2)
    })

    test('webkitRelativePath가 없는 파일은 건너뛴다', () => {
      const file = new File(['test'], 'orphan.pdf')
      const groups = groupFilesByFolder([file])
      expect(groups.size).toBe(0)
    })

    test('빈 배열은 빈 맵을 반환한다', () => {
      const groups = groupFilesByFolder([])
      expect(groups.size).toBe(0)
    })
  })

  describe('createFolderMappings', () => {
    test('파일 그룹을 FolderMapping 배열로 변환한다', () => {
      const fileGroups = new Map<string, File[]>([
        ['홍길동', [createMockFileWithPath('홍길동/doc.pdf', 1000)]],
        ['미매칭폴더', [createMockFileWithPath('미매칭폴더/file.pdf', 2000)]],
      ])

      const mappings = createFolderMappings(fileGroups, mockCustomers)

      expect(mappings.length).toBe(2)

      // 매칭된 폴더가 먼저
      const matchedMapping = mappings.find(m => m.folderName === '홍길동')
      expect(matchedMapping?.matched).toBe(true)
      expect(matchedMapping?.customerId).toBe('c1')
      expect(matchedMapping?.customerName).toBe('홍길동')
      expect(matchedMapping?.fileCount).toBe(1)
      expect(matchedMapping?.totalSize).toBe(1000)

      // 미매칭 폴더
      const unmatchedMapping = mappings.find(m => m.folderName === '미매칭폴더')
      expect(unmatchedMapping?.matched).toBe(false)
      expect(unmatchedMapping?.customerId).toBeNull()
      expect(unmatchedMapping?.customerName).toBeNull()
    })

    test('매칭된 폴더가 미매칭 폴더보다 먼저 정렬된다', () => {
      const fileGroups = new Map<string, File[]>([
        ['ㄱ미매칭', [createMockFileWithPath('ㄱ미매칭/a.pdf')]],
        ['홍길동', [createMockFileWithPath('홍길동/b.pdf')]],
        ['ㄴ미매칭', [createMockFileWithPath('ㄴ미매칭/c.pdf')]],
      ])

      const mappings = createFolderMappings(fileGroups, mockCustomers)

      // 첫 번째는 매칭된 '홍길동'
      expect(mappings[0].folderName).toBe('홍길동')
      expect(mappings[0].matched).toBe(true)

      // 나머지는 미매칭, 가나다 순
      expect(mappings[1].folderName).toBe('ㄱ미매칭')
      expect(mappings[2].folderName).toBe('ㄴ미매칭')
    })

    test('totalSize를 정확히 계산한다', () => {
      const fileGroups = new Map<string, File[]>([
        ['홍길동', [
          createMockFileWithPath('홍길동/a.pdf', 1000),
          createMockFileWithPath('홍길동/b.pdf', 2000),
          createMockFileWithPath('홍길동/c.pdf', 3000),
        ]],
      ])

      const mappings = createFolderMappings(fileGroups, mockCustomers)
      expect(mappings[0].totalSize).toBe(6000)
    })
  })
})

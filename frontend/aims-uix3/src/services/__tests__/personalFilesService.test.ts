/**
 * PersonalFilesService 테스트
 * @since 2025-12-07
 *
 * 개인 파일 관리 서비스 테스트
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { PersonalFileItem, FolderContents } from '../personalFilesService'

// vi.hoisted로 mock 함수들 선언 (vi.mock factory 내에서 사용 가능)
const { mockApiGet, mockApiPost, mockApiPut, mockApiDelete } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  mockApiPost: vi.fn(),
  mockApiPut: vi.fn(),
  mockApiDelete: vi.fn(),
}))

const { mockAxiosPost, mockAxiosGet } = vi.hoisted(() => ({
  mockAxiosPost: vi.fn(),
  mockAxiosGet: vi.fn(),
}))

// api 모듈 mock - 호이스팅됨
vi.mock('@/shared/lib/api', () => ({
  api: {
    get: mockApiGet,
    post: mockApiPost,
    put: mockApiPut,
    patch: vi.fn(),
    delete: mockApiDelete,
  },
  apiRequest: vi.fn(),
  API_CONFIG: {
    BASE_URL: 'http://localhost:3010',
    TIMEOUT: 30000,
    DEFAULT_HEADERS: { 'Content-Type': 'application/json' },
  },
  ApiError: class ApiError extends Error {
    constructor(message: string, public status: number, public statusText: string, public data?: unknown) {
      super(message)
      this.name = 'ApiError'
    }
  },
}))

// axios mock - 호이스팅됨
vi.mock('axios', () => ({
  default: {
    post: mockAxiosPost,
    get: mockAxiosGet,
  },
}))

// vi.mock 후에 서비스 임포트 (호이스팅으로 인해 mock이 먼저 적용됨)
import { personalFilesService } from '../personalFilesService'

// localStorage mock
const localStorageMock = {
  getItem: vi.fn().mockReturnValue('test-user'),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// URL.createObjectURL mock
const mockCreateObjectURL = vi.fn().mockReturnValue('blob:test-url')
const mockRevokeObjectURL = vi.fn()
Object.defineProperty(window, 'URL', {
  value: {
    createObjectURL: mockCreateObjectURL,
    revokeObjectURL: mockRevokeObjectURL,
  },
})

/**
 * 모킹된 파일 아이템 생성
 */
function createMockFile(overrides: Partial<PersonalFileItem> = {}): PersonalFileItem {
  return {
    _id: 'file-1',
    name: '테스트.pdf',
    type: 'file',
    mimeType: 'application/pdf',
    size: 1024 * 1024,
    parentId: null,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    isDeleted: false,
    ...overrides,
  }
}

/**
 * 모킹된 폴더 아이템 생성
 */
function createMockFolder(overrides: Partial<PersonalFileItem> = {}): PersonalFileItem {
  return {
    _id: 'folder-1',
    name: '테스트 폴더',
    type: 'folder',
    parentId: null,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    isDeleted: false,
    ...overrides,
  }
}

/**
 * 모킹된 폴더 컨텐츠 생성
 */
function createMockFolderContents(overrides: Partial<FolderContents> = {}): FolderContents {
  return {
    currentFolder: null,
    items: [],
    breadcrumbs: [{ _id: null, name: '내 드라이브' }],
    ...overrides,
  }
}

describe('PersonalFilesService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getFolderContents', () => {
    it('루트 폴더 내용을 조회해야 함', async () => {
      const mockContents = createMockFolderContents({
        items: [createMockFolder(), createMockFile()],
      })

      mockApiGet.mockResolvedValueOnce({
        success: true,
        data: mockContents,
      })

      const result = await personalFilesService.getFolderContents()

      expect(mockApiGet).toHaveBeenCalledWith('/api/personal-files/folders')
      expect(result).toEqual(mockContents)
      expect(result.items).toHaveLength(2)
    })

    it('특정 폴더 내용을 조회해야 함', async () => {
      const mockContents = createMockFolderContents({
        currentFolder: createMockFolder({ _id: 'folder-123' }),
        items: [createMockFile()],
        breadcrumbs: [
          { _id: null, name: '내 드라이브' },
          { _id: 'folder-123', name: '테스트 폴더' },
        ],
      })

      mockApiGet.mockResolvedValueOnce({
        success: true,
        data: mockContents,
      })

      const result = await personalFilesService.getFolderContents('folder-123')

      expect(mockApiGet).toHaveBeenCalledWith('/api/personal-files/folders/folder-123')
      expect(result.currentFolder?._id).toBe('folder-123')
    })

    it('null folderId로 루트 폴더를 조회해야 함', async () => {
      const mockContents = createMockFolderContents()

      mockApiGet.mockResolvedValueOnce({
        success: true,
        data: mockContents,
      })

      await personalFilesService.getFolderContents(null)

      expect(mockApiGet).toHaveBeenCalledWith('/api/personal-files/folders')
    })

    it('success가 false인 경우 에러를 발생시켜야 함', async () => {
      mockApiGet.mockResolvedValueOnce({
        success: false,
        message: '폴더를 찾을 수 없습니다',
      })

      await expect(personalFilesService.getFolderContents('invalid')).rejects.toThrow(
        '폴더를 찾을 수 없습니다'
      )
    })

    it('data가 없는 경우 기본 에러 메시지를 사용해야 함', async () => {
      mockApiGet.mockResolvedValueOnce({
        success: true,
        data: null,
      })

      await expect(personalFilesService.getFolderContents()).rejects.toThrow('폴더 조회 실패')
    })

    it('네트워크 에러 시 에러를 발생시켜야 함', async () => {
      mockApiGet.mockRejectedValueOnce(new Error('Network error'))

      await expect(personalFilesService.getFolderContents()).rejects.toThrow('Network error')
    })
  })

  describe('createFolder', () => {
    it('루트에 폴더를 생성해야 함', async () => {
      const mockFolder = createMockFolder({ name: '새 폴더' })

      mockApiPost.mockResolvedValueOnce({
        success: true,
        data: mockFolder,
      })

      const result = await personalFilesService.createFolder('새 폴더')

      expect(mockApiPost).toHaveBeenCalledWith('/api/personal-files/folders', {
        name: '새 폴더',
        parentId: undefined,
      })
      expect(result.name).toBe('새 폴더')
    })

    it('특정 폴더 내에 폴더를 생성해야 함', async () => {
      const mockFolder = createMockFolder({
        name: '하위 폴더',
        parentId: 'parent-folder',
      })

      mockApiPost.mockResolvedValueOnce({
        success: true,
        data: mockFolder,
      })

      const result = await personalFilesService.createFolder('하위 폴더', 'parent-folder')

      expect(mockApiPost).toHaveBeenCalledWith('/api/personal-files/folders', {
        name: '하위 폴더',
        parentId: 'parent-folder',
      })
      expect(result.parentId).toBe('parent-folder')
    })

    it('null parentId로 루트에 폴더를 생성해야 함', async () => {
      const mockFolder = createMockFolder({ name: '루트 폴더' })

      mockApiPost.mockResolvedValueOnce({
        success: true,
        data: mockFolder,
      })

      await personalFilesService.createFolder('루트 폴더', null)

      expect(mockApiPost).toHaveBeenCalledWith('/api/personal-files/folders', {
        name: '루트 폴더',
        parentId: null,
      })
    })

    it('success가 false인 경우 에러를 발생시켜야 함', async () => {
      mockApiPost.mockResolvedValueOnce({
        success: false,
        message: '폴더 이름이 중복됩니다',
      })

      await expect(personalFilesService.createFolder('중복 폴더')).rejects.toThrow(
        '폴더 이름이 중복됩니다'
      )
    })

    it('data가 없는 경우 기본 에러 메시지를 사용해야 함', async () => {
      mockApiPost.mockResolvedValueOnce({
        success: true,
        data: null,
      })

      await expect(personalFilesService.createFolder('테스트')).rejects.toThrow('폴더 생성 실패')
    })
  })

  describe('uploadFile', () => {
    it('파일을 업로드해야 함', async () => {
      const mockFile = new File(['test content'], 'test.txt', { type: 'text/plain' })
      const mockUploadedFile = createMockFile({ name: 'test.txt' })

      mockAxiosPost.mockResolvedValueOnce({
        data: {
          success: true,
          data: mockUploadedFile,
        },
      })

      const result = await personalFilesService.uploadFile(mockFile)

      expect(mockAxiosPost).toHaveBeenCalled()
      const callArgs = mockAxiosPost.mock.calls[0]
      expect(callArgs[0]).toBe('http://localhost:3010/api/personal-files/upload')
      expect(callArgs[1]).toBeInstanceOf(FormData)
      expect(result.name).toBe('test.txt')
    })

    it('특정 폴더에 파일을 업로드해야 함', async () => {
      const mockFile = new File(['test'], 'test.txt', { type: 'text/plain' })
      const mockUploadedFile = createMockFile({ parentId: 'target-folder' })

      mockAxiosPost.mockResolvedValueOnce({
        data: {
          success: true,
          data: mockUploadedFile,
        },
      })

      const result = await personalFilesService.uploadFile(mockFile, 'target-folder')

      expect(result.parentId).toBe('target-folder')
    })

    it('진행률 콜백을 호출해야 함', async () => {
      const mockFile = new File(['test'], 'test.txt', { type: 'text/plain' })
      const mockUploadedFile = createMockFile()
      const onProgress = vi.fn()

      mockAxiosPost.mockImplementation((_url, _data, config) => {
        // 진행률 이벤트 시뮬레이션
        if (config?.onUploadProgress) {
          config.onUploadProgress({ loaded: 50, total: 100 })
          config.onUploadProgress({ loaded: 100, total: 100 })
        }
        return Promise.resolve({
          data: {
            success: true,
            data: mockUploadedFile,
          },
        })
      })

      await personalFilesService.uploadFile(mockFile, null, onProgress)

      expect(onProgress).toHaveBeenCalledWith(50)
      expect(onProgress).toHaveBeenCalledWith(100)
    })

    it('total이 없으면 진행률 콜백을 호출하지 않아야 함', async () => {
      const mockFile = new File(['test'], 'test.txt', { type: 'text/plain' })
      const mockUploadedFile = createMockFile()
      const onProgress = vi.fn()

      mockAxiosPost.mockImplementation((_url, _data, config) => {
        if (config?.onUploadProgress) {
          config.onUploadProgress({ loaded: 50 }) // total 없음
        }
        return Promise.resolve({
          data: {
            success: true,
            data: mockUploadedFile,
          },
        })
      })

      await personalFilesService.uploadFile(mockFile, null, onProgress)

      expect(onProgress).not.toHaveBeenCalled()
    })

    it('success가 false인 경우 에러를 발생시켜야 함', async () => {
      const mockFile = new File(['test'], 'test.txt', { type: 'text/plain' })

      mockAxiosPost.mockResolvedValueOnce({
        data: {
          success: false,
          message: '파일 크기 초과',
        },
      })

      await expect(personalFilesService.uploadFile(mockFile)).rejects.toThrow('파일 크기 초과')
    })

    it('data가 없는 경우 기본 에러 메시지를 사용해야 함', async () => {
      const mockFile = new File(['test'], 'test.txt', { type: 'text/plain' })

      mockAxiosPost.mockResolvedValueOnce({
        data: {
          success: true,
          data: null,
        },
      })

      await expect(personalFilesService.uploadFile(mockFile)).rejects.toThrow('파일 업로드 실패')
    })
  })

  describe('renameItem', () => {
    it('항목 이름을 변경해야 함', async () => {
      mockApiPut.mockResolvedValueOnce({
        success: true,
      })

      await personalFilesService.renameItem('item-1', '새 이름')

      expect(mockApiPut).toHaveBeenCalledWith('/api/personal-files/item-1/rename', {
        newName: '새 이름',
      })
    })

    it('success가 false인 경우 에러를 발생시켜야 함', async () => {
      mockApiPut.mockResolvedValueOnce({
        success: false,
        message: '이름이 중복됩니다',
      })

      await expect(personalFilesService.renameItem('item-1', '중복 이름')).rejects.toThrow(
        '이름이 중복됩니다'
      )
    })

    it('message가 없는 경우 기본 에러 메시지를 사용해야 함', async () => {
      mockApiPut.mockResolvedValueOnce({
        success: false,
      })

      await expect(personalFilesService.renameItem('item-1', '테스트')).rejects.toThrow(
        '이름 변경 실패'
      )
    })
  })

  describe('deleteItem', () => {
    it('항목을 삭제해야 함', async () => {
      mockApiDelete.mockResolvedValueOnce({
        success: true,
      })

      await personalFilesService.deleteItem('item-1')

      expect(mockApiDelete).toHaveBeenCalledWith('/api/personal-files/item-1')
    })

    it('success가 false인 경우 에러를 발생시켜야 함', async () => {
      mockApiDelete.mockResolvedValueOnce({
        success: false,
        message: '삭제 권한이 없습니다',
      })

      await expect(personalFilesService.deleteItem('item-1')).rejects.toThrow(
        '삭제 권한이 없습니다'
      )
    })

    it('message가 없는 경우 기본 에러 메시지를 사용해야 함', async () => {
      mockApiDelete.mockResolvedValueOnce({
        success: false,
      })

      await expect(personalFilesService.deleteItem('item-1')).rejects.toThrow('삭제 실패')
    })
  })

  describe('moveItem', () => {
    it('항목을 다른 폴더로 이동해야 함', async () => {
      mockApiPut.mockResolvedValueOnce({
        success: true,
      })

      await personalFilesService.moveItem('item-1', 'target-folder')

      expect(mockApiPut).toHaveBeenCalledWith('/api/personal-files/item-1/move', {
        targetFolderId: 'target-folder',
      })
    })

    it('항목을 루트로 이동해야 함', async () => {
      mockApiPut.mockResolvedValueOnce({
        success: true,
      })

      await personalFilesService.moveItem('item-1', null)

      expect(mockApiPut).toHaveBeenCalledWith('/api/personal-files/item-1/move', {
        targetFolderId: null,
      })
    })

    it('success가 false인 경우 에러를 발생시켜야 함', async () => {
      mockApiPut.mockResolvedValueOnce({
        success: false,
        message: '이동할 수 없는 폴더입니다',
      })

      await expect(personalFilesService.moveItem('item-1', 'invalid')).rejects.toThrow(
        '이동할 수 없는 폴더입니다'
      )
    })

    it('message가 없는 경우 기본 에러 메시지를 사용해야 함', async () => {
      mockApiPut.mockResolvedValueOnce({
        success: false,
      })

      await expect(personalFilesService.moveItem('item-1', 'target')).rejects.toThrow('이동 실패')
    })
  })

  describe('getDownloadUrl', () => {
    it('다운로드 URL을 생성해야 함', () => {
      localStorageMock.getItem.mockReturnValue('test-user')

      const url = personalFilesService.getDownloadUrl('file-123')

      expect(url).toBe(
        'http://localhost:3010/api/personal-files/file-123/download?x-user-id=test-user'
      )
    })

    it('localStorage에 사용자 ID가 없으면 tester를 사용해야 함', () => {
      localStorageMock.getItem.mockReturnValue(null)

      const url = personalFilesService.getDownloadUrl('file-123')

      expect(url).toBe(
        'http://localhost:3010/api/personal-files/file-123/download?x-user-id=tester'
      )
    })
  })

  describe('downloadFile', () => {
    it('파일을 다운로드해야 함', async () => {
      const mockBlob = new Blob(['test content'], { type: 'application/pdf' })

      mockAxiosGet.mockResolvedValueOnce({
        data: mockBlob,
      })

      // DOM 조작 mock
      const mockLink = {
        href: '',
        setAttribute: vi.fn(),
        click: vi.fn(),
        remove: vi.fn(),
      }
      vi.spyOn(document, 'createElement').mockReturnValue(mockLink as unknown as HTMLElement)
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink as unknown as Node)

      await personalFilesService.downloadFile('file-123', '테스트.pdf')

      expect(mockAxiosGet).toHaveBeenCalledWith(
        'http://localhost:3010/api/personal-files/file-123/download',
        expect.objectContaining({
          responseType: 'blob',
        })
      )
      expect(mockLink.setAttribute).toHaveBeenCalledWith('download', '테스트.pdf')
      expect(mockLink.click).toHaveBeenCalled()
      expect(mockLink.remove).toHaveBeenCalled()
      expect(mockRevokeObjectURL).toHaveBeenCalled()
    })
  })

  describe('searchFiles', () => {
    it('검색어로 파일을 검색해야 함', async () => {
      const mockResult = {
        items: [createMockFile({ name: '검색결과.pdf' })],
        count: 1,
      }

      mockApiGet.mockResolvedValueOnce({
        success: true,
        data: mockResult,
      })

      const result = await personalFilesService.searchFiles({ q: '검색' })

      expect(mockApiGet).toHaveBeenCalledWith('/api/personal-files/search?q=%EA%B2%80%EC%83%89')
      expect(result.count).toBe(1)
    })

    it('타입 필터로 검색해야 함', async () => {
      const mockResult = {
        items: [createMockFolder()],
        count: 1,
      }

      mockApiGet.mockResolvedValueOnce({
        success: true,
        data: mockResult,
      })

      await personalFilesService.searchFiles({ type: 'folder' })

      expect(mockApiGet).toHaveBeenCalledWith('/api/personal-files/search?type=folder')
    })

    it('날짜 범위로 검색해야 함', async () => {
      const mockResult = { items: [], count: 0 }

      mockApiGet.mockResolvedValueOnce({
        success: true,
        data: mockResult,
      })

      await personalFilesService.searchFiles({
        dateFrom: '2025-01-01',
        dateTo: '2025-12-31',
      })

      expect(mockApiGet).toHaveBeenCalledWith(
        '/api/personal-files/search?dateFrom=2025-01-01&dateTo=2025-12-31'
      )
    })

    it('정렬 옵션으로 검색해야 함', async () => {
      const mockResult = { items: [], count: 0 }

      mockApiGet.mockResolvedValueOnce({
        success: true,
        data: mockResult,
      })

      await personalFilesService.searchFiles({
        sortBy: 'name',
        sortDirection: 'asc',
      })

      expect(mockApiGet).toHaveBeenCalledWith(
        '/api/personal-files/search?sortBy=name&sortDirection=asc'
      )
    })

    it('모든 옵션을 조합하여 검색해야 함', async () => {
      const mockResult = { items: [], count: 0 }

      mockApiGet.mockResolvedValueOnce({
        success: true,
        data: mockResult,
      })

      await personalFilesService.searchFiles({
        q: 'test',
        type: 'file',
        dateFrom: '2025-01-01',
        dateTo: '2025-12-31',
        sortBy: 'createdAt',
        sortDirection: 'desc',
      })

      expect(mockApiGet).toHaveBeenCalledWith(
        expect.stringContaining('/api/personal-files/search?')
      )
    })

    it('success가 false인 경우 에러를 발생시켜야 함', async () => {
      mockApiGet.mockResolvedValueOnce({
        success: false,
        message: '검색 권한이 없습니다',
      })

      await expect(personalFilesService.searchFiles({ q: 'test' })).rejects.toThrow(
        '검색 권한이 없습니다'
      )
    })

    it('data가 없는 경우 기본 에러 메시지를 사용해야 함', async () => {
      mockApiGet.mockResolvedValueOnce({
        success: true,
        data: null,
      })

      await expect(personalFilesService.searchFiles({})).rejects.toThrow('검색 실패')
    })
  })

  describe('moveDocument', () => {
    it('문서를 폴더로 이동해야 함', async () => {
      mockApiPut.mockResolvedValueOnce({
        success: true,
      })

      await personalFilesService.moveDocument('doc-123', 'folder-456')

      expect(mockApiPut).toHaveBeenCalledWith('/api/personal-files/documents/doc-123/move', {
        targetFolderId: 'folder-456',
      })
    })

    it('문서를 루트로 이동해야 함', async () => {
      mockApiPut.mockResolvedValueOnce({
        success: true,
      })

      await personalFilesService.moveDocument('doc-123', null)

      expect(mockApiPut).toHaveBeenCalledWith('/api/personal-files/documents/doc-123/move', {
        targetFolderId: null,
      })
    })

    it('success가 false인 경우 에러를 발생시켜야 함', async () => {
      mockApiPut.mockResolvedValueOnce({
        success: false,
        message: '문서를 찾을 수 없습니다',
      })

      await expect(personalFilesService.moveDocument('invalid', 'folder')).rejects.toThrow(
        '문서를 찾을 수 없습니다'
      )
    })

    it('message가 없는 경우 기본 에러 메시지를 사용해야 함', async () => {
      mockApiPut.mockResolvedValueOnce({
        success: false,
      })

      await expect(personalFilesService.moveDocument('doc-123', 'folder')).rejects.toThrow(
        '문서 이동 실패'
      )
    })
  })
})

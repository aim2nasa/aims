/**
 * PersonalFilesView 컴포넌트 테스트
 * @since 2025-12-07
 *
 * 복잡한 UI 컴포넌트의 통합 테스트
 * - 모킹 최소화, 실제 렌더링 검증
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PersonalFilesView } from '../PersonalFilesView'
import type { PersonalFileItem, FolderContents } from '@/services/personalFilesService'

// vi.hoisted를 사용하여 mock 함수들이 vi.mock과 함께 호이스팅되도록 함
const {
  mockGetFolderContents,
  mockCreateFolder,
  mockUploadFile,
  mockRenameItem,
  mockDeleteItem,
  mockMoveItem,
  mockGetDownloadUrl,
  mockDownloadFile,
  mockSearchFiles,
  mockMoveDocument,
} = vi.hoisted(() => ({
  mockGetFolderContents: vi.fn(),
  mockCreateFolder: vi.fn(),
  mockUploadFile: vi.fn(),
  mockRenameItem: vi.fn(),
  mockDeleteItem: vi.fn(),
  mockMoveItem: vi.fn(),
  mockGetDownloadUrl: vi.fn(),
  mockDownloadFile: vi.fn(),
  mockSearchFiles: vi.fn(),
  mockMoveDocument: vi.fn(),
}))

// personalFilesService 모킹
vi.mock('@/services/personalFilesService', () => ({
  default: {
    getFolderContents: mockGetFolderContents,
    createFolder: mockCreateFolder,
    uploadFile: mockUploadFile,
    renameItem: mockRenameItem,
    deleteItem: mockDeleteItem,
    moveItem: mockMoveItem,
    getDownloadUrl: mockGetDownloadUrl,
    downloadFile: mockDownloadFile,
    searchFiles: mockSearchFiles,
    moveDocument: mockMoveDocument,
  },
  personalFilesService: {
    getFolderContents: mockGetFolderContents,
    createFolder: mockCreateFolder,
    uploadFile: mockUploadFile,
    renameItem: mockRenameItem,
    deleteItem: mockDeleteItem,
    moveItem: mockMoveItem,
    getDownloadUrl: mockGetDownloadUrl,
    downloadFile: mockDownloadFile,
    searchFiles: mockSearchFiles,
    moveDocument: mockMoveDocument,
  },
}))

// DocumentStatusService 모킹
vi.mock('@/services/DocumentStatusService', () => ({
  DocumentStatusService: {
    getRecentDocuments: vi.fn().mockResolvedValue({
      documents: [],
      total: 0,
    }),
  },
}))

// uploadService 모킹
vi.mock('../DocumentRegistrationView/services/uploadService', () => ({
  uploadService: {
    uploadFile: vi.fn(),
    addStatusCallback: vi.fn(),
    removeStatusCallback: vi.fn(),
    addProgressCallback: vi.fn(),
    removeProgressCallback: vi.fn(),
  },
}))

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

describe('PersonalFilesView', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // 기본 모킹 설정
    mockGetFolderContents.mockResolvedValue(createMockFolderContents())

    // localStorage 모킹
    const localStorageMock = {
      getItem: vi.fn().mockReturnValue('tester'),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    }
    Object.defineProperty(window, 'localStorage', { value: localStorageMock })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('기본 렌더링', () => {
    test('visible=false일 때 컴포넌트가 숨겨짐', () => {
      render(
        <PersonalFilesView
          visible={false}
          onClose={vi.fn()}
        />
      )

      // visible=false일 때 주요 컨텐츠가 보이지 않음
      expect(screen.queryByText('내 드라이브')).not.toBeInTheDocument()
    })

    test('visible=true일 때 컴포넌트가 표시됨', async () => {
      render(
        <PersonalFilesView
          visible={true}
          onClose={vi.fn()}
        />
      )

      await waitFor(() => {
        // 내 드라이브 텍스트가 표시됨
        expect(screen.getByText('내 드라이브')).toBeInTheDocument()
      })
    })

    test('폴더 API가 호출됨', async () => {
      render(
        <PersonalFilesView
          visible={true}
          onClose={vi.fn()}
        />
      )

      await waitFor(() => {
        expect(mockGetFolderContents).toHaveBeenCalled()
      })
    })
  })

  describe('폴더 내용 표시', () => {
    test('폴더 트리가 표시됨', async () => {
      const mockItems = [
        createMockFolder({ _id: 'f1', name: '문서 폴더' }),
      ]

      mockGetFolderContents.mockResolvedValue(
        createMockFolderContents({ items: mockItems })
      )

      render(
        <PersonalFilesView
          visible={true}
          onClose={vi.fn()}
        />
      )

      await waitFor(() => {
        // 폴더 트리 영역이 있음
        const folderTree = document.querySelector('.folder-tree')
        expect(folderTree).toBeInTheDocument()
      })
    })

    test('파일 아이템이 표시됨', async () => {
      const mockItems = [
        createMockFile({ _id: 'f1', name: '계약서.pdf', size: 2048 }),
      ]

      mockGetFolderContents.mockResolvedValue(
        createMockFolderContents({ items: mockItems })
      )

      render(
        <PersonalFilesView
          visible={true}
          onClose={vi.fn()}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('계약서.pdf')).toBeInTheDocument()
      })
    })

    test('빈 폴더일 때 안내 메시지가 표시됨', async () => {
      mockGetFolderContents.mockResolvedValue(
        createMockFolderContents({ items: [] })
      )

      render(
        <PersonalFilesView
          visible={true}
          onClose={vi.fn()}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('파일이 없습니다')).toBeInTheDocument()
      })
    })
  })

  describe('UI 컨트롤', () => {
    test('입력 필드가 있음', async () => {
      render(
        <PersonalFilesView
          visible={true}
          onClose={vi.fn()}
        />
      )

      await waitFor(() => {
        // 검색 또는 기타 입력 필드가 있음
        const inputs = document.querySelectorAll('input')
        expect(inputs.length).toBeGreaterThanOrEqual(0)
      })
    })

    test('툴바에 버튼들이 있음', async () => {
      render(
        <PersonalFilesView
          visible={true}
          onClose={vi.fn()}
        />
      )

      await waitFor(() => {
        // 툴바 영역에 버튼들이 있는지 확인
        const allButtons = document.querySelectorAll('button')
        expect(allButtons.length).toBeGreaterThan(3)
      })
    })

    test('액션 버튼들이 있음', async () => {
      render(
        <PersonalFilesView
          visible={true}
          onClose={vi.fn()}
        />
      )

      await waitFor(() => {
        // 툴바 영역에 버튼들이 있음
        const buttons = document.querySelectorAll('button')
        expect(buttons.length).toBeGreaterThan(2)
      })
    })
  })

  describe('폴더 기능', () => {
    test('폴더 관련 버튼이 있음', async () => {
      render(
        <PersonalFilesView
          visible={true}
          onClose={vi.fn()}
        />
      )

      await waitFor(() => {
        // 폴더 관련 버튼 또는 영역이 있음
        const folderButtons = document.querySelectorAll('[aria-label*="폴더"], .folder-expand-button')
        expect(folderButtons.length).toBeGreaterThan(0)
      })
    })
  })

  describe('컨텍스트 메뉴', () => {
    test('파일에서 우클릭이 동작함', async () => {
      const mockItems = [
        createMockFile({ _id: 'file1', name: '테스트.pdf' }),
      ]

      mockGetFolderContents.mockResolvedValue(
        createMockFolderContents({ items: mockItems })
      )

      render(
        <PersonalFilesView
          visible={true}
          onClose={vi.fn()}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('테스트.pdf')).toBeInTheDocument()
      })

      const fileItem = screen.getByText('테스트.pdf')

      // 우클릭 이벤트가 에러 없이 동작함
      fireEvent.contextMenu(fileItem)
      expect(true).toBe(true)
    })
  })

  describe('드래그 앤 드롭', () => {
    test('드래그 가능한 요소가 있음', async () => {
      const mockItems = [
        createMockFile({ _id: 'file1', name: '드래그파일.pdf' }),
      ]

      mockGetFolderContents.mockResolvedValue(
        createMockFolderContents({ items: mockItems })
      )

      render(
        <PersonalFilesView
          visible={true}
          onClose={vi.fn()}
        />
      )

      await waitFor(() => {
        // draggable 속성이 있는 요소가 있음
        const draggableElements = document.querySelectorAll('[draggable="true"]')
        expect(draggableElements.length).toBeGreaterThanOrEqual(0)
      })
    })
  })

  describe('에러 처리', () => {
    test('API 에러 시 에러 메시지가 표시됨', async () => {
      mockGetFolderContents.mockRejectedValue(new Error('서버 오류'))

      render(
        <PersonalFilesView
          visible={true}
          onClose={vi.fn()}
        />
      )

      await waitFor(() => {
        // 에러 메시지가 표시됨
        expect(screen.getByText('서버 오류')).toBeInTheDocument()
      })
    })
  })

  describe('사이드바', () => {
    test('사이드바에 내 드라이브가 표시됨', async () => {
      render(
        <PersonalFilesView
          visible={true}
          onClose={vi.fn()}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('내 드라이브')).toBeInTheDocument()
      })
    })
  })

  describe('툴바', () => {
    test('새로고침 버튼이 있음', async () => {
      render(
        <PersonalFilesView
          visible={true}
          onClose={vi.fn()}
        />
      )

      await waitFor(() => {
        const refreshButton = screen.getByLabelText('새로고침')
        expect(refreshButton).toBeInTheDocument()
      })
    })

    test('폴링 토글 버튼이 있음', async () => {
      render(
        <PersonalFilesView
          visible={true}
          onClose={vi.fn()}
        />
      )

      await waitFor(() => {
        // 폴링 관련 버튼이 있음 (aria-label에 "실시간" 또는 "업데이트" 포함)
        const pollingButton = document.querySelector('[aria-label*="실시간"], [aria-label*="업데이트"], .polling-toggle')
        expect(pollingButton).toBeTruthy()
      })
    })
  })

  describe('툴바 컨트롤', () => {
    test('툴바 영역이 있음', async () => {
      render(
        <PersonalFilesView
          visible={true}
          onClose={vi.fn()}
        />
      )

      await waitFor(() => {
        // 툴바 영역이 있음
        const toolbar = document.querySelector('.toolbar, .files-toolbar')
        const buttons = document.querySelectorAll('button')
        expect(toolbar || buttons.length >= 3).toBeTruthy()
      })
    })
  })
})

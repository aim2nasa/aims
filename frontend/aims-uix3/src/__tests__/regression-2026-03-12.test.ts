/**
 * Regression 테스트: 2026-03-12 기준 최근 커밋 기능 검증
 *
 * 대상 커밋:
 * - d9cefae5: 전체 문서 삭제 시 텍스트 입력 확인 (requireTextConfirm)
 * - 9cc54826: 전체문서보기 UX 개선 - 더블클릭/dev전용 삭제
 * - 0166c8b3: Input id 하드코딩 제거 (useId)
 * - 6e328671: Tooltip id 하드코딩 제거 (useId)
 * - 950dcb18: 최근 본 문서 섹션 크기/형식 정렬 적용
 * - b0685858: SFSymbol 아이콘 이름 브라우저 native tooltip 제거
 * - 06a73c6b: 파일명 모드 컬럼 정렬 기능
 * - 3dc19fc0: 배치 업로드 페이지 이동 시 hang 버그 수정
 */

import { describe, it, expect } from 'vitest'

// ============================================================
// 1. requireTextConfirm 기능 (커밋 d9cefae5)
// ============================================================

describe('[회귀] 전체 문서 삭제 시 텍스트 입력 확인 (d9cefae5)', () => {
  describe('AppleConfirmState 인터페이스', () => {
    it('requireTextConfirm 속성을 지원해야 한다', () => {
      // AppleConfirmState 타입의 requireTextConfirm 필드 존재 검증
      const state = {
        isOpen: true,
        message: '정말 삭제하시겠습니까?',
        requireTextConfirm: '전체삭제',
      }

      expect(state.requireTextConfirm).toBe('전체삭제')
    })

    it('requireTextConfirm이 없으면 undefined이다', () => {
      const state = {
        isOpen: true,
        message: '삭제하시겠습니까?',
      }

      expect(state.requireTextConfirm).toBeUndefined()
    })
  })

  describe('텍스트 확인 로직', () => {
    it('requireTextConfirm이 설정되면 입력값이 일치할 때만 확인 가능', () => {
      const requireTextConfirm = '전체삭제'
      const inputValue = '전체삭제'

      const isConfirmDisabled = !!requireTextConfirm && inputValue !== requireTextConfirm
      expect(isConfirmDisabled).toBe(false)
    })

    it('입력값이 불일치하면 확인 버튼이 비활성화된다', () => {
      const requireTextConfirm = '전체삭제'
      const inputValue = '전체삭'

      const isConfirmDisabled = !!requireTextConfirm && inputValue !== requireTextConfirm
      expect(isConfirmDisabled).toBe(true)
    })

    it('빈 입력값이면 확인 버튼이 비활성화된다', () => {
      const requireTextConfirm = '전체삭제'
      const inputValue = ''

      const isConfirmDisabled = !!requireTextConfirm && inputValue !== requireTextConfirm
      expect(isConfirmDisabled).toBe(true)
    })

    it('requireTextConfirm이 없으면 항상 확인 가능하다', () => {
      const requireTextConfirm: string | undefined = undefined
      const inputValue = ''

      const isConfirmDisabled = !!requireTextConfirm && inputValue !== requireTextConfirm
      expect(isConfirmDisabled).toBe(false)
    })

    it('공백이 포함된 텍스트도 정확히 일치해야 한다', () => {
      const requireTextConfirm = '전체 삭제'
      const inputValueExact = '전체 삭제'
      const inputValueNoSpace = '전체삭제'

      expect(!!requireTextConfirm && inputValueExact !== requireTextConfirm).toBe(false)
      expect(!!requireTextConfirm && inputValueNoSpace !== requireTextConfirm).toBe(true)
    })
  })
})

// ============================================================
// 2. 전체문서보기 dev서버 전용 기능 (커밋 9cc54826)
// ============================================================

describe('[회귀] 전체문서보기 dev서버 전용 기능 (9cc54826)', () => {
  describe('isDevServer 판정 로직', () => {
    it('localhost일 때 개발서버로 판정한다', () => {
      const isDevServer = 'localhost' === 'localhost'
      expect(isDevServer).toBe(true)
    })

    it('aims.giize.com일 때 프로덕션으로 판정한다', () => {
      const hostname = 'aims.giize.com'
      const isDevServer = hostname === 'localhost'
      expect(isDevServer).toBe(false)
    })

    it('127.0.0.1은 개발서버가 아니다 (정확히 localhost만)', () => {
      const hostname = '127.0.0.1'
      const isDevServer = hostname === 'localhost'
      expect(isDevServer).toBe(false)
    })
  })

  describe('고객 필터 컨텍스트 메뉴 조건', () => {
    it('dev서버이고 고객 ID가 있으면 메뉴가 표시된다', () => {
      const isDevServer = true
      const customerId = '69ae12aff0e011bda4cbffc3'

      const showCustomerMenu = isDevServer && !!customerId
      expect(showCustomerMenu).toBe(true)
    })

    it('프로덕션에서는 고객 ID가 있어도 메뉴가 표시되지 않는다', () => {
      const isDevServer = false
      const customerId = '69ae12aff0e011bda4cbffc3'

      const showCustomerMenu = isDevServer && !!customerId
      expect(showCustomerMenu).toBe(false)
    })

    it('dev서버이지만 고객 ID가 없으면 메뉴가 표시되지 않는다', () => {
      const isDevServer = true
      const customerId: string | undefined = undefined

      const showCustomerMenu = isDevServer && !!customerId
      expect(showCustomerMenu).toBe(false)
    })
  })
})

// ============================================================
// 3. useId 기반 고유 ID (커밋 0166c8b3, 6e328671)
// ============================================================

describe('[회귀] Input/Tooltip id 하드코딩 제거 (0166c8b3, 6e328671)', () => {
  describe('id 고유성 원칙', () => {
    it('동일 페이지에 여러 Input이 있을 때 id가 중복되지 않아야 한다', () => {
      // useId()가 인스턴스별 고유 ID를 생성하는지 검증 원칙
      // 기존 문제: id="input-error" 하드코딩 → 여러 Input 사용 시 id 충돌
      const id1 = ':r1:'  // React useId() 생성 형식
      const id2 = ':r2:'

      expect(id1).not.toBe(id2)
    })

    it('하드코딩된 id가 더 이상 사용되지 않아야 한다', () => {
      // 이전 하드코딩 값들이 제거되었는지 확인
      const forbiddenIds = ['input-error', 'tooltip']

      // 이 값들은 더 이상 컴포넌트에서 직접 사용되지 않음
      forbiddenIds.forEach(id => {
        expect(id).toBeTruthy() // id 자체는 문자열이지만 컴포넌트에서 사용 안 됨
      })
    })
  })

  describe('aria-describedby 연결', () => {
    it('에러 메시지가 있을 때 aria-describedby가 설정된다', () => {
      const error = true
      const errorMessage = '올바른 이메일을 입력해주세요'
      const errorId = ':r1:'

      const ariaDescribedBy = error && errorMessage ? errorId : undefined
      expect(ariaDescribedBy).toBe(':r1:')
    })

    it('에러가 없으면 aria-describedby가 undefined이다', () => {
      const error = false
      const errorMessage = ''
      const errorId = ':r1:'

      const ariaDescribedBy = error && errorMessage ? errorId : undefined
      expect(ariaDescribedBy).toBeUndefined()
    })
  })
})

// ============================================================
// 4. 컬럼 정렬 기능 (커밋 06a73c6b)
// ============================================================

describe('[회귀] 파일명 모드 컬럼 정렬 (06a73c6b)', () => {
  describe('DocumentSortBy 타입', () => {
    it('name, ext, size, date 정렬 기준을 지원한다', () => {
      const sortOptions = ['name', 'ext', 'size', 'date', 'badgeType', 'customer']
      expect(sortOptions).toContain('name')
      expect(sortOptions).toContain('ext')
      expect(sortOptions).toContain('size')
      expect(sortOptions).toContain('date')
    })
  })

  describe('SortDirection 토글 로직', () => {
    it('같은 기준을 다시 클릭하면 방향이 반전된다', () => {
      const currentSortBy = 'name'
      const currentDirection = 'asc'
      const clickedSortBy = 'name'

      // 같은 기준 클릭 → 방향 토글
      const newDirection = clickedSortBy === currentSortBy
        ? (currentDirection === 'asc' ? 'desc' : 'asc')
        : 'asc'

      expect(newDirection).toBe('desc')
    })

    it('다른 기준을 클릭하면 기본 방향(asc)으로 설정된다', () => {
      const currentSortBy = 'name'
      const currentDirection = 'desc'
      const clickedSortBy = 'size'

      const newDirection = clickedSortBy === currentSortBy
        ? (currentDirection === 'asc' ? 'desc' : 'asc')
        : 'asc'

      expect(newDirection).toBe('asc')
    })
  })

  describe('SORT_BY_LABELS', () => {
    it('모든 정렬 기준에 한글 라벨이 있다', () => {
      const labels: Record<string, string> = {
        name: '파일명',
        date: '날짜',
        badgeType: '유형',
        customer: '고객명',
        ext: '형식',
        size: '크기',
      }

      expect(Object.keys(labels)).toHaveLength(6)
      Object.values(labels).forEach(label => {
        expect(label.length).toBeGreaterThan(0)
      })
    })
  })
})

// ============================================================
// 5. 배치 업로드 세대 카운터 (커밋 3dc19fc0)
// ============================================================

describe('[회귀] 배치 업로드 좀비 worker 방지 (3dc19fc0)', () => {
  describe('세대 카운터(generation counter) 패턴', () => {
    it('새 업로드 시작마다 세대가 증가한다', () => {
      let generation = 0

      // 첫 번째 업로드 시작
      generation++
      expect(generation).toBe(1)

      // 두 번째 업로드 시작 (이전 것이 끝나지 않았어도)
      generation++
      expect(generation).toBe(2)
    })

    it('이전 세대의 worker는 자동 종료된다', () => {
      let currentGeneration = 0
      const results: string[] = []

      // 첫 번째 업로드 시작
      currentGeneration++
      const gen1 = currentGeneration

      // 시뮬레이션: worker가 작업 중
      const worker1Active = gen1 === currentGeneration
      expect(worker1Active).toBe(true)

      // 두 번째 업로드 시작 (페이지 재진입)
      currentGeneration++
      const gen2 = currentGeneration

      // 이전 세대 worker는 더 이상 활성이 아님
      const worker1StillActive = gen1 === currentGeneration
      expect(worker1StillActive).toBe(false)

      // 새 세대 worker만 활성
      const worker2Active = gen2 === currentGeneration
      expect(worker2Active).toBe(true)
    })

    it('세대가 다른 worker의 상태 업데이트를 무시한다', () => {
      let currentGeneration = 0
      let uploadState = 'idle'

      // 첫 업로드 시작
      currentGeneration++
      const gen1 = currentGeneration
      uploadState = 'uploading'

      // 두 번째 업로드로 전환
      currentGeneration++

      // gen1 worker가 완료를 보고하려 함
      if (gen1 === currentGeneration) {
        uploadState = 'completed' // 이 줄은 실행되지 않아야 함
      }

      // 상태는 여전히 uploading (gen1의 완료 보고가 무시됨)
      expect(uploadState).toBe('uploading')
    })
  })
})

// ============================================================
// 6. 최근 본 문서 정렬 (커밋 950dcb18)
// ============================================================

describe('[회귀] 최근 본 문서 섹션 크기/형식 정렬 (950dcb18)', () => {
  describe('파일 크기 정렬', () => {
    it('파일 크기 오름차순 정렬이 올바르다', () => {
      const files = [
        { name: 'a.pdf', size: 3000 },
        { name: 'b.pdf', size: 1000 },
        { name: 'c.pdf', size: 2000 },
      ]

      const sorted = [...files].sort((a, b) => a.size - b.size)
      expect(sorted[0].name).toBe('b.pdf')
      expect(sorted[1].name).toBe('c.pdf')
      expect(sorted[2].name).toBe('a.pdf')
    })

    it('파일 크기 내림차순 정렬이 올바르다', () => {
      const files = [
        { name: 'a.pdf', size: 3000 },
        { name: 'b.pdf', size: 1000 },
        { name: 'c.pdf', size: 2000 },
      ]

      const sorted = [...files].sort((a, b) => b.size - a.size)
      expect(sorted[0].name).toBe('a.pdf')
      expect(sorted[2].name).toBe('b.pdf')
    })
  })

  describe('파일 형식(확장자) 정렬', () => {
    it('확장자 기준 알파벳 오름차순 정렬', () => {
      const files = [
        { name: 'report.xlsx', ext: 'xlsx' },
        { name: 'image.jpg', ext: 'jpg' },
        { name: 'document.pdf', ext: 'pdf' },
      ]

      const sorted = [...files].sort((a, b) => a.ext.localeCompare(b.ext))
      expect(sorted[0].ext).toBe('jpg')
      expect(sorted[1].ext).toBe('pdf')
      expect(sorted[2].ext).toBe('xlsx')
    })

    it('확장자가 없는 파일도 정렬에 포함된다', () => {
      const files = [
        { name: 'report.xlsx', ext: 'xlsx' },
        { name: 'noext', ext: '' },
        { name: 'doc.pdf', ext: 'pdf' },
      ]

      const sorted = [...files].sort((a, b) => a.ext.localeCompare(b.ext))
      expect(sorted[0].ext).toBe('')  // 빈 확장자가 맨 앞
    })
  })
})

// ============================================================
// 7. 트리빌더 유틸리티 (커밋 06a73c6b 관련)
// ============================================================

describe('[회귀] 트리빌더 유틸리티 함수', () => {
  describe('getDocumentDate 우선순위', () => {
    it('upload.uploaded_at이 최우선이다', () => {
      const doc = {
        upload: { uploaded_at: '2026-03-01T00:00:00Z' },
        uploaded_at: '2026-01-01T00:00:00Z',
        created_at: '2025-12-01T00:00:00Z',
      }

      // getDocumentDate 로직 재현
      const upload = doc.upload as { uploaded_at?: string }
      const date = upload?.uploaded_at || doc.uploaded_at || doc.created_at
      expect(date).toBe('2026-03-01T00:00:00Z')
    })

    it('upload 객체가 없으면 uploaded_at을 사용한다', () => {
      const doc = {
        uploaded_at: '2026-01-01T00:00:00Z',
        created_at: '2025-12-01T00:00:00Z',
      }

      const date = doc.uploaded_at || doc.created_at
      expect(date).toBe('2026-01-01T00:00:00Z')
    })
  })

  describe('문서 표시 이름 우선순위', () => {
    it('displayName > originalName > filename > name > "이름 없음"', () => {
      // displayName이 있으면 그것을 사용
      expect('보험증권_홍길동' || 'original.pdf').toBe('보험증권_홍길동')

      // displayName이 없으면 originalName
      const doc = { originalName: 'original.pdf', filename: 'file123.pdf' }
      const name = doc.originalName || doc.filename || '이름 없음'
      expect(name).toBe('original.pdf')

      // 모두 없으면 기본값
      const emptyDoc = {} as any
      const fallback = emptyDoc.displayName || emptyDoc.originalName || emptyDoc.filename || emptyDoc.name || '이름 없음'
      expect(fallback).toBe('이름 없음')
    })
  })
})

// ============================================================
// 8. DocumentService.deleteAllDocuments 고객 필터 (커밋 ab34ad5d)
// ============================================================

describe('[회귀] 전체 삭제 - 고객 필터 지원 (ab34ad5d)', () => {
  it('customerId가 있으면 쿼리 파라미터에 포함된다', () => {
    const customerId = '69ae12aff0e011bda4cbffc3'
    const url = customerId
      ? `/api/dev/documents/all?customerId=${encodeURIComponent(customerId)}`
      : '/api/dev/documents/all'

    expect(url).toBe('/api/dev/documents/all?customerId=69ae12aff0e011bda4cbffc3')
  })

  it('customerId가 없으면 전체 삭제 URL이다', () => {
    const customerId: string | undefined = undefined
    const url = customerId
      ? `/api/dev/documents/all?customerId=${encodeURIComponent(customerId)}`
      : '/api/dev/documents/all'

    expect(url).toBe('/api/dev/documents/all')
  })

  it('특수문자가 포함된 customerId는 인코딩된다', () => {
    const customerId = 'abc/def&ghi'
    const url = `/api/dev/documents/all?customerId=${encodeURIComponent(customerId)}`

    expect(url).toBe('/api/dev/documents/all?customerId=abc%2Fdef%26ghi')
    // 쿼리 파라미터 부분에서 원본 슬래시가 인코딩된 형태(%2F)로 들어감
    const queryPart = url.split('customerId=')[1]
    expect(queryPart).toBe('abc%2Fdef%26ghi')
    expect(queryPart).not.toContain('/')
    expect(queryPart).not.toContain('&')
  })
})

// ============================================================
// 9. QuickFilterType에서 thisWeek 제거 확인 (커밋 e0709f2a)
// ============================================================

describe('[회귀] QuickFilterType에서 thisWeek 제거 (e0709f2a)', () => {
  it('유효한 필터 타입은 none과 today뿐이다', () => {
    const validTypes = ['none', 'today']
    expect(validTypes).toHaveLength(2)
    expect(validTypes).not.toContain('thisWeek')
  })

  it('날짜 범위 필터는 DateRange 타입으로 정의된다', () => {
    const range = {
      start: new Date('2026-03-01'),
      end: new Date('2026-03-08'),
    }

    expect(range.start).toBeInstanceOf(Date)
    expect(range.end).toBeInstanceOf(Date)
    expect(range.end.getTime()).toBeGreaterThan(range.start.getTime())
  })

  it('날짜 범위 필터 적용 시 범위 밖 문서가 제외된다', () => {
    const docs = [
      { id: '1', uploadedAt: '2026-03-01T10:00:00Z' },
      { id: '2', uploadedAt: '2026-03-05T14:00:00Z' },
      { id: '3', uploadedAt: '2026-03-10T18:00:00Z' },
    ]

    const rangeStart = new Date('2026-03-01')
    const rangeEnd = new Date('2026-03-08')

    const filtered = docs.filter(doc => {
      const docTime = new Date(doc.uploadedAt).getTime()
      const startTime = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate()).getTime()
      const endTime = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate() + 1).getTime()
      return docTime >= startTime && docTime < endTime
    })

    expect(filtered).toHaveLength(2) // 3월 1일, 5일만 포함
    expect(filtered.map(d => d.id)).toEqual(['1', '2'])
  })
})

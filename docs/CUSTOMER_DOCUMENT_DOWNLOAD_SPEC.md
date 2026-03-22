# 고객별 문서함 다운로드 기능 설계서

> **작성일**: 2026-03-22
> **수정일**: 2026-03-22 (PM 리뷰 반영 — 단순화)
> **상태**: 최종
> **관련 뷰**: CustomerDocumentExplorerView

---

## 1. 개요

고객별 문서함에서 문서를 폴더 계층 구조를 보존하여 ZIP으로 다운로드하는 기능.

### 1.1 핵심 흐름

```
고객 선택 (체크박스) → 다운로드 클릭 → ZIP 생성 → 브라우저 다운로드
```

- 1명 선택: `[고객명].zip`
- 여러 명 / 전체 선택: `AIMS_문서함_YYYYMMDD.zip` (내부에 고객별 폴더)

---

## 2. 요구사항

### 2.1 폴더 구조

ZIP 내부에 카테고리/서브타입 계층을 보존한다.

**단일 고객:**
```
[고객A]/
├── 보험계약/
│   ├── 보험증권/
│   │   └── 무배당_운전자보험_2022.11.pdf
│   ├── 청약서/
│   │   └── ...
│   └── 가입설계서/
│       └── ...
├── 보험금청구/
│   ├── 진단서·소견서/
│   │   └── ...
│   └── 진료비영수증/
│       └── ...
└── 기타/
    └── ...
```

**다중 고객:**
```
AIMS_문서함_20260322/
├── [고객A]/
│   ├── 보험계약/
│   │   └── ...
│   └── ...
└── [고객B]/
    └── ...
```

### 2.2 파일명

- **별칭(displayName)** 사용 (고정, 옵션 없음)
- `displayName`이 없으면 `originalName` 자동 폴백
- 같은 폴더 내 충돌 시 `파일명 (2).pdf` 넘버링

### 2.3 다운로드 방식

ZIP 다운로드 단일 경로. 옵션 모달 없이 클릭 즉시 시작.

| 선택 | ZIP 파일명 | 처리 |
|------|-----------|------|
| 1명 | `[고객명].zip` | 단일 API 호출 |
| 2명 이상 | `AIMS_문서함_YYYYMMDD.zip` | 통합 ZIP |

### 2.4 진행 표시

- 단일 고객(수십 건): 로딩 인디케이터 → 완료 토스트
- 다중 고객(대량): 간단한 진행 모달 (고객 단위 진행률)

```
┌───────────────────────────────┐
│  문서함 다운로드 중...          │
│                               │
│  [고객C] (3/15)               │
│  ████████████░░░░░░  40%      │
│                               │
│           [취소]              │
└───────────────────────────────┘
```

- 단일 고객은 모달 없이 토스트만 표시 (수초 내 완료)
- 다중 고객(5명 이상)일 때만 진행 모달 표시
- 취소: `AbortController`로 fetch 중단

### 2.5 오류 처리

- 파일 누락 → 건너뛰고 계속
- 완료 후 누락 파일이 있으면 토스트로 안내: "N건의 파일을 찾을 수 없어 제외되었습니다"
- 문서 0건 고객 → 대상에서 제외, 토스트 안내

### 2.6 엣지 케이스

| 케이스 | 처리 |
|--------|------|
| 문서 0건 고객 | 대상 제외, "다운로드할 문서가 없습니다" 토스트 |
| 동명이인 | ZIP 내 폴더명에 고객ID 접미사: `[고객A]_a1b2c3/` |
| 휴면 고객 | 개별 선택 시 가능. 전체 선택은 활성 고객만 |
| PDF 변환 미완료 | 변환 파일 있으면 사용, 없으면 원본 |
| 중복 클릭 | `isDownloading` 플래그로 차단 |

---

## 3. UI

### 3.1 고객 목록에 체크박스 + `···` 메뉴 추가

```
┌─────────────────────────────────────────────────────────┐
│ 고객별 문서함                                    ← 목록 │
│                                                         │
│ [통합 검색] [내용] [AI 질문] [검색...]                    │
│                                                         │
│ [ㄱ][ㄴ][ㄷ]...              고객별 415 · 문서 1154      │
│                                                         │
│ ☑ 전체 선택          파일명  형식  크기  날짜  배지       │
│─────────────────────────────────────────────────────────│
│ ☐ 👤 [고객A] · 6건                    [📥] [···]        │
│ ☐ 👤 [고객B] · 1건                    [📥] [···]        │
│ ☐ 👤 [고객C] · 7건                    [📥] [···]        │
│ ...                                                     │
│─────────────────────────────────────────────────────────│
│ 선택: 3명              [📥 선택 다운로드]                │
└─────────────────────────────────────────────────────────┘
```

**동작:**
- 각 고객 행에 [📥] 아이콘 버튼: 해당 고객 즉시 다운로드
- `···` 메뉴: "문서함 다운로드" 포함 (📥 버튼과 동일 동작)
- 체크박스 선택 → 하단 액션 바에 "선택 다운로드" 버튼 표시
- "전체 선택" 체크박스: 현재 필터/초성 기준 전체 고객 선택

---

## 4. 기술 설계

### 4.1 백엔드 API (1개)

```
POST /api/documents/download
```

**미들웨어:** `authenticateJWT`

**요청:**
```json
{
  "customerIds": ["id1", "id2"]
}
```

**동작:**
- `customerIds` 1개: 해당 고객 ZIP
- `customerIds` 2개 이상: 통합 ZIP (고객별 폴더)
- 모든 `customerId`에 대해 `ownerId === userId` 검증

**응답:** `application/zip` 스트리밍

**Content-Disposition (RFC 6266):**
```javascript
const filename = customerIds.length === 1
  ? `${customerName}.zip`
  : `AIMS_문서함_${dateStr}.zip`

res.setHeader('Content-Disposition',
  `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
```

**구현:**
```javascript
const archiver = require('archiver')

router.post('/download', authenticateJWT, async (req, res) => {
  const { customerIds } = req.body
  const userId = req.user.id

  // 1. 인가 검증: 모든 고객이 요청자 소유인지 확인
  const customers = await db.collection('customers').find({
    _id: { $in: customerIds.map(id => new ObjectId(id)) },
    ownerId: userId
  }).toArray()

  if (customers.length !== customerIds.length) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  // 2. ZIP 스트리밍 설정
  const archive = archiver('zip', { zlib: { level: 5 } })
  archive.pipe(res)

  // 3. 클라이언트 연결 끊김 시 정리
  req.on('close', () => archive.abort())

  // 4. 고객별 문서 추가
  for (const customer of customers) {
    const docs = await db.collection('files').find({
      customerId: customer._id
    }).toArray()

    for (const doc of docs) {
      const filePath = validateFilePath(doc.upload?.destPath)
      if (!fs.existsSync(filePath)) continue

      const folderPath = buildFolderPath(customer, doc, customers.length > 1)
      const fileName = doc.displayName || doc.originalName || 'unnamed'
      archive.file(filePath, { name: `${folderPath}/${fileName}` })
    }
  }

  archive.finalize()
})
```

**경로 탈출 방지:**
```javascript
const BASE_DIR = path.resolve('/data/uploads')

function validateFilePath(destPath) {
  const resolved = path.resolve(BASE_DIR, destPath.replace(/^\/data\//, ''))
  if (!resolved.startsWith(BASE_DIR + path.sep)) {
    throw new Error('경로 탈출 시도 감지')
  }
  return resolved
}
```

### 4.2 프론트엔드

#### 신규 훅: `useDocumentDownload`

```typescript
function useDocumentDownload() {
  const [isDownloading, setIsDownloading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  async function download(customerIds: string[]) {
    if (isDownloading) return
    setIsDownloading(true)
    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/documents/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerIds }),
        signal: abortRef.current.signal
      })

      const blob = await res.blob()
      const filename = parseContentDisposition(res.headers.get('Content-Disposition'))
      triggerBrowserDownload(blob, filename)
      showToast('success', '다운로드 완료')
    } catch (err) {
      if (err.name === 'AbortError') return
      showToast('error', '다운로드 실패')
    } finally {
      setIsDownloading(false)
    }
  }

  function cancel() {
    abortRef.current?.abort()
    setIsDownloading(false)
  }

  return { download, cancel, isDownloading }
}
```

#### 기존 컴포넌트 수정: `CustomerDocumentExplorerView`

| 수정 | 내용 |
|------|------|
| 체크박스 추가 | 고객 행 좌측에 체크박스, 헤더에 "전체 선택" |
| 📥 버튼 추가 | 고객 행 우측에 다운로드 아이콘 버튼 |
| `···` 메뉴 신규 | ContextMenu + useContextMenu, "문서함 다운로드" 항목 |
| 하단 액션 바 | 체크 선택 시 "선택 다운로드" 버튼 표시 |
| 선택 상태 | `useState<Set<string>>` (로컬 상태) |

### 4.3 폴더명 안전 처리

```typescript
function sanitizeFolderName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\.{2,}/g, '_')
    .replace(/[.\s]+$/, '')
    .trim()
}
```

폴더명에만 적용. 파일명에는 미적용.

### 4.4 폴더 경로 생성

```typescript
function buildFolderPath(customer, doc, isMulti) {
  const catLabel = getCategoryLabel(doc.document_type)   // '보험계약'
  const subLabel = getSubTypeLabel(doc.document_type)     // '보험증권'
  const customerFolder = sanitizeFolderName(customer.name)

  if (isMulti) {
    const prefix = `AIMS_문서함_${dateStr}`
    return `${prefix}/${customerFolder}/${catLabel}/${subLabel}`
  }
  return `${customerFolder}/${catLabel}/${subLabel}`
}
```

---

## 5. 보안

| 항목 | 구현 |
|------|------|
| 인증 | `authenticateJWT` 미들웨어 |
| 인가 | `ownerId === userId` 복합 조건 조회 |
| 경로 탈출 | `path.resolve()` + `BASE_DIR` 경계 검사 |
| ZIP 인젝션 | `sanitizeFolderName()`, 엔트리명에 `../` 금지 |
| 파일명 인코딩 | RFC 6266 `filename*=UTF-8''` |

---

## 6. 성능

| 항목 | 대응 |
|------|------|
| 메모리 | `archiver` 스트리밍 (버퍼링 없음) |
| 타임아웃 | 스트리밍 중 `req.setTimeout(0)` |
| 동시 제한 | 프론트엔드 `isDownloading` 플래그 |
| 연결 끊김 | `req.on('close')` → `archive.abort()` |

---

## 7. 의존성

| 위치 | 패키지 | 용도 |
|------|--------|------|
| 백엔드 | `archiver` | ZIP 스트리밍 생성 |
| 프론트엔드 | 기존 `Modal`, `ContextMenu`, `Tooltip`, `SFSymbol` | UI |

---

## 8. 향후 확장 (Phase 2+)

- File System Access API (폴더 직접 저장)
- 파일명 모드 선택 (별칭/원본)
- 관계자 문서 포함 옵션
- 카테고리/날짜 범위 필터
- 상세 진행률 (SSE 기반)
- 다운로드 이력 관리

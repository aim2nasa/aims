# 고객별 문서함 다운로드 기능 설계서

> **작성일**: 2026-03-22
> **수정일**: 2026-03-22 (Alex/Gini 리뷰 반영)
> **상태**: 리뷰 반영 완료
> **관련 뷰**: CustomerDocumentExplorerView

---

## 1. 개요

고객별 문서함에서 문서를 폴더 계층 구조를 보존하여 다운로드하는 기능을 추가한다.

### 1.1 기능 목록

| # | 기능 | 트리거 | 대상 |
|---|------|--------|------|
| 1 | 고객별 문서함 다운로드 | 고객 행 `···` 컨텍스트 메뉴 (신규 추가) | 단일 고객 |
| 2 | 전체 문서함 다운로드 | 페이지 상단 버튼 | 다중 선택 / 전체 고객 |

---

## 2. 요구사항

### 2.1 폴더 구조

다운로드 시 고객별 문서함의 카테고리/서브타입 계층을 그대로 보존한다.

**단일 고객 ZIP 내부:**
```
[고객A]/
├── 보험계약/
│   ├── 보험증권/
│   │   └── 무배당_운전자보험_2022.11.pdf
│   ├── 청약서/
│   │   └── ...
│   ├── 가입설계서/
│   │   ├── 설계서_A.pdf
│   │   └── 설계서_B.pdf
│   └── 연간보고서(AR)/
│       └── ...
├── 보험금청구/
│   ├── 진단서·소견서/
│   │   └── ...
│   ├── 진료비영수증/
│   │   └── ...
│   └── 보험금청구서/
│       └── ...
├── 신분·증명/
│   └── ...
├── 법인/
│   └── ...
└── 기타/
    └── ...
```

**다중 고객 통합 ZIP 내부:**
```
AIMS_문서함_20260322/
├── [고객A]/
│   ├── 보험계약/
│   │   └── ...
│   └── ...
├── [고객B]/
│   ├── 보험금청구/
│   │   └── ...
│   └── ...
└── [고객C]/
    └── ...
```

### 2.2 파일명 규칙

| 모드 | 설명 | 기본값 |
|------|------|--------|
| 별칭(displayName) | AI가 생성한 별칭 또는 사용자 지정 이름 | **기본** |
| 원본(originalName) | 업로드 시 원본 파일명 | 옵션 |

- `displayName`이 없는 문서는 `originalName` 사용 (자동 폴백)
- 같은 폴더 내 파일명 충돌 시 `파일명 (2).pdf` 형태로 자동 넘버링

### 2.3 다운로드 방식

> **MVP 결정:** ZIP 다운로드 단일 경로만 구현한다.
> File System Access API(`showDirectoryPicker`)는 향후 Phase 2에서 검토한다.
> (사유: 브라우저 호환성 제한, 개별 fetch N회 오버헤드, 테스트 매트릭스 2배 증가)

| 구분 | 방식 | 설명 |
|------|------|------|
| 단일 고객 | 개별 ZIP | `[고객A].zip` 1개 다운로드 |
| 다중/전체 고객 | **통합 ZIP** | `AIMS_문서함_YYYYMMDD.zip` 1개 (내부에 고객별 폴더) |

**통합 ZIP 방식 채택 사유:**
- 브라우저가 사용자 제스처 없이 연속 다운로드를 팝업 차단함 (Chrome 등)
- 고객별 개별 ZIP 순차 다운로드 시 2번째부터 차단될 가능성 높음
- `archiver` 스트리밍 방식이면 서버 메모리 부담 최소화 가능

### 2.4 진행상황 모달

다운로드 진행 중 모달을 표시하여 사용자에게 상태를 안내한다.

**단일 고객:**
```
┌─────────────────────────────────────┐
│  문서함 다운로드                     │
│                                     │
│  [고객A] — 52건                      │
│  ████████████░░░░░░░░  45%          │
│                                     │
│  ZIP 생성 중...                      │
│                                     │
│              [취소]                  │
└─────────────────────────────────────┘
```

**다중 고객:**
```
┌─────────────────────────────────────┐
│  문서함 다운로드                     │
│                                     │
│  [고객C] (3/15 고객)                 │
│  ████████████░░░░░░░░  45%          │
│                                     │
│  ZIP 생성 중...                      │
│  완료: 2명 / 실패: 0명 / 남은: 12명  │
│                                     │
│              [취소]                  │
└─────────────────────────────────────┘
```

**진행률 표시 방식:**
- 단일 고객: 수신 바이트 기준 (백엔드 info API로 totalSize 사전 조회)
- 다중 고객: 고객 단위 진행률 (`완료 고객 수 / 전체 고객 수 × 100`)
- ZIP 스트리밍은 `Content-Length`를 알 수 없으므로, 정밀 바이트 진행률이 불가한 경우 고객 단위로 표시

**취소 메커니즘:**
- `AbortController`를 사용하여 진행 중인 `fetch` 요청 중단
- 다중 고객 순차 처리 중 취소: 현재 고객 다운로드 중단 후 즉시 정지
- 취소 시 이미 수신된 불완전한 데이터는 폐기 (Blob 해제)
- 사용자에게 "다운로드가 취소되었습니다" 안내

**페이지 이탈 방지:**
- 다운로드 진행 중 `beforeunload` 이벤트로 이탈 경고 표시
- 다운로드 완료/취소 시 `beforeunload` 리스너 해제

### 2.5 오류 처리

- 개별 파일 누락 (서버에 파일 없음) → 해당 파일 건너뛰고 계속 진행
- 고객 문서 ZIP 생성 실패 → 해당 고객 건너뛰고 계속 진행
- 완료 후 실패 목록을 결과 모달에 표시

```
┌─────────────────────────────────────┐
│  다운로드 완료                       │
│                                     │
│  ✓ 성공: 13명 (총 847건)            │
│  ✗ 실패: 2명                        │
│    - [고객D]: 서버 오류              │
│    - [고객E]: 파일 없음 (2건 누락)   │
│                                     │
│            [확인]                    │
└─────────────────────────────────────┘
```

### 2.6 엣지 케이스

| 케이스 | 처리 |
|--------|------|
| 문서 0건 고객 | 다운로드 대상에서 제외, "다운로드할 문서가 없습니다" 안내 |
| 동명이인 고객 | ZIP 내 폴더명에 고객ID 접미사 추가: `[고객A]_a1b2c3/` |
| 휴면(inactive) 고객 | 전체 다운로드 시 활성(active) 고객만 대상. 개별 선택 시 휴면 고객도 가능 |
| PDF 변환 미완료 문서 | 변환 완료 파일이 있으면 사용, 없으면 원본 파일 다운로드 |
| 관계자(가족) 문서 | `includeRelated=true` 시 `[고객A]/관계자/[관계자명]/카테고리/...` 구조 |
| 중복 다운로드 클릭 | `isDownloading` 플래그로 중복 실행 차단 |
| 다운로드 중 페이지 이탈 | `beforeunload` 경고 표시 |

---

## 3. 기능 상세

### 3.1 기능 1 — 고객별 문서함 다운로드

**트리거:** 고객 목록의 각 행 우측 `···` 컨텍스트 메뉴에 "문서함 다운로드" 항목 추가

> **참고:** 현재 고객 행에 `···` 메뉴가 없으므로 **신규 추가**한다.
> `ContextMenu` + `useContextMenu` 컴포넌트를 활용한다.

**동작 흐름:**
1. 사용자가 고객 행의 `···` 메뉴 클릭
2. "문서함 다운로드" 메뉴 항목 선택
3. 다운로드 옵션 모달 표시:
   - 파일명 모드: 별칭(기본) / 원본
   - 관계자 문서 포함 여부
4. 진행상황 모달 표시
5. 완료 후 결과 표시

**ZIP 파일명:** `[고객명].zip`

### 3.2 기능 2 — 전체 문서함 다운로드

**트리거:** 고객별 문서함 페이지 상단에 "다운로드" 버튼 배치

**선택 모드:**

| 모드 | 설명 |
|------|------|
| 전체 다운로드 | 모든 활성 고객의 문서함을 다운로드 |
| 선택 다운로드 | 체크박스로 고객을 선택하여 다운로드 |

**동작 흐름:**
1. "다운로드" 버튼 클릭 → 다운로드 설정 모달 표시
2. 설정 모달:
   - 대상 선택: 전체 / 선택한 고객
   - 체크박스 고객 선택 UI (선택 모드 시)
   - 파일명 모드: 별칭(기본) / 원본
   - 관계자 문서 포함 여부
3. "다운로드 시작" 클릭
4. **통합 ZIP으로 처리:**
   - 백엔드에서 선택된 고객들의 문서를 하나의 ZIP으로 스트리밍 생성
   - 내부에 고객별 폴더 구조 유지
5. 진행상황 모달: 고객 단위 진행률 표시
6. 완료 후 결과 표시

**ZIP 파일명:** `AIMS_문서함_YYYYMMDD.zip`

---

## 4. 기술 설계

### 4.1 아키텍처 개요

```
┌─────────────────┐     ┌─────────────────┐     ┌──────────────┐
│   프론트엔드      │────▶│    백엔드 API     │────▶│   MongoDB    │
│                 │     │                 │     │   + 파일저장소  │
│ - 다운로드 옵션   │     │ - ZIP 생성       │     │              │
│ - 진행상황 모달   │◀────│ - 스트리밍 응답   │◀────│              │
│ - AbortController│    │ - archiver      │     │              │
└─────────────────┘     └─────────────────┘     └──────────────┘
```

### 4.2 백엔드 API

#### 4.2.1 단일 고객 문서 ZIP 다운로드

```
GET /api/customers/:customerId/documents/download
```

**미들웨어:** `authenticateJWT` (인증 필수)

**쿼리 파라미터:**

| 파라미터 | 타입 | 기본값 | 설명 |
|----------|------|--------|------|
| `filenameMode` | `alias` \| `original` | `alias` | 파일명 모드 |
| `includeRelated` | `boolean` | `false` | 관계자 문서 포함 여부 |

**응답:** `application/zip` 스트리밍

**Content-Disposition 헤더 (RFC 6266 준수):**
```
Content-Disposition: attachment; filename*=UTF-8''%EC%98%88%EC%8B%9C.zip
```
- 한글 파일명은 반드시 `filename*=UTF-8''` + `encodeURIComponent()` 형태 사용
- Node.js `content-disposition` 패키지 또는 직접 인코딩

**인가 검증 (필수):**
```javascript
// 반드시 ownerId 복합 조건으로 조회 — 타인 고객 문서 접근 차단
const customer = await db.collection('customers').findOne({
  _id: new ObjectId(customerId),
  ownerId: userId  // ← 필수: 요청자 소유 고객인지 확인
})
if (!customer) return res.status(403).json({ error: 'Forbidden' })
```

**경로 탈출 방지 (필수):**
```javascript
const path = require('path')
const BASE_DIR = '/data/uploads'

function validateFilePath(filePath) {
  const resolved = path.resolve(BASE_DIR, filePath)
  if (!resolved.startsWith(path.resolve(BASE_DIR) + path.sep)) {
    throw new Error('경로 탈출 시도 감지')
  }
  return resolved
}
```

**파일 누락 처리:**
```javascript
// ZIP 생성 중 파일이 없으면 건너뛰기 (ZIP 전체 실패 방지)
if (!fs.existsSync(resolvedPath)) {
  skippedFiles.push({ name: doc.displayName, reason: '파일 없음' })
  continue  // 다음 문서로
}
```

**구현 상세:**
- `archiver` npm 패키지 사용 (스트리밍 ZIP 생성, 메모리 버퍼링 없음)
- 문서 파일은 서버 로컬 `/data/uploads/` 경로에서 `fs.createReadStream()`으로 읽기
- 빈 카테고리/서브타입 폴더는 생성하지 않음
- `archiver`의 `pipe(res)` 방식으로 직접 스트리밍 (메모리 효율적)

#### 4.2.2 다중 고객 통합 ZIP 다운로드

```
POST /api/documents/download/bulk
```

**미들웨어:** `authenticateJWT`

**요청 Body:**
```json
{
  "customerIds": ["id1", "id2", "id3"],
  "filenameMode": "alias",
  "includeRelated": false
}
```
- `customerIds`가 빈 배열이면 해당 설계사의 전체 활성 고객 대상
- 모든 `customerId`에 대해 `ownerId` 검증 수행

**응답:** `application/zip` 스트리밍

**ZIP 파일명:** `AIMS_문서함_YYYYMMDD.zip`

#### 4.2.3 다운로드 사전 정보 조회

```
GET /api/customers/:customerId/documents/download/info
```

**미들웨어:** `authenticateJWT`

**용도:** 다운로드 옵션 모달에서 건수/용량 미리 표시

**응답:**
```json
{
  "customerId": "...",
  "customerName": "[고객A]",
  "totalDocuments": 52,
  "totalSize": 156789012,
  "categories": [
    { "name": "보험계약", "count": 5 },
    { "name": "보험금청구", "count": 23 }
  ]
}
```

> `totalSize`는 문서 스키마의 `fileSize` 필드 합산. 필드 없는 문서는 제외.

### 4.3 프론트엔드 컴포넌트

#### 4.3.1 신규 컴포넌트

| 컴포넌트 | 경로 | 역할 |
|----------|------|------|
| `DocumentDownloadModal` | `features/customer/components/DocumentDownloadModal/` | 다운로드 옵션 설정 + 진행상황 + 결과 표시 통합 모달 |

**모달 상태 흐름:**
```
[설정] → [진행 중] → [완료/실패]
```

- **설정 단계:** 파일명 모드, 대상 고객 선택, 관계자 포함 여부
- **진행 단계:** 프로그레스 바 + 고객 단위 진행 + 완료/실패 카운트
- **완료 단계:** 성공/실패 요약 + 실패 목록

**단계 전환 시 포커스 관리:**
- 진행 단계 진입 시 → "취소" 버튼에 포커스
- 완료 단계 진입 시 → "확인" 버튼에 포커스
- `aria-live="polite"` 영역에 상태 변화 텍스트 업데이트 (스크린리더 대응)

#### 4.3.2 신규 훅

| 훅 | 경로 | 역할 |
|----|------|------|
| `useDocumentDownload` | `features/customer/hooks/useDocumentDownload.ts` | 다운로드 로직 (API 호출, 진행상황 관리, 취소) |

**인터페이스:**
```typescript
interface DownloadOptions {
  filenameMode: 'alias' | 'original'
  includeRelated: boolean
}

interface DownloadProgress {
  phase: 'preparing' | 'downloading' | 'completed' | 'cancelled' | 'error'
  currentCustomer: string
  currentCustomerIndex: number
  totalCustomers: number
  percentage: number
  successCount: number
  failCount: number
  errors: DownloadError[]
}

interface DownloadError {
  customerName: string
  fileName?: string
  reason: string
}

function useDocumentDownload(): {
  downloadSingle: (customerId: string, options: DownloadOptions) => Promise<void>
  downloadBulk: (customerIds: string[], options: DownloadOptions) => Promise<void>
  cancelDownload: () => void
  progress: DownloadProgress
  isDownloading: boolean
}
```

**취소 구현:**
```typescript
const abortControllerRef = useRef<AbortController | null>(null)

function cancelDownload() {
  abortControllerRef.current?.abort()
  setProgress(prev => ({ ...prev, phase: 'cancelled' }))
}

// fetch 호출 시
const response = await fetch(url, { signal: abortControllerRef.current.signal })
```

#### 4.3.3 기존 컴포넌트 수정

| 컴포넌트 | 수정 내용 |
|----------|-----------|
| `CustomerDocumentExplorerView` | 고객 행에 `···` 메뉴 **신규 추가** (ContextMenu + useContextMenu) |
| `CustomerDocumentExplorerView` | `···` 메뉴에 "문서함 다운로드" 항목 포함 |
| `CustomerDocumentExplorerView` | 페이지 상단에 "다운로드" 버튼 추가 |
| `CustomerDocumentExplorerView` | 체크박스 선택 모드 UI 추가 (전체 다운로드 시) |

**체크박스 선택 상태 관리:**
- `useState<Set<string>>` (로컬 상태) — Zustand store 불필요 (이 뷰 내에서만 사용)
- 현재 필터/초성 기준으로 로드된 고객 목록 대상으로 "전체 선택/해제"

### 4.4 폴더명/파일명 충돌 처리

```typescript
function resolveFilenameConflict(existingNames: Set<string>, name: string): string {
  if (!existingNames.has(name)) return name

  const ext = path.extname(name)       // '.pdf'
  const base = path.basename(name, ext) // '진단서'
  let counter = 2
  while (existingNames.has(`${base} (${counter})${ext}`)) {
    counter++
  }
  return `${base} (${counter})${ext}`   // '진단서 (2).pdf'
}
```

### 4.5 폴더명 안전 처리

파일 시스템에서 사용 불가한 문자를 치환한다. **폴더명에만 적용 (파일명에는 미적용).**

```typescript
function sanitizeFolderName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '_')   // Windows 금지 문자
    .replace(/\.{2,}/g, '_')         // 연속 마침표 (경로 탈출 방지)
    .replace(/[.\s]+$/, '')          // 끝의 마침표/공백 제거 (Windows 금지)
    .trim()
}
```

> **주의:** 단일 마침표는 치환하지 않음 (날짜 형식 `2024.11` 보존).
> 파일명의 확장자 마침표가 치환되지 않도록 폴더명에만 적용한다.

---

## 5. 데이터 흐름

### 5.1 단일 고객 ZIP 다운로드 시퀀스

```
사용자                 프론트엔드              백엔드                파일저장소
  │                      │                     │                     │
  │── ··· 메뉴 클릭 ────▶│                     │                     │
  │                      │                     │                     │
  │◀── 옵션 모달 표시 ───│                     │                     │
  │                      │                     │                     │
  │── "다운로드" 클릭 ──▶│                     │                     │
  │                      │── GET /info ───────▶│  (사전 조회)         │
  │                      │◀── 건수/용량 ───────│                     │
  │                      │                     │                     │
  │                      │── GET /download ───▶│                     │
  │                      │                     │── ownerId 검증 ────▶│
  │                      │                     │── 문서 목록 조회 ──▶│
  │                      │                     │◀── 문서 데이터 ─────│
  │                      │                     │                     │
  │                      │                     │── 경로 검증 ────────│
  │                      │                     │── fs.createReadStream│
  │                      │◀── ZIP 스트리밍 ────│◀── 파일 데이터 ─────│
  │                      │                     │                     │
  │◀── 진행상황 업데이트 ─│                     │                     │
  │                      │                     │                     │
  │◀── Blob → 다운로드 ──│                     │                     │
  │◀── 결과 모달 표시 ───│                     │                     │
```

### 5.2 다중 고객 통합 ZIP 다운로드 시퀀스

```
사용자                 프론트엔드              백엔드                파일저장소
  │                      │                     │                     │
  │── "다운로드" 클릭 ──▶│                     │                     │
  │── 고객 선택/전체 ───▶│                     │                     │
  │                      │                     │                     │
  │                      │── POST /bulk ──────▶│                     │
  │                      │   {customerIds}      │── 각 고객 ownerId 검증│
  │                      │                     │── 고객별 문서 조회 ─▶│
  │                      │                     │                     │
  │                      │                     │  for each 고객:      │
  │                      │                     │    경로 검증          │
  │                      │                     │    archiver.append() │
  │                      │                     │                     │
  │                      │◀── 통합 ZIP 스트리밍 │◀── 파일 데이터 ─────│
  │                      │                     │                     │
  │◀── 고객 단위 진행률 ──│                     │                     │
  │                      │                     │                     │
  │◀── Blob → 다운로드 ──│  (단일 파일)         │                     │
  │◀── 결과 모달 표시 ───│                     │                     │
```

---

## 6. UI 배치

### 6.1 고객별 다운로드 — 컨텍스트 메뉴 (신규)

고객 행 우측에 `···` 버튼 **신규 추가** + ContextMenu:

```
┌────────────────────┐
│ 📥 문서함 다운로드   │
│────────────────────│
│ (향후 확장 메뉴)     │
└────────────────────┘
```

### 6.2 전체 다운로드 — 버튼 배치

고객별 문서함 헤더 영역(요약 바 근처)에 다운로드 버튼 배치:

```
┌─────────────────────────────────────────────────────────┐
│ 고객별 문서함                                    ← 목록 │
│                                                         │
│ [통합 검색] [문서 내용] [AI 질문] [검색...]               │
│                                                         │
│ [ㄱ][ㄴ][ㄷ]...        ⬇ 고객별 415 · 문서 1154   [📥 다운로드] │
│                                                         │
│ 파일명  별칭  형식  크기  고객명  유형  날짜  배지          │
│─────────────────────────────────────────────────────────│
│ ☐ 👤 [고객A] · 6건                              ···     │
│ ☐ 👤 [고객B] · 1건                              ···     │
│ ...                                                     │
└─────────────────────────────────────────────────────────┘
```

- "다운로드" 버튼 클릭 → 설정 모달에서 전체/선택 모드 선택
- 선택 모드 시 체크박스 활성화

---

## 7. 의존성

### 7.1 백엔드

| 패키지 | 용도 | 비고 |
|--------|------|------|
| `archiver` | ZIP 스트리밍 생성 | 신규 설치 필요 |
| `content-disposition` | RFC 6266 한글 파일명 인코딩 | 신규 설치 필요 (또는 직접 `encodeURIComponent`) |

### 7.2 프론트엔드

| 기존 인프라 | 활용 |
|-------------|------|
| `Modal` 컴포넌트 | 옵션/진행/결과 모달 |
| `ContextMenu` + `useContextMenu` | 고객 행 메뉴 (신규 추가) |
| `DownloadHelper` | 개별 파일 다운로드 참고 |
| `SFSymbol` | 아이콘 |
| `Tooltip` | 버튼 툴팁 |

---

## 8. 보안 고려사항

| 항목 | 구현 방법 |
|------|-----------|
| **인증** | 모든 다운로드 API에 `authenticateJWT` 미들웨어 적용 |
| **인가** | `ownerId === userId` 복합 조건으로 조회. 타인 고객 문서 접근 시 403 반환 |
| **경로 탈출 방지** | `path.resolve()` + `BASE_DIR` 경계 검사. `../` 포함 경로 차단 |
| **심볼릭 링크** | `fs.realpathSync()` 후 `BASE_DIR` 경계 재확인 |
| **ZIP 파일명 인젝션** | `sanitizeFolderName()` 적용. ZIP 엔트리명에 `../` 금지 |
| **파일명 인코딩** | RFC 6266 `filename*=UTF-8''` 형태 사용 |

---

## 9. 성능/안정성

| 항목 | 대응 |
|------|------|
| **서버 메모리** | `archiver` 스트리밍 모드 사용 (파일을 메모리에 버퍼링하지 않음) |
| **Nginx 타임아웃** | `proxy_read_timeout` 조정 필요 시 설정 (대용량 고객) |
| **Express 타임아웃** | 스트리밍 응답 중에는 타임아웃 비활성화 (`req.setTimeout(0)`) |
| **동시 다운로드 제한** | 설계사당 동시 다운로드 1건으로 제한 (프론트엔드 `isDownloading` 플래그) |
| **좀비 스트림 정리** | 클라이언트 연결 끊김(`req.on('close')`) 시 `archiver.abort()` 호출 |

---

## 10. 향후 확장 가능성 (Phase 2+)

- File System Access API 지원 (폴더 직접 저장)
- 선택한 카테고리/서브타입만 다운로드
- 날짜 범위 필터링
- 정기 자동 백업 (스케줄)
- 다운로드 이력 관리
- SSE 기반 실시간 진행률 표시

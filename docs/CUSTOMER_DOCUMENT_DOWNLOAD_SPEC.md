# 고객별 문서함 다운로드 기능 설계서

> **작성일**: 2026-03-22
> **상태**: 검토 대기
> **관련 뷰**: CustomerDocumentExplorerView

---

## 1. 개요

고객별 문서함에서 문서를 폴더 계층 구조를 보존하여 다운로드하는 기능을 추가한다.

### 1.1 기능 목록

| # | 기능 | 트리거 | 대상 |
|---|------|--------|------|
| 1 | 고객별 문서함 다운로드 | 고객 행 `···` 컨텍스트 메뉴 | 단일 고객 |
| 2 | 전체 문서함 다운로드 | 페이지 상단 버튼 | 다중 선택 / 전체 고객 |

---

## 2. 요구사항

### 2.1 폴더 구조

다운로드 시 고객별 문서함의 카테고리/서브타입 계층을 그대로 보존한다.

```
곽승철/
├── 보험계약/
│   ├── 보험증권/
│   │   └── 곽승철_무배당뉴하이카운전자상해보험_2022.11.pdf
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

### 2.2 파일명 규칙

| 모드 | 설명 | 기본값 |
|------|------|--------|
| 별칭(displayName) | AI가 생성한 별칭 또는 사용자 지정 이름 | **기본** |
| 원본(originalName) | 업로드 시 원본 파일명 | 옵션 |

- `displayName`이 없는 문서는 `originalName` 사용 (자동 폴백)
- 같은 폴더 내 파일명 충돌 시 `파일명 (2).pdf` 형태로 자동 넘버링

### 2.3 다운로드 방식

| 브라우저 지원 | 방식 | 설명 |
|---------------|------|------|
| File System Access API 지원 (Chrome/Edge) | 폴더 직접 저장 | `showDirectoryPicker()` → 계층 폴더 직접 생성 |
| 미지원 (Firefox/Safari 등) | ZIP 다운로드 | 백엔드에서 ZIP 생성 → 브라우저 다운로드 |

### 2.4 진행상황 모달

다운로드 진행 중 모달을 표시하여 사용자에게 상태를 안내한다.

```
┌─────────────────────────────────────┐
│  문서함 다운로드                     │
│                                     │
│  곽승철 (3/15 고객)                  │
│  ████████████░░░░░░░░  45%          │
│                                     │
│  진료비영수증_2024.pdf 다운로드 중... │
│                                     │
│  완료: 2 / 실패: 0 / 남은: 12       │
│                                     │
│              [취소]                  │
└─────────────────────────────────────┘
```

**표시 항목:**
- 현재 처리 중인 고객명 + 순번 (다중 고객 시)
- 전체 진행률 (%) + 프로그레스 바
- 현재 다운로드 중인 파일명
- 완료/실패/남은 건수
- 취소 버튼

### 2.5 오류 처리

- 개별 파일 다운로드 실패 → 건너뛰고 계속 진행
- 고객 단위 ZIP 생성 실패 → 해당 고객 건너뛰고 계속 진행
- 완료 후 실패 목록을 결과 모달에 표시

```
┌─────────────────────────────────────┐
│  다운로드 완료                       │
│                                     │
│  ✓ 성공: 13명 (총 847건)            │
│  ✗ 실패: 2명                        │
│    - 김규선: 서버 오류               │
│    - 권영민: 파일 없음 (2건)         │
│                                     │
│            [확인]                    │
└─────────────────────────────────────┘
```

---

## 3. 기능 상세

### 3.1 기능 1 — 고객별 문서함 다운로드

**트리거:** 고객 목록의 각 행 우측 `···` 컨텍스트 메뉴에 "문서함 다운로드" 항목 추가

**동작 흐름:**
1. 사용자가 고객 행의 `···` 메뉴 클릭
2. "문서함 다운로드" 메뉴 항목 선택
3. 다운로드 옵션 모달 표시:
   - 파일명 모드: 별칭(기본) / 원본
   - 다운로드 방식: 폴더 저장(지원 시) / ZIP 다운로드
4. 진행상황 모달 표시
5. 완료 후 결과 표시

**ZIP 파일명:** `{고객명}.zip` (예: `곽승철.zip`)

### 3.2 기능 2 — 전체 문서함 다운로드

**트리거:** 고객별 문서함 페이지 상단에 "다운로드" 버튼 배치

**선택 모드:**

| 모드 | 설명 |
|------|------|
| 전체 다운로드 | 모든 고객의 문서함을 다운로드 |
| 선택 다운로드 | 체크박스로 고객을 선택하여 다운로드 |

**동작 흐름:**
1. "다운로드" 버튼 클릭 → 다운로드 설정 모달 표시
2. 설정 모달:
   - 대상 선택: 전체 / 선택한 고객
   - 체크박스 고객 선택 UI (선택 모드 시)
   - 파일명 모드: 별칭(기본) / 원본
   - 다운로드 방식: 폴더 저장(지원 시) / ZIP 다운로드
3. "다운로드 시작" 클릭
4. **고객 단위 순차 처리:**
   - 고객별로 ZIP 생성 요청 → 다운로드 → 다음 고객
   - 하나의 거대 ZIP을 만들지 않음 (서버 부하 분산)
5. 진행상황 모달: 고객 단위 진행률 표시
6. 완료 후 결과 표시

**ZIP 파일명:** 고객별 `{고객명}.zip`

---

## 4. 기술 설계

### 4.1 아키텍처 개요

```
┌─────────────────┐     ┌─────────────────┐     ┌──────────────┐
│   프론트엔드      │────▶│    백엔드 API     │────▶│   MongoDB    │
│                 │     │                 │     │   + 파일저장소  │
│ - 다운로드 옵션   │     │ - ZIP 생성       │     │              │
│ - 진행상황 모달   │◀────│ - 스트리밍 응답   │◀────│              │
│ - 폴더 저장/ZIP  │     │                 │     │              │
└─────────────────┘     └─────────────────┘     └──────────────┘
```

### 4.2 백엔드 API

#### 4.2.1 단일 고객 문서 ZIP 다운로드

```
GET /api/customers/:customerId/documents/download
```

**쿼리 파라미터:**

| 파라미터 | 타입 | 기본값 | 설명 |
|----------|------|--------|------|
| `filenameMode` | `alias` \| `original` | `alias` | 파일명 모드 |
| `includeRelated` | `boolean` | `false` | 관계자 문서 포함 여부 |

**응답:** `application/zip` 스트리밍

**ZIP 내부 구조:**
```
곽승철/
├── 보험계약/
│   ├── 보험증권/
│   │   └── 파일.pdf
│   └── ...
└── ...
```

**구현 상세:**
- `archiver` npm 패키지 사용 (스트리밍 ZIP 생성)
- 문서 파일은 서버 로컬 `/data/uploads/` 경로에서 직접 읽기
- 빈 카테고리/서브타입 폴더는 생성하지 않음
- Content-Disposition 헤더: `attachment; filename="곽승철.zip"`

#### 4.2.2 다운로드 가능 여부 확인 (선택적)

```
GET /api/customers/:customerId/documents/download/info
```

**응답:**
```json
{
  "customerId": "...",
  "customerName": "곽승철",
  "totalDocuments": 52,
  "totalSize": 156789012,
  "categories": [
    { "name": "보험계약", "count": 5 },
    { "name": "보험금청구", "count": 23 }
  ]
}
```

### 4.3 프론트엔드 컴포넌트

#### 4.3.1 신규 컴포넌트

| 컴포넌트 | 경로 | 역할 |
|----------|------|------|
| `DocumentDownloadModal` | `features/customer/components/DocumentDownloadModal/` | 다운로드 옵션 설정 + 진행상황 + 결과 표시 통합 모달 |

**모달 상태 흐름:**
```
[설정] → [진행 중] → [완료/실패]
```

- **설정 단계:** 파일명 모드, 다운로드 방식, 대상 고객 선택
- **진행 단계:** 프로그레스 바 + 현재 파일명 + 완료/실패 카운트
- **완료 단계:** 성공/실패 요약 + 실패 목록

#### 4.3.2 신규 훅

| 훅 | 경로 | 역할 |
|----|------|------|
| `useDocumentDownload` | `features/customer/hooks/useDocumentDownload.ts` | 다운로드 로직 (API 호출, 진행상황 관리, File System Access API) |

**인터페이스:**
```typescript
interface DownloadOptions {
  filenameMode: 'alias' | 'original'
  downloadMethod: 'folder' | 'zip'  // File System Access vs ZIP
  includeRelated: boolean
}

interface DownloadProgress {
  phase: 'preparing' | 'downloading' | 'completed' | 'error'
  currentCustomer: string
  currentCustomerIndex: number
  totalCustomers: number
  currentFile: string
  completedFiles: number
  totalFiles: number
  percentage: number
  errors: DownloadError[]
}

interface DownloadError {
  customerName: string
  fileName?: string
  reason: string
}

function useDocumentDownload(): {
  startDownload: (customerIds: string[], options: DownloadOptions) => Promise<void>
  cancelDownload: () => void
  progress: DownloadProgress
  isDownloading: boolean
}
```

#### 4.3.3 기존 컴포넌트 수정

| 컴포넌트 | 수정 내용 |
|----------|-----------|
| `CustomerDocumentExplorerView` | 고객 행 `···` 메뉴에 "문서함 다운로드" 항목 추가 |
| `CustomerDocumentExplorerView` | 페이지 상단에 "다운로드" 버튼 추가 |
| `CustomerDocumentExplorerView` | 체크박스 선택 모드 UI 추가 (전체 다운로드 시) |

### 4.4 File System Access API 분기

```typescript
async function downloadToFolder(customerData, options) {
  if ('showDirectoryPicker' in window) {
    // Chrome/Edge: 폴더 직접 저장
    const dirHandle = await window.showDirectoryPicker()
    // 계층 폴더 생성 + 파일 쓰기
  } else {
    // Firefox/Safari: ZIP 다운로드 폴백
    await downloadAsZip(customerData, options)
  }
}
```

**폴더 직접 저장 시:**
- 프론트엔드에서 개별 문서를 `fetch` → `FileSystemWritableFileStream`으로 기록
- 진행률은 파일 단위로 업데이트

**ZIP 다운로드 시:**
- 백엔드 API 호출 → 스트리밍 ZIP 수신 → Blob → 다운로드
- 진행률은 수신 바이트 기준 또는 고객 단위

### 4.5 폴더명/파일명 충돌 처리

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

### 4.6 폴더명 안전 처리

파일 시스템에서 사용 불가한 문자를 치환한다.

```typescript
function sanitizeFolderName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '_')  // Windows 금지 문자
    .replace(/\./g, '·')            // 마침표 → 가운데점 (폴더명 안전)
    .trim()
}
```

**적용 대상:** 고객명, 카테고리명, 서브타입명

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
  │                      │── GET /download ───▶│                     │
  │                      │                     │── 문서 목록 조회 ──▶│
  │                      │                     │◀── 문서 데이터 ─────│
  │                      │                     │                     │
  │                      │                     │── 파일 읽기 ────────▶│
  │                      │◀── ZIP 스트리밍 ────│◀── 파일 데이터 ─────│
  │                      │                     │                     │
  │◀── 진행상황 업데이트 ─│                     │                     │
  │                      │                     │                     │
  │◀── 다운로드 완료 ────│                     │                     │
  │◀── 결과 모달 표시 ───│                     │                     │
```

### 5.2 다중 고객 다운로드 시퀀스

```
고객 목록: [강새봄, 곽승철, 김기태, ...]

for each 고객:
  1. 진행 모달 업데이트: "강새봄 (1/3 고객)"
  2. GET /api/customers/:id/documents/download → ZIP 스트리밍
  3. 브라우저 다운로드 트리거: 강새봄.zip
  4. 성공 → 다음 고객 / 실패 → 에러 기록, 다음 고객 진행

완료 후: 결과 모달 표시
```

---

## 6. UI 배치

### 6.1 고객별 다운로드 — 컨텍스트 메뉴

기존 고객 행의 `···` 메뉴에 항목 추가:

```
┌──────────────────┐
│ 📥 문서함 다운로드 │  ← 신규
│─────────────────-│
│ (기존 메뉴 항목들) │
└──────────────────┘
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
│ ☐ 👤 강새봄 · 6건                              ···      │
│ ☐ 👤 강세황 · 1건                              ···      │
│ ...                                                     │
└─────────────────────────────────────────────────────────┘
```

- 체크박스: "다운로드" 버튼 클릭 시 체크박스 선택 모드 진입
- 또는 바로 전체/선택 옵션이 있는 설정 모달 표시

---

## 7. 의존성

### 7.1 백엔드

| 패키지 | 용도 | 비고 |
|--------|------|------|
| `archiver` | ZIP 스트리밍 생성 | 이미 사용 중인지 확인 필요 |

### 7.2 프론트엔드

| 기존 인프라 | 활용 |
|-------------|------|
| `Modal` 컴포넌트 | 옵션/진행/결과 모달 |
| `ContextMenu` + `useContextMenu` | 고객 행 메뉴 |
| `DownloadHelper` | 개별 파일 다운로드 참고 |
| `SFSymbol` | 아이콘 |
| `Tooltip` | 버튼 툴팁 |

---

## 8. 보안 고려사항

- 다운로드 API는 인증된 사용자(설계사)만 접근 가능
- 다운로드 대상은 해당 설계사 소속 고객의 문서로 제한
- ZIP 파일명에 경로 탐색 문자(`../`) 포함 방지
- 서버 측 파일 경로 검증 (심볼릭 링크 추적 방지)

---

## 9. 향후 확장 가능성

- 선택한 카테고리/서브타입만 다운로드
- 날짜 범위 필터링
- 정기 자동 백업 (스케줄)
- 다운로드 이력 관리

# 고객 문서 트리 탐색기 설계 계획서

> **작성일**: 2026-03-02 | **상태**: 설계 완료, 구현 대기

## Context

고객 상세 화면(CustomerFullDetailView)의 문서 탭에서 문서를 플랫 리스트로만 볼 수 있음. 문서 일괄등록(batch upload) 시 사용자가 구성한 폴더 트리 구조가 업로드 후 사라지는 문제. 또한 고객 문서를 폴더로 분류/관리하는 기능이 없음.

**목표**: 배치 업로드 시 폴더 구조를 보존하고, Windows 탐색기와 같은 트리 뷰 UI를 통해 고객 문서를 탐색하고 폴더를 관리(생성/이동/이름변경)할 수 있게 한다.

**핵심 UX**: 문서 섹션에서 "트리 보기" 클릭 → 문서 영역이 zoom-in 확대되면서 CenterPane 전체를 커버하는 둥근 사각형 트리 탐색기로 전환 → 돌아가기 시 zoom-out 축소되며 원래 화면 복원

---

## Step 1: 데이터 모델 — `folderPath` 필드 + `customer_doc_folders` 컬렉션

### 1-1. documents(`files`) 컬렉션에 `folderPath` 추가

각 문서에 고객 기준 상대 폴더 경로를 저장합니다.

```javascript
// files 컬렉션 문서 예시
{
  _id: ObjectId("..."),
  customerId: ObjectId("..."),
  ownerId: "user123",
  upload: {
    originalName: "진단서.pdf",
    sourcePath: "내문서/홍길동/청구서류",  // 기존: 업로드 시 원본 전체 경로
    // ...
  },
  folderPath: "/청구서류",  // ★ 신규: 고객 기준 상대 폴더 경로
  // ...
}
```

**folderPath 규칙**:
- 루트: `""` (빈 문자열) 또는 null
- 1단계: `"/보험"`
- 2단계: `"/보험/생명보험"`
- 항상 `/`로 시작, 끝에는 `/` 없음
- 기존 문서 (folderPath 없음): 루트로 취급

### 1-2. `customer_doc_folders` 컬렉션 (빈 폴더 지원)

문서가 없는 빈 폴더를 유지하기 위한 경량 컬렉션.

```javascript
{
  _id: ObjectId("..."),
  customerId: ObjectId("..."),
  ownerId: String,
  path: "/보험/생명보험",       // 폴더 전체 경로 (유니크: customerId + ownerId + path)
  name: "생명보험",             // 표시 이름 (path의 마지막 세그먼트)
  createdAt: ISODate("..."),
  updatedAt: ISODate("...")
}
```

**인덱스**: `{ customerId: 1, ownerId: 1, path: 1 }` (unique)

---

## Step 2: 백엔드 API

### 2-1. 기존 엔드포인트 수정

**`GET /api/customers/:id/documents`** — `folderPath` 반환 추가

파일: `backend/api/aims_api/routes/customers-routes.js` (line ~2400)

```javascript
return {
  _id: doc._id,
  originalName: doc.upload?.originalName || 'Unknown File',
  // ... 기존 필드들 ...
  folderPath: doc.folderPath || null,    // ★ 추가
  sourcePath: doc.upload?.sourcePath || null,  // ★ 추가 (참조용)
  ...statusInfo
};
```

### 2-2. 신규 폴더 관리 API

**`GET /api/customers/:id/folders`** — 고객의 모든 폴더 조회

```javascript
// 응답
{
  success: true,
  data: {
    folders: [
      { _id: "...", path: "/보험", name: "보험", fileCount: 5 },
      { _id: "...", path: "/보험/생명보험", name: "생명보험", fileCount: 3 },
      { _id: "...", path: "/청구서류", name: "청구서류", fileCount: 2 }
    ]
  }
}
```
- `customer_doc_folders` + documents의 `folderPath`에서 유니크 경로 수집
- 각 폴더의 `fileCount`는 documents에서 집계

**`POST /api/customers/:id/folders`** — 폴더 생성

```javascript
// 요청
{ path: "/보험/새폴더" }
// 응답
{ success: true, data: { folder: { _id: "...", path: "/보험/새폴더", name: "새폴더" } } }
```

**`PATCH /api/customers/:id/folders/rename`** — 폴더 이름 변경

```javascript
// 요청
{ oldPath: "/보험/생명보험", newPath: "/보험/생명보험_변경" }
```
- `customer_doc_folders`에서 해당 폴더 path 업데이트
- `files` 컬렉션에서 `folderPath`가 `oldPath`로 시작하는 모든 문서 일괄 업데이트
- `$regex: "^/보험/생명보험"` → 접두사 치환

**`PATCH /api/customers/:id/documents/:docId/move`** — 문서 폴더 이동

```javascript
// 요청
{ folderPath: "/청구서류" }  // null이면 루트로 이동
```

**`DELETE /api/customers/:id/folders`** — 폴더 삭제

```javascript
// 요청
{ path: "/보험/생명보험" }
```
- 포함된 문서들의 `folderPath`를 상위 폴더로 변경 (문서는 삭제하지 않음)
- `customer_doc_folders`에서 해당 경로 삭제

---

## Step 3: 배치 업로드 시 `folderPath` 저장

### 3-1. 프론트엔드: `source_path` + `folder_path` 전송

파일: `frontend/aims-uix3/src/features/batch-upload/api/batchUploadApi.ts` (line ~198)

```typescript
// uploadFile() 메서드의 FormData에 추가
const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath
if (relativePath) {
  const pathParts = relativePath.split('/')
  if (pathParts.length > 1) {
    // 전체 경로 (기존 source_path)
    const fullFolderPath = pathParts.slice(0, -1).join('/')
    formData.append('source_path', fullFolderPath)

    // 고객 폴더 이후의 상대 경로 (folderPath)
    // customerMatcher가 결정한 customerFolderName 기준으로 strip
    // 예: "내문서/홍길동/보험/진단서.pdf" → customerFolderName="홍길동"
    //     → folderPath="/보험"
    if (customerFolderIndex !== undefined) {
      const subParts = pathParts.slice(customerFolderIndex + 1, -1)
      if (subParts.length > 0) {
        formData.append('folder_path', '/' + subParts.join('/'))
      }
    }
  }
}
```

**참고**: `uploadFile()` 시그니처에 `customerFolderName` 파라미터 추가 필요. `useBatchUpload` 훅에서 `FolderMapping.folderName`을 전달.

### 3-2. 백엔드: `folder_path` 저장

파일: `backend/api/document_pipeline/routers/doc_prep_main.py`

```python
# 기존 source_path 옆에 추가
folder_path: Optional[str] = Form(None),

# 문서 저장 시 folderPath 필드 추가
if folder_path:
    update_fields["folderPath"] = folder_path
```

### 3-3. 폴더 자동 생성

배치 업로드 완료 후, 업로드된 문서들의 `folderPath`에서 고유 폴더 경로를 추출하여 `customer_doc_folders`에 자동 upsert (빈 폴더 유지를 위해).

---

## Step 4: 프론트엔드 타입 및 서비스

### 4-1. `CustomerDocumentItem` 타입 확장

파일: `frontend/aims-uix3/src/services/DocumentService.ts` (line 78)

```typescript
export interface CustomerDocumentItem {
  // ... 기존 필드들 ...
  folderPath?: string;    // ★ 고객 기준 상대 폴더 경로
  sourcePath?: string;    // ★ 업로드 시 원본 전체 경로 (참조용)
}
```

### 4-2. 파싱 로직 추가

파일: `frontend/aims-uix3/src/services/DocumentService.ts` (line ~460)

```typescript
const folderPath = toString(item['folderPath']);
if (folderPath) result.folderPath = folderPath;
const sourcePath = toString(item['sourcePath']);
if (sourcePath) result.sourcePath = sourcePath;
```

### 4-3. 폴더 API 서비스

새 파일: `frontend/aims-uix3/src/services/customerFolderService.ts`

```typescript
export interface CustomerFolder {
  _id: string
  path: string
  name: string
  fileCount?: number
}

export const customerFolderService = {
  getFolders(customerId: string): Promise<CustomerFolder[]>,
  createFolder(customerId: string, path: string): Promise<CustomerFolder>,
  renameFolder(customerId: string, oldPath: string, newPath: string): Promise<void>,
  deleteFolder(customerId: string, path: string): Promise<void>,
  moveDocument(customerId: string, docId: string, folderPath: string | null): Promise<void>,
}
```

---

## Step 5: 폴더 트리 빌드 유틸리티

새 파일: `frontend/aims-uix3/src/features/customer/utils/buildFolderTree.ts`

```typescript
export interface FolderTreeNode {
  key: string              // 고유 키 (경로 기반)
  name: string             // 표시 이름
  type: 'folder' | 'file'
  children: FolderTreeNode[]
  document?: CustomerDocumentItem  // 파일인 경우
  fileCount?: number       // 폴더 내 총 파일 수
  path: string             // 전체 경로
  isExplicit?: boolean     // customer_doc_folders에 명시적으로 존재하는 폴더
}

export function buildFolderTree(
  documents: CustomerDocumentItem[],
  explicitFolders: CustomerFolder[]
): FolderTreeNode
```

**동작**:
1. `explicitFolders`에서 명시적 폴더 노드 생성
2. 각 문서의 `folderPath`에서 경로 분해 → 중간 폴더 노드 자동 생성
3. `folderPath`가 없는 문서 → 루트에 배치
4. 정렬: 폴더 우선 → 이름 가나다순
5. 각 폴더의 `fileCount` 재귀 계산

---

## Step 6: 트리 탐색기 컴포넌트 (UI)

### 6-1. 파일 구조

```
frontend/aims-uix3/src/features/customer/views/CustomerDocumentTreeView/
  CustomerDocumentTreeView.tsx          # 메인 컴포넌트
  CustomerDocumentTreeView.layout.css   # 3-column grid + zoom 애니메이션
  CustomerDocumentTreeView.tree.css     # 좌측 폴더 트리 스타일
  CustomerDocumentTreeView.list.css     # 우측 파일 리스트 + 컨텍스트 메뉴
```

### 6-2. 컴포넌트 Props

```typescript
interface CustomerDocumentTreeViewProps {
  visible: boolean
  customer: Customer
  onClose: () => void
}
```

### 6-3. 레이아웃 (CenterPaneView 래퍼)

- **CenterPaneView** 래퍼: `margin: 0` → CenterPane 전체 커버하는 둥근 사각형
- 헤더: `chevron.left` 돌아가기 버튼 + "📁 {고객명} 문서" 제목
- 콘텐츠: 3-column CSS Grid (`PersonalFilesView.layout.css` 패턴)

```
┌────────────────────────────────────────────────────┐
│  ◀  📁 곽승철 문서                                    │  ← glassmorphism 헤더
├────────┬─┬─────────────────────────────────────────┤
│ 📁전체문서│ │  전체 문서 > 보험 > 생명보험        🔍   │  ← 브레드크럼 + 검색
│  📁보험   │ │ ─────────────────────────────────────── │
│   📁생명  │ │  📁 장기보험         3개   2026.02.19   │  ← 파일/폴더 리스트
│   📁손해  │ │  📄 진단서.pdf  TXT  1.2MB  2026.02.19  │
│  📁청구   │ │  📄 영수증.jpg  OCR  340KB  2026.02.19  │
│           │ │                                         │
│           │ │                                         │
└────────┴─┴─────────────────────────────────────────┘
  사이드바  R         메인 영역
  (240px)  (4px)      (나머지)
```

### 6-4. 좌측 폴더 트리

- `PersonalFilesView`의 `.folder-tree`, `.folder-tree-row` CSS 재사용
- 재귀적 렌더링, 레벨별 `padding-left` 들여쓰기 (20px × depth)
- 활성 폴더: `var(--color-primary-alpha-20)` 배경 + 좌측 `3px solid var(--color-button-primary-bg)`
- 확장/축소 화살표 (`chevron.right` ↔ `chevron.down`)
- 폴더 아이콘: `folder.fill` (닫힘) / `folder.fill` with primary color (열림)
- 우클릭 컨텍스트 메뉴: 폴더 이름 변경, 새 하위 폴더, 폴더 삭제

### 6-5. 우측 파일 리스트

- 툴바: 상위 폴더 버튼 + 브레드크럼 + 새 폴더 버튼 + 검색
- 테이블 헤더: 이름 | 뱃지 | 크기 | 등록일 (DocumentsTab 컬럼 패턴)
- 폴더 행: 폴더 아이콘 + 이름 + 파일 수 뱃지 → 더블클릭으로 진입
- 파일 행: 파일 타입 아이콘 + 이름 + TXT/OCR/BIN 뱃지 + 크기 + 날짜
- 우클릭 컨텍스트 메뉴: 미리보기, 요약, 다운로드, 폴더 이동, 삭제
- 드래그 앤 드롭: 파일을 좌측 폴더 트리에 드롭하여 이동

### 6-6. 폴더 관리 기능

| 기능 | UI | API |
|------|-----|-----|
| 폴더 생성 | 툴바 "새 폴더" 버튼 or 우클릭 메뉴 | `POST /api/customers/:id/folders` |
| 폴더 이름 변경 | 폴더 우클릭 → "이름 변경" | `PATCH /api/customers/:id/folders/rename` |
| 폴더 삭제 | 폴더 우클릭 → "삭제" (문서는 상위로 이동) | `DELETE /api/customers/:id/folders` |
| 문서 이동 | 파일 드래그→폴더 드롭 or 우클릭→"이동" | `PATCH /api/customers/:id/documents/:docId/move` |

---

## Step 7: Zoom 확대/축소 트랜지션

### 7-1. 열기 (zoom-in)

문서 섹션 위치에서 확대되며 CenterPane 전체를 채우는 느낌.

```css
@keyframes treeViewZoomIn {
  from {
    opacity: 0;
    transform: scale(0.35);
    transform-origin: bottom left;  /* 문서 섹션이 좌하단에 위치 */
    border-radius: calc(var(--radius-lg) * 2);
  }
  40% {
    opacity: 1;
    border-radius: var(--radius-lg);
  }
  to {
    opacity: 1;
    transform: scale(1);
    transform-origin: bottom left;
    border-radius: var(--radius-lg);
  }
}

.customer-doc-tree-view--entering {
  animation: treeViewZoomIn 380ms cubic-bezier(0.32, 0.72, 0, 1);
}
```

### 7-2. 닫기 (zoom-out)

```css
@keyframes treeViewZoomOut {
  from {
    opacity: 1;
    transform: scale(1);
    transform-origin: bottom left;
  }
  to {
    opacity: 0;
    transform: scale(0.35);
    transform-origin: bottom left;
    border-radius: calc(var(--radius-lg) * 2);
  }
}

.customer-doc-tree-view--exiting {
  animation: treeViewZoomOut 280ms cubic-bezier(0.32, 0.72, 0, 1);
  pointer-events: none;
}
```

### 7-3. 구현 패턴

```typescript
const [animState, setAnimState] = useState<'entering' | 'visible' | 'exiting'>('entering')

const handleClose = useCallback(() => {
  setAnimState('exiting')
}, [])

const handleAnimationEnd = useCallback(() => {
  if (animState === 'entering') setAnimState('visible')
  if (animState === 'exiting') onClose()  // 애니메이션 완료 후 실제 unmount
}, [animState, onClose])
```

### 7-4. 접근성

```css
@media (prefers-reduced-motion: reduce) {
  .customer-doc-tree-view--entering,
  .customer-doc-tree-view--exiting {
    animation: none !important;
  }
}
```

---

## Step 8: CustomerFullDetailView 통합

파일: `frontend/aims-uix3/src/features/customer/views/CustomerFullDetailView/CustomerFullDetailView.tsx`

### 8-1. 트리 보기 버튼 추가

문서 섹션 헤더 (line ~1360, "문서 내용 검색" 버튼 옆)에 트리 보기 버튼 추가.

```tsx
<Tooltip content="폴더 트리 보기">
  <button
    type="button"
    className="customer-full-detail__tree-view-btn"
    onClick={() => setIsTreeViewOpen(true)}
    aria-label="폴더 트리 보기"
  >
    <SFSymbol name="folder.fill" size={SFSymbolSize.CAPTION_1} weight={SFSymbolWeight.MEDIUM} />
  </button>
</Tooltip>
```

### 8-2. 트리 뷰 렌더링

```tsx
{isTreeViewOpen && customer && (
  <CustomerDocumentTreeView
    visible={isTreeViewOpen}
    customer={customer}
    onClose={() => setIsTreeViewOpen(false)}
  />
)}
```

---

## 수정/생성 파일 요약

### 백엔드 수정 (3개 파일)

| 파일 | 변경 |
|------|------|
| `backend/api/aims_api/routes/customers-routes.js` | 문서 응답에 `folderPath`, `sourcePath` 추가 + 폴더 CRUD 5개 엔드포인트 |
| `backend/api/document_pipeline/routers/doc_prep_main.py` | `folder_path` 파라미터 추가 + 저장 로직 |
| (MongoDB) | `customer_doc_folders` 컬렉션 + 인덱스, `files.folderPath` 필드 |

### 프론트엔드 수정 (4개 파일)

| 파일 | 변경 |
|------|------|
| `frontend/.../batch-upload/api/batchUploadApi.ts` | `source_path` + `folder_path` FormData 전송 |
| `frontend/.../services/DocumentService.ts` | `CustomerDocumentItem`에 `folderPath`, `sourcePath` 추가 |
| `frontend/.../CustomerFullDetailView/CustomerFullDetailView.tsx` | 트리 보기 버튼 + 렌더링 |
| `frontend/.../CustomerFullDetailView/CustomerFullDetailView.tabs.css` | 버튼 스타일 |

### 프론트엔드 신규 (6개 파일)

| 파일 | 내용 |
|------|------|
| `frontend/.../services/customerFolderService.ts` | 폴더 CRUD API 서비스 |
| `frontend/.../customer/utils/buildFolderTree.ts` | FolderTreeNode 타입 + buildFolderTree() |
| `frontend/.../CustomerDocumentTreeView/CustomerDocumentTreeView.tsx` | 메인 트리 탐색기 컴포넌트 |
| `frontend/.../CustomerDocumentTreeView/CustomerDocumentTreeView.layout.css` | Grid + zoom 애니메이션 |
| `frontend/.../CustomerDocumentTreeView/CustomerDocumentTreeView.tree.css` | 폴더 트리 스타일 |
| `frontend/.../CustomerDocumentTreeView/CustomerDocumentTreeView.list.css` | 파일 리스트 + 컨텍스트 메뉴 |

---

## 재사용할 기존 코드

| 기존 파일 | 재사용 내용 |
|-----------|-------------|
| `components/CenterPaneView/CenterPaneView.tsx` | 래퍼 컴포넌트 (둥근 사각형, glassmorphism 헤더) |
| `components/DocumentViews/PersonalFilesView/PersonalFilesView.layout.css` | 3-column grid, 리사이저, 폴더 트리, 브레드크럼 CSS |
| `features/customer/controllers/useCustomerDocumentsController` | 고객 문서 데이터 로드 |
| `entities/document/DocumentUtils` | 파일 타입 아이콘, 뱃지 계산 |
| `components/SFSymbol/SFSymbol.tsx` | 아이콘 컴포넌트 |
| `shared/ui/SortIndicator` | 정렬 UI |
| `shared/ui/ContextMenu` | 우클릭 메뉴 |
| `shared/ui/Tooltip` | 툴팁 |

---

## 디자인 규칙 준수

- CSS 색상: `var(--color-*)` 변수만 사용
- 타이포: 섹션 `13px/600`, 데이터 `12px/400`, 헤더 `11px/600`, 뱃지 `10px/400`
- font-weight 500 금지
- 아이콘: 최대 17px, 배경 투명, 호버는 opacity+scale만
- CenterPaneView: `border-radius: var(--radius-lg)`, glassmorphism 헤더
- PersonalFilesView 패턴: 3-column grid, 리사이저, 폴더 트리, 브레드크럼

---

## 검증 방법

1. **백엔드 API**: `ssh rossi@100.110.215.65 'curl -s "http://localhost:3010/api/customers/{id}/documents" | python3 -m json.tool'`로 `folderPath` 필드 확인
2. **폴더 CRUD**: 폴더 생성 → 이름 변경 → 문서 이동 → 삭제 API 테스트
3. **배치 업로드**: 하위 폴더가 있는 폴더 일괄등록 → MongoDB에서 `folderPath` 확인
4. **트리 빌드**: `buildFolderTree` vitest 단위 테스트
5. **UI**: 고객 상세 → 트리 보기 클릭 → zoom-in → 폴더 탐색 → 돌아가기 → zoom-out
6. **빌드**: `cd frontend/aims-uix3 && npm run build`
7. **호환성**: `folderPath` 없는 기존 문서가 루트에 정상 표시되는지 확인

---

## 엣지 케이스

| 케이스 | 처리 |
|--------|------|
| `folderPath` 없는 기존 문서 | 루트("전체 문서")에 표시 |
| 단일 파일 업로드 | `webkitRelativePath` 비어있음 → `folderPath` null → 루트 |
| 빈 폴더 | `customer_doc_folders` 컬렉션에서 유지 |
| 깊은 중첩 (5단계+) | padding-left 들여쓰기로 무한 지원 |
| 한글/특수문자 경로 | FormData 자동 인코딩, MongoDB 저장 문제 없음 |
| 폴더 삭제 시 포함 문서 | 문서는 삭제하지 않고 상위 폴더로 이동 |
| 동일 이름 폴더 | 같은 레벨에서 동일 이름 방지 (path unique) |

---

## 구현 우선순위

1. **Phase 1 (데이터 기반)**: Step 1~4 — 모델 + API + 타입
2. **Phase 2 (읽기 UI)**: Step 5~6 (6-1~6-5) — 트리 빌드 + 읽기 전용 탐색기 + zoom
3. **Phase 3 (관리 기능)**: Step 6-6 — 폴더 CRUD + 드래그 앤 드롭
4. **Phase 4 (통합)**: Step 7~8 — CustomerFullDetailView 연동

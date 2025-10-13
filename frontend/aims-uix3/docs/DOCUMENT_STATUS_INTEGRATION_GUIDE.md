# 문서 처리 상태 표시 기능 통합 가이드

## 📋 개요

이 가이드는 다른 문서 관련 View 컴포넌트에 문서 처리 상태(completed, processing, error, pending) 표시 기능을 추가하는 방법을 설명합니다.

## 🎯 적용 대상

다음과 같은 컴포넌트에 적용 가능:
- 문서 목록을 표시하는 모든 View 컴포넌트
- 문서 검색 결과 View
- 고객별 문서 목록 View
- 태그별 문서 목록 View

## ⚠️ 핵심 전제조건

**반드시 `/api/documents/status` API를 사용해야 합니다!**

일반 `/api/documents` API는 기본 문서 정보만 반환하므로, 처리 상태 메타데이터(`processing_metadata`, `ocr_result`, `ai_analysis` 등)가 포함되지 않습니다.

## 🔧 구현 단계

### Step 1: Controller 수정 (데이터 소스 변경)

#### 1.1 Import 추가
```typescript
import { DocumentStatusService } from '@/services/DocumentStatusService';
```

#### 1.2 loadDocuments 함수 수정
기존 `/api/documents` 대신 `/api/documents/status` 사용:

```typescript
const loadDocuments = useCallback(async (params: Partial<DocumentSearchQuery>, silent = false) => {
  try {
    if (!silent) {
      setIsLoading(true);
    }
    setError(null);

    // DocumentStatusService를 사용하여 처리 상태 정보도 함께 가져오기
    const data = await DocumentStatusService.getRecentDocuments(1000);
    const realDocuments = data.files || data.data?.documents || data.documents || [];

    // 각 문서의 customer_relation 정보를 가져오기 위해 개별 문서 조회
    const documentsWithCustomerRelation = await Promise.all(
      realDocuments.map(async (doc: any) => {
        try {
          const detailedDoc = await DocumentStatusService.getDocumentStatus(doc._id || doc.id || '');
          return {
            ...doc,
            customer_relation: detailedDoc.data?.rawDocument?.customer_relation
          };
        } catch (error) {
          console.error(`Failed to fetch detailed info for document ${doc._id}:`, error);
          return doc;
        }
      })
    );

    // 검색 필터링
    let filteredDocs = documentsWithCustomerRelation;
    if (searchQuery.trim()) {
      const searchTermLower = searchQuery.toLowerCase();
      filteredDocs = documentsWithCustomerRelation.filter((doc: any) => {
        const filename = DocumentStatusService.extractFilename(doc).toLowerCase();
        return filename.includes(searchTermLower);
      });
    }

    // 페이지네이션 적용
    const limit = params.limit || 10;
    const offset = params.offset || 0;
    const paginatedDocs = filteredDocs.slice(offset, offset + limit);

    setDocuments(paginatedDocs);
    setTotal(filteredDocs.length);
    setHasMore(offset + limit < filteredDocs.length);
    setIsInitialLoad(false);
  } catch (err) {
    setError(handleApiError(err));
  } finally {
    if (!silent) {
      setIsLoading(false);
    }
  }
}, [searchQuery]);
```

**주요 포인트**:
- `DocumentStatusService.getRecentDocuments(1000)`: 처리 상태 정보 포함
- 개별 문서 조회로 `customer_relation` 정보 보강
- 클라이언트 사이드 검색 및 페이지네이션 적용

---

### Step 2: View Component 수정 (상태 표시 추가)

#### 2.1 Import 추가
```typescript
import { DocumentStatusService } from '../../../services/DocumentStatusService';
```

#### 2.2 상태 추출 로직 추가
문서 목록 렌더링 시 각 문서의 상태 정보 추출:

```typescript
documents.map((document) => {
  // 상태 정보 추출
  const status = DocumentStatusService.extractStatus(document as any)
  const statusLabel = DocumentStatusService.getStatusLabel(status)
  const statusIcon = DocumentStatusService.getStatusIcon(status)

  // 고객 연결 로직
  const isLinked = Boolean((document as any).customer_relation)
  const canLink = status === 'completed' && !isLinked  // ⚠️ 중요!
  const linkTooltip = isLinked ? '이미 고객과 연결됨' : '고객에게 연결'

  return (
    // JSX...
  )
})
```

**canLink 로직 설명**:
- `status === 'completed'`: 문서 처리가 완료된 경우만
- `&& !isLinked`: 아직 고객과 연결되지 않은 경우만
- 결과: **오류/처리중/대기 상태는 연결 불가**

#### 2.3 상태 아이콘 JSX 추가
액션 버튼 **바로 앞**에 상태 아이콘 추가:

```tsx
{/* 🍎 STATUS: 문서 처리 상태 아이콘 */}
<Tooltip content={statusLabel}>
  <div className={`status-icon status-${status}`}>
    {statusIcon}
  </div>
</Tooltip>

{/* 액션 버튼 */}
<div className="document-actions">
  {/* 버튼들... */}
</div>
```

---

### Step 3: CSS 수정 (레이아웃 및 스타일)

#### 3.1 Grid 레이아웃 수정
기존 grid-template-columns에 **28px 상태 아이콘 열** 추가:

```css
.document-item {
  display: grid;
  grid-template-columns:
    24px      /* 아이콘 고정 */
    1fr       /* 파일명 (가변) */
    80px      /* 크기 고정 */
    120px     /* 날짜 고정 */
    50px      /* 타입 고정 */
    28px      /* 상태 아이콘 ⭐ 추가 */
    104px;    /* 액션 버튼 */
  gap: 12px;
  align-items: center;
  /* ... */
}
```

#### 3.2 상태 아이콘 스타일 추가
문서 타입 스타일 다음에 추가:

```css
/* === 🍎 STATUS ICON: Document processing status === */
.status-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  flex-shrink: 0;
  transition: all 0.2s ease-out;
}

.status-icon.status-completed {
  color: var(--color-success);
}

.status-icon.status-processing {
  color: var(--color-primary-500);
  animation: processing-pulse 2s ease-in-out infinite;
}

@keyframes processing-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.status-icon.status-error {
  color: var(--color-error);
}

.status-icon.status-pending {
  color: var(--color-warning);
}
```

**스타일 포인트**:
- `status-completed`: 녹색 (성공)
- `status-processing`: 파란색 + 펄스 애니메이션
- `status-error`: 빨간색 (오류)
- `status-pending`: 주황색 (대기)

---

## 📊 상태 값 매핑

| 상태 | 값 | 아이콘 | 색상 | 의미 |
|------|-----|--------|------|------|
| 완료 | `completed` | ✓ | 녹색 | 모든 처리 완료 |
| 처리중 | `processing` | ⟳ | 파란색 | OCR/AI 처리 진행 중 |
| 오류 | `error` | ✗ | 빨간색 | 처리 실패 |
| 대기 | `pending` | ○ | 주황색 | 처리 대기 중 |

---

## ✅ 체크리스트

구현 완료 후 다음 항목을 확인하세요:

- [ ] Controller에서 `DocumentStatusService.getRecentDocuments()` 사용
- [ ] View에서 `DocumentStatusService` import
- [ ] 각 문서마다 `extractStatus()`, `getStatusLabel()`, `getStatusIcon()` 호출
- [ ] `canLink = status === 'completed' && !isLinked` 로직 적용
- [ ] 상태 아이콘 JSX가 액션 버튼 **앞**에 위치
- [ ] Grid 레이아웃에 28px 상태 열 추가
- [ ] 상태 아이콘 CSS 스타일 4가지 모두 추가
- [ ] 오류 상태 문서는 "고객에게 연결" 버튼 비활성화 확인
- [ ] 처리중/대기 상태 문서도 "고객에게 연결" 버튼 비활성화 확인
- [ ] 완료 상태 + 미연결 문서만 "고객에게 연결" 버튼 활성화 확인

---

## 🔍 트러블슈팅

### 문제: 상태 아이콘이 "?"로 표시됨

**원인**: `/api/documents` API 사용 (처리 메타데이터 없음)

**해결**: Controller에서 `DocumentStatusService.getRecentDocuments()` 사용

### 문제: 버튼이 모두 비활성화됨

**원인**: 문서 객체에 필요한 필드 누락

**해결**:
1. `/api/documents/status` API 사용 확인
2. `customer_relation` 정보 개별 조회 로직 확인
3. 타입 캐스팅: `document as any` 사용

### 문제: 오류 상태 문서도 연결 버튼 활성화

**원인**: `canLink` 로직이 `!isLinked`만 체크

**해결**: `canLink = status === 'completed' && !isLinked`로 수정

---

## 📝 참고 구현

완전한 구현 예제는 다음 파일 참고:
- Controller: `src/controllers/useDocumentsController.tsx`
- View: `src/components/DocumentViews/DocumentLibraryView/DocumentLibraryView.tsx`
- CSS: `src/components/DocumentViews/DocumentLibraryView/DocumentLibraryView.css`

---

## 🎨 디자인 원칙

1. **Progressive Disclosure**: 상태 아이콘은 서브틀하게 표시
2. **일관성**: DocumentStatusView와 동일한 아이콘 및 색상 사용
3. **접근성**: Tooltip으로 상태 설명 제공
4. **명확성**: 오류 상태는 즉시 식별 가능하도록 표시

---

**작성일**: 2025-10-14
**버전**: 1.0.0
**최종 수정**: DocumentLibraryView 구현 완료 (commit: 4b6db17)

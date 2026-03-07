# 관계자 문서 링크 기능 설계서

> 작성일: 2026-03-07
> 상태: 설계 완료, 구현 대기

---

## 1. 배경

### 1.1 문제 발견

법인 고객 "캐치업코리아"에 AR(연간보고서) 2건을 업로드한 후 다음 현상 확인:

| 위치 | 상태 | 기대 |
|------|------|------|
| "내 문서" 탭 > 연간보고서(AR) | 안영미_AR_2025-08-27.pdf, 김보성_AR_2025-08-29.pdf 표시 | OK |
| "관계자 문서" 탭 > 안영미 폴더 | 해당 AR **미표시** (다른 날짜 AR만 보임) | 보여야 함 |
| "관계자 문서" 탭 > 김보성 폴더 | 해당 AR **미표시** (다른 날짜 AR만 보임) | 보여야 함 |

### 1.2 현재 데이터 상태 (DB 확인)

```
files 컬렉션:
  69abdb951f7b3ff2aeda0c14:
    upload.originalName: "김보성보유계약현황202508.pdf"
    displayName: "김보성_AR_2025-08-29.pdf"
    customerId: 698f3ed781123c52a305ab1d (캐치업코리아 = 법인)
    document_type: "annual_report"
    ar_parsing_status: "completed"

  69abdb951f7b3ff2aeda0c15:
    upload.originalName: "안영미annual report202508.pdf"
    displayName: "안영미_AR_2025-08-27.pdf"
    customerId: 698f3ed781123c52a305ab1d (캐치업코리아 = 법인)
    document_type: "annual_report"
    ar_parsing_status: "completed"
```

AR은 본질적으로 **개인의 보유계약현황**이지만, `customerId`는 법인(캐치업코리아)에 남아있다.

### 1.3 원인: 고객 검색 API 경로 버그

`doc_prep_main.py` L693-695에서 AR 감지 시 고객 검색 API를 호출하지만, 경로가 잘못되어 항상 실패:

```python
# 현재 (잘못됨) - /customers/:id 라우트에 매칭되어 400 에러
search_response = await client.get(
    f"{settings.AIMS_API_URL}/api/customers/search",  # "search"가 :id로 해석됨
    params={"q": customer_name, "userId": user_id},
)
```

CRS 감지 코드(L936-938)에도 **동일한 버그**가 존재한다.

### 1.4 핵심 질문

> "법인에 올린 AR/CRS를 개인 고객으로 자동 이전해야 하는가?"

---

## 2. 설계 토의

### 2.1 전문가 패널

| 전문가 | 역할 |
|--------|------|
| **Alex** | 아키텍트/개발자 |
| **Dana** | UX 디자이너 |
| **소라** | 보험 설계사 (실사용자 페르소나, 경력 18년, IT 비전문가) |

### 2.2 검토된 방안

#### A안: 자동 이전 (customerId를 개인으로 변경)
- Alex 초기 의견: 코드 설계 의도이며 데이터 모델상 정확
- **기각 사유**:
  - 소라: "캐치업코리아에서 올렸는데 사라지면 안 돼요"
  - 사용자: "이름 매칭이 틀릴 수 있어서 자동은 위험"
  - Dana: "피드백 없는 자동 이동은 신뢰 파괴"

#### B안: 사용자 확인 팝업 ("안영미에게 이동하시겠습니까?")
- Dana 추천: Progressive Disclosure, 사용자 결정권 보장
- **기각 사유**:
  - 소라: "팝업 자주 뜨면 귀찮아요. 바빠서 일일이 못 해요"
  - AR 파싱이 비동기라 업로드 시점에 정보 없음

#### C안: 문서 복제 (법인+개인 각각)
- **즉시 기각**: Single Source of Truth 위반, 저장 공간 2배, 동기화 문제

#### D안: 현재 상태 유지
- **기각 사유**:
  - 소라: "안영미 이름이 써있는데 안영미 폴더에 없는 건 이상해요"
  - 관계자 탭에서 접근 불가 = 실질적 UX 문제

#### E안: 연결(Link) 방식 -- 채택
- customerId는 법인 유지 + `relatedCustomerId` 필드 추가
- 관계자 문서 탭에서 해당 문서도 함께 표시 (원본/링크 구분)

### 2.3 최종 합의: "옮기지 말고, 연결하자"

소라의 바인더 비유:
> "캐치업코리아 바인더 > 안영미 탭에 꽂으면, 안영미 탭에서도 보이는 것"

| 원칙 | 내용 |
|------|------|
| 소유권 불변 | customerId는 업로드한 고객(법인)에 그대로 유지 |
| 연결 추가 | AR/CRS 파싱 시 추출한 개인 고객 ID를 `relatedCustomerId`에 저장 |
| 양쪽 표시 | "내 문서" + "관계자 문서" 양쪽에서 접근 가능 |
| 안전성 | 매칭 실패해도 기존 동작에 영향 없음 (필드 null이면 무시) |
| 원본/링크 구분 | 관계자 탭에서 링크 문서는 출처(법인명) 표시 |

### 2.4 기존 버그(API 경로) 처리 방침

현재 AR/CRS 감지 코드에서 고객 검색 API 경로가 잘못되어 customerId 이전이 실패하고 있다.
**이 버그는 수정하지 않는다.** 연결(Link) 방식을 채택했으므로 customerId 이전 자체가 불필요하다.
대신, 동일한 고객 검색 로직을 **`relatedCustomerId` 설정 용도로 전환**한다.

---

## 3. 기술 구현안

### 3.1 데이터 모델 변경

`files` 컬렉션에 `relatedCustomerId` 필드 추가:

```javascript
// files 문서 예시
{
  _id: ObjectId("69abdb951f7b3ff2aeda0c14"),
  customerId: ObjectId("698f3ed781123c52a305ab1d"),       // 캐치업코리아 (법인) - 불변
  relatedCustomerId: ObjectId("698edd1a559fc6d089997d6f"), // 김보성 (개인) - 신규
  document_type: "annual_report",
  displayName: "김보성_AR_2025-08-29.pdf",
  // ...
}
```

### 3.2 백엔드 변경

#### 3.2.1 `doc_prep_main.py` -- AR 감지 로직 수정

**변경 범위:** `_detect_and_process_annual_report()` L688~770

- 고객 검색 API 경로 수정: `/api/customers/search` -> `/api/customers?search=`
- `customerId` 덮어쓰기 제거
- `relatedCustomerId` 필드로 저장

```python
# 수정 전 (L760-762)
if customer_id:
    update_fields["customerId"] = ObjectId(customer_id)

# 수정 후
if related_customer_id and ObjectId.is_valid(related_customer_id):
    update_fields["relatedCustomerId"] = ObjectId(related_customer_id)
```

#### 3.2.2 `doc_prep_main.py` -- CRS 감지 로직 수정

**변경 범위:** `_detect_and_process_customer_review()` L930~1003

동일한 수정 적용 (API 경로 + relatedCustomerId).

#### 3.2.3 관계자 문서 조회 API 변경 없음

관계자 문서 조회는 **프론트엔드에서 직접 수행** (L318-320):
```typescript
const result = await DocumentService.getCustomerDocuments(relatedId)
```

이 API는 `customerId = relatedId`인 문서만 반환한다.
추가로 `relatedCustomerId = relatedId`인 문서도 포함하도록 **문서 조회 API를 확장**하거나,
프론트엔드에서 별도 조회를 추가한다.

**선택: 문서 조회 API 확장** (백엔드 1곳 수정이 프론트엔드 N곳 수정보다 효율적)

`documents-routes.js` GET `/api/documents` 엔드포인트에서:
```javascript
// includeRelated=true: $and로 소유자 격리 보장
if (includeRelated && userId) {
  query = {
    $and: [
      { $or: [{ customerId: customerOid }, { relatedCustomerId: customerOid }] },
      { ownerId: userId }
    ]
  };
} else {
  query = { customerId: customerOid };
  if (userId) query.ownerId = userId;
}
```

### 3.3 프론트엔드 변경

#### 3.3.1 관계자 문서 로드 시 `includeRelated` 파라미터 전달

`CustomerDocumentExplorerView.tsx` L318-320:
```typescript
// 수정 전
const result = await DocumentService.getCustomerDocuments(relatedId)

// 수정 후
const result = await DocumentService.getCustomerDocuments(relatedId, { includeRelated: true })
```

#### 3.3.2 원본/링크 구분 표시

관계자 문서 탭에서 `relatedCustomerId`로 연결된 문서(= customerId가 다른 고객)는 **출처 표시**:

```
안영미_AR_2026-01-30.pdf     PDF  410.99 KB  2026.02.13 17:36:24
안영미_AR_2025-08-27.pdf     PDF  398.99 KB  2026.03.07 17:02:30  [캐치업코리아]
```

구분 방법: `document.customerId !== relatedId` → 링크 문서 → 출처 배지 표시

---

## 4. 영향 범위

| 파일 | 변경 내용 |
|------|----------|
| `backend/api/document_pipeline/routers/doc_prep_main.py` | AR/CRS 감지: API 경로 수정 + customerId 이전 -> relatedCustomerId |
| `backend/api/aims_api/routes/customers-routes.js` | GET /api/customers/:id/documents: includeRelated 파라미터 + customerId 응답 추가 |
| `frontend/.../CustomerDocumentExplorerView.tsx` | 관계자 문서 로드 시 includeRelated + 링크 배지 UI |
| `frontend/.../services/DocumentService.ts` | getCustomerDocuments 파라미터 확장 |

### 4.1 영향 없는 것

- "내 문서" 탭: customerId 기반 조회 → 변화 없음
- 기존 개인 고객 직접 업로드 문서: relatedCustomerId 없음 → 변화 없음
- AI 검색 (hybrid_search): 별도 로직, 영향 없음

---

## 5. 데이터 마이그레이션

기존에 법인에 업로드된 AR/CRS 중 `relatedCustomerId`가 없는 문서에 대해,
`displayName`에서 고객명을 추출하여 `relatedCustomerId`를 후행 설정하는 마이그레이션 검토.

**우선순위: 낮음** (신규 업로드부터 적용, 기존 데이터는 필요 시 수동 처리)

---

## 6. Gini 검수 결과

### 1차 검수: FAIL (4건)

| # | 심각도 | 이슈 | 수정 |
|---|--------|------|------|
| 1 | Critical | `$or` + top-level `ownerId` 조합 시 소유자 격리 우회 가능 | `$and` 명시적 결합으로 수정 |
| 2 | Critical | 링크 배지 툴팁이 법인명 하드 참조 → 개인 간 관계에서 오표시 | "다른 고객 문서함에서 연결됨"으로 일반화 |
| 3 | Major | `customerName \|\| '법인'` fallback → 개인 관계에서 부정확 | #2와 함께 수정 |
| 4 | Major | `relatedCustomerId` 저장 시 타입 혼용 (ObjectId/String) | `ObjectId.is_valid` 실패 시 저장하지 않도록 변경 |

### 수정 후 상태
- TypeScript 타입 체크: PASS
- 빌드: PASS
- 기존 테스트 4439건: ALL PASS

---

## 7. 구현 진행 기록

| 단계 | 상태 | 비고 |
|------|------|------|
| 설계 문서 작성 | 완료 | 본 문서 |
| 백엔드: relatedCustomerId 저장 | 완료 | AR + CRS 양쪽 |
| 백엔드: 문서 조회 API 확장 | 완료 | includeRelated + $and 소유자 격리 |
| 프론트엔드: 관계자 탭 링크 표시 | 완료 | 링크 아이콘 배지 + 툴팁 |
| 테스트 | 완료 | tsc + build + vitest 4439 PASS |
| Gini 검수 | 완료 | 4건 발견 → 모두 수정 |
| 배포 | 대기 | 사용자 확인 후 |
| Gini 검수 | 대기 | |
| 배포 | 대기 | |

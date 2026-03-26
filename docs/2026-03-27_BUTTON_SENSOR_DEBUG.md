# 요약/전체텍스트 버튼 비활성화 디버깅 보고서

> 작성일: 2026-03-27 01:40 KST
> 상태: **미해결 — 원인 추적 중**

---

## 목표

텍스트가 없는 문서의 요약/전체텍스트 버튼을 비활성화(disabled)하여 센서 역할.

```
비활성화 상태 → 텍스트 채워짐 → 활성화 상태
```

---

## 현재 코드

`DocumentExplorerTree.tsx` L389-394:
```typescript
// 요약 버튼
disabled={!(typeof doc.meta === 'object' && doc.meta?.summary) && !(typeof doc.ocr === 'object' && (doc.ocr as any)?.summary)}

// 전체텍스트 버튼
disabled={!doc._hasMetaText && !doc._hasOcrText}
```

---

## 증상

**모든** 전체텍스트 버튼이 `disabled: false`. ZIP/AI/JPG 파일 포함.

- Playwright evaluate로 확인: 10개 버튼 전부 `disabled: false`, `opacity: 1`, `pointerEvents: auto`
- React fiber에서 확인: `disabledProp: false` → React가 disabled를 false로 렌더링
- 캐치업포멧.ai 버튼 클릭 → "문서의 전체 텍스트를 찾을 수 없습니다" 모달 표시 (클릭이 됨 = 비활성화 안 됨)

---

## DB 확인

```
캐치업포멧.ai:     meta.full_text: 0자, ocr.full_text: 0자
캐치업코리아노무규정.zip: meta.full_text: 0자, ocr.full_text: 0자
암검진067.jpg:     meta.full_text: 0자, ocr.full_text: 0자
```

**DB에 텍스트 없음 → API의 `_hasMetaText`/`_hasOcrText`는 false여야 함**

---

## API 확인 (미완료)

서버에서 직접 explorer-tree API 호출 시도했으나 인증 문제로 확인 못 함.
- `x-user-id` 헤더만으로는 문서 0건 반환
- JWT 토큰 기반 인증이 필요하나 서버에서 토큰 조회 실패

---

## 가설

### 가설 1: API가 `_hasMetaText`를 반환하지 않음
- API 응답에 `_hasMetaText` 필드 자체가 없으면 → `doc._hasMetaText === undefined` → `!undefined = true` → **disabled 되어야 함**
- 하지만 disabled 안 됨 → 이 가설 기각

### 가설 2: `doc._hasMetaText`가 truthy 값
- React fiber에서 `disabledProp: false` → `!doc._hasMetaText && !doc._hasOcrText`가 `false`
- 즉, `doc._hasMetaText` 또는 `doc._hasOcrText` 중 하나가 truthy
- **DB에는 텍스트 없는데 API가 true 반환** → API 버그?

### 가설 3: 프론트엔드 Document 변환 과정에서 값이 바뀜
- `DocumentStatusService.ts` L547: `const hasMetaText = Boolean(metaFullTextContent) || Boolean((document as Partial<Document>)._hasMetaText)`
- 이 로직이 문서 상태 계산 중에 `_hasMetaText`를 덮어쓸 수 있음
- **explorer-tree API → getExplorerTree() → data.data 직접 반환** 이므로 변환 과정이 없어야 하지만, 다른 경로에서 변환이 일어날 수 있음

### 가설 4 (가장 유력): `doc` 객체가 다른 경로를 통해 생성됨
- DocumentExplorerTree에서 사용하는 `doc`은 `Document` 타입
- 이 객체가 explorer-tree API 응답에서 직접 오는 게 아니라, `DocumentStatusService`의 다른 메서드(`getDocumentStatuses` 등)를 통해 변환된 후 오는 것일 수 있음
- 변환 과정에서 `_hasMetaText`가 true로 설정되거나, 원본 API 응답의 `_hasMetaText: false`가 무시될 수 있음

---

## 다음 단계

1. **DocumentExplorerView에서 `explorerData.documents`가 어디서 오는지 추적**
   - `useDocumentExplorerTree` 훅 → `fetchExplorerTree` → `DocumentStatusService.getExplorerTree`
   - 반환된 documents 배열의 각 doc에 `_hasMetaText` 필드가 있는지 확인

2. **API 응답을 브라우저 DevTools Network에서 직접 확인**
   - 또는 Playwright의 network interception으로 API 응답 캡처

3. **근본 수정: API 응답에서 `_hasMetaText`를 신뢰하지 말고, 직접 계산**
   - `doc.meta?.full_text` 또는 `doc.ocr?.full_text`의 존재 여부로 직접 판단
   - 단, explorer-tree API는 full_text를 projection으로 제거(`$project: {'meta.full_text': 0}`)하므로 이 필드가 없음
   - → `_hasMetaText` 플래그에 의존할 수밖에 없음 → API 레벨에서 확인 필수

---

## 관련 파일

| 파일 | 역할 |
|------|------|
| `DocumentExplorerTree.tsx` L389-394 | 버튼 disabled 로직 |
| `DocumentStatusService.ts` L254 | explorer-tree API 호출 |
| `documents-routes.js` L70-93 | `_hasMetaText`/`_hasOcrText` aggregation 계산 |
| `documents-routes.js` L920-950 | explorer-tree 응답 매핑 |

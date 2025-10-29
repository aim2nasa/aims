# overallStatus 자동 업데이트 구현

## 📋 구현 목표

문서처리현황 페이지에서 상태(status) 칼럼 정렬을 가능하게 하기 위해 MongoDB에 `overallStatus` 필드를 저장하도록 개선

## ✅ 구현 완료 사항

### 1. API 수정
- **대상 API**: `/api/documents/status` (Line 448-483)
- **수정 내용**: 폴링 시점에 `overallStatus` 필드 자동 생성/업데이트

### 2. 작동 방식
```javascript
// 각 문서마다 실행
if (!doc.overallStatus || doc.overallStatus !== 'completed') {
  // 현재 상태 계산
  const { computed } = prepareDocumentResponse(doc);
  const newStatus = computed.overallStatus;

  // DB에 저장된 값과 다르면 업데이트
  if (doc.overallStatus !== newStatus) {
    await db.collection(COLLECTION_NAME).updateOne(
      { _id: doc._id },
      {
        $set: {
          overallStatus: newStatus,
          overallStatusUpdatedAt: new Date()
        }
      }
    );
  }
}
```

### 3. 성능 최적화
- **완료된 문서 스킵**: `overallStatus === 'completed'`인 문서는 업데이트 안 함
- **변경 감지**: 값이 실제로 변경된 경우만 DB 업데이트
- **비동기 병렬 처리**: `Promise.all()`로 여러 문서 동시 업데이트

## 📊 검증 결과

### 전체 문서 커버리지
```
전체 문서 수: 104개
✅ overallStatus 있음: 104개
❌ overallStatus 없음: 0개

커버리지: 100.00%
```

### 상태별 분포
```
completed: 97개 (93%)
processing: 1개 (1%)
error: 6개 (6%)
```

### 신규 파일 테스트
- 4개 파일 업로드 후 테스트
- API 호출 시 자동으로 `overallStatus: 'processing'` 생성 확인
- 처리 완료 후 `processing` → `completed` 자동 업데이트 확인

## 🔄 실시간 업데이트 흐름

```
1. 파일 업로드
   └─> 백그라운드 처리 시작 (meta, ocr, embed)

2. 문서처리현황 페이지 폴링
   └─> /api/documents/status 호출

3. API에서 각 문서 확인
   ├─> overallStatus 없음 → prepareDocumentResponse() 호출 → DB에 저장
   ├─> overallStatus = 'processing' → 현재 상태 재계산 → 변경되면 업데이트
   └─> overallStatus = 'completed' → 스킵 (성능 최적화)

4. 응답 전송
   └─> 프론트엔드에서 최신 상태 표시
```

## 📁 수정된 파일

- `backend/api/aims_api/server.js` (Line 448-483)
  - +25 lines, -3 lines
  - `/api/documents/status` API에 DB 업데이트 로직 추가

## 🎯 다음 단계

1. **백엔드 정렬 구현**: `?sort=status_asc/desc` 파라미터 처리
2. **프론트엔드 정렬 활성화**: status 칼럼 정렬 버튼 활성화
3. **검증**: 100개 문서로 정렬 동작 확인

## 💡 핵심 원칙 준수

### CLAUDE.MD 최소 수정 원칙
- ✅ 오직 `/api/documents/status` API만 수정
- ✅ 불필요한 `/api/documents` API는 원본 유지
- ✅ 기존 응답 구조 변경 없음
- ✅ `analyzeDocumentStatus()` 기존 로직 유지

### 폴링 기반 업데이트
- ✅ 별도 초기화 스크립트 불필요
- ✅ 기존/신규 문서 동일하게 처리
- ✅ 사용자 폴링에 맞춰 자동 업데이트

## 📝 커밋 정보

- **Commit**: `97013eb`
- **Message**: `feat(server): 문서처리현황 페이지 overallStatus 자동 업데이트 구현`
- **Date**: 2025-10-29

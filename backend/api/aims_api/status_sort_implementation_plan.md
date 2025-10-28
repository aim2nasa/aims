# 문서 상태(Status) 정렬 기능 구현 계획서

## 📋 목표
문서처리현황 페이지에서 상태별 정렬 기능 구현

## 🔍 문제
- `overallStatus`가 DB에 저장 안 됨 (매번 계산)
- 프론트엔드는 페이지 내에서만 정렬 가능 (전체 정렬 불가)
- 백엔드 정렬 불가능 (정렬 기준 없음)

## 🎯 해결 방안

### 폴링 시점 상태 업데이트

**핵심:**
- 폴링 API에서 `completed` 아닌 문서만 `overallStatus` 업데이트
- 필드 없으면 그때 생성
- 초기화 스크립트 불필요

**동작:**
```javascript
for (const doc of documents) {
  if (!doc.overallStatus || doc.overallStatus !== 'completed') {
    // prepareDocumentResponse() 호출
    // overallStatus 계산 → DB 저장
  }
}
```

**장점:**
- 매우 간단
- 기존/새 문서 동일하게 처리
- 리스크 없음

## 📝 구현 단계

### 1. 폴링 API 수정
- `/api/customers/:id/documents`에 상태 업데이트 로직 추가
- `completed` 아닌 문서만 업데이트

### 2. 백엔드 정렬 구현
- `sort=status_asc/desc` 처리
- `overallStatus` 필드로 정렬

### 3. 프론트엔드 수정
- status 정렬 차단 코드 제거

## 🧪 검증

각 단계마다 실제 데이터로 검증
- 검증 실패 → 다음 단계 진행 금지
- 100개 문서 비교로 정렬 확인

## 📌 변경 이력

- v1.0: MongoDB Change Streams → 실패 (Replica Set 필수)
- v2.0: 폴링 시점 업데이트 + 초기화 스크립트 → 복잡함
- v3.0: 폴링 시점 업데이트만 → 최종 (간단, 명료)

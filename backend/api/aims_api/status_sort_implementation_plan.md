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
- 프론트엔드 폴링 요청 시 `overallStatus` 계산 → DB 저장
- `completed` 아닌 문서만 업데이트 (성능 최적화)

**동작:**
```
폴링 → 문서 조회 → overallStatus 계산 → DB 업데이트 → 응답
```

**장점:**
- 중앙 집중 (server.js 한 곳)
- 기존 모듈 수정 불필요
- 간단한 구현

## 📝 구현 단계

### 1. 초기화 스크립트
- 모든 문서에 `overallStatus` 필드 생성
- 파일: `backend/api/aims_api/scripts/initialize_overall_status.js`

### 2. 폴링 API 수정
- `/api/customers/:id/documents`에 상태 업데이트 로직 추가
- `completed` 아닌 문서만 업데이트

### 3. 백엔드 정렬 구현
- `sort=status_asc/desc` 처리
- aggregation pipeline으로 정렬

### 4. 프론트엔드 수정
- status 정렬 차단 코드 제거

## 🧪 검증

각 단계마다:
1. 실제 데이터로 검증
2. 검증 실패 → 다음 단계 진행 금지
3. 100개 문서 비교로 정렬 확인

## 📌 변경 이력

- v1.0: MongoDB Change Streams → 실패 (Replica Set 필수)
- v2.0: 폴링 시점 업데이트 → 채택

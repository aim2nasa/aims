# Regression 테스트 현황 (2024년 11월)

**작성일**: 2024년 11월 3일
**기간**: 2024년 10월 ~ 2024년 11월

## 개요

최근 1개월(2024년 10월 ~ 11월) 주요 기능 및 버그 수정에 대한 regression 테스트 완료.

## 테스트 결과 요약

- **총 테스트 수**: 161개
- **전체 테스트**: 2,826 passed, 23 skipped
- **커밋 수**: 8개

## Phase별 상세 내역

| Phase | 테스트 파일 | 테스트 수 | 보호 기능 |
|-------|------------|----------|----------|
| 1-1 | `DocumentService.qdrant-deletion.test.ts` | 12개 | Qdrant 임베딩 자동 삭제 |
| 1-2 | `DocumentService.customer-preview-edge-cases.test.ts` | 22개 | 고객 문서 프리뷰 API |
| 2-1 | `DocumentStatusList.badges-color-system.test.tsx` | 17개 | OCR/AR/TXT 뱃지 색상 |
| 2-2 | `annualReportService.header-validation.test.ts` | 13개 | AR 헤더 검증 |
| 2-3 | `userIsolation.integration.test.ts` | 15개 | 사용자 격리 |
| 2-4 | `RelationshipModal.duplicate-prevention.test.tsx` | 11개 | 법인 관계자 중복 방지 |
| 3-1 | `timeUtils.integration.test.ts` | 49개 | Timestamp 정규화 |
| 3-2/3-3 | `ux-improvements.regression.test.ts` | 22개 | 타임아웃/지도 경계 |

## 보호 중인 주요 기능

- ✅ Qdrant 벡터 DB 동기화 (문서 삭제 시)
- ✅ 고객 문서 프리뷰 API 엣지 케이스 처리
- ✅ OCR 신뢰도별 뱃지 색상 분류
- ✅ 연차보고서(AR) 자동 파싱 헤더 검증
- ✅ 사용자별 문서 격리 (multi-tenant)
- ✅ 법인 관계자 중복 방지
- ✅ AIMS 표준 타임스탬프 시스템 (ISO 8601 UTC)
- ✅ 문서 타임아웃 감지 (5분 기준)
- ✅ 제주도 포함 지도 경계

## 테스트 실행 방법

```bash
cd frontend/aims-uix3
npm test
```

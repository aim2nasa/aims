# 전체 테스트 스킬

이 스킬은 "전체 테스트" 요청 시 자동으로 적용됩니다.

## 트리거 키워드
- "전체 테스트"
- "full test"
- "모든 테스트"
- "테스트 전체"

## 필수 실행 항목 (병렬 실행)

### 1. Frontend (aims-uix3)
```bash
cd d:/aims/frontend/aims-uix3 && npm test -- --run
```

### 2. Backend (aims_api)
```bash
cd d:/aims/backend/api/aims_api && npm test
```

## 결과 보고 형식

| 프로젝트 | 테스트 파일 | 테스트 수 | 결과 |
|----------|-------------|-----------|------|
| aims-uix3 | N개 | N개 | ✅/❌ |
| aims_api | N개 | N개 | ✅/❌ |

## 주의사항

- **절대 하나만 실행하지 말 것** - 프론트엔드와 백엔드 모두 실행 필수
- 두 테스트는 **병렬로** 실행하여 시간 절약
- Python 테스트(annual_report_api)는 Windows에서 venv 경로 문제로 생략 가능

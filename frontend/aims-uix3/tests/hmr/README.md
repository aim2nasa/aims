# HMR 테스트 스위트

이 디렉토리는 Vite HMR (Hot Module Replacement) 기능의 안정성을 검증하기 위한 자동화 테스트를 포함합니다.

## 테스트 파일

### 기본 테스트
- **test-hmr.js**: 기본 HMR 기능 테스트 (CSS, TSX, Icon 각 3회)

### 집중 테스트
- **test-hmr-icons.js**: 아이콘 변경 집중 테스트 (6개 테스트 케이스, 28회 변경)
  - 기본 아이콘 CSS 변경
  - 아이콘 색상/크기 변경
  - 빠른 연속 변경 (5회)
  - 대용량 아이콘 CSS 추가
  - 안정성 테스트 (20회 반복)

### 종합 테스트
- **test-hmr-comprehensive.js**: 엣지 케이스 종합 테스트 (7개 테스트 케이스, 95회+ 변경)
  - CSS, TSX, 아이콘 변경
  - 동시 다발적 파일 변경 (3개 파일)
  - 빠른 연속 변경 (10회)
  - 대용량 파일 처리
  - 안정성 테스트 (30회 반복)

### 극한 테스트
- **test-hmr-extreme.js**: 극단적 스트레스 테스트 (6개 테스트 케이스, 70회+ 변경)
  - 초대용량 CSS (100KB)
  - 초고속 연속 변경 (100ms 간격, 50회)
  - 복잡한 CSS 중첩 (100단계)
  - 잘못된 CSS 구문 추가 후 복구
  - 동시 다발적 파일 변경 (3개 파일)
  - 반복적 에러 복구 (10회)

### 장기 안정성 테스트
- **test-hmr-long-term.js**: 1시간 연속 안정성 테스트
  - 865회 반복 (CSS 288회, TSX 289회, 아이콘 288회)
  - 메모리 누수 감지
  - 서버 크래시 감지
  - 실시간 진행 상황 표시

## 실행 방법

```bash
# 개별 테스트 실행
node tests/hmr/test-hmr-icons.js
node tests/hmr/test-hmr-comprehensive.js
node tests/hmr/test-hmr-extreme.js
node tests/hmr/test-hmr-long-term.js

# 서버가 실행 중이어야 합니다 (포트 5173)
cd frontend/aims-uix3
npm run dev
```

## 테스트 결과

테스트 결과는 JSON 파일로 저장됩니다:
- `test-results-icons.json`
- `test-results-extreme.json`
- `test-results-long-term.json`

## 최종 보고서

전체 테스트 결과 및 분석은 다음 문서를 참고하세요:
- **최종 보고서**: `docs/HMR_TEST_FINAL_REPORT_20251109.md`
- **사용자 가이드**: `docs/HMR_SOLUTION.md`
- **작업 노트**: `tests/hmr/HMR_TEST_REPORT.md`

## 핵심 통계

- **총 테스트**: 19개 (18개 통과, 1개 실패 - OS 제약)
- **총 파일 변경**: 1,058회 이상
- **서버 크래시**: 0회
- **HMR 성공률**: 100%
- **개발 속도 개선**: 15배 (30초 → 2초)

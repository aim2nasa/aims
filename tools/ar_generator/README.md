# AR Generator

AIMS Annual Report 테스트 PDF 생성 도구

## 개요

이 도구는 AR(Annual Report) 파싱 파이프라인을 테스트하기 위한 Mock PDF를 생성합니다.

## 설치

```bash
cd tools/ar_generator
npm install
```

### 한글 폰트 설정

`fonts/` 디렉토리에 한글 폰트를 추가해야 합니다:

```bash
# 서버에서 폰트 추출 (이미 설치된 경우)
cp /tmp/fonts/NotoSansKR_1.otf fonts/NotoSansKR-Regular.otf

# 또는 Noto Sans KR 다운로드
# https://fonts.google.com/noto/specimen/Noto+Sans+KR
```

## 사용법

### 1. 단일 AR PDF 생성

```bash
# 기본 프리셋으로 생성
npm run generate

# 특정 고객명으로 생성
npm run generate -- --customer "홍길동" --preset basic

# 신상철 고객 템플릿 사용
npm run generate -- --shin

# 다양한 프리셋
npm run generate -- --preset single        # 단일 계약
npm run generate -- --preset many          # 다수 계약 (10-15개)
npm run generate -- --preset with_lapsed   # 실효계약 포함
npm run generate -- --preset mixed_status  # 다양한 상태 혼합
```

### 2. 배치 생성

```bash
# 5개 기본 AR 생성
npm run batch

# 10개 혼합 시나리오 생성
npm run batch -- --count 10 --scenario mixed

# 스트레스 테스트용 (다수 계약)
npm run batch -- --count 5 --scenario stress
```

### 3. 자동화 테스트

```bash
# 전체 테스트 실행
npm run test:ar

# 특정 시나리오 테스트
npm run test:ar -- --scenario edge-cases
npm run test:ar -- --scenario stress
npm run test:ar -- --scenario shin-template

# 다른 API 서버 지정
npm run test:ar -- --api-url http://100.110.215.65:8004
```

### 4. 프리셋 목록 확인

```bash
npm run dev list
```

## 프리셋

| 프리셋 | 설명 |
|--------|------|
| `basic` | 기본 (계약 3-5개) |
| `single` | 단일 계약 |
| `many` | 다수 계약 (10-15개) |
| `with_lapsed` | 정상 3개 + 실효 2개 |
| `all_lapsed` | 모두 실효 |
| `mixed_status` | 다양한 상태 혼합 |
| `empty` | 계약 없음 (엣지케이스) |

## 출력 디렉토리

- 단일 생성: `output/AR_{고객명}_{날짜}.pdf`
- 배치 생성: `output/batch/`

## 프로그래매틱 사용

```typescript
import { generateARPdf, saveARPdf } from './src/generator.js';
import { generateFromPreset, generateCustomAR } from './src/templates.js';

// 프리셋으로 생성
const options = generateFromPreset('basic', {
  customerName: '홍길동',
  issueDate: '2026-01-15',
});
const pdfBytes = await generateARPdf(options);

// 커스텀 계약으로 생성
const customOptions = generateCustomAR('김철수', [
  {
    증권번호: '0013017050',
    보험상품: '무배당 종신보험',
    계약상태: '정상',
    '보험료(원)': 150000,
  },
]);
await saveARPdf(customOptions, '/path/to/output.pdf');
```

## 테스트 시나리오

### edge-cases
- 빈 계약 (empty)
- 단일 계약 (single)
- 모두 실효 (all_lapsed)

### stress
- 다수 계약 (10-15개) 반복 생성

### shin-template
- 신상철 고객 실제 데이터 템플릿

## 파일 구조

```
ar_generator/
├── src/
│   ├── index.ts          # CLI 진입점
│   ├── generator.ts      # PDF 생성 핵심 로직
│   ├── templates.ts      # AR 템플릿 및 샘플 데이터
│   ├── test-runner.ts    # 자동화 테스트
│   └── types.ts          # TypeScript 타입 정의
├── fonts/                # 한글 폰트
├── output/               # 생성된 PDF 출력
├── package.json
├── tsconfig.json
└── README.md
```

## 환경변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `AR_API_URL` | Annual Report API URL | `http://localhost:8004` |
| `AIMS_API_URL` | AIMS API URL | `http://localhost:3010` |

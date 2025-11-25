# Excel Refiner

## AIMS 규칙 준수

**상위 규칙 문서**: `../../CLAUDE.md` 준수 필수

- CSS 하드코딩 금지 (색상, 크기 모두 CSS 변수 사용)
- `!important` 사용 금지
- 아이콘 최대 16px (드롭존 일러스트 제외)
- 커밋 전 사용자 승인 필수
- 최소한 수정 원칙

## 개요

보험 설계사용 엑셀 데이터 정제 도구. 증권번호 중복/빈값 검출 및 문제 행 삭제 기능 제공.

## 핵심 기능

1. **엑셀 파싱**: xlsx 라이브러리로 .xlsx/.xls 파일 읽기
2. **증권번호 검증**: 컬럼명 자동 감지 → 중복/빈값 검출
3. **문제 행 표시**: 빈값(주황), 중복(빨강) 색상 구분, 상단 정렬
4. **행 삭제**: Ctrl/Shift 다중 선택 후 삭제
5. **정제 파일 저장**: `원본명_정제_YYYYMMDD.xlsx` 형식으로 내보내기

## 프로젝트 구조

```
src/
├── features/excel-refiner/
│   ├── ExcelRefinerView.tsx    # 메인 컴포넌트
│   ├── ExcelRefinerView.css    # 스타일
│   ├── hooks/useValidation.ts  # 검증 로직
│   ├── utils/excel.ts          # 파싱/내보내기
│   └── types/excel.ts          # 타입 정의
└── shared/
    ├── ui/Button/              # 공용 버튼
    └── design/                 # CSS 변수 (aims-uix3 호환)
```

## 설계 의도

- **aims-uix3와 분리**: 빠른 개발을 위해 독립 프로젝트로 시작
- **통합 대비**: path alias, CSS 변수 시스템을 aims-uix3와 동일하게 구성
- **확장 가능**: 추후 컬럼별 검증 로직 추가 예정

## 검증 로직

현재 증권번호 컬럼만 적용:
- 컬럼명에 "증권번호" 또는 "policy" 포함 시 자동 감지
- 빈값 체크 (null, undefined, 'nan', 빈문자열)
- 중복값 체크

## 기술 스택

- Vite + React 19 + TypeScript
- xlsx (SheetJS)
- CSS Variables (Light/Dark 테마 지원)

## 실행

```bash
cd frontend/excel-refiner
npm install
npm run dev  # http://localhost:5181
```

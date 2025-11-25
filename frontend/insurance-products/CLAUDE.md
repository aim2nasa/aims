# Insurance Products

## AIMS 규칙 준수

**상위 규칙 문서**: `../../CLAUDE.md` 준수 필수

- CSS 하드코딩 금지 (색상, 크기 모두 CSS 변수 사용)
- `!important` 사용 금지
- 아이콘 최대 16px (드롭존 일러스트 제외)
- 커밋 전 사용자 승인 필수
- 최소한 수정 원칙

## 개요

메트라이프 보험상품 DB 등록/관리 도구. 공식 홈페이지에서 조사한 판매중/판매중지 상품 데이터를 관리.

## 핵심 기능

1. **파일 업로드**: MD/Excel 파일 드래그앤드롭으로 파싱
2. **상품 목록**: 테이블 형태로 필터/검색/정렬
3. **카테고리**: 보장, 변액, 연금, 법인, 양로, 저축
4. **상태 관리**: 판매중/판매중지 구분
5. **DB 저장**: MongoDB `docupload.insurance_products` 컬렉션

## 프로젝트 구조

```
src/
├── features/insurance-products/
│   ├── InsuranceProductsView.tsx    # 메인 컴포넌트
│   ├── InsuranceProductsView.css    # 스타일
│   ├── types/product.ts             # 타입 정의
│   └── utils/parser.ts              # 파일 파싱
└── shared/
    ├── ui/Button/                   # 공용 버튼
    └── design/                      # CSS 변수 (aims-uix3 호환)
```

## 데이터 모델

```typescript
interface InsuranceProduct {
  _id?: string;
  category: '보장' | '변액' | '연금' | '법인' | '양로' | '저축';
  productName: string;
  saleStartDate: string;    // YYYY.MM.DD
  saleEndDate?: string;     // 판매중지 상품만
  status: '판매중' | '판매중지';
  surveyDate: string;       // 조사일
}
```

## 기술 스택

- Vite + React 19 + TypeScript
- xlsx (SheetJS)
- CSS Variables (Light/Dark 테마 지원)

## 실행

```bash
cd frontend/insurance-products
npm install
npm run dev  # http://localhost:5182
```

## API 엔드포인트

- `GET /api/insurance-products` - 전체 상품 조회
- `POST /api/insurance-products/bulk` - 상품 일괄 등록
- `PUT /api/insurance-products/:id` - 상품 수정
- `DELETE /api/insurance-products/:id` - 상품 삭제

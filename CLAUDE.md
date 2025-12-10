# CLAUDE.md

## 🎯 핵심 철학

**"최고의 UX를 위해서는 모든 것을 뜯어 고칠 용의가 있다."**

- 모든 결정 기준: "사용자에게 더 나은가?"
- UX 개선을 위해 기존 코드/아키텍처 전면 개편 가능
- 코드는 다시 짜면 되지만, 사용자의 시간은 돌아오지 않는다

---

## ⚠️ CRITICAL RULES

### 1. Git Commit 규칙
- **사용자 명시적 승인 없이 절대 커밋 금지**
- 구현 완료 → 설명 → 사용자 승인 대기 → 커밋
- **커밋 메시지는 한글로 작성**

### 2. 최소한 수정 원칙
- 요청된 기능에 **직접 필요한 부분만** 수정
- 관련 없는 코드 절대 건드리지 않기
- 진단과 구현 일치: "색상 문제" → CSS만, "로직 문제" → 로직만

### 3. 코드 원복 원칙
- 2번 시도 실패 시 **즉시 git checkout으로 원복 후 재구현**
- 잘못된 코드 위에 수정 쌓지 말 것

### 4. 하드코딩 금지
| 금지 | 허용 |
|------|------|
| `#ffffff`, `rgba()` 직접 사용 | `var(--color-*)` CSS 변수 |
| 컴포넌트별 CSS 변수 정의 | `variables.css`에서만 정의 |
| inline style 색상값 | className 사용 |

- 새 색상 필요 시: `variables.css`에 추가 → 사용
- `!important` 절대 금지

### 5. 아이콘 규칙
- **최대 크기**: 17px (BODY), LeftPane/CenterPane 제목은 ~20.8px (1.3em)
- **배경**: 투명 (`background: transparent`)
- **호버**: opacity + scale만 (배경색 변경 금지)
- SFSymbol 미정의 시 → 직접 SVG 사용 (`fill="currentColor"`)
- **캐싱 문제**: `rm -rf node_modules/.vite && npm run dev` → Ctrl+Shift+R
- **고객 타입 아이콘**: `AllCustomersView.tsx`에 정의된 custom SVG 아이콘 사용
  - 개인: 블루(파랑) 사람 아이콘 `.customer-icon--personal`
  - 법인: 오렌지 건물 아이콘 `.customer-icon--corporate`

### 6. 백엔드 API 연동
- **추측 금지**, 실제 API 호출로 응답 구조 확인 필수
```bash
ssh tars.giize.com 'curl -s "http://localhost:3010/api/endpoint" | python3 -m json.tool'
```

### 7. 날짜/시간 형식
| 유형 | 형식 | 예시 |
|------|------|------|
| 날짜+시간 | `YYYY.MM.DD HH:mm:ss` | `2025.11.30 18:35:32` |
| 날짜만 | `YYYY.MM.DD` | `2025.11.30` |

- 24시간제, 구분자 점(`.`), KST 기준
- 유틸리티: `@/shared/lib/timeUtils`

### 8. 🔴 고객명 유일성 철칙
**같은 설계사(userId) 내에서 고객명은 절대 중복 불가!**

| 범위 | 중복 허용 |
|------|----------|
| 개인/법인 | ❌ 불가 - "홍길동 개인"이 있으면 "홍길동 법인" 등록 불가 |
| 활성/휴면 | ❌ 불가 - 휴면 고객과도 이름 중복 불가 |
| 대소문자 | ❌ 불가 - "Hong"과 "hong"은 동일 |

**예시:**
- ✅ 설계사A: "홍길동" + 설계사B: "홍길동" (다른 설계사는 OK)
- ❌ 설계사A: "홍길동 개인" + 설계사A: "홍길동 법인" (동일 설계사 내 불가)
- ❌ 설계사A: "홍길동 활성" + 설계사A: "홍길동 휴면" (동일 설계사 내 불가)

---

## System Overview

**AIMS** (Agent Intelligent Management System): 보험 설계사를 위한 지능형 문서 관리 시스템

### 도메인 모델
```
설계사 ─(1:N)─► 고객 ─(1:N)─► 문서
                  └─(0:N)─► 계약 ─(N:1)─► 보험상품 ─(N:1)─► 보험사
```

| 엔티티 | 설명 |
|--------|------|
| 설계사 | 보험 영업인, 여러 고객 관리 |
| 고객 | 설계사의 고객 (= 계약자) |
| 계약 | 증권번호, 계약상태, 피보험자, 수익자 |

---

## Development Environment

| 환경 | 위치 |
|------|------|
| Backend Server | `tars.giize.com` (`/home/rossi/aims`) |
| Frontend | `D:\aims` (Windows) |
| Database | MongoDB `tars:27017` |

### 백엔드 수정 절차
1. **로컬에서 파일 수정** (D:\aims)
2. `scp`로 서버에 복사
3. 배포 스크립트 실행: `./deploy_aims_api.sh`

---

## Architecture

### Frontend (`frontend/aims-uix3/`)
- React + TypeScript + Vite
- TanStack Query + Zustand
- Apple design philosophy

### 공통 컴포넌트
| 컴포넌트 | 용도 |
|----------|------|
| `@/shared/ui/Modal` | 기본 모달 |
| `@/shared/ui/DraggableModal` | 드래그/리사이즈 모달 |
| `@/shared/ui/Button` | variant: primary/secondary/ghost/destructive/link |
| `@/shared/ui/Tooltip` | iOS 스타일 툴팁 |

**금지**: HTML `<button>` 직접 사용, Portal/ESC 직접 구현

### Backend Services
- Node.js API: `backend/api/aims_api/` (포트 3010)
- Python FastAPI: `backend/api/doc_status_api/` (포트 8000)

---

## Commands

### Frontend
```bash
cd frontend/aims-uix3
npm run dev      # 개발 서버 (5177)
npm run build    # 프로덕션 빌드
npm test         # 테스트
npm run typecheck
```

### Backend
```bash
cd backend/api/aims_api && npm start
cd backend/api/doc_status_api && uvicorn main:app --reload
```

---

## 디자인 시스템

### Typography (Dense)
| 용도 | 크기 | weight |
|------|------|--------|
| 섹션 제목 | 13px | 600 |
| 테이블 데이터 | 12px | 400 |
| 테이블 헤더 | 11px | 600 |
| 배지 | 10px | 400 |

- font-weight 500 **사용 금지**

### Apple 디자인 원칙
1. **Clarity**: 정보 계층 명확
2. **Deference**: UI가 콘텐츠 방해 금지
3. **Depth**: 자연스러운 시각적 계층

- Progressive Disclosure: "Invisible until you need it"
- 화려한 그라데이션, 강한 색상 강조 금지

---

## 문제 해결

### React HMR 문제
```bash
pkill -f "react-scripts"
rm -rf node_modules/.cache
npm start
# 브라우저: Ctrl+Shift+R
```

### 아이콘 캐싱 문제
```bash
rm -rf node_modules/.vite dist .vite
npm run dev
# Ctrl+Shift+R
```

---

## 참조 문서

| 문서 | 내용 |
|------|------|
| [CSS_SYSTEM.md](frontend/aims-uix3/CSS_SYSTEM.md) | CSS 시스템 상세 |
| [DENSE_TYPOGRAPHY_SYSTEM.md](frontend/aims-uix3/docs/DENSE_TYPOGRAPHY_SYSTEM.md) | 타이포그래피 |
| [ICON_IMPLEMENTATION_TROUBLESHOOTING.md](docs/ICON_IMPLEMENTATION_TROUBLESHOOTING.md) | 아이콘 문제 해결 |
| [SECURITY_ROADMAP.md](docs/SECURITY_ROADMAP.md) | 보안 로드맵 |
| [EXCEL_IMPORT_SPECIFICATION.md](docs/EXCEL_IMPORT_SPECIFICATION.md) | 고객/계약 일괄등록 엑셀 입력 표준 |

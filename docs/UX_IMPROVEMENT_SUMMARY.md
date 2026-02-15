# UX 개선 완료 요약

> 작성일: 2026-02-15
> 근거 문서: [UX_AUDIT_BY_DEVICE.md](UX_AUDIT_BY_DEVICE.md)

## 개요

디바이스별 UX 감사(22건) → 재검증(8건 개선 필요) → 최종 검증(6건 실제 필요) → 구현 완료

---

## 구현 내역

| # | 커밋 | 내용 | 수정 파일 |
|---|------|------|----------|
| 1 | `08dd3642` | Tooltip 터치 디바이스 지원 (탭 토글, 3초 자동닫기, 외부터치 닫기) | `Tooltip.tsx` |
| 2 | `b516f4de` | Android 뒤로가기 버튼으로 모달 닫기 (useBackButton 훅) | `useModalCore.ts`, `Modal.tsx`, `DraggableModal.tsx` |
| 3 | `25a5d8ed` | ChatPanel 삭제 버튼 터치 디바이스 접근성 (opacity 항상 표시) | `ChatPanel.css` |
| 4 | `d4cf3e2f` | PC 데이터 영역 텍스트 선택 허용 (user-select: text) | `responsive.css` |
| 5 | `ff349c3d` | InitialFilterBar 모바일 터치 타겟 확대 (30→36px + 44px hitbox) | `InitialFilterBar.css` |
| 6 | `2bb307ae` | 연락처 입력 inputMode 속성 추가 (모바일 키보드 최적화) | `ContactSection.tsx` |

---

## 디바이스별 영향 범위

| # | 개선 항목 | PC (마우스) | iPad | iPhone | Android |
|---|----------|:-----------:|:----:|:------:|:-------:|
| 1 | Tooltip 터치 지원 | - | O | O | O |
| 2 | 뒤로가기 모달 닫기 | - | - | - | O |
| 3 | 삭제 버튼 터치 접근성 | - | O | O | O |
| 4 | 텍스트 선택 허용 | O | - | - | - |
| 5 | InitialFilterBar 터치 타겟 | - | O | O | O |
| 6 | inputMode 키보드 최적화 | - | O | O | O |

### 판단 기준

- **`@media (pointer: coarse)`** → 터치 디바이스 전체 (iPad, iPhone, Android)
- **`@media (pointer: fine)`** → 마우스 기기 (PC)
- **`popstate` (뒤로가기)** → Android 전용 (iOS는 Safari 제스처가 별도 동작)
- **`inputMode`** → 가상 키보드가 있는 기기 (iPad, iPhone, Android)

---

## 제외 항목 (재검증 결과 개선 불필요)

| 항목 | 제외 사유 |
|------|----------|
| DocumentLibraryView 반응형 | 이미 768px/480px 미디어쿼리 + 카드 레이아웃 존재 |
| 고객등록 폼 375px 레이아웃 | 291px 입력 영역으로 충분히 사용 가능 |

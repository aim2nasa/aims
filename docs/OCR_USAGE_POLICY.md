# OCR 사용량 정책

> **최종 업데이트**: 2025-12-24
> **상태**: 구현 예정

## 개요

- **Upstage OCR**: 페이지 단위 과금 ($0.0015/페이지)
- **정책 목표**: Upstage 과금 방식과 일치하는 페이지 기반 제한

---

## 핵심 원칙

```
1. 단순함 > 복잡한 이중 제한
2. UX > 비용 최적화
3. Upstage 과금과 일치 → 투명성
4. 사전 체크 → 초과 방지
```

---

## 제한 기준

| 항목 | 정책 |
|------|------|
| **제한 단위** | 페이지 수 (월간) |
| **리셋 기준** | 가입 기념일 (KST) |
| **문서당 제한** | 없음 (Upstage 100p 제한 의존) |
| **표시 포맷** | `127p / 500p (23건)` |

### 월간 리셋 기준: 가입 기념일 (Anniversary)

```
예시: 6월 15일 가입 → 매월 15일 리셋 (KST 00:00)
- 1차 사이클: 6/15 ~ 7/14
- 2차 사이클: 7/15 ~ 8/14
```

- 31일 가입 → 2월은 28일(or 29일)에 리셋
- 시간대: KST (Asia/Seoul)

---

## Tier별 월간 페이지 한도

| Tier | 페이지 한도 | 예상 문서 수 (~5p 평균) | 월 비용 상한 |
|------|------------|------------------------|-------------|
| free_trial | **100** | ~20건 | $0.15 |
| standard | **500** | ~100건 | $0.75 |
| premium | **3,000** | ~600건 | $4.50 |
| vip | **10,000** | ~2,000건 | $15.00 |
| admin | **무제한** (-1) | - | - |

---

## OCR 대상 파일 및 페이지 수 산정

### OCR 대상
- meta 과정에서 텍스트 추출이 안 되는 파일만 OCR 수행
- 텍스트 기반 문서 (DOCX, TXT 등)는 meta에서 처리 → OCR 대상 아님

### 페이지 수 산정 (OCR 전 사전 파악)

| 파일 형식 | 페이지 수 | 방법 |
|----------|----------|------|
| 이미지 (JPG, PNG, BMP, GIF, WebP) | **1페이지** | MIME 타입 확인 → 고정값 |
| PDF | **가변** | `pdfjs-dist` (pdf.numPages) |
| TIFF | **가변** | `tiff` 라이브러리 (pageCount()) - **구현 필요** |

### 페이지 수 파악 도구

기존 도구 확장: `tools/mime_type_analyzer/file_analyzer.js`

```bash
node /home/rossi/aims/tools/mime_type_analyzer/file_analyzer.js <filePath>
# 출력: { "pdf_pages": 5, "mime": "application/pdf", ... }
```

- 서버 경로: `/home/rossi/aims/tools/mime_type_analyzer/file_analyzer.js`
- n8n OCRWorker에서 `executeCommand` 노드로 호출
- **TODO**: TIFF 다중 페이지 지원 추가 필요

---

## 한도 체크 흐름

### n8n OCRWorker 처리 순서

```
1. Redis Stream에서 OCR 요청 수신
2. file_analyzer.js 호출 → 페이지 수 파악
3. aims_api 한도 체크 API 호출
4. 허용 → OCR 수행 → 사용량 기록
   거부 → OCR 스킵 → 상태 업데이트
```

### 한도 체크 API

```
POST /api/internal/ocr/check-quota
Body: { owner_id, page_count }
Response: { allowed: true/false, current_usage, quota, remaining }
```

### 판단 기준

```javascript
if (현재_사용량 + 요청_페이지 <= 한도) {
  // ✅ OCR 허용
} else {
  // ❌ OCR 거부 (문서는 저장, OCR만 스킵)
}
```

---

## OCR 상태 정의

### files.ocr.status 값

| 상태 | 설명 |
|------|------|
| `pending` | OCR 대기 중 |
| `running` | OCR 처리 중 |
| `done` | OCR 완료 |
| `error` | OCR API 호출 실패 |
| `quota_exceeded` | 한도 초과로 스킵 |
| `parse_error` | 페이지 수 파악 실패 (기타) |
| `encrypted` | 암호화된 PDF |
| `corrupted` | 손상된 파일 |
| `unsupported` | 지원하지 않는 형식 |

### 사용량 증가 시점
- **OCR 완료 후** (`status = done`) `ocr.page_count` 값으로 사용량 증가
- 거부/실패 시 사용량 미증가

---

## 예시 시나리오

### 100페이지 한도, 6월 15일 가입

**초기 상태**: 한도 100p, 사용량 0p, 사이클 6/15~7/14

| 단계 | 이벤트 | 체크 로직 | 결과 | 사용량 |
|------|--------|----------|------|--------|
| 1 | 30p 문서 업로드 | `0 + 30 <= 100` ✅ | OCR 수행 | 30p |
| 2 | 50p 문서 업로드 | `30 + 50 <= 100` ✅ | OCR 수행 | 80p |
| 3 | 25p 문서 업로드 | `80 + 25 > 100` ❌ | OCR 거부 | 80p |
| 4 | 20p 문서 업로드 | `80 + 20 <= 100` ✅ | OCR 수행 | 100p |
| 5 | 1p 문서 업로드 | `100 + 1 > 100` ❌ | OCR 거부 | 100p |
| 6 | 7월 15일 (리셋) | 사용량 리셋 | - | 0p |
| 7 | 3p 문서 업로드 | `0 + 3 <= 100` ✅ | OCR 수행 | 3p |

### 차단 시 메시지

```
이번 사이클 OCR 한도(100페이지)를 초과합니다.
현재 사용량: 80페이지
요청 문서: 25페이지
한도 초과: 5페이지

문서는 저장되었으나 OCR 텍스트 추출은 수행되지 않았습니다.
사이클 리셋: 2025.07.15
```

---

## 동시성 처리

### 문제
동일 사용자가 동시에 여러 문서 업로드 시 Race Condition 발생 가능

### 해결책

1. **OCRWorker 단일 인스턴스**: 워커는 1개만 실행
2. **Redis Stream 순차 처리**: XREADGROUP으로 순차 처리 보장

---

## 에러 케이스 처리

### 에러 케이스별 상태

| 케이스 | OCR 상태 | 로그 |
|--------|----------|------|
| 암호화된 PDF | `encrypted` | `[OCR-SKIP] encrypted: {file_path}` |
| 손상된 파일 | `corrupted` | `[OCR-SKIP] corrupted: {file_path}` |
| 지원하지 않는 형식 | `unsupported` | `[OCR-SKIP] unsupported: {file_path}` |
| 기타 파싱 에러 | `parse_error` | `[OCR-SKIP] parse error: {file_path}, {error}` |
| 한도 초과 | `quota_exceeded` | `[OCR-SKIP] quota exceeded: {owner_id}, need {page_count}p` |
| OCR API 실패 | `error` | `[OCR-FAIL] api error: {file_path}, {error}` |

**원칙**: 페이지 수 파악 실패 = OCR 불가능 파일 → OCR 거부 (사용량 미차감)

---

## UI 표시

### UsageQuotaWidget (원형 차트)

```
OCR: 127p / 500p (23건)
     ↑       ↑     ↑
   사용량   한도  문서수(참고)
```

### 툴팁 상세 정보

```
OCR 사용량
━━━━━━━━━━━━━━━━━━━━
사용: 127페이지 (23건)
한도: 500페이지
남음: 373페이지 (74.6%)
━━━━━━━━━━━━━━━━━━━━
사이클: 12/15 ~ 01/14
리셋까지: 22일
```

### 경고 레벨

| 사용률 | 레벨 | 색상 |
|--------|------|------|
| 0-79% | Normal | 기본 |
| 80-94% | Warning | 주황 |
| 95%+ | Danger | 빨강 |

---

## 데이터 모델

### users 컬렉션 추가 필드

```javascript
{
  // 기존 필드...
  subscription_start_date: ISODate("2025-06-15"),  // 가입일 (리셋 기준)
}
```

### Tier 정의 (storageQuotaService.js)

```javascript
const DEFAULT_TIER_DEFINITIONS = {
  free_trial: { ocr_page_quota: 100 },
  standard: { ocr_page_quota: 500 },
  premium: { ocr_page_quota: 3000 },
  vip: { ocr_page_quota: 10000 },
  admin: { ocr_page_quota: -1 },  // 무제한
}
```

### API 응답 (GET /api/users/me/storage)

```javascript
{
  ocr_page_quota: 500,        // 페이지 한도
  ocr_pages_used: 127,        // 사용 페이지 수
  ocr_docs_count: 23,         // 문서 수 (참고용)
  ocr_is_unlimited: false,    // 무제한 여부
  ocr_cycle_start: "2025-12-15",  // 현재 사이클 시작
  ocr_cycle_end: "2026-01-14",    // 현재 사이클 종료
}
```

---

## 구현 위치

| 파일 | 역할 |
|------|------|
| `tools/mime_type_analyzer/file_analyzer.js` | 페이지 수 파악 (PDF, TIFF 추가 필요) |
| `backend/api/aims_api/lib/storageQuotaService.js` | Tier 정의, 사용량 계산, 사이클 계산 |
| `backend/api/aims_api/routes/ocr-usage-routes.js` | 한도 체크 API |
| `backend/n8n_flows/modules/OCRWorker.json` | 사전 페이지 수 체크 + OCR 실행 |
| `frontend/aims-uix3/src/shared/ui/UsageQuotaWidget/` | UI 표시 |
| `frontend/aims-admin/src/pages/TierManagementPage/` | 관리자 설정 |

---

## 구현 체크리스트

- [x] file_analyzer.js에 TIFF 다중 페이지 지원 추가
- [x] users.subscription_start_date 필드 추가 (마이그레이션)
- [x] storageQuotaService.js에 사이클 계산 함수 추가
- [x] check-quota API 구현
- [x] OCRWorker에 페이지 수 체크 노드 추가
- [x] 프론트엔드 사이클 정보 표시

> 구현 완료: 2025-12-24

# Upstage OCR 데이터 프라이버시 정책

> 조사일: 2026-02-21

## 핵심 요약

Upstage API 이용약관(Article 22)에 따라, **API를 통한 입출력 데이터는 저장되지 않으며 AI 모델 학습에 사용되지 않습니다.** 별도의 opt-out 토글이나 API 파라미터 없이 기본 정책으로 적용됩니다.

> "The Company does not store input/output data via APIs and does not use it for service research and development or AI model training."

---

## 1. 데이터 저장 및 학습 정책

| 구분 | 데이터 저장 | 모델 학습 사용 |
|------|-------------|----------------|
| **동기 API** (AIMS 사용 중) | 저장하지 않음 | 사용하지 않음 |
| **비동기 API** | 입력: 추론 완료까지 최대 3일 임시 저장 / 출력: 완료 후 30일 저장 | 사용하지 않음 |
| **Console Playground** | 저장됨 | **서비스 개선 및 AI R&D에 사용될 수 있음** |

AIMS에서 사용하는 동기 API(`/v1/document-digitization`)는 데이터가 Upstage 서버에 저장되지 않으며, 모델 학습에도 사용되지 않습니다.

---

## 2. 보안 인증

| 인증 | 대상 |
|------|------|
| SOC 2 | API 서비스 |
| HIPAA | AWS 배포 환경 |
| ISO/IEC 27001 | 정보보안 관리체계 |
| ISO/IEC 27701 | 개인정보 관리체계 |

---

## 3. 엔터프라이즈 배포 옵션

| 옵션 | 설명 |
|------|------|
| **Public API** | 데이터 비저장/비학습 정책 기본 적용 |
| **Private Cloud** | 고객의 보안 환경 내에서 데이터 격리 |
| **On-Premise** | 인프라 및 데이터에 대한 완전한 통제권 확보 |

---

## 4. API 파라미터 수준의 프라이버시 설정

현재 Upstage Document Parse API에는 OpenAI의 `store: false`나 Anthropic의 Zero Data Retention 같은 **API 파라미터 수준의 프라이버시 토글은 존재하지 않습니다.** API 사용 시 비저장/비학습이 기본 정책이므로 별도 설정이 불필요합니다.

---

## 5. AIMS 현재 사용 현황

- **엔드포인트**: `api.upstage.ai/v1/document-digitization` (API 전용, 브라우저 접속 불가)
- **모델**: `document-parse-nightly` (enhanced 모드)
- **호출 방식**: 동기 API
- **데이터 보호 상태**: 비저장/비학습 정책 자동 적용, 별도 설정 불필요

---

## 참조

### 핵심 근거 (API 데이터 비저장/비학습 정책)

- [Upstage 이용약관 — Article 22: Member-Input Data](https://www.upstage.ai/terms-of-service)
  > Section 4: "The Company does not store input/output data via APIs and does not use it for service research and development or AI model training."
  > (2026-01-27 시행)

### 개인정보 처리방침 (비동기 API 보존 기간 등)

- [Upstage Privacy Policy (2025-12-12)](https://www.upstage.ai/privacy-policy/updated-dec-12-2025)
- [Upstage Privacy Policy (2025-03-07)](https://www.upstage.ai/privacy-policy/updated-mar-07-2025)

### API 레퍼런스

- [Document Parse API Reference](https://console.upstage.ai/api/document-digitization/document-parsing)

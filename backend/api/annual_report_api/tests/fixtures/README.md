# AR 파서 테스트 픽스처

이 폴더는 AR(Annual Report) 파서 테스트에 사용되는 PDF 픽스처를 보관합니다.
파일 종류는 두 가지로 나뉩니다.

1. **실제 PDF (Integration 테스트용, git 제외)**
2. **합성 PDF (단위 테스트용, 런타임 생성)** — `synth_pdf.py`

---

## 1. 실제 PDF 픽스처 (git 제외)

### 목적

Phase 4.5 Integration 테스트에서 실제 Upstage Document AI 응답과 본질 로직의
정합성을 검증하기 위해 사용합니다. 단위 테스트는 이 파일이 없어도 전부 통과해야 합니다.

### PII 보호 정책

- 이 PDF들은 **실제 고객 PII를 포함**합니다. `.gitignore`에 등록되어 git에 절대
  커밋되지 않습니다.
- 파일명은 원본(고객명) 대신 **컨텐츠 유형 기반의 익명 이름**을 사용합니다.
  AIMS의 SUPREME RULE: "파일명으로 AR/CRS 판단 금지" 원칙상 파서는 파일명에
  의존하지 않으므로, 익명 파일명으로도 동작에 영향이 없습니다.
- Integration 테스트 로그는 증권번호/주민번호 등을 마스킹한 상태로만 출력합니다.

### 파일 목록

| 익명 파일명 | 타입 | 페이지 | 텍스트 추출량 | 비고 |
|---|---|---|---|---|
| `text_ar_sample_with_cover.pdf` | 텍스트 AR (표지 있음) | 28 | 36,913 chars | pdfplumber로 파싱 가능 |
| `image_ar_sample_1.pdf` | 이미지 AR (텍스트 레이어 없음) | 1 | 0 chars | Upstage 강제 라우팅 대상 |
| `image_ar_sample_2.pdf` | 이미지 AR (텍스트 레이어 없음) | 1 | 0 chars | Upstage 강제 라우팅 대상 |

### 원본 파일 매핑 (tars dev 내부)

> 매핑은 MongoDB `docupload.files._id` 로만 기록합니다 (원본 고객명 미기재).
> 실제 원본 파일명이 필요하면 이슈 #57 내부 코멘트 또는 tars DB를 직접 조회하세요.

- `text_ar_sample_with_cover.pdf`
  - MongoDB `files._id`: `69c3c3af6987b9bd097e986e`
  - tars 경로: `/data/files/users/69875e2b4c2149195032adc6/2026/03/260325201456_ff05b875.pdf`
  - 유형: 텍스트 레이어 있는 annual report (표지 + 계약 현황)

- `image_ar_sample_1.pdf`
  - MongoDB `files._id`: `69b7a7cbda077bc42dd00794`
  - tars 경로: `/data/files/users/69875e2b4c2149195032adc6/2026/03/260316154844_054f74be.pdf`
  - 유형: 이미지 PDF (보유계약현황, 텍스트 레이어 0자)

- `image_ar_sample_2.pdf`
  - MongoDB `files._id`: `69b7a7c4da077bc42dd006ce`
  - tars 경로: `/data/files/users/69875e2b4c2149195032adc6/2026/03/260316154837_75b2d35d.pdf`
  - 유형: 이미지 PDF (보유계약현황, 텍스트 레이어 0자)

### 다운로드 절차 (tars dev에서)

새 개발자가 Integration 테스트를 돌리고 싶을 때는 다음 절차를 따릅니다:

```bash
# 1. tars 접속 가능 확인 (Tailscale IP)
ssh rossi@100.110.215.65 "hostname"

# 2. 픽스처 다운로드 (3개 파일)
TARS_USER_DIR=/data/files/users/69875e2b4c2149195032adc6

scp rossi@100.110.215.65:${TARS_USER_DIR}/2026/03/260325201456_ff05b875.pdf \
    backend/api/annual_report_api/tests/fixtures/text_ar_sample_with_cover.pdf

scp rossi@100.110.215.65:${TARS_USER_DIR}/2026/03/260316154844_054f74be.pdf \
    backend/api/annual_report_api/tests/fixtures/image_ar_sample_1.pdf

scp rossi@100.110.215.65:${TARS_USER_DIR}/2026/03/260316154837_75b2d35d.pdf \
    backend/api/annual_report_api/tests/fixtures/image_ar_sample_2.pdf
```

### Integration 테스트 실행

```bash
cd backend/api/annual_report_api

# 기본 실행 (integration 제외) — CI/로컬 기본
pytest -m "not integration"

# Integration 포함 — 실제 Upstage API 호출 발생 (비용!)
#   UPSTAGE_API_KEY 필요 (.env.shared에서 자동 로드)
pytest -m integration
```

Integration 테스트는 다음 조건에서 자동 skip 됩니다:

- `UPSTAGE_API_KEY` 환경변수가 없음
- 실제 픽스처 파일이 존재하지 않음

---

## 2. 합성 PDF 픽스처 (`synth_pdf.py`)

단위 테스트(Phase 4.5 1~6번)는 `synth_pdf.py` 유틸로 런타임에 가상 PDF를
생성합니다. 이 방식은 PII가 없고, 결정적이며, CI에서 항상 재현 가능합니다.

### 제공 함수

- `make_text_ar_pdf(path, contracts=..., total_premium=...)`
  → reportlab으로 텍스트 레이어가 있는 가상 AR PDF 생성
  → pdfplumber로 텍스트/표 추출 가능
- `make_image_only_pdf(path, width=600, height=800)`
  → PIL로 이미지 한 장을 그려 reportlab으로 PDF에 삽입
  → 텍스트 레이어 0자 → `is_image_pdf()` 판정 대상

### 사용 예시

```python
from tests.fixtures.synth_pdf import make_text_ar_pdf, make_image_only_pdf

def test_something(tmp_path):
    text_pdf = tmp_path / "text.pdf"
    make_text_ar_pdf(str(text_pdf))
    # ...

    img_pdf = tmp_path / "image.pdf"
    make_image_only_pdf(str(img_pdf))
    # ...
```

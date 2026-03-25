# 문서 일괄등록 테스트 중 발견된 이슈 분석

| 항목 | 내용 |
|------|------|
| 일시 | 2026.03.25 14:26 ~ 15:39 |
| 환경 | Production (aims.giize.com) |
| 테스트 목적 | **xPipe 통합 후 첫 대량 파일 처리 검증** |
| 테스트 데이터 | 캐치업코리아 고객 문서 일괄등록 388건 |
| 분석자 | Claude |
| 리뷰 | Alex (설계/구현), Gini (품질 검증) — 독립 리뷰 완료 |

---

## TOP PRIORITY: xPipe가 prod에서 전혀 동작하지 않음

> **이번 테스트의 핵심 목적은 xPipe 통합 후 대량 파일 처리 검증이었다.**
> 결과: xPipe는 403건 중 **단 한 건도 성공하지 못했다.** 전량 legacy fallback으로 처리됨.
> **이 상태가 계속되면 xPipe는 아무 의미가 없다.** 최우선 수정 대상.

→ 상세: [ISSUE-2](#issue-2-xpipe-전량-실패--legacy-fallback-의존-심각도-critical)

---

## ISSUE-1: displayName AI 분류 오류 (심각도: High)

### 현상

OCR 후 AI가 생성한 displayName이 원본 파일의 내용과 다른 문서/인물로 분류된 사례 확인.

| 원본 파일명 | AI displayName | 문제 |
|------------|---------------|------|
| `안영미백병원보험금청구서.pdf` | `안희정 자동차운전면허증 2032.01.pdf` | 인물(안영미→안희정), 문서유형(보험금청구서→운전면허증) 변경 |
| `안영미백병원보험금청구서1.pdf` | `[정보성] 삼성화재 보험금 청구서 2025.03.pdf` | 고객명 누락, 계약자명(정보성)이 대표명으로 노출 |
| `캐치업직원보험청구시필요서류.pdf` | `[캐치업코리아] 법인등기부등본 2023.08.pdf` | 문서유형 완전 불일치 |
| `유아영신분증1.jpg` | `[캐치업코리아] 자동차운전면허증.jpg` | 인물명 누락 |

### DB 증거

```
_id: 69c372527eecbb166ff77ba1
upload.originalName: 캐치업코리아/김보성,안영미/안영미/안영미백병원보험금청구서.pdf
displayName: 안희정 자동차운전면허증 2032.01.pdf

_id: 69c372527eecbb166ff77ba4
upload.originalName: 캐치업코리아/김보성,안영미/안영미/안영미백병원보험금청구서1.pdf
displayName: [정보성] 삼성화재 보험금 청구서 2025.03.pdf
```

### 추정 원인

1. 보험금 청구서 PDF에 운전면허증 사본 등 첨부 서류가 합쳐져 있는 것이 보험업계 표준. AI가 첨부 문서를 주 문서로 오인했을 가능성
2. displayName 프롬프트가 복합 문서(청구서+첨부서류)에서 "주된 내용"을 식별하는 데 취약
3. **주의**: 실제 PDF 내용을 확인하지 않은 상태이므로 AI가 맞을 수도 있음 (PDF 내부에 해당 문서가 실제 포함된 경우)

### 영향

- 사용자가 별칭 모드에서 문서를 검색할 때 혼란 유발
- 원본 파일명은 보존되므로 원본 모드에서는 영향 없음

### Alex 리뷰 의견
- **부분동의 (Medium 권고)**: 실제 PDF 내용 확인 없이 "오류"로 단정 불가. displayName은 사용자가 수동 변경 가능한 보조 정보.

### Gini 리뷰 의견
- **부분동의 (High 유지)**: 14시대 OCR displayName 158건 중 의심 사례 다수. 2건만 보고하고 전수조사를 TO-DO로 남긴 것은 불완전.

### 분석 요청

- [ ] 실제 PDF 내용 확인 (AI 분류가 정말 오류인지 검증)
- [ ] 158건 OCR displayName 전수 조사 — 오분류 비율 파악
- [ ] 복합 문서(청구서+첨부서류) 처리 전략 검토

---

## ISSUE-2: xPipe 전량 실패 — legacy fallback 의존 (심각도: CRITICAL)

### 현상

이번 테스트의 모든 파일 처리가 xPipe 실패 → legacy fallback 경로로 처리됨. xPipe가 prod에서 동작하지 않는 상태.

### 수치

| 유형 | 이번 테스트(14시) | 하루 전체 누적 |
|------|:---------------:|:------------:|
| xPipe 실패 총 건수 | **403건** | 945건 |
| 원인: FileNotFoundError | **403건** (100%) | 888건 |
| 원인: UPSTAGE_API_KEY 미설정 | **0건** | 57건 (02시/11시 발생, 이번 테스트 무관) |

> **수치 정정**: 초기 보고서에서 945건으로 기재했으나, 이는 2026-03-25 하루 전체 로그 누적치. 이번 테스트(14시대, ownerId `695cfe26...`)에서 발생한 건수는 **403건**.

### 근본 원인: FileNotFoundError

```
FileNotFoundError: [Errno 2] No such file or directory:
  '/tmp/tmp5g1cik9p/캐치업코리아/김보성,안영미/안영미/안영미백병원보험금청구서1.pdf'
```

`doc_prep_main.py:2065`에서 `os.path.join(tmp_dir, original_name)`으로 임시 파일을 저장하려 하지만, 일괄등록 시 `original_name`이 `캐치업코리아/김보성,안영미/안영미/파일.pdf` 같은 경로 구조를 포함. 중간 디렉토리가 미생성 상태에서 `open()`을 호출하여 `FileNotFoundError` 발생.

### 참고: UPSTAGE_API_KEY 미설정 (이번 테스트 무관)

57건은 새벽 02시(4건), 오전 11시(53건)에 발생. xPipe ExtractStage에서 `os.environ.get("UPSTAGE_API_KEY", "")`가 빈 문자열을 반환. `.env.shared` 로드 누락 또는 xPipe context 주입 경로 문제.

### 영향

- xPipe 파이프라인이 prod에서 전혀 동작하지 않는 상태
- 모든 처리가 legacy fallback에 의존 — **결과적으로 모든 문서는 정상 처리됨**
- legacy fallback이 안전장치로 의도대로 작동한 것이므로, 사용자 영향은 없음
- 단, xPipe 도입 효과(성능, 모듈화) 미달성

### Alex 리뷰 의견
- **동의 (High)**: 버그 확인. `os.makedirs(os.path.dirname(tmp_path), exist_ok=True)` 추가 또는 `os.path.basename(original_name)` 사용으로 수정 가능. 다만 이 tmp_path가 xPipe context에서 참조되지 않으므로 dead code 가능성도 있음.

### Gini 리뷰 의견
- **부분동의 (High)**: 핵심 사실은 맞으나, 초기 보고서의 수치(945건)와 원인 분류(UPSTAGE 57건)가 시점 필터 없이 집계되어 부정확했음.

### 분석 요청

- [ ] `doc_prep_main.py:2065` tmp_path 생성 로직 수정 (makedirs 또는 basename)
- [ ] 이 tmp_path가 xPipe context에서 실제 사용되는지 확인 (dead code 여부)
- [ ] UPSTAGE_API_KEY 환경변수 로드 경로 확인 (별도 이슈)

---

## ISSUE-3: 중복 파일 자동 삭제 — 사용자 알림 부재 (심각도: Low)

> **수정**: 초기 보고서에서 "파일 6건 소실"로 기재했으나, Alex/Gini 리뷰 결과 **중복 해시 감지에 의한 정상 삭제**로 확인됨. "소실"은 부적절한 표현.

### 현상

업로드 직후 캐치업코리아 394건 → 최종 완료 시 388건. 약 6~8건 감소.

### 원인

`doc_prep_main.py:1455-1488`의 **중복 파일 해시 처리 로직**에 의한 정상 동작:
- 동일 SHA-256 해시의 파일이 이미 존재할 경우 고아 문서 삭제
- DuplicateKeyError 발생 시 중복 레코드 cleanup

13시 테스트(youmi 계정)에서 동일 파일이 이미 등록되었기 때문에, 14시 테스트에서 해시 중복으로 삭제된 것으로 추정.

### 수치 참고

- 초기 보고서: 6건 감소
- Gini 검증: 로그상 14시대 중복 삭제 **8건**, 수치 차이는 count 조회 시점의 비동기성에 기인

### 영향

- 중복 제거 자체는 **정상 동작**
- 단, 어떤 파일이 중복으로 제거되었는지 사용자에게 명시적 알림 부재 (UX 개선 여지)

### Alex 리뷰 의견
- **반대 (소실 아님)**: DuplicateKeyError 시 SSE 알림(`"동일한 파일이 이미 등록되어 있습니다."`)이 전송됨. 중복 삭제는 정상 동작.

### Gini 리뷰 의견
- **반대 (수치 오분석)**: 실제 8건 삭제, "소실" 표현 부적절. 의도된 로직 동작이므로 Low가 적절.

---

## ISSUE-4: HWP 변환 병목 (심각도: Low)

### 현상

HWP 파일 변환 시 pdf_converter 서비스에서 60초 타임아웃 발생. PDF 변환 워커가 `concurrency=1`로 순차 처리.

### 로그 증거

```
14:38:16 - [PDF변환워커] 실패: 69c373f0df3997b79712db29 (260325143440_4d8c1fb1.hwp)
           retry 0/2 - 변환 실패 (HTTP 500):
           {"success":false,"error":"HWP 변환 타임아웃 - 파일이 너무 크거나 복잡합니다","duration":60043}
14:38:16 - [PDF변환워커] 5.0s 후 재시도 예약
14:39:24 - [PDF변환워커] 처리 시작: 69c373f0df3997b79712db29 (260325143440_4d8c1fb1.hwp)  ← 재시도
```

### 수치

| 항목 | 값 |
|------|---|
| HWP 타임아웃 발생 | **4건** (14시대), 5건(하루 전체) |
| 타임아웃 시간 | 60초 |
| 재시도 최대 | 2회 |

### 아키텍처 참고 (Alex 분석)

Upload Worker, PDF Conversion Worker, OCR Worker는 **독립적으로 동작**:
- Upload Worker: 다중 병렬 처리 (max_concurrent=3)
- PDF Conversion Worker: `concurrency=1` — **HWP/DOC 변환만 전담**
- OCR Worker: Redis Stream 기반 별도 워커

**HWP 변환 타임아웃은 같은 PDF 변환 큐 내의 다른 HWP/DOC 파일만 지연시키며, Upload Worker나 OCR Worker를 blocking하지 않음.**

### Alex 리뷰 의견
- **부분동의 (Low 권고)**: concurrency=1은 pdf_converter 서비스 부하 방지를 위한 의도적 설계. 워커간 blocking 없음. 5건 타임아웃은 대규모 배치에서 예상 가능한 수준.

### Gini 리뷰 의견
- **동의 (Medium)**: 원인 분석 정확. 단, 5건은 하루 전체이며 14시대는 4건.

---

## 요약

| # | 이슈 | 심각도 | Alex | Gini | 비고 |
|---|------|:------:|:----:|:----:|------|
| **2** | **xPipe 전량 실패, legacy fallback 의존** | **CRITICAL** | 동의 | 부분동의 | **TOP PRIORITY — xPipe 존재 의의 상실** |
| 1 | displayName AI 분류 오류 | High | 부분동의 | 부분동의 | PDF 미확인, 전수조사 필요 |
| 3 | 중복 파일 자동 삭제 — 알림 부재 | Low | 반대 | 반대 | 정상 동작 |
| 4 | HWP 변환 병목 | Low | 부분동의 | 동의 | 의도적 설계 |

### 리뷰에서 보정된 사항

1. **ISSUE-2 수치**: 945건 → 이번 테스트 403건 (하루 누적과 혼동), UPSTAGE 57건은 이번 테스트 무관
2. **ISSUE-3 성격**: "파일 소실" → "중복 해시 감지에 의한 정상 삭제", 심각도 Medium → Low
3. **ISSUE-4 영향**: "전체 파이프라인 정체" → "PDF 변환 큐 내부만 영향, 다른 워커 blocking 없음"
4. **ISSUE-1 주의**: 실제 PDF 내용 미확인 상태에서 AI 오류로 단정 보류, 전수 조사 필요

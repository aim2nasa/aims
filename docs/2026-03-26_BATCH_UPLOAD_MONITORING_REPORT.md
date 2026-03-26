# 캐치업코리아 문서 일괄등록 모니터링 보고서

> 작성일: 2026-03-26 17:45 KST
> 고객: 캐치업코리아 (법인, ID: `698f3ed781123c52a305ab1d`)
> 모니터링 시간: 16:58 ~ 17:45 KST (약 47분)

---

## 1. 업로드 요약

| 항목 | 값 |
|------|-----|
| 총 파일 | 393개 성공 + 53개 중복 건너뜀 |
| 폴더 수 | 1개 |
| 소요 시간 | 5분 20초 |
| DB 기록 건수 | 391건 (UI 393과 2건 차이) |

### 최종 처리 현황 (18:00 기준)

| 상태 | 건수 | 비율 |
|------|------|------|
| completed | 380 | 97.2% |
| processing (멈춤) | 11 | 2.8% |
| **합계** | **391** | 100% |

멈춘 11건은 모두 `progress: 40` / "텍스트 추출 중" 단계에서 정지.
self-healing이 error→processing으로 되돌리지만, 재처리해도 같은 이유로 다시 실패하여 **processing↔error를 반복**하는 상태.

---

## 2. 상태 정의 참조

문서 처리 상태(overallStatus)의 12단계 세분화 정의는 별도 문서 참조:
**→ [DOCUMENT_STATUS_DEFINITION.md](DOCUMENT_STATUS_DEFINITION.md)**

핵심만 요약하면:
- `completed` = **임베딩까지 전부 완료.** AI 검색 가능 상태
- `embed_pending` = 텍스트 처리 끝남, 임베딩 크론 대기 중 (아직 completed 아님)
- `processing` = 레거시 호환용 (12단계 세분화 이전 데이터)

---

## 3. 모니터링 타임라인

### Phase 1: 업로드 진행 (16:58 ~ 17:05)

```
16:58  총  60건 │ completed 14 │ pending  44 │ processing  0
16:59  총 108건 │ completed 12 │ pending  84 │ processing  9
17:00  총 196건 │ completed 13 │ pending 162 │ processing 18 │ credit_pending 1
17:02  총 306건 │ completed 45 │ pending 265 │ processing  7
17:05  총 362건 │ completed 45 │ pending 315 │ processing  7
```

- 업로드 속도: 분당 약 60~90건
- 17:05경 362건에서 업로드 속도 급감, 이후 소량 추가

### Phase 2: 업로드 완료 + 처리 진행 (17:05 ~ 17:20)

```
17:14  총 391건 │ completed  46 │ pending 335 │ processing  7
17:16  총 391건 │ completed  45 │ pending 328 │ processing 15
17:20  총 391건 │ completed  45 │ pending 313 │ processing 29
```

- UI 표시: 393개 성공, 53개 중복 건너뜀, 5분 20초 소요
- pending→processing 전환 꾸준히 진행

### Phase 3: 파이프라인 가속 (17:21 ~ 17:30)

```
17:21  총 391건 │ completed  44 │ pending 209 │ processing 134  ← 대량 픽업!
17:30  총 391건 │ completed 109 │ pending 178 │ processing  99  ← 대량 완료!
```

- 17:21에 processing이 29→134로 폭발적 증가 (워커가 대량 픽업)
- 17:30에 completed가 46→109로 63건 한번에 완료

### Phase 4: 수렴 (17:30 ~ 17:45)

```
17:34  총 391건 │ completed 110 │ pending 172 │ processing 106
17:39  총 391건 │ completed 194 │ pending   0 │ processing 193 ← pending 소진!
17:41  총 391건 │ completed 250 │ processing 136 │ error 4
17:45  총 391건 │ completed 276 │ processing 109 │ error 6
```

- 17:39에 pending 완전 소진 — 모든 문서가 processing 이상 단계 진입
- 이후 completed가 빠르게 증가하는 추세

---

## 4. 발견된 이슈

### 이슈 #1: completed 수가 일시적으로 감소하는 현상

**심각도**: 중

**관찰**:
모니터링 중 completed 수가 증가하다가 갑자기 1~2건 줄어드는 현상이 4회 이상 발생했다.

| 시각 | completed | 변화 |
|------|-----------|------|
| 16:58 | 14 | - |
| 16:59 | 12 | **-2** |
| 17:03 | 16 | +4 |
| 17:04 | 14 | **-2** |
| 17:10 | 45 | +31 |
| 17:12 | 43 | **-2** |
| 17:17 | 43 | - |
| 17:29 | 46 | +3 |
| 17:30 | 109 | +63 |

**문제점**:
12단계 세분화 설계에 따르면 `completed`는 "임베딩까지 완료"된 최종 상태다.
최종 상태인 문서가 다시 다른 상태로 돌아간다는 것은 **어딘가에서 completed 문서의 overallStatus를 덮어쓰는 코드 경로가 있다**는 뜻이다.

**가능한 원인**:
- full_pipeline.py self-healing 로직이 completed 문서를 재처리 대상으로 잘못 판정
- 또는 다른 서비스(AR/CRS 스캐너 등)가 관할권 원칙을 위반하고 overallStatus를 변경

**추가 조사 필요**: completed → 다른 상태로 전이되는 정확한 코드 경로 파악

---

### 이슈 #2: UI 카운트(393)와 DB 카운트(391) 불일치

**심각도**: 낮음

**관찰**:
- UI "업로드 완료" 화면: **393개** 성공
- DB `files` 컬렉션 실제 문서 수: **391건**
- 차이: 2건

**가능한 원인**:
- 중복 감지 로직의 카운팅 경계 판정 차이
- 업로드 중 일시적 실패 후 재시도 시 카운트만 증가하고 실제 DB insert는 안 된 경우

---

### 이슈 #3: 미지원 파일 형식 에러 (4건)

**심각도**: 낮음 (예상된 동작이지만 UX 개선 여지 있음)

| # | 파일명 | 형식 | 에러 |
|---|--------|------|------|
| 1 | 서울중앙 2019가합585938 김보성.zip | ZIP | 텍스트 추출 불가 (unknown) |
| 2 | 캐치업코리아-고객거래확인서,FATCA확인서.zip | ZIP | 텍스트 추출 불가 (unknown) |
| 3 | 캐치업코리아 요청자료.zip | ZIP | 텍스트 추출 불가 (unknown) |
| 4 | 캐치업포멧.ai | AI | 텍스트 추출 불가 (unknown) |

**개선 제안**: ZIP/AI 등 미지원 파일은 에러 대신 "보관 전용"으로 completed 처리하는 것이 사용자 경험에 유리. 또는 업로드 단계에서 미리 안내.

---

### 이슈 #4: PPT 이미지 변환 후 텍스트 추출 실패 (1건)

**심각도**: 중

**에러 파일**: `안영미신분증.ppt`
**처리 방식**: `libreoffice+pdfplumber`
**에러**: LibreOffice로 PDF 변환은 성공했으나 텍스트가 0자

**문제**: PPT 안에 이미지만 있는 경우, 변환된 PDF에서 pdfplumber가 텍스트를 찾지 못한다. 이때 OCR로 fallback해야 하는데, 현재는 에러로 처리된다.

**개선 제안**: 이미지 기반 PPT에 대한 OCR fallback 로직 추가

---

### 이슈 #5: JPG OCR 실패 (1건)

**심각도**: 중

**에러 파일**: `암검진067.jpg`
**처리 방식**: `ocr`
**에러**: OCR 시도했으나 텍스트 추출 결과 0자

**가능한 원인**: 이미지 품질 문제 (낮은 해상도, 기울어짐, 스캔 불량 등)

**개선 제안**: OCR 결과가 빈 텍스트일 때 "에러"가 아닌 "텍스트 없음(보관 전용)"으로 처리 검토. 사용자에게 "이 파일은 AI 검색에 포함되지 않습니다" 안내가 에러 표시보다 유용.

---

### 이슈 #6: processing 병목 (배치 완료 패턴)

**심각도**: 정보 (동작 자체는 정상)

**관찰**:
- pending→processing 전환은 빠르지만, processing→completed 전환이 느림
- processing에 최대 179건이 누적된 상태에서 completed는 분당 ~1건만 증가
- 일정 시간 후 수십 건이 한꺼번에 completed로 전환 (배치 패턴)

**원인**: AI 분류/요약 API 호출(gpt-4o-mini)이 병목. 동시 처리 제한 또는 rate limit로 인해 processing에서 오래 머묾. 처리 완료 시 배치 단위로 다음 단계로 넘어감.

**영향**: 사용자가 "processing이 왜 안 줄어들지?" 혼란 가능. 하지만 결국 처리됨.

---

### 이슈 #7: credit_pending 일시 발생 후 자동 해소

**심각도**: 정보 (정상 동작 확인)

**관찰**: OCR 크레딧 부족으로 `credit_pending` 1건 발생 → full_pipeline.py 크론이 크레딧 재확인 후 자동 재처리하여 해소.

**결론**: self-healing 로직 정상 작동 확인됨.

---

### 이슈 #8: document_pipeline 메모리 1.1GB

**심각도**: 주의

**관찰**: PM2에서 `document_pipeline` 프로세스 메모리 1.1GB (12분 전 재시작된 상태).

**원인 추정**: 391건 동시 업로드로 인한 메모리 급증. 대량 업로드 시 메모리 관리 점검 필요.

---

### 이슈 #9: 멈춘 문서 11건 — progress 40%에서 영구 정지

**심각도**: 중

**관찰**:
처리 완료 후 UI에서 11건이 "40%" 상태로 표시되며 더 이상 진행되지 않음.
DB에서 확인하면 `overallStatus: processing/error` (반복), `progress: 40`, `progressMessage: "텍스트 추출 중"`.

**40%의 의미**: 파이프라인에서 `extracting`(텍스트 추출) 단계가 전체 진행률의 40% 지점.
이 단계에서 텍스트를 추출하지 못하면 분류→임베딩으로 진행이 불가능하여 영구 정지.

**self-healing 무한 루프**: full_pipeline.py 크론이 error를 processing으로 되돌려 재시도하지만,
동일한 이유로 다시 실패 → processing↔error 반복. 사용자에게는 40%에서 멈춘 것으로 보임.

**11건 전체 목록**:

| # | 파일명 | 형식 | 추출 방식 | 실패 원인 |
|---|--------|------|-----------|-----------|
| 1 | 서울중앙 2019가합585938 김보성.zip | ZIP | unknown | 아카이브 — 텍스트 추출 불가 |
| 2 | 캐치업코리아-고객거래확인서,FATCA확인서.zip | ZIP | unknown | 아카이브 — 텍스트 추출 불가 |
| 3 | 캐치업코리아 요청자료.zip | ZIP | unknown | 아카이브 — 텍스트 추출 불가 |
| 4 | 캐치업코리아노무규정.zip | ZIP | unknown | 아카이브 — 텍스트 추출 불가 |
| 5 | 2018컨설팅자료.zip | ZIP | unknown | 아카이브 — 텍스트 추출 불가 |
| 6 | 캐치업코리아 표준취업규칙(최종).hwp | HWP | libreoffice+pdfplumber | PDF 변환 성공, 텍스트 0자 (이미지 HWP) |
| 7 | 20130409_121226표준취업규칙(최종).hwp | HWP | libreoffice+pdfplumber | PDF 변환 성공, 텍스트 0자 (이미지 HWP) |
| 8 | 표준취업규칙(최종).hwp | HWP | libreoffice+pdfplumber | PDF 변환 성공, 텍스트 0자 (이미지 HWP) |
| 9 | 캐치업포멧.ai | AI | unknown | 디자인 파일 — 텍스트 추출 불가 |
| 10 | 안영미신분증.ppt | PPT | libreoffice+pdfplumber | PDF 변환 성공, 텍스트 0자 (이미지 PPT) |
| 11 | 암검진067.jpg | JPG | ocr | OCR 시도했으나 텍스트 0자 (인식 실패) |

**분류별 요약**:

| 유형 | 건수 | 상세 |
|------|------|------|
| ZIP (아카이브) | 5건 | 텍스트 추출 자체가 불가능 |
| HWP (이미지 기반) | 3건 | LibreOffice가 PDF로 변환했지만 텍스트 없음, OCR fallback 없음 |
| PPT (이미지 기반) | 1건 | 위와 동일 |
| AI (디자인 파일) | 1건 | Adobe Illustrator — 텍스트 추출 불가능 |
| JPG (OCR 실패) | 1건 | OCR 시도했으나 인식 실패 |

**개선 제안**:
1. **ZIP/AI**: 텍스트 추출이 원천적으로 불가능한 파일은 error가 아닌 "보관 전용(completed)"으로 처리. self-healing 무한 루프 방지
2. **이미지 기반 HWP/PPT**: LibreOffice 변환 후 텍스트 0자이면 OCR fallback 로직 추가
3. **OCR 빈 결과**: 에러 대신 "텍스트 없음" 상태로 completed 처리
4. **self-healing 무한 루프 방지**: 동일 에러로 N회 이상 재시도한 문서는 재시도 중단

---

## 5. 종합 평가

### 잘 동작한 것
- 391건 대량 업로드가 에러 없이 접수됨
- 12단계 세분화 상태가 모니터링에 유용
- credit_pending 자동 해소 (self-healing 정상)
- 에러율 2.8% (11/391) — 모두 텍스트 추출 불가능한 파일 형식

### 개선이 필요한 것 (우선순위순)
1. **self-healing 무한 루프** — 텍스트 추출 불가 파일이 processing↔error를 영구 반복. 재시도 상한 필요
2. **미지원 파일 에러 정책** — ZIP/AI를 에러가 아닌 "보관 전용(completed)"으로 처리
3. **이미지 HWP/PPT OCR fallback** — LibreOffice 변환 후 텍스트 0자일 때 OCR 시도 누락
4. **completed 감소 현상** — 최종 상태가 일시적으로 뒤로 돌아감
5. **OCR 빈 결과 처리** — 에러보다 "텍스트 없음" 안내가 적절
6. **UI/DB 카운트 불일치** — 사소하지만 정확성 개선

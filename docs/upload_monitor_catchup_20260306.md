# 캐치업코리아 대량 업로드 모니터링 로그
- 날짜: 2026-03-06
- 고객: 캐치업코리아 (698f3ed781123c52a305ab1d)
- 총 업로드: 395건
- 배치ID: batch_1772718436292_ovond7a

## 최종 결과
- **395건 업로드 -> 389건 완료, 6건 중복 오류**
- 에러율: 1.5% (전부 중복 파일 차단 -- 정상 동작)
- 별칭 생성: 117건+ (무의미한 파일명에만)
- 문서 분류: 23개 유형 정상 배정
- 임베딩: completed 즉시 처리
- OCR 후처리: 백그라운드 순차 진행 중 (사용자 체감 완료)

## 타임라인
| 시각(KST) | comp | proc | err | cp | alias | 비고 |
|-----------|------|------|-----|-----|-------|------|
| 03:02 | 0 | 49 | 0 | 0 | 0 | 업로드 시작 |
| 03:03 | 10 | 76 | 0 | 0 | 0 | |
| 03:04 | 27 | 273 | 0 | 0 | 0 | |
| 03:05 | 45 | 348 | 0 | 0 | 10 | 별칭 생성 시작 |
| 03:06 | 61 | 333 | 0 | 0 | 13 | 395건 입수 완료 |
| 03:07 | 74 | 320 | 0 | 0 | 15 | |
| 03:08 | 89 | 305 | 0 | 0 | 20 | |
| 03:09 | 100 | 294 | 0 | 0 | 22 | |
| 03:10 | 119 | 275 | 0 | 0 | 24 | |
| 03:11 | 137 | 257 | 0 | 0 | 26 | |
| 03:12 | 149 | 245 | 0 | 0 | 28 | |
| 03:13 | 153 | 241 | 0 | 0 | 32 | |
| 03:15 | 163 | 231 | 0 | 0 | 42 | |
| 03:17 | 171 | 223 | 0 | 0 | 45 | |
| 03:19 | 179 | 215 | 0 | 0 | 50 | OCR 병목 시작 |
| 03:21 | 183 | 211 | 0 | 0 | 54 | |
| 03:22 | 216 | 177 | 0 | 0 | 62 | overallStatus 389 comp 확인 |
| 03:24 | 340 | 49 | 0 | 0 | 117 | UI: 389/395 완료, 6 오류 |

---

## 발견된 이슈

### ISSUE-1: HWP 변환 타임아웃 (경미)
- HWP 파일 3종이 PDF 변환 큐에서 타임아웃 (60초 초과)
- 자동 재시도 진행 중, 최종적으로 일부 failed
- 영향: 해당 HWP만 미리보기 PDF 없음, 다른 파일 처리에 영향 없음

**수정 방향**: HWP 변환 타임아웃 증가 또는 대용량 HWP 변환 전략 개선
**연관**: ISSUE-9 (변환 실패 → OCR fallback → 잘못된 뱃지) — 동일 근본 원인

**상세 데이터** (pdf_conversion_queue):
- `260306030648_9c6fe992.hwp`: docId=69a9c5581377f935dd1a777d, **failed** (retry 2, "HWP 변환 타임아웃 - 파일이 너무 크거나 복잡합니다")
- `260306030954_b1e7a1d9.hwp`: preview completed, text_extraction **failed** (retry 2, 동일 타임아웃)
- `260306031019_0b493ba7.hwp`: docId=69a9c55c1377f935dd1a77c8, **failed** (retry 2, 동일 타임아웃)
- `260306031034_74be0ad8.hwp`: preview completed, text_extraction **failed** (caller timeout 180s)
- `260306031633_b59f2348.hwp`: preview completed, text_extraction **failed** (caller timeout 180s)
- 나머지 HWP들은 정상 completed

---

### ISSUE-2: Thumbs.db 파일 업로드 (경미)
- Windows 썸네일 캐시 파일 `Thumbs.db`가 최소 2건 업로드됨
- 분류: `general`로 처리됨
- 기능 문제 아님, 불필요한 파일이 업로드된 것

**수정 방향**: 업로드 시 Thumbs.db, .DS_Store 등 시스템 파일 필터링 추가
**수정 위치**: `document_pipeline` 업로드 수신 단계 또는 프론트엔드 업로드 컴포넌트

---

### ISSUE-3: unclassifiable 다수 (관찰 필요)
- `meta.document_type: "unclassifiable"` 총 57건 (status=completed 기준)
- 대부분 이미지(JPG) + 텍스트 없는 PDF + HR 서식류
- 텍스트가 없어 분류 불가한 경우(JPG, 스캔PDF)와 보험과 무관한 서식류(결근계, 시말서 등)

**수정 방향**:
1. OCR 완료 후 재분류 시도 (현재 OCR 전에 분류되는 문서들)
2. HR 서식류는 `hr_document` 분류 강화

**unclassifiable 문서 샘플** (57건 중 일부):
| 파일명 | MIME | text길이 | summary |
|--------|------|----------|---------|
| 김보성 대표님-액자디자인.jpg | image/jpeg | 0 | X |
| 김보성명함.jpg | image/jpeg | 0 | X |
| 암검진066.jpg | image/jpeg | 0 | X |
| 안영미병원영수증(자생한방20230313).pdf | application/pdf | 7 | X |
| 캐치업코리아 주주명부.pdf | application/pdf | 0 | X |
| 결근계.pdf | application/pdf | 151 | O |
| 시말서.pdf | application/pdf | 211 | O |
| 징계 의결서.pdf | application/pdf | 121 | O |
| 연차휴가 대체사용 합의서.pdf | application/pdf | 740 | O |
| 포트폴리오_구본미.pdf | application/pdf | 17926 | O |

---

### ISSUE-4: JPG 이미지 BIN 뱃지 (이슈 아님 — OCR 완료 후 자동 해결)
- **03:31 확인**: 이전에 BIN이었던 JPG 파일들이 OCR 완료 후 OCR 뱃지로 정상 전환됨
- BIN은 OCR 대기 중 임시 상태였으며, OCR 순차 처리 완료 시 자동 해결
- 단, `암검진067.jpg`는 OCR done인데 텍스트가 비어있어 BIN 유지 가능 (빈 이미지일 수 있음)
- `암검진067.jpg`: status=completed, OCR status=done인데 full_text 비어있음
- progress=70, progressStage=ocr -- completed인데 progress 70은 비정상
- badgeType 계산: full_text(meta/ocr 모두) 없으면 무조건 BIN

**수정 방향**:
1. badgeType 계산 시 mimeType도 고려 (이미지면 OCR 결과 없어도 BIN 대신 다른 표시)
2. 또는 OCR이 텍스트 추출 실패했을 때 progress/status 정합성 보장

**상세 데이터** (files._id: 69a9c5361377f935dd1a75dc):
```json
{
  "_id": "69a9c5361377f935dd1a75dc",
  "originalName": "암검진067.jpg",
  "status": "completed",
  "overallStatus": "completed",
  "progress": 70,
  "progressStage": "ocr",
  "progressMessage": "OCR 대기열에 추가됨",
  "meta.meta_status": "done",
  "meta.mime": "image/jpeg",
  "meta.extension": ".jpg",
  "meta.summary": "" (len=0),
  "meta.full_text": "" (len=0),
  "meta.document_type": "general",
  "ocr.status": "done",
  "ocr.full_text": null (len=0)
}
```

**수정 위치**:
- badgeType 계산: `customers-routes.js:2512` (`let badgeType = 'BIN'`)
- 또는 OCR worker: OCR 결과가 빈 텍스트일 때 progress/status 처리

---

### ISSUE-5: Thumbs.db 업로드 (ISSUE-2와 동일, 병합)
- ISSUE-2 참조

---

### ISSUE-6: overallStatus=completed인데 summary 미생성 38건 (버그)
- DB `overallStatus: completed`인데 `status: processing` -- 38건 (시점에 따라 43~60건 관측)
- 38건 모두 `hasSummary: false`, `ocrStatus: queued/running`
- 38건 모두 `docType: "general"` (OCR 전이라 제대로 분류 안 됨)
- 38건 모두 `embedStatus: "skipped"` (텍스트 없어서 임베딩 스킵)

**근본 원인**: `overallStatus`가 OCR 완료 전에 `completed`로 전환됨
- `overallStatus`는 webhooks에서 업데이트 (document-processing-complete)
- OCR은 별도 큐에서 비동기 처리
- OCR 완료 전에 overallStatus가 completed로 바뀌어 UI에서 "완료"로 보이지만 실제로는 미완료

**수정 방향**:
1. overallStatus를 OCR 완료 후에만 completed로 전환
2. 또는 OCR 완료 시 재분류/요약 실행 후 overallStatus 업데이트

**수정 위치**:
- `document_pipeline/workers/ocr_worker.py` - OCR 완료 콜백
- `aims_api/routes/webhooks-routes.js` - document-processing-complete 핸들러
- `aims_api/routes/documents-routes.js` - analyzeDocumentStatus 함수

**38건 전체 목록**:
| _id | 파일명 | OCR상태 | 텍스트 |
|-----|--------|---------|--------|
| 69a9c5731377f935dd1a78b0 | 청구서류002.jpg | running | X |
| 69a9c5731377f935dd1a78b5 | 청구서류003.jpg | queued | X |
| 69a9c5741377f935dd1a78b9 | 캐치업윤명희청약서.pdf | queued | meta있음 |
| 69a9c5741377f935dd1a78ba | 안희정수술확인서.jpg | queued | X |
| 69a9c5741377f935dd1a78bf | 삼성화재 보험금청구.pdf | queued | meta있음 |
| 69a9c5751377f935dd1a78c5 | 캐치업(박지우수면무호흡수술확인서).pdf | queued | meta있음 |
| 69a9c5761377f935dd1a78c8 | 08하 7454 자동차등록증.jpeg | queued | X |
| 69a9c5761377f935dd1a78c9 | 160구3184자동차등록증.jpg | queued | X |
| 69a9c5791377f935dd1a78e0 | 자동차청약서001.jpg | queued | X |
| 69a9c57a1377f935dd1a78e3 | 자동차청약서002.jpg | queued | X |
| 69a9c57f1377f935dd1a7919 | 90도3455자동차등록증.jpg | queued | X |
| 69a9c5801377f935dd1a791c | 90도3455자동차등록증1.jpg | queued | X |
| 69a9c5801377f935dd1a7922 | i_42e274d0fd36.jpg | queued | X |
| 69a9c5801377f935dd1a7923 | i_951e220d0c9b.jpg | queued | X |
| 69a9c5801377f935dd1a7928 | 90도3455자동차청약서.jpg | queued | X |
| 69a9c5801377f935dd1a792b | i_ec3a3dbd1097.jpg | queued | X |
| 69a9c5801377f935dd1a792e | 캐치업자동차 증권(70나0396).jpg | queued | X |
| 69a9c5801377f935dd1a792f | 자동차청약서(캐치업).jpg | queued | X |
| 69a9c5811377f935dd1a7934 | 캐치업자동차증권(160구3184).jpg | queued | X |
| 69a9c5811377f935dd1a7936 | 박지우운전면허증.jpg | queued | X |
| 69a9c5821377f935dd1a794f | 법인 종합재무컨설팅 제안서.ppt | queued | X |
| 69a9c5831377f935dd1a795c | 캐치업(장재석메모).pdf | queued | X |
| 69a9c5831377f935dd1a7961 | 캐치업직원보험청구시필요서류.pdf | queued | meta있음 |
| 69a9c5831377f935dd1a7964 | 캐치업코리아 2021.11.25.hwp | queued | X |
| 69a9c5831377f935dd1a7968 | 캐치업코리아 보험가입내역정리.png | queued | X |
| 69a9c5841377f935dd1a796f | 캐치업화재보험지급내역서.pdf | queued | X |
| 69a9c5841377f935dd1a7973 | 캐치업직원해지서류.pdf | queued | meta있음 |
| 69a9c5851377f935dd1a797b | 해지서류098.jpg | queued | X |
| 69a9c5851377f935dd1a797f | 구본미(가족주민번호).pdf | queued | X |
| 69a9c5851377f935dd1a7982 | 구본미(신분증).pdf | queued | X |
| 69a9c5851377f935dd1a7985 | 구본미졸업증명서.pdf | queued | meta있음 |
| 69a9c5851377f935dd1a7986 | 박지우검사결과지.pdf | queued | meta있음 |
| 69a9c5851377f935dd1a798b | 구본미.jpg | queued | X |
| 69a9c5861377f935dd1a798e | 박지우신분증.pdf | queued | X |
| 69a9c5861377f935dd1a7991 | 유아영신분증2.jpg | queued | X |
| 69a9c5861377f935dd1a7992 | 유아영신분증1.jpg | queued | X |
| 69a9c5861377f935dd1a7997 | 캐치업사업비내역서.pdf | queued | meta있음 |
| 69a9c5871377f935dd1a799d | 캐치업자동차견적.jpg | queued | X |

---

### ISSUE-7: 중복 파일 차단 6건 (정상 -- 단, UI 표시 개선 필요)
- 해시 기반 중복 검출 정상 동작
- 6건 모두 `status: failed`, `progressMessage: "동일한 파일이 이미 등록되어 있습니다."`
- 6건 모두 `overallStatus: processing` (error로 안 바뀜 -- 동기화 버그)
- UI 표시: 0 B, -1%, 타입 `-`, 문서유형 `미지정` -- 사용자에게 원인 불명 오류로 보임

**수정 방향**:
1. 중복 오류 시 `overallStatus`를 `error`로 설정
2. UI에서 중복 파일 에러 메시지 표시 ("동일한 파일이 이미 등록되어 있습니다")
3. 또는 중복 파일은 목록에서 숨기기 / 별도 섹션 표시

**수정 위치**:
- `document_pipeline` 중복 검출 로직 - overallStatus 업데이트 추가
- `DocumentStatusList.tsx` - failed 상태 + progressMessage 표시
- `customers-routes.js:2504` - analyzeDocumentStatus에서 failed 처리

**6건 상세 데이터**:
| _id | 파일명 | status | overallStatus | createdAt |
|-----|--------|--------|---------------|-----------|
| 69a9c5471377f935dd1a763c | 캐치업-운전자.pdf | failed | processing | 2026-03-05T18:02:47 |
| 69a9c5631377f935dd1a7802 | 21년 세무조정계산서_캐치업코리아.pdf | failed | processing | 2026-03-05T18:03:15 |
| 69a9c5781377f935dd1a78d6 | 3204가입증.pdf | failed | processing | 2026-03-05T18:03:36 |
| 69a9c57b1377f935dd1a78ec | 캐치업 가입증-1.pdf | failed | processing | 2026-03-05T18:03:39 |
| 69a9c57e1377f935dd1a790a | 캐치업3184 청약서-1.pdf | failed | processing | 2026-03-05T18:03:42 |
| 69a9c57f1377f935dd1a7913 | 캐치업3184 청약서.pdf | failed | processing | 2026-03-05T18:03:43 |

공통: meta=null, fileSize=null, fileHash=null (중복 검출 시 파일 처리 자체가 안 됨)

---

### ISSUE-8: 대용량 PDF 분류/요약 실패 (포트폴리오_구본미.pdf, 260MB)
- 파일: `포트폴리오_구본미.pdf` (260MB, 21페이지)
- 분류: `unclassifiable` (confidence: 1.0 — 높은 확신으로 분류 불가 판정)
- **summary 필드가 raw JSON 문자열**: `{"type":"unclassifiable","confidence":1.0,"title":"","summary":"","tags":[]}`
  - 정상이면 summary에 요약 텍스트가 들어가야 하는데, OpenAI 응답 JSON이 그대로 저장됨
  - UI 요약 모달에서 이 JSON 문자열이 그대로 표시됨 (사용자 혼란)
- **full_text 내용이 비정상**: 커피믹스 식품 표기사항, CMYK 인쇄 정보 등
  - 포트폴리오 PDF인데 내용이 커피 제품 라벨 → PDF 내부에 포트폴리오 디자인 작업물이 이미지로 들어있고, 텍스트 레이어는 커피 라벨 디자인의 텍스트만 추출된 것으로 추정
  - 260MB = 고해상도 이미지 다수 포함 PDF
- badgeType: TXT (full_text 17,926자 있으므로)

**문제 분석**:
1. **summary에 JSON이 그대로 저장** — OpenAI 응답 파싱 실패 또는 파싱 로직 버그
   - 정상 flow: OpenAI → JSON 응답 → summary 필드에 요약 텍스트 추출 → 저장
   - 이 문서: JSON 문자열 전체가 summary에 저장됨
2. **대용량 PDF 텍스트 추출 품질** — 이미지 기반 PDF는 텍스트 레이어만 추출하면 무의미한 내용
3. **분류 실패** — 추출된 텍스트가 커피 라벨이라 보험 분류 불가 (정상 판단)

**수정 방향**:
1. summary에 JSON 문자열이 그대로 들어가는 파싱 버그 수정
   - `openai_service.py` 또는 `ocr_worker.py`에서 OpenAI 응답 파싱 로직 확인
2. 대용량 PDF(100MB+)에 대한 처리 전략 검토
   - 이미지 기반 PDF는 OCR 처리 필요하나 260MB는 OCR 비용/시간 과다
   - 옵션: 파일 크기 제한, 첫 N페이지만 처리, 또는 이미지 기반 감지 후 안내 메시지
3. UI에서 summary가 JSON일 때 fallback 표시

**상세 데이터** (files._id: 69a9c5a61377f935dd1a79b3):
```
originalName: 포트폴리오_구본미.pdf
sizeBytes: 272,688,186 (260MB)
pdfPages: 21
mime: application/pdf
status: completed / overallStatus: completed
meta.document_type: unclassifiable (confidence: 1.0)
meta.summary: '{"type":"unclassifiable","confidence":1.0,"title":"","summary":"","tags":[]}'
meta.full_text: 17,926자 (커피믹스 라벨 텍스트, CMYK 인쇄 메타데이터 등)
meta.tags: [] (빈 배열)
ocr.status: null (OCR 미실행 — PDF 텍스트 레이어만 추출)
docembed.status: done
displayName: 없음
```

**수정 위치**:
- summary JSON 파싱: `document_pipeline/services/openai_service.py` — classify_document 또는 summarize 함수
- 대용량 파일 처리: `document_pipeline/workers/ocr_worker.py`, `document_pipeline/services/doc_prep_main.py`
- UI fallback: `DocumentSummaryModal` 컴포넌트

---

### ISSUE-9: HWP PDF변환 실패 → OCR fallback → 잘못된 뱃지 표시 (버그)

**현상**: HWP 파일 15건 중 6건이 OCR 뱃지로 표시됨. 나머지 9건은 TXT 뱃지(정상).
- TXT 뱃지 HWP: PDF 변환(:8005) 성공 → `meta.full_text`에 텍스트 저장 → TXT 뱃지
- OCR 뱃지 HWP: PDF 변환 **실패** → `meta.full_text` 비어있음 → OCR 큐로 fallback → `ocr.full_text`에 텍스트 저장 → OCR 뱃지

**근본 원인**: PDF 변환 큐(pdf_converter :8005)에서 text_extraction 실패 시 OCR 큐로 fallback되는 경로가 존재.
- git 커밋 `63f0baa4`에서 HWP는 OCR 대신 PDF 변환 경로를 사용하도록 변경됨
- git 커밋 `8ae8801c`에서 이를 테스트로 검증함
- **그러나 PDF 변환 실패 시 OCR fallback 경로가 남아있어**, 변환 실패한 HWP가 OCR로 빠짐

**두 가지 버그**:
1. **HWP PDF 변환 타임아웃** — 일부 HWP가 변환 실패 (ISSUE-1과 동일 원인)
2. **OCR fallback 후 상태 미완료** — OCR 완료(done)했지만 `progress: 70`, `progressStage: ocr`, `progressMessage: "OCR 대기열에 추가됨"` 유지 → 후속 처리(분류/요약) 미실행

**전체 HWP 15건 분류**:

| 파일명 | 크기 | 뱃지 | 경로 | meta.ft | ocr.ft | progress |
|--------|------|------|------|---------|--------|----------|
| 개정정관(자사주).hwp | 101KB | TXT | PDF변환OK | 19,758 | 0 | 100 |
| 취업규칙.hwp | 179KB | TXT | PDF변환OK | 20,572 | 0 | 100 |
| 캐치업취업규칙.hwp | 98KB | TXT | PDF변환OK | 20,445 | 0 | 100 |
| 정    관-캐치업코리아.hwp | - | TXT | PDF변환OK | 10,317 | 0 | 100 |
| 정관_(최근샘플).hwp | - | TXT | PDF변환OK | 7,092 | 0 | 100 |
| 정관_캐치업코리아.hwp | - | TXT | PDF변환OK | 7,092 | 0 | 100 |
| 브로우바복무규정2.hwp | - | TXT | PDF변환OK | 842 | 0 | 100 |
| 별첨 1.2 근로자명부(개별식).hwp | - | TXT | PDF변환OK | 219 | 0 | 100 |
| 제12장 재해보상취업규칙.hwp | 12KB | TXT | PDF변환OK | 497 | 0 | 100 |
| **20130409_121226표준취업규칙(최종).hwp** | **1.1MB** | **OCR** | **변환실패→OCR** | 0 | 74,629 | 70 |
| **표준취업규칙(최종).hwp** | **1.3MB** | **OCR** | **변환실패→OCR** | 0 | 74,631 | 70 |
| **캐치업코리아 표준취업규칙(최종).hwp** | **304KB** | **OCR** | **변환실패→OCR** | 0 | 74,607 | 70 |
| **포괄근로계약서(갑을제외일반5인미만용).hwp** | **31KB** | **OCR** | **변환실패→OCR** | 0 | 1,956 | 70 |
| **별첨 19 사직서.hwp** | **14KB** | **OCR** | **변환실패→OCR** | 0 | 127 | 70 |
| **캐치업코리아 2021.11.25.hwp** | **17KB** | **OCR** | **변환실패→OCR** | 0 | 415 | 70 |

**PDF 변환 큐 실패 매핑**:

| 원본 HWP | storedName | 큐 실패 유형 | 에러 메시지 |
|----------|------------|------------|-----------|
| 20130409_121226표준취업규칙(최종).hwp | 260306030648_9c6fe992.hwp | preview_pdf | HWP 변환 타임아웃 (HTTP 500, 60초 초과) |
| 표준취업규칙(최종).hwp | 260306030954_b1e7a1d9.hwp | text_extraction | HWP 변환 타임아웃 (HTTP 500, 60초 초과) |
| 캐치업코리아 표준취업규칙(최종).hwp | 260306031019_0b493ba7.hwp | text_extraction | caller timeout (180초) |
| 포괄근로계약서(갑을제외일반5인미만용).hwp | 260306030728_68966e02.hwp | text_extraction | caller timeout (180초) |
| 별첨 19 사직서.hwp | 260306031034_74be0ad8.hwp | text_extraction | caller timeout (180초) |
| 캐치업코리아 2021.11.25.hwp | 260306031633_b59f2348.hwp | text_extraction | caller timeout (180초) |

**관련 git 커밋**:
- `63f0baa4`: HWP를 OCR 대신 pdf_converter(:8005)→PyMuPDF 경로로 변경
- `8ae8801c`: HWP/XLSX/PPTX OCR 미사용 테스트 검증
- 관련 파일: `doc_prep_main.py`, `pdf_conversion_text_service.py`, `config.py`

**수정 방향**:
1. HWP 변환 타임아웃 증가 (60초 → 120초+) 또는 LibreOffice 변환 안정성 개선
2. PDF 변환 실패 → OCR fallback 경로에서도 후속 처리(분류/요약) 실행되도록 수정
3. OCR 완료 후 progress/progressStage 업데이트 (70→100, ocr→complete)
4. 또는 PDF 변환 실패 시 OCR fallback을 의도적으로 허용하되, 뱃지를 TXT로 표시 (PDF→OCR 경유이므로)

**수정 위치**:
- `document_pipeline/services/doc_prep_main.py` — OCR fallback 분기 로직
- `document_pipeline/workers/ocr_worker.py` — OCR 완료 후 progress 업데이트
- `document_pipeline/services/pdf_conversion_text_service.py` — 타임아웃 설정
- `aims_api/routes/customers-routes.js:2512` — badgeType 계산 로직

---

## 정상 동작 확인

### 문서 분류
- 23개 유형 분류: medical_receipt(11), policy(8), general(7), proposal(6), hr_document(6) 등
- confidence 0.95로 높은 정확도

### 별칭 생성
- 무의미한 파일명(img*.jpg)에만 자동 생성 -- 정상 로직
- 예: img001.jpg -> 주민등록표.jpg, img006.jpg -> 안영미 진단서.jpg
- 의미있는 원본명 파일은 별칭 미생성 (정상)

### 임베딩
- completed 문서 즉시 임베딩 처리 완료 (docembed.status: done)
- ISSUE-6 문서들은 embedStatus: skipped (텍스트 없어서)

### 중복 검출
- 해시 기반 중복 파일 차단 6건 -- 정상 동작

---

## 코드 분석 보고 (Alex + Gini)

> 2026-03-06 모니터링 후 코드 레벨 조사. 이슈별 근본 원인 + 수정 위치 + 수정 방향.
> 스냅샷 데이터: `docs/snapshots/20260306_catchup/`

---

### [Alex] ISSUE-1/9: HWP 변환 타임아웃 + OCR fallback 파이프라인

#### 전체 흐름
```
doc_prep_main.py:1276 → is_convertible_mime() 확인
  → pdf_conversion_text_service.py:66 → enqueue(job_type="text_extraction")
  → pdf_conversion_queue_service.py:261 → wait_for_result(timeout=180)
    → PdfConversionWorker._convert() → httpx POST :8005/convert [timeout=180]
      → _extract_text_from_pdf_bytes() [PyMuPDF]
```

#### 타임아웃 설정값 (3중 구조)
| 위치 | 파일:라인 | 값 |
|------|-----------|-----|
| wait_for_result poll-wait | `pdf_conversion_queue_service.py:264` | 180초 |
| Worker httpx 호출 | `pdf_conversion_worker.py:102` | 180초 |
| Stale 복구 | `config.py:76` | 5분 |
| 최대 재시도 | `config.py:74` | 2회 |

#### ISSUE-1 근본 원인: Worker concurrency=1 + 대량 큐잉
- `PdfConversionWorker`는 한 번에 1건만 처리
- 395건 업로드 시 HWP 15건이 큐에 순차 대기
- 각 HWP 변환에 수십 초 → 뒤에 있는 작업은 `wait_for_result` 180초 내에 자기 차례가 오지 않아 타임아웃
- 에러 메시지가 2종류인 이유: "HWP 변환 타임아웃 (HTTP 500, 60초)"는 pdf_converter(:8005) 자체 타임아웃, "caller timeout (180s)"는 poll-wait 타임아웃

#### OCR Fallback 경로 (`doc_prep_main.py:1462-1500`)
```python
# 라인 1276: PDF 변환 시도
if (not full_text) and is_convertible_mime(detected_mime):
    converted_text = await convert_and_extract_text(dest_path)
    # 실패 시 full_text는 여전히 빈 문자열

# 라인 1462: full_text가 비어있으면 OCR 큐로
if not full_text or len(full_text.strip()) == 0:
    await RedisService.add_to_stream(file_path=dest_path, ...)  # ← .hwp 그대로!
    await _notify_progress(doc_id, user_id, 70, "ocr", "OCR 대기열에 추가됨")
    return  # ← 여기서 리턴, progress=70에서 멈춤
```

#### ISSUE-9 근본 원인: 3가지 버그 복합
1. **HWP가 OCR에 `.hwp` 그대로 전송** — `dest_path`가 `.hwp` 확장자인 채로 Upstage OCR에 전달 (이미지/PDF만 지원)
2. **OCR 에러 핸들러가 progress 미갱신** — `ocr_worker.py:359-393` `_handle_ocr_error`는 `ocr.status="error"`만 설정, **`progress`/`progressStage`/`status` 필드는 건드리지 않음**
3. **OCR 성공 핸들러도 progress=100 미설정** — `ocr_worker.py:277-357` `_handle_ocr_success`에서 `status: "completed"` 설정하지만 **`progress: 100`, `progressStage: "complete"` 누락**

#### 수정 포인트 (우선순위)
| # | 파일:라인 | 수정 내용 |
|---|-----------|-----------|
| 1 | `ocr_worker.py:291-303` (`_handle_ocr_success`) | `progress: 100, progressStage: "complete"` 추가 |
| 2 | `ocr_worker.py:372-378` (`_handle_ocr_error`) | `progress: -1, progressStage: "error", status: "failed"` 추가 |
| 3 | `doc_prep_main.py:1462` | OCR fallback 전에 `detected_mime`가 convertible이면 OCR 대신 에러 처리 (HWP를 OCR에 보내지 않기) |
| 4 | `pdf_conversion_text_service.py:39` | 대량 큐잉 시 타임아웃 전략 개선 (큐 깊이 고려 또는 callback 방식 전환) |

#### Alex 의견
> ISSUE-1과 ISSUE-9는 동일 파이프라인의 연쇄 실패입니다. 근본 해결은 (1) Worker concurrency를 높이거나, (2) poll-wait를 callback으로 전환하는 것이지만, **즉시 수정 가능한 것은 OCR Worker의 progress/status 갱신 누락**입니다. 이것만 수정해도 167건의 stuck 문서가 해소됩니다. HWP→OCR fallback 경로도 차단해야 합니다 — Upstage OCR은 HWP를 처리할 수 없으므로 무의미한 OCR 비용이 발생합니다.

---

### [Alex] ISSUE-8: 대용량 PDF summary에 JSON 문자열 저장 버그

#### 근본 원인
**파일:** `openai_service.py:356-357`

```python
if not summary:
    summary = content[:500]  # ← content는 OpenAI raw JSON 응답 문자열
```

**흐름:**
1. 260MB PDF → 텍스트 레이어 17,926자 추출 (커피믹스 라벨 디자인 텍스트)
2. `openai_service.py:297-299` — 10,000자로 truncate 후 OpenAI 전송
3. OpenAI 응답: `{"type":"unclassifiable","confidence":1.0,"title":"","summary":"","tags":[]}`
4. `parsed.get("summary", "")` → `""` (빈 문자열, 보험 무관 내용이라 요약 불가)
5. **`if not summary:` → True** (빈 문자열은 Python에서 falsy)
6. **fallback 발동:** `summary = content[:500]` → OpenAI JSON raw 문자열이 summary가 됨
7. `doc_prep_main.py:1313` — `meta.summary`로 MongoDB에 그대로 저장

#### 코드 위치
| 단계 | 파일:라인 | 역할 |
|------|-----------|------|
| OpenAI 호출 | `openai_service.py:266-378` | `summarize_text()` — 분류+요약 |
| 텍스트 truncate | `openai_service.py:297-299` | 10,000자 제한 |
| JSON 파싱 | `openai_service.py:330` | `parsed = json.loads(content)` |
| summary 추출 | `openai_service.py:350` | `summary = parsed.get("summary", "")` |
| **버그 위치** | `openai_service.py:356-357` | `if not summary: summary = content[:500]` |
| DB 저장 | `doc_prep_main.py:1313` | `meta.summary: summary` |

#### 영향 범위
`summarize_text()` 호출처 3곳 모두 영향:
- `doc_prep_main.py:1294` (메인 업로드)
- `doc_prep_main.py:280` (shadow 모드)
- `ocr_worker.py:200` (OCR 후 요약)

#### 수정 포인트
| # | 파일:라인 | 수정 내용 |
|---|-----------|-----------|
| 1 | `openai_service.py:356-357` | **fallback 로직 변경**: unclassifiable이면 안내 메시지, 그 외에도 JSON raw 대신 파싱된 정보 사용 |

```python
# 수정 예시 (옵션 B — 권장)
if not summary:
    if doc_type == "unclassifiable":
        summary = "문서 내용을 판독할 수 없거나 분류할 수 없는 문서입니다."
    else:
        summary = f"[자동 분류: {doc_type}] 요약 생성 불가"
```

#### Alex 의견
> `content[:500]` fallback은 JSON 파싱 실패 시를 위한 안전장치인데, JSON 파싱이 성공했지만 summary가 빈 경우에도 발동됩니다. 조건 분기가 필요합니다. 또한 대용량 이미지 PDF(260MB)는 텍스트 레이어가 무의미할 수 있으므로, 파일 크기 경고나 이미지 비율 기반 OCR 필요성 판단도 장기적으로 검토할 만합니다.

---

### [Alex] ISSUE-6: overallStatus 조기 completed + OCR 후 요약/분류 미실행

#### 근본 원인: webhook 핸들러의 레이스 컨디션

**`customers-routes.js:3514-3533`** — `document-processing-complete` webhook 핸들러:

```javascript
// 빈 텍스트 체크: 텍스트 없음 → 임베딩 스킵 + 바로 completed
const hasText = (doc.meta?.full_text?.trim() !== '') ||
                (doc.ocr?.full_text?.trim() !== '') || ...;

if ((status === 'completed' || status === 'done') && !hasText && ...) {
    newOverallStatus = 'completed';
    // docembed도 skip 처리
    await db.updateOne(..., { $set: { 'docembed.status': 'skipped' }});
}
```

**레이스 컨디션 시나리오:**
1. OCR worker → `_update_ocr_status()` (MongoDB에 `ocr.full_text` write)
2. OCR worker → `_notify_processing_complete("completed")` (webhook 호출)
3. webhook 핸들러 → `findOne()` (문서 읽기)
4. **대량 업로드 시** MongoDB write lag → 3번 시점에 아직 `ocr.full_text`가 없음
5. `hasText = false` → `overallStatus = "completed"` + `docembed.status = "skipped"`
6. 결과: **요약/분류 없이 완료 처리, 임베딩도 스킵**

#### overallStatus "completed" 설정 위치 전체 목록

| # | 파일:라인 | 트리거 조건 | 비고 |
|---|-----------|-------------|------|
| A | `customers-routes.js:3519-3522` | webhook + 빈 텍스트 | **주 원인** |
| B | `customers-routes.js:3506-3507` | webhook + docembed done/skipped | 정상 |
| C | `full_pipeline.py:294,338` | 임베딩 완료 | 정상 |
| D | `full_pipeline.py:194` | 불일치 자동 보정 | 보정 |
| E | `doc_prep_main.py:1442` | 비지원 MIME | 정상 |
| F | `documents-routes.js:1431-1448` | 폴링 API 재계산 | **보조 원인** |
| G | `documentStatusHelper.js:179` | `progress >= 100` 또는 `progressStage === 'complete'` | 계산 |

#### 167건 stuck 문서의 상태 일관성

```
모든 167건: status=completed, overallStatus=completed, progress=70,
           progressStage=ocr, ocr.status=done, hasSummary=false
```

- `progress=70`에서 멈춤: OCR worker의 `_handle_ocr_success`가 `progress: 100` 미설정 (ISSUE-9와 동일 원인)
- `hasSummary=false`: OCR worker의 `summarize_text()` 결과가 DB에 반영되기 전에 webhook이 먼저 completed 처리

#### ISSUE-6과 ISSUE-9의 관계

| 측면 | ISSUE-6 | ISSUE-9 |
|------|---------|---------|
| 영향 범위 | 167건 (JPG, PDF, HWP 등 OCR 경유 문서 전체) | 6건 (HWP만) |
| 근본 원인 | webhook 레이스 컨디션 + OCR worker progress 미갱신 | HWP→OCR fallback + progress 미갱신 |
| 공통 원인 | **OCR worker가 progress=100, progressStage=complete를 설정하지 않음** |

#### 수정 포인트

| # | 파일:라인 | 수정 내용 | 우선순위 |
|---|-----------|-----------|----------|
| 1 | `ocr_worker.py:291-303` | `_handle_ocr_success`에 `progress: 100, progressStage: "complete"` 추가 | **즉시** |
| 2 | `ocr_worker.py` | `_update_ocr_status` await 후에만 `_notify_processing_complete` 호출 보장 | **즉시** |
| 3 | `customers-routes.js:3514-3533` | webhook에서 `ocr.status`가 `queued/running`이면 completed 처리 보류 | 중기 |
| 4 | `customers-routes.js:3514` | 방향 A: OCR worker가 직접 overallStatus 설정, webhook의 빈텍스트 로직 제거 | 장기 |

#### Alex 의견
> ISSUE-6은 **167건에 영향을 미치는 가장 큰 이슈**입니다. ISSUE-9(6건)의 상위 문제이기도 합니다. OCR worker의 `_handle_ocr_success`에서 progress/progressStage를 설정하는 것이 ISSUE-6과 ISSUE-9를 동시에 해결하는 핵심 수정입니다. webhook 레이스 컨디션은 대량 업로드에서만 발생하므로, OCR worker 수정 후에도 잔존할 수 있어 webhook 측 방어 로직도 병행 권장합니다.

---

### [Gini] ISSUE-2: Thumbs.db 시스템 파일 업로드

#### 필터링 체인 분석

| 단계 | 파일 | 역할 |
|------|------|------|
| 공통 상수 | `shared/file-validation-constants.json` | `BLOCKED_EXTENSIONS` 정의 |
| FE 확장자 체크 | `shared/lib/fileValidation/validators/extensionValidator.ts:29-32` | 확장자만 체크 |
| FE 배치 검증 | `features/batch-upload/utils/fileValidation.ts:48-62` | 업로드 전 검증 |
| BE 수신 | `document_pipeline/routers/doc_upload.py:31-48` | 파일 수신 |
| BE 파이프라인 | `document_pipeline/routers/doc_prep_main.py:185-195` | 처리 시작 |

#### 품질 문제
- `BLOCKED_EXTENSIONS`는 보안 위험 실행파일(exe, dll, sh 등)만 차단
- **파일명 기반 시스템 파일 필터링 없음**: `Thumbs.db`, `.DS_Store`, `desktop.ini` 모두 통과
- 프론트엔드/백엔드 양쪽 모두 누락

#### 수정 포인트
| # | 파일 | 수정 내용 |
|---|------|-----------|
| 1 | `shared/file-validation-constants.json` | `SYSTEM_FILE_NAMES` 배열 추가: `["thumbs.db", ".ds_store", "desktop.ini", "ehthumbs.db"]` |
| 2 | `extensionValidator.ts` | `isSystemFileName()` 함수 추가 + `validateExtension`에 통합 |
| 3 | `doc_prep_main.py:315` 근처 | 백엔드 방어 체크 추가 (직접 API 호출 방어) |

#### Gini 의견
> 수정 난이도 **낮음** (상수 추가 + 함수 1개). 이중 방어(FE+BE)가 필요합니다. 프론트엔드는 UX(업로드 시도 전 차단), 백엔드는 보안(직접 API 호출 방어).

#### 테스트 체크리스트
- [ ] `Thumbs.db` 드래그앤드롭 → 필터링 확인
- [ ] `.DS_Store`, `desktop.ini` 필터링 확인
- [ ] 정상 파일(`.pdf`, `.jpg`) 영향 없음 확인
- [ ] 백엔드 직접 POST → 400 반환 확인

---

### [Gini] ISSUE-3: unclassifiable 다수 (57건) — OCR 결과 품질 문제

#### 분류 흐름 분석

```
이미지/텍스트없는PDF 업로드
  ↓
doc_prep_main.py:1293 — full_text 없으면 분류 스킵 → 기본값 "general"
  ↓
doc_prep_main.py:1462 — OCR 큐 등록
  ↓
ocr_worker.py:198 — OCR 완료 후 full_text 있으면 summarize_text() 호출
  ↓
ocr_worker.py:300 — meta.document_type 업데이트 (OCR 결과로 재분류)
```

#### 품질 문제 — **OCR 시점 문제가 아닌 텍스트 품질 문제**

- OCR 전에는 기본값 `"general"` 저장 (분류 호출하지 않음)
- OCR 완료 후 `ocr_worker.py:198-208`에서 **재분류 실행** — 이 경로는 정상 동작
- 57건이 unclassifiable인 이유: **OCR 결과 텍스트 자체가 의미 없음** (이미지만 있는 PDF, 손글씨, 빈 HR 양식)
- `openai_service.py:103,125` 프롬프트: "텍스트 없거나 의미 단어 10자 미만이면 unclassifiable"
- 재분류 트리거: **없음** (unclassifiable 후 재처리 로직 부재)

#### 수정 방향 (3가지 옵션)

| 옵션 | 내용 | 난이도 |
|------|------|--------|
| A | 사용자 수동 분류 UI 제공 | 중간 |
| B | AI 분류 프롬프트 강화 (HR 서식류 가이드) | 중간 |
| C | "자동 분류 불가" 레이블로 UX 개선 | 낮음 |

#### Gini 의견
> 이 이슈는 **버그가 아닌 구조적 한계**입니다. OCR 후 재분류는 정상 동작하지만, OCR 텍스트 품질이 낮은 문서는 분류 자체가 불가합니다. 완전 해결보다는 **C안(UX 개선) + A안(수동 분류)** 조합이 적절합니다. 프롬프트 수정(B안)은 효과가 제한적일 수 있습니다.

#### 테스트 체크리스트
- [ ] 텍스트 없는 JPG → OCR 큐 진입 → OCR 후 `meta.document_type` 변경 확인
- [ ] 빈 양식 PDF → unclassifiable 판정 재현
- [ ] OCR 텍스트 있는 문서 → 정상 분류 확인

---

### [Gini] ISSUE-7: 중복 파일 차단 UI 표시 — overallStatus 미설정 버그

#### 중복 차단의 두 경로

**경로 A — 프론트엔드 사전 검사 (정상):**
```
useBatchUpload.ts:384 → checkDuplicateFile()
  → isDuplicate → DuplicateDialog → skip (서버에 파일 미전송)
```

**경로 B — 백엔드 MongoDB unique 인덱스 충돌 (버그):**
```
doc_prep_main.py:377 → status="processing" 문서 생성 (overallStatus 없음)
doc_prep_main.py:1354 → DuplicateKeyError 발생
doc_prep_main.py:1362 → _notify_progress(-1, "error", ...) → status="failed"
                         ★ overallStatus는 설정되지 않음!
```

#### 근본 원인
- `_notify_progress()` (`doc_prep_main.py:1063-1075`)에서 `status: "failed"`는 설정하지만 **`overallStatus` 필드는 건드리지 않음**
- 문서 생성 시점(`doc_prep_main.py:377`)에 `overallStatus` 없이 생성
- 결과: `overallStatus` 필드 자체가 없거나 초기값(`"processing"`) 유지

#### UI 표시 문제 원인
| 필드 | 값 | 원인 |
|------|----|------|
| 크기 0 B | `upload.fileSize` 미저장 | DuplicateKeyError가 메타 추출 전에 발생 |
| -1% | `progress: -1` | `_notify_progress` 설정값 |
| 타입 `-` | `meta.mime` 미저장 | 메타 추출 전 에러 |
| 문서유형 `미지정` | `meta.document_type` 미저장 | 분류 전 에러 |

#### 수정 포인트
| # | 파일:라인 | 수정 내용 |
|---|-----------|-----------|
| 1 | `doc_prep_main.py:1358-1363` | DuplicateKeyError 핸들러에서 `overallStatus: "error"` 명시 설정 |
| 2 | `doc_prep_main.py:1063-1075` | `_notify_progress`에서 `progress == -1`이면 `overallStatus: "error"` 추가 (더 포괄적) |

#### Gini 의견
> 수정 난이도 **낮음** (1줄 추가). `_notify_progress`의 에러 분기에서 `overallStatus: "error"`를 함께 설정하는 것이 가장 포괄적입니다. ISSUE-6 Alex 보고서의 overallStatus 설정 위치 목록과 교차 확인한 결과, DuplicateKeyError 경로는 Alex 목록에 없었으며 이는 Alex가 정상 경로만 추적했기 때문입니다. **에러 경로에서의 overallStatus 미설정은 추가 버그**입니다.

#### 테스트 체크리스트
- [ ] 동일 파일 2회 업로드 → 2번째 `overallStatus: "error"` 확인
- [ ] UI에서 오류 상태로 표시되는지 확인
- [ ] 중복 파일 삭제 가능 여부 확인
- [ ] 정상 파일 업로드 영향 없음 확인

---

### 크로스 검증 (Alex ↔ Gini)

#### 일치하는 발견

| 항목 | Alex | Gini | 일치 |
|------|------|------|------|
| OCR worker progress 미갱신 | ISSUE-1/9에서 발견 (`ocr_worker.py:291-303`) | ISSUE-6에서 동일 코드 확인 | **일치** |
| overallStatus 설정 위치 | 7곳 식별 (A~G) | DuplicateKeyError 경로 추가 발견 | **보완** |
| ISSUE-3 원인 | - | OCR 텍스트 품질 문제 (시점 문제 아님) | Gini 단독 |
| ISSUE-8 fallback 버그 | `openai_service.py:356-357` 식별 | - | Alex 단독 |

#### Gini가 보완한 사항
1. **ISSUE-7**: Alex의 overallStatus 설정 위치 목록에 **DuplicateKeyError 에러 경로 누락** → Gini가 `_notify_progress` 에러 분기에서 `overallStatus` 미설정 버그 추가 발견
2. **ISSUE-3**: Alex는 미조사 → Gini가 "OCR 시점 문제가 아닌 텍스트 품질 문제"로 정확한 원인 식별
3. **ISSUE-2**: 프론트엔드+백엔드 이중 방어선 필요성 제시

#### 수정 우선순위 종합 (Alex + Gini 합의)

| 순위 | 이슈 | 수정 | 영향 범위 | 난이도 |
|------|------|------|-----------|--------|
| **1** | ISSUE-6+9 | `ocr_worker.py` progress/progressStage 갱신 | **167건** | 낮음 |
| **2** | ISSUE-6 | `customers-routes.js:3514-3533` webhook 레이스 컨디션 방어 | 대량 업로드 시 | 중간 |
| **3** | ISSUE-8 | `openai_service.py:356-357` fallback 로직 수정 | 모든 unclassifiable | 낮음 |
| **4** | ISSUE-7 | `doc_prep_main.py` DuplicateKeyError에 overallStatus 추가 | 중복 파일 | 낮음 |
| **5** | ISSUE-1 | PDF 변환 타임아웃/concurrency 개선 | 대량 HWP | 중간 |
| **6** | ISSUE-2 | 시스템 파일 필터링 상수 추가 | 경미 | 낮음 |
| **7** | ISSUE-3 | unclassifiable UX 개선 + 수동 분류 | 구조적 | 중간 |

---

## 대량 업로드 방식 검토 (모니터링 후 논의)

### 배경
캐치업코리아 395건(수백 MB) 테스트에서 파이프라인 이슈가 다수 발견됨. 실제 운영에서는 **10GB급 고객 데이터**도 업로드할 수 있으며, 웹 브라우저 기반 업로드의 한계가 드러남.

### 현재 방식 (웹 업로드) 한계
- 브라우저를 계속 열어두고 진행률 확인 필요
- 네트워크 끊김 시 재시도 불가
- 대용량(10GB+)에서 브라우저 메모리 초과, HTTP 타임아웃 위험
- 서버 파이프라인 과부하 (OCR/PDF 변환 큐 적체)

### 대안: PC 에이전트 방식 (OneDrive 유사)
- AutoClicker에 "문서 폴더 동기화" 모듈 추가 (별도 앱 불필요, 배포 인프라 기존 활용)
- 백그라운드 동기화, 중단/재개, 파일 단위 순차 전송, 서버 부하 자동 조절

### 결론 (2026-03-06)
**지금 당장은 불필요.** 이유:
1. 10GB급 업로드는 최초 마이그레이션 시 1회성, 일상 사용은 소량
2. 이번 이슈들은 업로드 방식이 아닌 **서버 파이프라인 버그** — 에이전트 방식이어도 동일 발생
3. 파이프라인 버그 수정이 우선

**로드맵:**
| 시기 | 항목 | 비고 |
|------|------|------|
| 즉시 | 파이프라인 버그 수정 (ISSUE-1~9) | 현재 웹 방식 안정화 |
| 중기 | chunked upload + 재시도 로직 | 대용량 파일 안정성 (웹) |
| 장기 | AC 폴더 동기화 모듈 | 사용자 요구 발생 시 검토 |

### macOS 에이전트 비용 참고
- **Apple Developer Program**: 연 $99 (macOS + iOS 앱 배포, 코드 서명/공증)
- Python 스크립트 직접 배포 시 무료 가능하나, macOS Gatekeeper 경고 → UX 나쁨
- AutoClicker는 현재 Windows 전용(SikuliX). macOS 설계사 수요 발생 시 검토
- 결론: **현 시점에서 macOS 에이전트 개발 불필요. 수요 발생 시 $99/년 투자**

---

## 서버 부하 추산 (다중 사용자 시나리오)

> 2026-03-06 운영 데이터 + 실측 시스템 그래프 기반 분석.

### 대량 업로드 실측 데이터 (aims-admin 시스템 상태)

395건 업로드 중 시스템 상태 그래프 (2026-03-06 03:00~04:00 KST):

| 지표 | 값 | 판단 |
|------|-----|------|
| **CPU** | 7% (현재), 그래프상 **~50% 지속** (업로드 중) | 4코어 절반 점유 |
| **Memory** | 62% (4.8GB / 7.7GB) | **스왑 상시 사용 중** |
| **Disk (/)** | 51% (55GB / 115.8GB) | OS 디스크 절반 |
| **Disk (/data)** | 7% (110.1GB / 1.8TB) | 여유 충분 |
| 동시접속 | 11 (활성 사용자 1명) | |
| 요청/초 | 0.6 | |
| 피크 요청 | 16/s | |
| 응답시간 평균 | **320.97ms** | |
| 응답시간 P95 | **458.01ms** | |
| 응답시간 P99 | **5,020.99ms** (5초!) | **심각** |
| 부하 지수 | 21.2 (정상) | |
| n8n | **Unhealthy** (ECONNREFUSED) | 사용 안 함, 무시 가능 |

**핵심 관찰:**
- CPU 그래프에서 업로드 시간대(03:00~03:30)에 **~50%까지 상승** 후 서서히 하락
- Memory는 **상시 50% 이상**, 업로드 중 **62%까지 상승**
- **P99 응답시간 5초** — 1명 사용인데 이미 간헐적으로 느린 응답 발생
- 서비스 상태 이력에서 `aims_rag_api:8000` 장애 복구 반복 기록

### 현재 서버 사양 (tars)
| 항목 | 값 |
|------|-----|
| CPU | i5-2400 (2012년, 4코어 3.1GHz) |
| RAM | 7.7GB (4.8GB 사용, **스왑 3.8GB 상시 사용**) |
| 디스크 (/) | 115.8GB (51% 사용) |
| 디스크 (/data) | 1.8TB (7% 사용, 1.6TB 여유) |
| document_pipeline | 516MB 단독 점유 |

### 현재 운영 데이터 (설계사 1명)
- 고객 889명, 문서 2,329건, 저장 1.3GB
- 파일 97%가 1MB 이하 (평균 589KB)
- 캐치업코리아 단독 728MB (전체의 56%)

### 다중 사용자 추산

| 항목 | 1명 (현재) | 10명 | 50명 | 100명 |
|------|-----------|------|------|-------|
| 문서 수 | 2,329 | ~23,000 | ~115,000 | ~230,000 |
| 저장 용량 | 1.3GB | ~20GB | ~100GB | ~200GB |
| 디스크 (/data) | 충분 | 충분 | 충분 | 충분 |
| **RAM** | **위험** (스왑 3.8GB) | **붕괴** | - | - |
| **CPU** | 50% (업로드 중) | **100% 상시** | 불가 | 불가 |
| 동시 업로드 | 400건 가능 (P99 5초) | 큐 붕괴 | - | - |
| API 비용/월 | ~$5 | ~$50 | ~$250 | ~$500 |

### 병목 우선순위
1. **RAM** — 즉시 위험. 1명인데 스왑 3.8GB. 최소 16GB, 권장 32GB
2. **CPU** — 395건 업로드로 50% 도달. 10명 동시 시 포화. 최소 8코어
3. **P99 응답시간** — 1명 사용에 5초. 사용자 증가 시 UX 심각 악화
4. **Worker concurrency** — 단일 worker → 대량 큐잉 시 타임아웃
5. **디스크/API** — 당분간 여유

---

## 서버 교체 비용 추산 (2026-03-06)

### 권장 스펙

| 항목 | 최소 (10명) | 권장 (50명+) | 현재 tars |
|------|------------|-------------|-----------|
| CPU | 8코어/16스레드 | 12코어+ | i5-2400 (4코어, 2012년) |
| RAM | 16GB DDR4 | 32GB DDR4/DDR5 | 7.7GB DDR3 |
| OS 디스크 | **SSD 필수** | NVMe 1TB | HDD 115GB |
| 데이터 디스크 | HDD 2TB | HDD 4TB | HDD 1.8TB |

> 별도 GPU 불필요 — AI 추론은 OpenAI API 사용.

### 신품 가격 (데스크탑 조립 기준)

| 등급 | 구성 예시 | 가격 |
|------|----------|------|
| **가성비 (10명)** | i5-13400 (10코어) / 32GB / NVMe 500GB + HDD 2TB | **60~80만원** |
| **권장 (50명)** | i5-14500 또는 Ryzen 7 7700 (8코어) / 64GB / NVMe 1TB + HDD 4TB | **100~130만원** |
| **여유 (100명+)** | i7-14700 (20코어) 또는 Ryzen 9 7900 / 64GB / NVMe 2TB | **150~200만원** |

### 중고 가격 (기업 리스 반납품 기준)

| 등급 | 구성 예시 | 가격 |
|------|----------|------|
| **최저가** | Dell Optiplex / i7-8700 (6코어) / 32GB / SSD 512GB | **15~25만원** |
| **가성비 추천** | Dell/HP 워크스테이션 / i7-10700 (8코어) / 32GB / NVMe 512GB | **25~40만원** |
| **넉넉** | i7-12700 (12코어) / 64GB / NVMe 1TB | **50~70만원** |

> 중고나라, 용산, 컴퓨존 리퍼 기준. 기업 리스 반납품이 상태 좋고 저렴.

### 현실적 추천

현재 사용자 1명, 당분간 급증 예상 없음 →

**중고 i7-10700 + 32GB + NVMe 512GB ≈ 30~40만원**

예상 개선 효과:
- RAM: 7.7GB → 32GB (스왑 사용 완전 해소)
- CPU: 4코어 → 8코어/16스레드 (처리량 4배)
- 디스크: HDD → NVMe (I/O 10~50배, P99 5초 문제 대폭 개선)
- 기존 /data HDD 1.8TB는 데이터 디스크로 이전 장착 가능

**가장 체감 큰 업그레이드: OS 디스크 SSD/NVMe 전환** — 현재 P99 5초의 상당 부분이 HDD I/O 병목일 가능성 높음.

---

## 이슈 해결 결과 (2026-03-07)

### 해결 완료 (6건)

| 이슈 | 커밋 | 수정 내용 | 검증 |
|------|------|----------|------|
| **ISSUE-1** | `7caf297f` (ISSUE-6+9에 포함) | HWP 변환 실패 → OCR fallback 경로 차단으로 핵심 원인(stuck) 해결 | pytest PASS |
| **ISSUE-2** | `7fd8d051` | FE: `isSystemFileName()` + BE: HTTP 400 반환. SSOT: `file-validation-constants.json` | pytest 10개 + vitest 24개 PASS |
| **ISSUE-6+9** | `7caf297f` | (1) `ocr_worker.py`: 성공 시 `progress:100/progressStage:complete`, 실패 시 `progress:-1/overallStatus:error` (2) `doc_prep_main.py`: `is_convertible_mime()` 체크 → HWP/DOC/PPT OCR 전송 방지 (3) `customers-routes.js`: webhook에서 `ocr.status`가 queued/running이면 completed 보류 | pytest 4개 PASS |
| **ISSUE-7** | `0174d772` | `_notify_progress()`에서 `progress==-1 && stage=="error"` 시 `overallStatus:"error"` 설정 | pytest 3개 PASS |
| **ISSUE-8** | `1f1eda63` | `openai_service.py` fallback: unclassifiable → 안내 메시지, 그 외 → `text[:200]` (raw JSON 저장 방지) | pytest 5개 PASS |
| 테스트 수정 | `06a9b5af` | `test_pipeline_routing.py`: HWP 변환 실패 테스트를 새 동작(OCR 방지→보관)에 맞게 수정 | pytest PASS |

### 해당 없음 (3건)

| 이슈 | 사유 |
|------|------|
| **ISSUE-3** | 이슈 아님 — 텍스트가 없거나 의미 없는 문서(빈 이미지, 손글씨, 명함 사진)를 "분류 불가"로 판정한 것은 AI의 정상 동작. 분류할 수 없는 문서를 분류 불가로 판정하는 것이 올바른 결과 |
| **ISSUE-4** | 이슈 아님 — JPG BIN 뱃지는 OCR 대기 중 임시 상태, OCR 완료 후 자동 해결 |
| **ISSUE-5** | ISSUE-2와 중복 |

### 배포 후 1회성 DB 패치 (167건 stuck 문서 복구)

```javascript
// ocr.status=done인데 progress=70에서 멈춘 문서 → completed
db.files.updateMany(
  { progress: 70, progressStage: "ocr", "ocr.status": "done" },
  { $set: { progress: 100, progressStage: "complete" } }
)

// ocr.status=error인데 progress=70에서 멈춘 문서 → error
db.files.updateMany(
  { progress: 70, progressStage: "ocr", "ocr.status": "error" },
  { $set: { progress: -1, progressStage: "error", overallStatus: "error", status: "failed" } }
)
```

### 전체 테스트 결과

| 테스트 | 결과 |
|--------|------|
| document_pipeline pytest (96건) | ALL PASS |
| aims_api jest (989건) | ALL PASS |
| frontend vitest (24건) | ALL PASS |
| pipeline_routing (326건) | ALL PASS |

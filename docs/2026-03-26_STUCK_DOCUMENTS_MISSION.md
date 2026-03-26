# 멈춘 문서 11건 해결 미션 — 이어서 진행

> 최종 업데이트: 2026-03-26 19:40 KST
> 상태: **진행 중 — 다음 세션에서 계속**

---

## 1. 미션 정의

11개 문제 파일을 프로덕션 서버에 업로드하여 **모든 파일이 의도대로 처리 완료될 때까지 반복**한다.

### 반복 루프 (무한 반복, 성공까지)

```
1. 서버에 최신 코드 배포
2. 11개 파일을 캐치업코리아 고객에게 업로드 (프론트엔드 UI 경유)
3. 적절한 시간 모니터링
4. 판정:
   - 11건 전부 의도대로 completed → 성공! 루프 종료
   - 처리 안 됨 / 에러 → 즉시 중단
     → 11건 DB에서 삭제
     → 원인 분석 → 코드 수정 → 커밋 → 푸시 → 재배포
     → 1번으로 돌아감
```

### 기대 결과

| 유형 | 파일 | 기대 최종 상태 |
|------|------|---------------|
| A | ZIP 5건 + AI 1건 | completed (보관, `processingSkipReason: unsupported_format`) |
| B | HWP 3건 | completed (변환 성공 시 정상처리, 실패 시 보관) |
| C | PPT 1건 | completed (OCR fallback 시도 후 정상 또는 보관) |
| D | JPG 1건 | completed (보관, `processingSkipReason: no_text_extractable`) |

### 규칙
- 파일은 반드시 **캐치업코리아 고객**(ID: `698f3ed781123c52a305ab1d`)에 연결
- 문서 크기가 **0 B로 표시되는 버그**도 함께 수정해야 함
- 적절한 시간 내 처리 안 되면 바로 중단하고 삭제 후 재시도

---

## 2. 테스트 파일

### 로컬 경로
`D:\Users\rossi\Desktop\캐치업코리아` (사용자가 직접 올림)

### 원본 파일 백업
`D:\tmp\stuck-documents\` (서버에서 복사한 원본)

```
typeA_zip_서울중앙.zip          (54MB)   — ZIP 아카이브
typeA_zip_고객거래확인서.zip     (5.6MB)  — ZIP 아카이브
typeA_zip_요청자료.zip          (1.5MB)  — ZIP 아카이브
typeA_zip_노무규정.zip          (862KB)  — ZIP 아카이브
typeA_zip_2018컨설팅.zip        (14MB)   — ZIP 아카이브
typeA_ai_캐치업포멧.ai          (706KB)  — Adobe Illustrator
typeB_hwp_표준취업규칙_최종.hwp  (304KB)  — HWP (변환 타임아웃 이력)
typeB_hwp_20130409_표준취업규칙.hwp (1.1MB) — HWP
typeB_hwp_표준취업규칙.hwp      (1.3MB)  — HWP
typeC_ppt_안영미신분증.ppt      (68KB)   — 이미지 PPT
typeD_jpg_암검진067.jpg         (26KB)   — 빈 이미지
```

---

## 3. 현재 상태 (세션 종료 시점)

### 커밋 이력

| 커밋 | 내용 | push 여부 |
|------|------|-----------|
| `2716aed7` | docs: 상태 정의서 | ✅ pushed |
| `fcd7334e` | docs: 모니터링 보고서 + 이슈 분석 | ✅ pushed |
| `44f4a666` | **R1**: xPipe ExtractStage 보관 처리 + MIME 방어 | ✅ pushed |
| `e0774434` | **R2**: HWP 120초 + OCR fallback + 보관 전용 completed 정의 | ✅ pushed |

### 서버 배포 상태

| 서비스 | 배포 상태 | 근거 |
|--------|----------|------|
| `pdf_converter` (:8005) | ✅ 최신 코드 반영 | HWP 3건이 "완료"로 처리됨 (120초 타임아웃 작동) |
| `document_pipeline` (:8100) | ❌ **구버전** | extract.py에 UNSUPPORTED_EXTENSIONS 등 수정 코드 없음 확인 |

**원인**: deploy_all.sh가 git pull을 했지만 document_pipeline의 venv 환경이나 파일 동기화 문제로 코드가 반영되지 않았을 가능성.

### 마지막 테스트 결과 (3번째 업로드)

| 파일 | 상태 | 크기 | 비고 |
|------|------|------|------|
| HWP 3건 | ✅ 완료 | **0 B (버그)** | HWP 변환+처리 성공, 크기 표시 안 됨 |
| ZIP 5건 | ❌ 40% | 0 B | extract.py 수정 미반영 |
| AI 1건 | ❌ 40% | 0 B | extract.py 수정 미반영 |
| PPT 1건 | ❌ 40% | 0 B | extract.py 수정 미반영 |
| JPG 1건 | ❌ 40% | 0 B | extract.py 수정 미반영 |

### DB 정리 필요

현재 DB에 테스트 업로드 문서가 남아있음:
```javascript
// 삭제 대상 (다음 세션에서 먼저 실행)
db.files.deleteMany({
  customerId: ObjectId("698f3ed781123c52a305ab1d"),
  createdAt: { $gte: ISODate("2026-03-26T10:30:00Z") }
})
```

---

## 4. 다음 세션에서 할 일 (순서대로)

### 4-1. DB 정리
이전 테스트 업로드 11건 삭제

### 4-2. 서버 코드 확인 + 재배포
```bash
# 1. 서버에서 코드 확인
ssh rossi@100.110.215.65 'grep -c "UNSUPPORTED_EXTENSIONS" ~/aims/backend/api/document_pipeline/xpipe/stages/extract.py'
# 0이면 미반영 → 재배포 필요

# 2. 재배포
ssh rossi@100.110.215.65 'cd ~/aims && ./deploy_all.sh'

# 3. 재확인
ssh rossi@100.110.215.65 'grep -c "UNSUPPORTED_EXTENSIONS" ~/aims/backend/api/document_pipeline/xpipe/stages/extract.py'
# 1 이상이어야 함
```

만약 deploy_all.sh 후에도 반영 안 되면:
- document_pipeline의 배포 스크립트를 개별 실행: `./backend/api/document_pipeline/deploy_document_pipeline.sh`
- 또는 서버에서 직접 extract.py 파일 내용 확인

### 4-3. 0 B 파일 크기 버그 수정
모든 파일이 `0 B`로 표시됨. 원인 조사 필요:
- `meta.size_bytes` 필드가 DB에 기록되지 않거나 0인지 확인
- doc_prep_main.py의 보관 처리 분기에서 `len(file_content)`이 0을 반환하는지 확인
- 프론트엔드 표시 로직 문제인지 확인

### 4-4. 업로드 + 모니터링
- `D:\Users\rossi\Desktop\캐치업코리아` 폴더의 11개 파일을 UI에서 캐치업코리아에 업로드
- 1분 간격 모니터링
- 처리 안 되면 → 삭제 → 수정 → 재배포 → 재시도

---

## 5. 관련 문서

| 문서 | 경로 |
|------|------|
| 상태 정의서 | `docs/DOCUMENT_STATUS_DEFINITION.md` |
| 모니터링 보고서 | `docs/2026-03-26_BATCH_UPLOAD_MONITORING_REPORT.md` |
| 이슈 분석 | `docs/2026-03-26_STUCK_DOCUMENTS_ISSUE.md` |

## 6. 수정된 코드 파일 (확인용)

| 파일 | 수정 내용 |
|------|-----------|
| `backend/api/document_pipeline/xpipe/stages/extract.py` | UNSUPPORTED_EXTENSIONS/MIME, 텍스트 0자 보관 처리 |
| `backend/api/document_pipeline/routers/doc_prep_main.py` | MIME 방어 + _process_via_xpipe 보관 분기 |
| `backend/api/document_pipeline/workers/pdf_conversion_worker.py` | ocr_fallback_needed 마커 + OCR 큐 등록 |
| `tools/convert/convert2pdf.js` | HWP_CONVERT_TIMEOUT_MS 60→120초 |
| `backend/api/document_pipeline/tests/test_extract_unsupported.py` | regression 35건 |
| `backend/api/document_pipeline/tests/test_round2_hwp_ocr_fallback.py` | regression 5건 |
| `backend/api/document_pipeline/tests/test_pdf_conversion_queue.py` | TC-01 업데이트 |

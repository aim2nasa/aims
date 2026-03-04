# OCR 기반 이미지 파일 별칭(displayName) 자동 생성

**작성일**: 2026-03-04
**상태**: 완료 (배포 + backfill 완료)

---

## 1. 배경 및 목적

### 문제
이미지 파일(img015.jpg 등)은 파일명만으로 내용을 파악할 수 없다. 설계사가 수백~수천 건의 문서를 관리할 때, `img001.jpg` ~ `img020.jpg` 같은 파일명은 사실상 무의미하다.

### 기존 시스템
AR/CRS PDF 문서는 이미 PDF 텍스트 파싱을 통해 `displayName`을 자동 생성:
- AR: `{고객명}_AR_{YYYY-MM-DD}.pdf` (예: `홍길동_AR_2024-03-01.pdf`)
- CRS: `{고객명}_CRS_{상품명}_{YYYY-MM-DD}.pdf`

프론트엔드에는 별칭/원본 토글 기능이 이미 구현되어 있어, `displayName` 필드만 채워주면 자동으로 동작한다.

### 해결 방안
OCR 처리 완료 시 AI(OpenAI)가 생성하는 summary에서 **짧은 제목**도 함께 추출하여 `displayName`으로 저장. 추가 API 비용 없이 기존 summary 생성 호출에 "제목" 항목만 추가.

---

## 2. 아키텍처

```
이미지 업로드
    ↓
document_pipeline (doc_prep_main.py)
    ↓ OCR 필요 판단
Redis Stream 큐잉
    ↓
OCR Worker (ocr_worker.py)
    ├─ Upstage API로 텍스트 추출 (full_text)
    ├─ OpenAI로 요약+태그+제목 생성 ← [변경점: 제목 추가]
    ├─ displayName 설정 ← [변경점: 신규 로직]
    └─ MongoDB 저장 + SSE 알림
    ↓
프론트엔드 (변경 없음)
    └─ 별칭/원본 토글로 displayName 표시
```

### 안전장치
- AR/CRS 문서의 기존 `displayName`은 절대 덮어쓰지 않음 (`not doc.get("displayName")` 체크)
- 파일 확장자 유지 (`.jpg`, `.png` 등)
- 특수문자 제거 + 40자 제한

---

## 3. 변경 파일 목록

| 파일 | 변경 내용 |
|------|----------|
| `backend/api/document_pipeline/services/openai_service.py` | 프롬프트에 "제목" 추가, 파서에 `제목:` 파싱, 리턴에 `title` 추가 |
| `backend/api/document_pipeline/workers/ocr_worker.py` | `import re` 추가, `_process_ocr()`에 title 패스스루, `_handle_ocr_success()`에 displayName 생성 |
| `backend/api/document_pipeline/scripts/backfill_display_names.py` | 기존 OCR 완료 문서 일괄 별칭 생성 스크립트 (신규) |

---

## 4. 구현 상세

### 4-1. openai_service.py 수정 (line 188~196, 224~242)
**변경 전 프롬프트:**
```
요약: [요약 내용]
태그: [태그1], [태그2], [태그3]
```

**변경 후 프롬프트:**
```
제목: [문서 내용을 대표하는 짧은 제목, 최대 40자]
요약: [요약 내용]
태그: [태그1], [태그2], [태그3]
```

- 파서에 `제목:` 라인 파싱 추가
- 리턴: `{"summary": ..., "tags": [...], "title": "...", "truncated": bool}`
- 추가 API 비용: 0 (동일 호출에 제목 요청만 추가)

### 4-2. ocr_worker.py 수정
**(a)** `_process_ocr()` (line 191) — summary 결과에서 `title` 패스스루:
```python
"title": result.get("title") if result else None,
```

**(b)** `_handle_ocr_success()` (line 272~292) — title → displayName 변환:
```python
# title이 있고, 기존 displayName이 없는 경우에만 설정
title = ocr_result.get("title")
if title:
    doc = await collection.find_one({"_id": ObjectId(file_id)}, {"displayName": 1, "upload.originalName": 1})
    if doc and not doc.get("displayName"):
        ext = os.path.splitext(original_name)[1].lower()
        safe_title = re.sub(r'[\\/:*?"<>|]', '', title).strip()[:40]
        ocr_update["displayName"] = f"{safe_title}{ext}"
```

### 4-3. backfill 스크립트
- 대상: `ocr.status="done"` + `full_text`/`summary` 존재 + `displayName` 없음 + AR/CRS 아님
- gpt-4o-mini로 full_text에서 제목 추출 (summary가 null인 기존 문서 대응)
- 서버에서 1회 실행

---

## 5. 구현 진행 기록

### Step 1: openai_service.py 수정 ✅
- [x] 프롬프트에 "제목" 응답 형식 추가
- [x] 파서에 `제목:` 라인 파싱 추가
- [x] 리턴 dict에 `title` 키 추가

### Step 2: ocr_worker.py 수정 ✅
- [x] `import re` 추가
- [x] `_process_ocr()` title 패스스루
- [x] `_handle_ocr_success()` displayName 생성 로직 (AR/CRS 보호 포함)

### Step 3: backfill 스크립트 ✅
- [x] `backfill_display_names.py` 작성
- [x] 서버에서 실행

### Step 4: 배포 및 검증 ✅
- [x] document_pipeline PM2 재시작
- [x] backfill 실행: **92건 성공, 0건 실패, 1건 스킵** (full_text 없는 문서)
- [ ] 프론트엔드 토글 확인 (사용자 확인 대기)

---

## 6. 검증 결과

### MongoDB 검증
```
displayName 총: 2,021건
  - AR/CRS: 1,929건 (기존)
  - OCR 기반: 92건 (신규)
```

### backfill 샘플 결과

| 원본 파일명 | 생성된 별칭 |
|------------|-----------|
| `img015.jpg` | `김보성 환자 진료비 계산서 및 영수증.jpg` |
| `img001.jpg` | `주민등록표 등본 발급 확인서.jpg` |
| `캐치업통장.png` | `캐치업코리아 계좌 개설 확인서.png` |
| `3rNKIxPRY2E8xsvlEv80Pk_i_66h5du.jpg` | `요양기관 진료비 세부내역서.jpg` |
| `김보성진단서(망막박리2023.02).pdf` | `김보성 환자 망막 수술 진단서.pdf` |
| `구본미졸업증명서.pdf` | `홍익대학교 졸업 및 석사 학위 증명서.pdf` |
| `유아영.xlsx` | `2023년 4월 급여 및 지출 내역.xlsx` |

### 비용 분석
- 신규 업로드: 추가 비용 0 (기존 OpenAI 호출에 제목 요청 추가)
- backfill 92건: gpt-4o-mini 약 $0.01 미만

---

## 7. 향후 개선 가능

1. **meta.full_text 기반 확장**: OCR 없이 PDF 텍스트만 추출된 문서(MetaService 경로)에도 제목 생성 가능
2. **수동 편집 UI**: 사용자가 별칭을 직접 수정하는 기능
3. **중복 별칭 구분**: 동일 내용의 여러 문서(예: 진료비 영수증)에 날짜/순번 추가

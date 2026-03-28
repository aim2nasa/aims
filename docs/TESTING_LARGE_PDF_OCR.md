---
name: 대용량 PDF OCR 분할 E2E 테스트 방법
description: 38MB PDF 업로드 → 분할 OCR → 완료 검증 절차. 재테스트 시 참조
type: reference
---

## 테스트 대상

38MB 이미지 PDF: `D:\Users\rossi\Documents\TestData\캐치업코리아\김보성,안영미\안영미\2022.9.27건강검진(안영미).pdf`

## 사전 준비

1. 파일을 Playwright 허용 경로로 복사 (aims 루트 아래):
   ```
   D:\aims\_tmp_upload\캐치업코리아\김보성,안영미\안영미\2022.9.27건강검진(안영미).pdf
   ```
2. 기존 동일 파일이 DB에 있으면 **UI에서 삭제** (중복 해시 차단됨)

## 테스트 절차

### 1. 기존 문서 삭제 (중복 방지)
- aims.giize.com 로그인 (PIN: 3007)
- 전체 문서 보기 → 해당 파일 행에 **호버** → 삭제 버튼 클릭 → 확인

### 2. 파일 업로드
- 고객·계약·문서 등록 → **일반 문서** 탭
- 고객 선택: "캐치업코리아" 검색 → 선택 완료
- 파일 업로드 영역 클릭 → 위 경로의 PDF 선택
- 업로드 완료 대기 (38MB, 약 30초)

### 3. 처리 대기 및 검증
- 전체 문서 보기에서 해당 문서 상태 모니터링
- 파이프라인 처리 순서: 업로드 → xPipe extract → OCR 분할 → 요약/분류 → 임베딩
- 예상 소요: 분할 OCR 2-5분 + 임베딩 크론 1분

### 4. 검증 항목

**DB 확인 (MongoDB MCP):**
```
files 컬렉션: { "upload.originalName": /건강검진.*안영미/ }
```
- `overallStatus`: `completed`
- `meta.full_text` 또는 `ocr.full_text`: 텍스트 존재 (≥10자)
- `document_type`: `health_checkup` 또는 `general`
- `docembed.status`: `done`
- `meta.size_bytes`: ~39MB (0B가 아님)

**UI 확인:**
- 전체 문서 보기에서 "완료" 표시
- 크기: 37.81 MB (0B가 아님)

**서버 로그 확인:**
```bash
ssh rossi@100.110.215.65 'pm2 logs document_pipeline --lines 50 --nostream'
```
- `[ChunkedOCR]` 또는 `PDF 분할` 로그 확인
- 각 청크 완료 로그 확인

## 주의사항
- 서버에서 curl 직접 업로드는 **금지됨** (사용자 거부)
- Playwright file_upload 경로는 `d:\aims` 하위만 허용
- 중복 파일은 해시 비교로 차단됨 → 반드시 기존 삭제 후 재업로드

# 멈춘 문서 테스트 절차서

> 이 문서를 따라하면 어느 세션에서든 동일한 테스트를 재현할 수 있습니다.
> 마지막 업데이트: 2026-03-27 04:30 KST

---

## 1. 사전 조건

- 서버 배포 완료 (`deploy_all.sh`)
- 로컬에 테스트 파일 존재 (아래 경로)
- `.gitignore`에 `_tmp_upload/` 등록됨

---

## 2. 테스트 파일

### 경로
```
D:\aims\_tmp_upload\캐치업코리아\   ← 36건 (정상 25 + 멈춤 11)
```
> 원본: `D:\Users\rossi\Desktop\캐치업코리아\` (정상\ + 멈춤 파일들\)

### 정상 파일 목록 (25건)
| # | 파일명 | 타입 | 기대 결과 |
|---|--------|------|----------|
| 1 | (완료)등기부등본_(주)캐치업코리아_250326.pdf | PDF | TXT, legal_document |
| 2 | (주)캐치업코리아 2025. 02월 퇴직연금 부담금 내역.xls | XLS | TXT, hr_document, PDF변환 |
| 3 | (주)캐치업코리아_사업자등록증_231218.pdf | PDF | TXT, corp_basic |
| 4 | [비용+준비서류 안내]_(주)캐치업코리아_250318.pdf | PDF | TXT, legal_document |
| 5 | 교하로501-증권-30만원.pdf | PDF | TXT, policy |
| 6 | 김보성 종신제안.xlsx | XLSX | TXT, policy, PDF변환 |
| 7 | 김보성님-운전자보험-20250515.pdf | PDF | TXT, policy |
| 8 | 김보성님운전자보험청약서.pdf | PDF | TXT, application |
| 9 | 마장사은품.pptx | PPTX | OCR, unclassifiable, PDF변환 |
| 10 | 방촌로1172-5-증권-100만원.pdf | PDF | TXT, policy |
| 11 | 방촌로1172-5-증권-150만원.pdf | PDF | TXT, policy |
| 12 | 브라운스톤-증권-10만원.pdf | PDF | TXT, policy |
| 13 | 손익(주)라이콘코리아.pdf | PDF | TXT, corp_tax |
| 14 | 손익(주)캐치업코리아.pdf | PDF | TXT, corp_tax |
| 15 | 유아영.xlsx | XLSX | TXT, general, PDF변환 |
| 16 | 정관_캐치업코리아.hwp | HWP | TXT, corp_basic, PDF변환 |
| 17 | 캐치업사업비내역서.pdf | PDF | TXT/OCR, policy |
| 18 | 캐치업상품설명서.pdf | PDF | TXT, policy |
| 19 | 캐치업자동차견적.jpg | JPG | OCR, policy |
| 20 | 캐치업청약서 (1).pdf | PDF | TXT, application |
| 21 | 캐치업청약서.pdf | PDF | TXT, application |
| 22 | 캐치업코리아-낙하리_DB손보.pdf | PDF | TXT, policy |
| 23 | 캐치업코리아-낙하리_현대해상.pdf | PDF | TXT, policy |
| 24 | 캐치업코리아-자필서류-20240813.pdf | PDF | TXT, application |
| 25 | 캔버스보관렉.pptx | PPTX | TXT, general, PDF변환 |

### 멈춤 파일 목록 (11건) — 핵심 검증 대상
| # | 파일명 | 타입 | 기대 결과 | 검증 포인트 |
|---|--------|------|----------|------------|
| 1 | 20130409_121226표준취업규칙(최종).hwp | HWP | TXT, 인사/노무, PDF변환 | **이슈1**: conversion_pending → 폴링 유지 → 자동 TXT 전환 |
| 2 | 2018컨설팅자료.zip | ZIP | BIN, 미지정, 보관 | |
| 3 | 서울중앙 2019가합585938 김보성.zip | ZIP | BIN, 미지정, 보관 | |
| 4 | 안영미신분증.ppt | PPT | OCR, 신분증, PDF변환 | **이슈2**: ocr.summary API 포함 → 요약 버튼 활성 |
| 5 | 암검진067.jpg | JPG | OCR, 미지정, 완료 | **이슈3**: image/* MIME → OCR 배지 |
| 6 | 캐치업코리아 요청자료.zip | ZIP | BIN, 미지정, 보관 | |
| 7 | 캐치업코리아 표준취업규칙(최종).hwp | HWP | TXT, 인사/노무, PDF변환 | **이슈1**: 동일 |
| 8 | 캐치업코리아-고객거래확인서,FATCA확인서.zip | ZIP | BIN, 미지정, 보관 | |
| 9 | 캐치업코리아노무규정.zip | ZIP | BIN, 미지정, 보관 | |
| 10 | 캐치업포멧.ai | AI | BIN, 미지정, 보관 | |
| 11 | 표준취업규칙(최종).hwp | HWP | TXT, 인사/노무, PDF변환 | **이슈1**: 동일 |

---

## 3. 테스트 절차

### 3-1. DB 정리 (이전 테스트 데이터 삭제)
```bash
ssh rossi@100.110.215.65 "mongosh --quiet --eval 'db.files.deleteMany({customerId: ObjectId(\"698f3ed781123c52a305ab1d\")})' docupload"
```
> 전체 삭제 (캐치업코리아는 테스트 전용 고객이므로 날짜 필터 불필요)

### 3-2. 업로드용 임시 폴더 준비
```bash
# 이미 준비되어 있으면 생략. 최초 1회만 실행:
rm -rf "D:/aims/_tmp_upload"
mkdir -p "D:/aims/_tmp_upload/캐치업코리아"
cp "D:/Users/rossi/Desktop/캐치업코리아/정상"/* "D:/aims/_tmp_upload/캐치업코리아/"
cp "D:/Users/rossi/Desktop/캐치업코리아/멈춤 파일들"/* "D:/aims/_tmp_upload/캐치업코리아/"
ls "D:/aims/_tmp_upload/캐치업코리아/" | wc -l  # → 36
```

### 3-3. 문서 일괄등록으로 업로드
1. `https://aims.giize.com` 접속 → 카카오 로그인 → PIN: 3007
2. 좌측 메뉴 **빠른 작업 → 문서 일괄등록** 클릭
3. 폴더 선택 영역 클릭 → `D:\aims\_tmp_upload\캐치업코리아` 선택
4. "캐치업코리아 · 36개 · 매칭" 확인 → **"1개 폴더 업로드 시작"** 클릭
5. 36건 업로드 완료 확인 (약 20초)

### 3-4. 전체 문서 보기에서 모니터링
좌측 메뉴 **문서 → 전체 문서 보기** 클릭 후 **새로고침 없이** 관찰:

| 시간 | 예상 상태 |
|------|----------|
| 0~30초 | 대부분 10%, 0 B, BIN. 상단 "문서 처리 0/36" |
| 1~2분 | PDF 파일들 → TXT 배지 + 문서유형 표시. 처리율 50~70% |
| 2~3분 | PPT/PPTX → OCR/TXT 배지 (PDF 변환 후). JPG → OCR 배지 |
| 3~7분 | HWP → conversion_pending → 변환 워커 처리 → TXT 배지 + PDF 배지 |
| 7~10분 | 임베딩 완료 → 36/36 완료 (일부 HWP는 변환 시간에 따라 지연 가능) |

**핵심 검증 포인트 (3건 이슈)**:

1. **이슈1: 조기 completed (HWP)**
   - [ ] HWP 파일이 `BIN 60%` → `TXT 100%` → `TXT 완료`로 **새로고침 없이** 자동 전환
   - [ ] 특히 표준취업규칙.hwp 3건이 인사/노무 유형으로 분류됨
   - 실패 시: DB에서 `overallStatus`가 `completed`인데 `status`가 `converting`이면 조기 completed 재발

2. **이슈2: ocr.summary API**
   - [ ] 안영미신분증.ppt → OCR 배지 + 신분증 유형 + **요약 버튼 활성(disabled 아님)**
   - 실패 시: API 응답에 `ocr.summary`가 누락됨 → `documents-routes.js` 확인

3. **이슈3: 이미지 OCR 배지**
   - [ ] 암검진067.jpg → **OCR 배지** (BIN이 아님)
   - 실패 시: badgeType 계산에서 `image/*` MIME 체크 누락

### 3-5. DB 검증
```bash
ssh rossi@100.110.215.65 'mongosh --quiet tars:27017/docupload --eval '"'"'
var docs = db.files.find(
  {customerId: ObjectId("698f3ed781123c52a305ab1d"), createdAt: {$gte: ISODate("2026-03-26T00:00:00Z")}},
  {overallStatus:1, progress:1, "docembed.status":1, "upload.originalName":1, "upload.conversion_status":1, document_type:1, "meta.full_text":1}
).toArray();
print("총: " + docs.length);
var completed = docs.filter(d => d.overallStatus === "completed").length;
var embedDone = docs.filter(d => (d.docembed||{}).status === "done").length;
var embedSkipped = docs.filter(d => (d.docembed||{}).status === "skipped").length;
print("completed: " + completed + " | embed done: " + embedDone + " | skipped: " + embedSkipped);
// 문제 파일 출력
docs.filter(d => d.overallStatus !== "completed" || ((d.docembed||{}).status !== "done" && (d.docembed||{}).status !== "skipped")).forEach(d => {
  print("⚠️ " + (d.upload||{}).originalName + " | " + d.overallStatus + " | embed:" + ((d.docembed||{}).status||"-"));
});
'"'"''
```

**기대 결과**:
```
총: 36
completed: 36 | embed done: ~29 | skipped: ~7
```
> HWP 변환 시간에 따라 일부 문서가 아직 processing일 수 있음. 10분 후 재확인.

### 3-6. 임시 폴더 정리 (선택)
```bash
# 재테스트 가능성이 있으면 보존. .gitignore에 등록되어 있음.
# rm -rf "D:/aims/_tmp_upload"
```

---

## 4. 성공 기준

| 항목 | 기준 |
|------|------|
| 36건 전부 completed | overallStatus === "completed" (HWP 변환 완료 후) |
| progress 100% | 36건 전부 progress >= 100 |
| embed done + skipped = 36 | 텍스트 있는 파일 done, 없는 파일 skipped |
| conversion_failed 0건 | processingSkipReason에 conversion_failed 없음 |
| UI 자동 갱신 (이슈1) | **새로고침 없이** HWP가 BIN→TXT+인사/노무로 자동 전환 |
| 요약 버튼 활성 (이슈2) | 안영미신분증.ppt 요약 버튼이 disabled 아님 |
| 이미지 OCR 배지 (이슈3) | 암검진067.jpg가 OCR 배지 |

---

## 5. 고객 정보

- 고객명: 캐치업코리아
- 고객 ID: `698f3ed781123c52a305ab1d`
- 고객 유형: 법인

---

## 6. 서버 정보

- 서버: `rossi@100.110.215.65` (Tailscale VPN)
- DB: `tars:27017/docupload`
- 배포: `cd ~/aims && bash deploy_all.sh`

# MetLife PDF 다운로드 스킬

이 스킬은 MetLife 고객목록조회에서 특정 초성의 고객들에 대해 **변액리포트 + Annual Report**를 PDF로 다운로드합니다.

## 트리거 키워드
- "/metlife-pdf <초성>"
- "metlife pdf 다운로드 <초성>"
- "<초성> 변액리포트 다운로드"
- "<초성> annual report 다운로드"

## 파라미터

| 파라미터 | 필수 | 설명 | 예시 |
|----------|------|------|------|
| 초성 | ✅ | 대상 고객의 초성 | ㄱ, ㄴ, ㅇ, 기타 |

**지원 초성:** ㄱ, ㄴ, ㄷ, ㄹ, ㅁ, ㅂ, ㅅ, ㅇ, ㅈ, ㅊ, ㅋ, ㅌ, ㅍ, ㅎ, 기타

## 사용 예시

```
/metlife-pdf ㄱ
/metlife-pdf ㅇ
/metlife-pdf 기타
```

## 저장 경로

```
D:\captures\metlife_ocr\{초성}\
├── page_*.png              # 페이지 캡처 이미지
├── page_*.json             # OCR 결과
├── run_*.log               # 실행 로그
├── checkpoint.json         # 마지막 처리 위치 (재개용)
├── errors.json             # 오류 발생 고객 목록
└── pdf\                    # PDF 저장 폴더
    ├── {고객명}_변액리포트.pdf
    └── {고객명}_AnnualReport.pdf
```

## 실행 절차

### Phase 1: 준비
```bash
# 스크린샷 폴더 비우기
cmd.exe /c "rd /s /q D:\aims\tools\MetlifePDF.sikuli\screenshots 2>nul & mkdir D:\aims\tools\MetlifePDF.sikuli\screenshots"
```

### Phase 2: 실행
```bash
# PowerShell 백그라운드로 SikuliX 실행 (--integrated-view 옵션 필수!)
powershell.exe -Command "Set-Location 'D:\aims\tools\MetlifePDF.sikuli'; java '-Dfile.encoding=UTF-8' -jar 'C:\SikuliX\sikulixide-2.0.5.jar' -r 'MetlifeCustomerList.py' -- --chosung '{초성}' --integrated-view"
```
- `run_in_background: true` 옵션 사용
- TaskOutput으로 상태 모니터링

### Phase 2-1: 재개 (오류 발생 후)
```bash
# --resume 옵션으로 중단 지점부터 재개
powershell.exe -Command "Set-Location 'D:\aims\tools\MetlifePDF.sikuli'; java '-Dfile.encoding=UTF-8' -jar 'C:\SikuliX\sikulixide-2.0.5.jar' -r 'MetlifeCustomerList.py' -- --chosung '{초성}' --integrated-view --resume"
```
- checkpoint.json에서 마지막 처리 위치 자동 로드
- 해당 네비/스크롤 페이지까지 자동 이동
- 마지막 처리 고객 다음부터 처리 재개

### Phase 3: 완료 대기
- TaskOutput block=false로 주기적 확인
- 로그 파일 모니터링: `D:\captures\metlife_ocr\{초성}\run_*.log`
- "=== 실행 종료 ===" 문자열로 완료 판단

### Phase 4: 결과 분석 및 리포트 생성
1. 로그 파일 읽기 (`D:\captures\metlife_ocr\{초성}\run_*.log` - 가장 최근 파일)
2. 다운로드 결과 파싱:
   - 성공: 변액리포트 N건, Annual Report N건
   - 실패: 사유별 분류
3. **`D:\captures\metlife_ocr\{초성}\report_{초성}.md` 파일 생성** (필수!)

## 결과 보고 형식

```markdown
# MetLife PDF 다운로드 결과 - {초성}

## 요약
| 항목 | 값 |
|------|-----|
| 대상 초성 | {초성} |
| 총 고객 수 | N명 |
| 변액리포트 | N건 |
| Annual Report | N건 |
| 실패 | N건 |

## 상세 결과
| No | 고객명 | 변액리포트 | Annual Report | 비고 |
|----|--------|-----------|---------------|------|
| 1 | 홍길동 | ✅ | ✅ | |
| 2 | 김철수 | ✅ | ❌ | 리포트 없음 |
```

## 오류 발생 시 재개

### checkpoint.json (자동 저장)
매 고객 처리 성공 시 자동 저장됩니다:
```json
{
  "마지막고객": "강민수",
  "초성": "ㄱ",
  "네비페이지": 1,
  "스크롤페이지": 3,
  "행": 5,
  "시간": "2026-01-29 23:45:00"
}
```

### errors.json (오류 발생 시)
오류 발생 고객 정보가 누적됩니다:
```json
[
  {
    "고객명": "고채윤",
    "초성": "ㄱ",
    "네비페이지": 1,
    "스크롤페이지": 3,
    "행": 2,
    "오류": "변액보험리포트 X 버튼 찾을 수 없음",
    "시간": "2026-01-29 23:40:00"
  }
]
```

### 재개 명령
```bash
# 중단 지점부터 자동 재개
--resume 옵션 추가
```
- checkpoint.json에서 위치(네비페이지, 스크롤페이지, 행) 읽음
- 해당 위치까지 자동 이동 (다음 버튼, Page Down)
- 마지막 처리 고객 다음 행부터 처리 재개

## 주의사항

- SikuliX는 GUI 자동화 도구이므로 **화면이 보이는 상태**에서만 동작
- MetLife 고객목록조회 화면이 열려 있어야 함
- 백그라운드 실행 시 PowerShell 사용 필수
- 실행 전 반드시 스크린샷 폴더 비우기
- PDF 다운로드에는 고객 수에 따라 상당한 시간 소요
- **재개 시 스크린샷 폴더 비우지 않음** (기존 스크린샷 유지)

## 관련 파일

| 파일 | 용도 |
|------|------|
| `tools/MetlifePDF.sikuli/MetlifeCustomerList.py` | 메인 스크립트 |
| `tools/MetlifePDF.sikuli/verify_customer_integrated_view.py` | 고객통합뷰 진입/리포트 다운로드 모듈 |
| `D:\captures\metlife_ocr\` | 캡처/PDF 저장 루트 |

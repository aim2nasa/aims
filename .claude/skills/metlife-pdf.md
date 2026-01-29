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
powershell.exe -Command "Set-Location 'D:\aims\tools\MetlifePDF.sikuli'; java -jar 'C:\SikuliX\sikulixide-2.0.5.jar' -r 'MetlifeCustomerList.py' -- --chosung '{초성}' --integrated-view"
```
- `run_in_background: true` 옵션 사용
- TaskOutput으로 상태 모니터링

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

## 주의사항

- SikuliX는 GUI 자동화 도구이므로 **화면이 보이는 상태**에서만 동작
- MetLife 고객목록조회 화면이 열려 있어야 함
- 백그라운드 실행 시 PowerShell 사용 필수
- 실행 전 반드시 스크린샷 폴더 비우기
- PDF 다운로드에는 고객 수에 따라 상당한 시간 소요

## 관련 파일

| 파일 | 용도 |
|------|------|
| `tools/MetlifePDF.sikuli/MetlifeCustomerList.py` | 메인 스크립트 |
| `tools/MetlifePDF.sikuli/verify_customer_integrated_view.py` | 고객통합뷰 진입/리포트 다운로드 모듈 |
| `D:\captures\metlife_ocr\` | 캡처/PDF 저장 루트 |

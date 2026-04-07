# 토의: HWP 변환 실패 시 60%에서 영구 stuck (#19)

## 배경
- 권보경동의서.hwp, 권보경위임장.hwp — progress 60%, conversion_queued에서 영구 stuck
- LibreOffice HWP 변환 실패 → "변환 대기" → 큐 미등록 → stuck

## 원인
doc_prep_main.py:2087-2106에서 is_convertible_mime()이고 텍스트 추출 실패 시
무조건 "변환 대기"로 전환. skip_reason이 "conversion_failed"(이미 변환 시도 실패)인 경우도
동일하게 대기로 빠짐 → 큐에도 등록 안 되고 conv_status도 미설정 → 영구 stuck.

## 수정
skip_reason == "conversion_failed"인 경우 "변환 대기"가 아닌 에러 상태로 전환.
corrupted_pdf 에러 처리 패턴과 동일하게 status: failed, overallStatus: error 설정.

## 추가: pre-commit hook 강화
fix/ 브랜치에서 코드 변경 시 regression 테스트 포함 필수.
테스트 없이 커밋 시 hook이 차단.

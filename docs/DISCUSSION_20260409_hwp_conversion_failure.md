# HWP PDF 변환 실패 — 토의 보고서

**날짜:** 2026-04-09
**이슈:** #39 — HWP 파일 PDF 변환 실패 (권보경동의서/위임장)
**브랜치:** fix/hwp-pdf-conversion-failure-39

## 현상

HWP 파일 업로드 시 "파일 변환에 실패했습니다. 지원되지 않는 형식이거나 파일이 손상되었을 수 있습니다." 에러 발생.

## 근본 원인

1. **soffice(LibreOffice) 직접 호출의 구조적 불안정**: soffice가 HWP 파일 변환 중 hang → 60초 타임아웃 → 에러 표시
2. **xPipe 파이프라인에 ConvertStage 미등록**: 변환 단계가 파이프라인에 없어 ExtractStage가 인라인으로 변환을 시도하는 비정상 구조
3. **변환 실패 시 즉시 에러 표시**: pdf_conversion_worker가 백그라운드에서 복구하더라도 사용자가 이미 에러를 봄

## 기각된 방안

- **타임아웃 확대 + 재시도**: 증상 완화일 뿐 soffice hang이라는 근본 원인을 해결하지 못함

## 수정 내용

1. **soffice 직접 호출 완전 제거** — `ConvertStage._try_soffice_direct()` 삭제, pdf_converter 서비스 전용으로 단일화
2. **ConvertStage를 xPipe 파이프라인에 등록** — extract 앞에 convert 단계 추가
3. **변환 실패 시 큐 위임** — 에러 대신 `pdf_conversion_worker` 큐에 위임하여 백그라운드 재처리. 큐 등록 실패 시에만 에러 표시 (fallback)
4. **에러 로깅 개선** — `except Exception: pass` → 실패 원인 warning 로그 기록

## 검증

- Regression 테스트 21개 PASS
- dev 환경에서 HWP 파일 업로드 → 에러 없이 완료 확인

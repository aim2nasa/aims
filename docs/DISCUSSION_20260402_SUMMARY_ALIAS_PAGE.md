# 토의 보고서: Summary/Alias/Pagination 버그 수정 (2026-04-02)

## 참여: 사용자, Claude

---

## 이슈 1: full_text 없이 summary가 존재하는 버그

### 현상
- `.ai` 파일(캐치업포멧.ai) — full_text가 없는데 `meta.summary`에 AI 환각 요약이 존재
- DB 문서 ID: `69c77f714931cf818e4fdf4c`
- summary 내용: 파일 경로명에서 AI가 추론한 내용 (실제 파일 내용 아님)

### 원인
`doc_prep_main.py` xPipe 처리 경로 2곳에서 **파일명을 `summarize_text()`에 전달**하여 summary 생성:
1. 보관 파일 경로 (line 2306-2318): `_sanitize_filename_for_prompt(original_name)` → `summarize_text()`
2. 일반 경로 (line 2405-2406): full_text 부족 시 파일명 fallback → `summarize_text()`

### 합의된 원칙
> **`summary`는 `full_text`의 AI 요약이다. full_text가 없으면 summary도 없어야 한다.**

- `full_text` = 파싱 또는 OCR로 읽은 원문
- `summary` = full_text를 AI로 요약한 것
- 이 1:1 종속 관계를 위반하는 구현은 수정 대상

### 수정 방향
- 파일명 기반 `summarize_text()` 호출에서 `document_type`(분류)은 유지
- `summary`와 `title`은 full_text가 존재할 때만 저장
- 파일명 fallback 경로: `summary = ""`, `title = ""` 강제

---

## 이슈 2: full_text 없는 파일의 AI별칭 생성 불가

### 현상
- `.ai` 파일 선택 → "완료" 클릭 → 별칭 생성 안됨 (그냥 종료)
- `doc_display_name.py`에서 텍스트 10자 미만이면 `insufficient_text`로 스킵
- 원본 파일명(originalName)으로 별칭 생성하는 폴백 없음

### 합의된 원칙
> **10자 임계값은 논리적 근거 없음 — 제거한다.**
> **원본 파일명으로 의미 있는 별칭을 만들 수 있는지의 판단은 AI에게 위임한다.**

- full_text가 없으면 originalName을 AI(`generate_title_only()`)에 전달
- AI가 "이 원본 이름으로 의미 있는 별칭을 만들 수 있는가" 판단
- 가능하면 생성, 불가능하면 스킵
- 호출 우선순위: full_text > originalName

### 수정 방향
- `_extract_text_from_document()`에서 10자 임계값 제거
- text 추출 실패 시 originalName fallback 추가
- `generate_title_only()` 프롬프트에서 AI가 판단하도록 지시

---

## 이슈 3: F5 새로고침 시 1페이지로 리셋

### 현상
- 전체 문서 보기에서 특정 페이지 탐색 후 F5 → 1페이지로 리셋
- `DocumentStatusProvider.tsx` line 66: `useState<number>(1)` — URL 연동 없음

### 합의된 방향
- URL search param (`?page=N`)으로 현재 페이지 관리
- 기존 URL param 패턴(`view`, `customerId`, `tab` 등)과 일관
- 기술적 구현은 Alex에게 위임

---

## 부수 작업
- 기존 DB의 오염 데이터 정리 (파일명 기반으로 생성된 잘못된 summary 제거)

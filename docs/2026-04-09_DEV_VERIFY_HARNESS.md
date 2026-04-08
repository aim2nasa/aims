# dev 검증 하네스 보고서

> 2026-04-09 제정. 커밋 전 dev 검증 의무화를 구조적으로 강제하는 하네스.

## 배경

### 문제

Claude가 정의된 개발 프로세스(/compact-fix, /ace-process)를 무시하고 코드를 바로 수정한 뒤 커밋하는 패턴이 반복됨. CLAUDE.md 규칙, 메모리, 텍스트 주입 등 텍스트 기반 규칙은 모두 무시 가능하여 실효성이 없었음.

### 핵심 원칙

**커밋 = 검증 완료 보증.** 미검증 코드 커밋은 git 히스토리의 품질을 오염시킨다.

### 해결 방향

텍스트 규칙이 아닌 **구조적 강제** - 검증을 통과하지 않으면 커밋 자체가 물리적으로 불가능하게 만든다.

## 하네스 구조

```
코드 수정
    |
    v
py scripts/dev_verify.py          <-- 검증 스크립트 실행
    |
    +-- 프론트엔드 변경? --> npm run build + npm test
    +-- 백엔드 변경?    --> Python 구문 검사 + pytest
    |
    +-- FAIL --> 마커 미생성, 커밋 불가
    +-- PASS --> .dev-verified 생성 (VERIFIED:{해시})
    |
    v
git commit 시도
    |
    v
[Layer 1] pre_commit_review.py (Claude Code PreToolUse 훅)
    |
    +-- .gini-approved 마커 확인 (Gini 검수 게이트)
    +-- main 브랜치 코드 커밋 차단
    +-- regression 테스트 포함 여부 확인
    +-- .dev-verified 해시 검증              <-- 핵심
    +-- 이슈 기록 확인
    +-- 밴드에이드 패턴 감지
    +-- 서비스별 테스트 실행
    |
    v
[Layer 2] .git/hooks/pre-commit (git 훅)
    |
    +-- .dev-verified 존재 확인
    +-- VERIFIED: 접두사 확인 (touch 위조 차단)
    +-- Python 구문 검사
    +-- 프론트엔드 빌드 + 테스트
    |
    v
커밋 성공
    |
    v
[Layer 3] .git/hooks/post-commit
    |
    +-- .dev-verified 삭제 (마커 소비)
    +-- 다음 커밋은 새로 검증 필요
```

## 위조 방지 메커니즘

### 해시 기반 마커

`.dev-verified` 파일 내용: `VERIFIED:{16자리 해시}`

해시 입력: `git diff --cached --raw` 출력 (blob SHA 포함)

```
:100644 100644 abc1234 def5678 M    path/to/file.py
```

blob SHA가 포함되어 있으므로, 동일 파일명이라도 내용이 다르면 해시가 달라진다.

### 위조 시나리오별 차단

| 시나리오 | 차단 지점 | 결과 |
|---------|----------|------|
| 마커 없이 커밋 | pre_commit_review.py + git hook | BLOCKED |
| `touch .dev-verified` | git hook (VERIFIED: 접두사 없음) | BLOCKED |
| `echo "VERIFIED:fake" > .dev-verified` | pre_commit_review.py (해시 불일치) | BLOCKED |
| 검증 후 파일 내용 변경 후 커밋 | pre_commit_review.py (blob SHA 변경으로 해시 불일치) | BLOCKED |
| `py scripts/dev_verify.py` 정상 실행 | 빌드/테스트 통과 + 해시 일치 | ALLOWED |

## 관련 파일

| 파일 | 역할 |
|------|------|
| `scripts/dev_verify.py` | 검증 실행 + 해시 마커 생성 |
| `scripts/pre_commit_review.py` | Claude Code PreToolUse 훅 (해시 검증) |
| `.git/hooks/pre-commit` | git 훅 (형식 검증 + 빌드/테스트) |
| `.git/hooks/post-commit` | 마커 소비 (1회용) |
| `CLAUDE.md` | Rule 0-7 선언 |

## 검증 전략 (dev_verify.py)

| 변경 위치 | 검증 항목 | 배포 필요 |
|-----------|----------|:---------:|
| frontend/aims-uix3/ (JS/TS) | npm run build + npm test | 불필요 |
| frontend/aims-uix3/ (CSS만) | 스킵 | 불필요 |
| backend/ (.py) | Python 구문 검사 | 불필요 |
| backend/api/document_pipeline/ | pytest | 불필요 |
| backend/api/annual_report_api/ | pytest | 불필요 |
| 백엔드 E2E | scp + PM2 재시작 + dev 검증 | 커밋 불필요 |

## 프로세스 스킬과의 관계

| 상황 | 마커 생성 주체 |
|------|--------------|
| /compact-fix 사용 | Phase 3 완료 시 자동 생성 |
| /ace-process 사용 | ACE 4/6 완료 시 자동 생성 |
| 프로세스 미사용 | `py scripts/dev_verify.py` 수동 실행 |

프로세스 사용 여부와 무관하게, 하네스가 검증을 강제한다.

## 커밋 게이트 전체 흐름

```
git commit 시도
    |
    v
[0] Gini 검수 게이트 (.gini-approved)
[0.5] main 브랜치 코드 커밋 차단
[0.6] regression 테스트 포함 여부 (fix/ 브랜치)
[0.7] dev 검증 게이트 (.dev-verified 해시 검증)    <-- 이번 추가
[0.8] 이슈 기록 게이트 (이슈 번호 포함 시)
[1] 밴드에이드 패턴 감지
[2] 서비스별 테스트 실행
    |
    v
모두 통과 --> 커밋 성공
하나라도 실패 --> exit(2), 커밋 차단
```

## 한계

- `scripts/` 경로의 파일 변경은 EXCLUDE_PATHS로 면제 (인프라 스크립트)
- dev_verify.py 자체의 자동화 테스트는 미작성 (수동 3개 시나리오 검증 완료)
- 해시 충돌 확률: SHA-256의 16자리(64비트) 절단 사용, 실질적 충돌 무시 가능

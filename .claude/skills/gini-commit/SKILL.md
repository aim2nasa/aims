---
name: gini-commit
description: Gini 검수 포함 커밋. 커밋, commit, 코드 커밋, 변경사항 커밋 요청 시 자동 사용
user_invocable: true
---

# Gini 검수 커밋 스킬

코드 변경이 있는 커밋 시 Gini 품질 검수를 자동으로 수행한 뒤 커밋한다.

## 트리거

- `/gini-commit` (사용자 호출)
- "커밋", "commit", "코드 커밋", "변경사항 커밋"

## 워크플로우

```
1. git diff 확인 → 변경 파일 목록 파악
2. 코드 변경 여부 판단
   - 코드 파일(.py, .ts, .tsx, .js, .jsx, .css, .html) 변경 있음 → Gini 검수 실행
   - 문서 파일(.md)만 변경 → Gini 스킵, 바로 커밋
   - 변경 없음 → "커밋할 변경사항이 없습니다" 안내 후 종료
3. Gini 검수 (코드 변경 시)
   - gini-quality-engineer 에이전트 호출
   - 변경된 코드 파일을 대상으로 품질/보안/에러처리 검수
   - PASS → 4단계로
   - FAIL → 이슈 목록 표시, 수정 후 재검수 (자동 수정 시도)
   - 재검수 최대 2회. 2회 FAIL 시 사용자에게 보고하고 중단
4. GINI GATE 마커 생성 + 커밋
   - Gini PASS 후 `touch D:/aims/.gini-approved` 실행 (PreToolUse 훅 통과용 1회성 마커)
   - CLAUDE.md 규칙 준수: 한글 커밋 메시지, Co-Authored-By 포함
   - regression 테스트 포함 여부는 pre-commit hook이 검증
   - 마커는 훅이 자동 삭제 (1회 사용 후 소멸)
```

## 판단 기준

### Gini 검수 대상 (코드 파일)
```
.py, .ts, .tsx, .js, .jsx, .css, .html
```

### Gini 스킵 대상 (문서/설정 파일만)
```
.md, .json (package.json 제외), .yml, .yaml, .env, .txt, .csv
```

## Gini 검수 요청 프롬프트

Gini에게 전달할 검수 범위:
- `git diff`로 변경된 코드 파일만 대상
- 검수 관점: 보안, 에러 처리, 부작용 없음, 근본 원인 해결, 아키텍처 정합성
- PASS/FAIL 판정 + 이슈 목록 반환

## 자동 수정 흐름

Gini FAIL 시:
1. 이슈 목록에서 자동 수정 가능한 항목 식별
2. 수정 적용
3. Gini 재검수
4. 여전히 FAIL → 사용자에게 보고

## 주의사항

- Gini 검수는 **코드 변경이 있을 때만** 실행 (문서만 변경 시 스킵)
- 커밋 메시지에 Gini 검수 결과를 기록하지 않음 (커밋 메시지는 변경 내용에 집중)
- CLAUDE.md의 커밋 규칙 (한글 메시지, regression 테스트 포함) 준수

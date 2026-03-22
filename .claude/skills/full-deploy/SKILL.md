---
name: full-deploy
description: AIMS 전체 배포 실행. /full-deploy, 전체 배포, deploy all, 풀 디플로이 요청 시 사용
user_invocable: true
---

# AIMS 전체 배포 스킬

서버에 최신 코드를 pull하고 전체 서비스를 배포합니다.
독립 서비스는 병렬 배포, AI Regression은 기본 제외.

## 트리거

- `/full-deploy` (사용자 호출)
- "전체 배포", "전체배포", "deploy all", "풀 디플로이"

## 옵션 감지

사용자가 "regression 포함", "regression 테스트도", "AI 테스트 포함" 등을 언급하면
`--with-regression` 플래그를 추가한다. 기본은 **regression 제외**.

## 실행 단계

### Phase 1: 사전 확인

로컬 Git 상태를 확인합니다. 커밋되지 않은 변경사항이 있으면 사용자에게 알립니다.

```bash
cd /d/aims && git status --short
```

push되지 않은 커밋이 있으면 push합니다.

```bash
cd /d/aims && git log origin/main..HEAD --oneline
```

### Phase 2: 전체 배포 실행 (실시간 진행상황 표시)

**분리형 폴링 방식** — 배포 시작과 진행상황 조회를 별도 bash 호출로 분리한다.

#### Step 1: 이전 파일 정리 + 배포 시작

regression 제외 (기본):
```bash
ssh rossi@100.110.215.65 'cd ~/aims && rm -f /tmp/deploy_exitcode.txt /tmp/deploy_result.txt && nohup bash -c "./deploy_all.sh > /tmp/deploy_result.txt 2>&1; echo \$? > /tmp/deploy_exitcode.txt" > /dev/null 2>&1 & echo "배포 시작됨 (PID: $!)"'
```

regression 포함:
```bash
ssh rossi@100.110.215.65 'cd ~/aims && rm -f /tmp/deploy_exitcode.txt /tmp/deploy_result.txt && nohup bash -c "./deploy_all.sh --with-regression > /tmp/deploy_result.txt 2>&1; echo \$? > /tmp/deploy_exitcode.txt" > /dev/null 2>&1 & echo "배포 시작됨 (PID: $!)"'
```

이 명령은 즉시 반환된다 (배포는 백그라운드 실행).

#### Step 2: 진행상황 폴링 (반복 실행)

아래 명령을 **별도의 bash 호출로 반복** 실행한다.
**매 호출 결과를 사용자에게 텍스트로 출력**해야 한다.

```bash
ssh rossi@100.110.215.65 'sleep 3; LAST=$(grep -oP "\[\d+/\d+\].*" /tmp/deploy_result.txt 2>/dev/null | tail -1); echo "PROGRESS: ${LAST:-시작 중...}"; if test -f /tmp/deploy_exitcode.txt; then echo "DEPLOY_DONE:$(cat /tmp/deploy_exitcode.txt)"; fi'
```

- 각 호출은 서버에서 **3초** 대기 후 현재 진행상황을 반환
- 출력에 `DEPLOY_DONE:0` 포함 → 배포 성공 → Phase 3으로
- 출력에 `DEPLOY_DONE:N` (N≠0) 포함 → 배포 실패 → Phase 3에서 에러 확인
- `DEPLOY_DONE`이 없으면 아직 진행 중 → 같은 명령 재호출
- **exit code는 항상 0** (진행 중이든 완료든). `DEPLOY_DONE` 문자열로만 완료 판단
- **최대 60회 반복 (약 3분). 초과 시 타임아웃 경고**
- 매 폴링마다 사용자에게 현재 단계를 텍스트로 보고할 것

### Phase 3: 배포 결과 확인

```bash
ssh rossi@100.110.215.65 'grep -oP "\[\d+/\d+\].*" /tmp/deploy_result.txt'
```

각 단계의 완료 여부를 파싱합니다.

### Phase 4: 서비스 헬스체크

```bash
ssh rossi@100.110.215.65 'echo "=== pm2 ===" && pm2 list && echo "=== health ===" && curl -s http://localhost:3010/health && echo "" && curl -s http://localhost:8000/health && echo "" && curl -s http://localhost:8004/health'
```

## 결과 보고

| 단계 | 서비스 | 결과 |
|------|--------|------|
| 1 | Git Pull | ✅/❌ |
| 2 | aims_api (3010) | ✅/❌ |
| 3-8 | 백엔드 병렬 (rag, ar, proxy, mcp, health, pdf) | ✅/❌ |
| 9 | document_pipeline (8100) | ✅/❌ |
| 10-11 | 프론트엔드 병렬 (Frontend + Admin) | ✅/❌ |
| 12 | 서비스 상태 | ✅/❌ |
| 13 | Docker 정리 | ✅/❌ |
| 14 | AI Regression (옵션) | ✅/❌/스킵 |
| - | 헬스체크 | ✅/❌ |

## 주의사항

- **배포 스크립트만 사용**: `pm2 restart` / `npm start` 직접 실행 금지
- **서버 경로**: `/home/rossi/aims`
- **Tailscale IP**: `100.110.215.65`
- **출력 리다이렉트 필수**: `deploy_all.sh` 출력이 30KB 초과
- **스마트 빌드**: 소스 변경 없는 서비스는 자동으로 QUICK RESTART
- **AI Regression**: 기본 제외. `--with-regression` 옵션으로만 실행

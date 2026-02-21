---
name: full-deploy
description: AIMS 전체 배포 실행. /full-deploy, 전체 배포, deploy all, 풀 디플로이 요청 시 사용
user_invocable: true
---

# AIMS 전체 배포 스킬

서버에 최신 코드를 pull하고 전체 서비스(13단계)를 배포합니다.

## 트리거

- `/full-deploy` (사용자 호출)
- "전체 배포", "전체배포", "deploy all", "풀 디플로이"

## 실행 단계

### Phase 1: 사전 확인

로컬 Git 상태를 확인합니다. 커밋되지 않은 변경사항이 있으면 사용자에게 알립니다.

```bash
cd /d/aims && git status --short
```

push되지 않은 커밋이 있으면 알립니다.

```bash
cd /d/aims && git log origin/main..HEAD --oneline
```

### Phase 2: 전체 배포 실행

출력이 30KB를 초과하므로 반드시 파일 리다이렉트를 사용합니다.

```bash
ssh rossi@100.110.215.65 'cd ~/aims && ./deploy_all.sh > /tmp/deploy_result.txt 2>&1; echo $?'
```

- 타임아웃: 10분
- exit code `0`이면 성공

### Phase 3: 배포 결과 확인

```bash
ssh rossi@100.110.215.65 'cat /tmp/deploy_result.txt'
```

13단계 각각의 "완료" 여부를 파싱합니다.

### Phase 4: 서비스 헬스체크

주요 서비스의 상태를 확인합니다.

```bash
ssh rossi@100.110.215.65 'echo "=== pm2 ===" && pm2 list && echo "=== health ===" && curl -s http://localhost:3010/health && echo "" && curl -s http://localhost:8000/health && echo "" && curl -s http://localhost:8004/health'
```

## 결과 보고

| 단계 | 서비스 | 결과 |
|------|--------|------|
| 1 | Git Pull | ✅/❌ |
| 2 | aims_api (3010) | ✅/❌ |
| 3 | aims_rag_api (8000) | ✅/❌ |
| 4 | annual_report_api (8004) | ✅/❌ |
| 5 | pdf_proxy (8002) | ✅/❌ |
| 6 | aims_mcp (3011) | ✅/❌ |
| 7 | aims_health_monitor (3012) | ✅/❌ |
| 8 | pdf_converter (8005) | ✅/❌ |
| 9 | n8n 워크플로우 | ✅/❌ |
| 10 | Frontend | ✅/❌ |
| 11 | Admin | ✅/❌ |
| 12 | 서비스 상태 | ✅/❌ |
| 13 | Docker 정리 | ✅/❌ |
| - | 헬스체크 | ✅/❌ |

배포 실패 시 해당 단계와 에러 메시지를 표시합니다.

## 주의사항

- **배포 스크립트만 사용**: `pm2 restart` / `npm start` 직접 실행 금지
- **서버 경로**: `/home/rossi/aims`
- **Tailscale IP**: `100.110.215.65`
- **출력 리다이렉트 필수**: `deploy_all.sh` 출력이 30KB 초과
- **스마트 빌드**: 소스 변경 없는 서비스는 자동으로 QUICK RESTART

---
name: deploy-guide
description: AIMS 서비스 배포 방법. 배포, deploy, 서버 반영, 업데이트 요청 시 자동 사용
---

# AIMS 배포 가이드

이 스킬은 AIMS 프로젝트의 배포 규칙과 절차를 적용합니다.

## 전체 배포 (Full Deploy)

**명령어:**
```bash
ssh rossi@100.110.215.65 'cd ~/aims && ./deploy_all.sh'
```

**자동 수행 작업 (15단계):**
1. Git 정리 및 Pull (`.build_hash` 파일 보존)
2. aims_api 배포 (Docker)
3. aims_rag_api 배포 (Docker)
4. annual_report_api 배포 (PM2)
5. pdf_proxy 배포 (PM2)
6. aims_mcp 배포 (PM2)
7. aims_health_monitor 배포 (PM2)
8. pdf_converter 배포 (PM2)
9. document_pipeline 배포 (PM2)
10. n8n 워크플로우 배포 (skip)
11. Frontend 배포
12. Admin 배포
13. 서비스 상태 확인
14. Docker 정리
15. AI 어시스턴트 Regression 테스트

**스마트 빌드**: 소스 변경이 없는 서비스는 QUICK RESTART 모드로 빠르게 재시작

## 개별 서비스 배포

| 서비스 | 포트 | 관리 | 배포 스크립트 |
|--------|------|------|---------------|
| aims_api | 3010 | Docker | `./backend/api/aims_api/deploy_aims_api.sh` |
| aims_rag_api | 8200 | Docker | `./backend/api/aims_rag_api/deploy_aims_rag_api.sh` |
| aims_mcp | 3011 | PM2 | `./backend/api/aims_mcp/deploy_aims_mcp.sh` |
| pdf_proxy | 8002 | PM2 | `./backend/api/pdf_proxy/deploy_pdf_proxy.sh` |
| annual_report_api | 8004 | PM2 | `./backend/api/annual_report_api/deploy_annual_report_api.sh` |
| document_pipeline | 8100 | PM2 | `./backend/api/document_pipeline/deploy_document_pipeline.sh` |
| aims_health_monitor | 3012 | PM2 | `./backend/api/aims_health_monitor/deploy_aims_health_monitor.sh` |
| pdf_converter | 8005 | PM2 | `./tools/convert/deploy_pdf_converter.sh` |

**실행 예시:**
```bash
# 서버에서 직접 실행
cd /home/rossi/aims/backend/api/aims_api && ./deploy_aims_api.sh

# 로컬에서 SSH로 실행
ssh rossi@100.110.215.65 'cd ~/aims/backend/api/aims_api && ./deploy_aims_api.sh'
```

## 절대 금지 사항

| 금지 명령어 | 이유 |
|------------|------|
| `pm2 restart` 직접 실행 | 환경 설정 누락 가능 |
| `npm start` 직접 실행 | 프로세스 관리 불가 |
| `uvicorn` 직접 실행 | 백그라운드 실행 안 됨 |
| `git clean -fd` 수동 실행 | `.build_hash` 삭제됨 → 전체 재빌드 |

## 배포 전 체크리스트

1. **로컬 테스트 완료**: `npm test` 통과
2. **타입 체크 완료**: `npm run typecheck` 통과
3. **커밋 완료**: 변경사항 모두 커밋
4. **서버 Git Pull**: 최신 코드 반영

## 배포 후 확인

```bash
# 서비스 상태 확인
ssh rossi@100.110.215.65 'pm2 list'

# 개별 헬스체크
ssh rossi@100.110.215.65 'curl -s http://localhost:3010/api/health'  # aims_api (Docker)
ssh rossi@100.110.215.65 'curl -s http://localhost:8200/health'    # aims_rag_api (Docker)
ssh rossi@100.110.215.65 'curl -s http://localhost:8100/health'    # document_pipeline (PM2)
ssh rossi@100.110.215.65 'curl -s http://localhost:8004/health'    # annual_report_api (PM2)
ssh rossi@100.110.215.65 'curl -s http://localhost:3011/health'    # aims_mcp (PM2)
ssh rossi@100.110.215.65 'curl -s http://localhost:8002/health'    # pdf_proxy (PM2)
ssh rossi@100.110.215.65 'curl -s http://localhost:8005/health'    # pdf_converter (PM2)
ssh rossi@100.110.215.65 'curl -s http://localhost:3012/health'    # aims_health_monitor (PM2)
```

## 롤백

문제 발생 시:
```bash
# Git으로 이전 버전 복원
ssh rossi@100.110.215.65 'cd ~/aims && git checkout HEAD~1'

# 해당 서비스 재배포
ssh rossi@100.110.215.65 'cd ~/aims/backend/api/aims_api && ./deploy_aims_api.sh'
```

## 서버 정보

| 항목 | 값 |
|------|-----|
| 서버 호스트 | `tars.giize.com` 또는 `tars` |
| Tailscale IP | `100.110.215.65` |
| 프로젝트 경로 | `/home/rossi/aims` |
| 사용자 | `rossi` |

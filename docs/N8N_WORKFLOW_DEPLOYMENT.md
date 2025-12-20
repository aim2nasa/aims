# n8n 워크플로우 자동 배포

## Quick Reference

| 방법 | 재시작 필요 | 권장 |
|------|-------------|------|
| CLI | O | X |
| REST API | X | O |

---

## 방법 1: CLI (Docker)

```bash
# 워크플로우 import
docker exec n8n-docker-n8n-1 n8n import:workflow --input=/data/aims/n8n/workflows/my-workflow.json

# 워크플로우 활성화
docker exec n8n-docker-n8n-1 n8n update:workflow --id=<ID> --active=true

# 디렉토리 전체 import
docker exec n8n-docker-n8n-1 n8n import:workflow --separate --input=/data/aims/n8n/workflows/
```

**주의**: DB 직접 조작 → n8n 재시작 필요

---

## 방법 2: REST API (권장)

### API Key 생성
n8n UI → Settings → API → Create API Key

### 엔드포인트

| 작업 | Method | Endpoint |
|------|--------|----------|
| 목록 조회 | GET | `/api/v1/workflows` |
| 생성 | POST | `/api/v1/workflows` |
| 업데이트 | PUT | `/api/v1/workflows/{id}` |
| 활성화 | POST | `/api/v1/workflows/{id}/activate` |
| 비활성화 | POST | `/api/v1/workflows/{id}/deactivate` |

### 사용 예시

```bash
# 워크플로우 생성
curl -X POST "https://n8nd.giize.com/api/v1/workflows" \
  -H "X-N8N-API-KEY: your-api-key" \
  -H "Content-Type: application/json" \
  -d @workflow.json

# 워크플로우 업데이트
curl -X PUT "https://n8nd.giize.com/api/v1/workflows/{id}" \
  -H "X-N8N-API-KEY: your-api-key" \
  -H "Content-Type: application/json" \
  -d @workflow.json

# 활성화
curl -X POST "https://n8nd.giize.com/api/v1/workflows/{id}/activate" \
  -H "X-N8N-API-KEY: your-api-key"
```

---

## 배포 스크립트

### 디렉토리 구조

```
aims/
└── n8n/
    └── workflows/
        ├── file-upload-handler.json
        ├── ocr-processor.json
        └── deploy_n8n_workflows.sh
```

### deploy_n8n_workflows.sh

```bash
#!/bin/bash
set -e

N8N_API_KEY="${N8N_API_KEY:-your-api-key}"
N8N_URL="https://n8nd.giize.com/api/v1"

for file in workflows/*.json; do
  [ -f "$file" ] || continue

  workflow_id=$(jq -r '.id // empty' "$file")
  name=$(jq -r '.name' "$file")

  echo "Deploying: $name"

  if [ -n "$workflow_id" ]; then
    # 업데이트 시도
    curl -sf -X PUT "$N8N_URL/workflows/$workflow_id" \
      -H "X-N8N-API-KEY: $N8N_API_KEY" \
      -H "Content-Type: application/json" \
      -d @"$file" > /dev/null && echo "  Updated" || \
    # 실패시 생성
    curl -sf -X POST "$N8N_URL/workflows" \
      -H "X-N8N-API-KEY: $N8N_API_KEY" \
      -H "Content-Type: application/json" \
      -d @"$file" > /dev/null && echo "  Created"
  else
    # ID 없으면 생성
    curl -sf -X POST "$N8N_URL/workflows" \
      -H "X-N8N-API-KEY: $N8N_API_KEY" \
      -H "Content-Type: application/json" \
      -d @"$file" > /dev/null && echo "  Created"
  fi
done

echo "Done!"
```

---

## 설정 정보

| 항목 | 값 |
|------|-----|
| n8n URL | https://n8nd.giize.com |
| Container | n8n-docker-n8n-1 |
| Data Mount | /data/aims → ~/aims |

---

## 참고 문서

- [n8n CLI Commands](https://docs.n8n.io/hosting/cli-commands/)
- [n8n REST API](https://docs.n8n.io/api/)
- [Export/Import Workflows](https://docs.n8n.io/workflows/export-import/)

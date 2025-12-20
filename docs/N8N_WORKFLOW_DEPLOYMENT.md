# n8n 워크플로우 자동 배포

## Quick Reference

| 방법 | 재시작 필요 | 권장 |
|------|-------------|------|
| CLI | O | X |
| REST API | X | O |

---

## 워크플로우 목록

| 파일 | 경로 | 용도 |
|------|------|------|
| DocPrepMain.json | n8n_flows/ | 메인 문서 처리 |
| DocMeta.json | modules/ | 문서 메타데이터 |
| DocOCR.json | modules/ | OCR 처리 |
| DocReadAI.json | modules/ | AI 문서 읽기 |
| DocSummary.json | modules/ | 문서 요약 |
| DocUpload.json | modules/ | 문서 업로드 |
| ErrorLogger.json | modules/ | 에러 로깅 |
| OCRWorker.json | modules/ | OCR 워커 |
| SmartSearch.json | modules/ | 스마트 검색 |

---

## 배포 방법

### 1. API Key 설정

```bash
# tars 서버에서 환경변수 설정
export N8N_API_KEY="your-api-key-here"

# 또는 ~/.bashrc에 추가
echo 'export N8N_API_KEY="your-api-key-here"' >> ~/.bashrc
```

### 2. 배포 실행

```bash
# tars 서버에서 실행
cd ~/aims/backend/n8n_flows
./deploy_n8n_workflows.sh
```

---

## 디렉토리 구조

```
backend/n8n_flows/
├── deploy_n8n_workflows.sh    # 배포 스크립트
├── DocPrepMain.json           # 메인 워크플로우
├── modules/
│   ├── DocMeta.json
│   ├── DocOCR.json
│   ├── DocReadAI.json
│   ├── DocSummary.json
│   ├── DocUpload.json
│   ├── ErrorLogger.json
│   ├── OCRWorker.json
│   └── SmartSearch.json
└── tests/                     # 테스트용 (배포 제외)
```

---

## REST API 엔드포인트

| 작업 | Method | Endpoint |
|------|--------|----------|
| 목록 조회 | GET | `/api/v1/workflows` |
| 생성 | POST | `/api/v1/workflows` |
| 업데이트 | PUT | `/api/v1/workflows/{id}` |
| 활성화 | POST | `/api/v1/workflows/{id}/activate` |
| 비활성화 | POST | `/api/v1/workflows/{id}/deactivate` |

---

## 설정 정보

| 항목 | 값 |
|------|-----|
| n8n URL | https://n8nd.giize.com |
| API URL | https://n8nd.giize.com/api/v1 |
| Container | n8n-docker-n8n-1 |
| Data Mount | /data/aims → ~/aims |

---

## 참고 문서

- [n8n CLI Commands](https://docs.n8n.io/hosting/cli-commands/)
- [n8n REST API](https://docs.n8n.io/api/)
- [Export/Import Workflows](https://docs.n8n.io/workflows/export-import/)

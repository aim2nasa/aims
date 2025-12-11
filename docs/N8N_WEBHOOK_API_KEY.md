# n8n Webhook API Key 인증 도입 가이드

> 작성일: 2025.12.11
> 상태: **계획됨** (미적용)

## 1. 목적

n8n webhook 엔드포인트에 API Key 인증을 추가하여 무단 접근 차단

## 2. n8n Webhook 인증 옵션

### 2.1 지원 방식

| 방식 | 설명 | 추천 |
|------|------|------|
| **Header Auth** | 특정 헤더에 비밀키 필수 | **추천** |
| Basic Auth | username:password | - |
| JWT Auth | Bearer 토큰 검증 | 복잡 |

### 2.2 Header Auth 설정 방법

**n8n UI에서:**
1. Webhook 노드 클릭
2. **Authentication** → `Header Auth` 선택
3. 설정:
   - **Header Name**: `X-API-Key`
   - **Header Value**: `your-secret-key-here`

## 3. 적용 대상 Webhook

| Webhook | URL | 용도 |
|---------|-----|------|
| docprep-main | `/webhook/docprep-main` | 문서 업로드 |
| smartsearch | `/webhook/smartsearch` | AI 검색 |
| docsummary | `/webhook/docsummary` | 문서 요약 |
| dococr | `/webhook/dococr` | OCR 처리 |
| docmeta | `/webhook/docmeta` | 메타데이터 추출 |

## 4. 프론트엔드 수정 사항

### 4.1 uploadService.ts

```typescript
// API Key 헤더 추가
xhr.setRequestHeader('X-API-Key', 'your-secret-key-here')
```

### 4.2 searchService.ts

```typescript
const response = await fetch(SMARTSEARCH_API_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'your-secret-key-here'  // 추가
  },
  body: JSON.stringify(payload)
})
```

## 5. 내부 서비스 수정 사항

### 5.1 aims_rag_api (rag_search.py)

```python
headers = {
    'Content-Type': 'application/json',
    'X-API-Key': 'your-secret-key-here'  # 추가
}
response = requests.post(N8N_WEBHOOK_URL, json=payload, headers=headers)
```

### 5.2 n8n 워크플로우 내부 호출

워크플로우 간 HTTP Request 노드에서도 헤더 추가 필요:
- DocPrepMain → DocMeta
- DocPrepMain → DocOCR
- DocOCR → DocSummary

## 6. API Key 관리

### 6.1 권장 사항

- 환경변수로 관리 (`N8N_WEBHOOK_API_KEY`)
- 최소 32자 이상의 랜덤 문자열
- 정기적 로테이션 (분기별)

### 6.2 Key 생성 예시

```bash
# 랜덤 API Key 생성
openssl rand -hex 32
# 결과: a1b2c3d4e5f6...
```

## 7. 적용 순서

1. API Key 생성 및 환경변수 설정
2. n8n Webhook 노드에 Header Auth 설정
3. 프론트엔드 코드에 헤더 추가
4. 내부 서비스 코드에 헤더 추가
5. n8n 워크플로우 간 호출에 헤더 추가
6. 테스트 및 검증

## 8. 테스트

```bash
# API Key 없이 호출 (차단되어야 함)
curl -X POST "https://n8nd.giize.com/webhook/smartsearch" \
  -H "Content-Type: application/json" \
  -d '{"query": "test"}'
# 예상 결과: 401 Unauthorized

# API Key 포함 호출 (성공해야 함)
curl -X POST "https://n8nd.giize.com/webhook/smartsearch" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-key-here" \
  -d '{"query": "test"}'
# 예상 결과: 200 OK
```

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2025.12.11 | 최초 작성 (계획 문서) |

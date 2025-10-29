# AIMS API - curl 호출 규격

## 문서 목록 조회 API

### 기본 호출

```bash
curl "http://tars.giize.com:3010/api/documents/status?limit=100"
```

### 파라미터

| 파라미터 | 기본값 | 설명 | 예시 |
|---------|--------|------|------|
| `limit` | 10 | **최대표시 개수** (한 번에 가져올 문서 수) | `limit=100` |
| `page` | 1 | 페이지 번호 | `page=2` |
| `sort` | `uploadDate_desc` | 정렬 기준 | `sort=filename_asc` |
| `status` | - | 상태 필터 | `status=completed` |
| `search` | - | 파일명 검색 | `search=보험` |

### 정렬 옵션 (sort)

```
uploadDate_asc / uploadDate_desc    업로드날짜
filename_asc / filename_desc        파일명
fileSize_asc / fileSize_desc        파일크기
mimeType_asc / mimeType_desc        파일타입
status_asc / status_desc            상태
```

### 페이지네이션 테스트 예제

```bash
# 1페이지 (1~10번째)
ssh tars.giize.com 'curl -s "http://localhost:3010/api/documents/status?page=1&limit=10" | python3 -m json.tool | head -50'

# 2페이지 (11~20번째)
ssh tars.giize.com 'curl -s "http://localhost:3010/api/documents/status?page=2&limit=10" | python3 -m json.tool | head -50'

# pagination 정보만 확인
ssh tars.giize.com 'curl -s "http://localhost:3010/api/documents/status?limit=10" | python3 -c "import sys, json; data=json.load(sys.stdin); print(json.dumps(data[\"data\"][\"pagination\"], indent=2, ensure_ascii=False))"'
```

### 응답 형식

```json
{
  "success": true,
  "data": {
    "documents": [
      {
        "_id": "document_id",
        "originalName": "파일명.pdf",
        "uploadedAt": "2025-10-29T12:34:56.789Z",
        "fileSize": 1234567,
        "mimeType": "application/pdf",
        "overallStatus": "completed",
        "progress": 100
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 100,
      "total": 1234,
      "totalPages": 13
    }
  }
}
```

### 주요 사용 예시

```bash
# 최신 100개
curl "http://tars.giize.com:3010/api/documents/status?limit=100"

# 2페이지 조회 (101~200번째)
curl "http://tars.giize.com:3010/api/documents/status?page=2&limit=100"

# 파일명 정렬 (가나다순)
curl "http://tars.giize.com:3010/api/documents/status?limit=100&sort=filename_asc"

# 파일 크기 큰 것부터
curl "http://tars.giize.com:3010/api/documents/status?limit=100&sort=fileSize_desc"

# 원격 서버에서 JSON 예쁘게 출력
ssh tars.giize.com 'curl -s "http://localhost:3010/api/documents/status?limit=10" | python3 -m json.tool'
```

## 핵심

**`limit` = 프론트엔드의 "최대표시" 값**
- 최대표시 100 설정 → `limit=100` API 호출 → 최대 100개 문서 반환

**`page` + `limit` = 페이지네이션**
- skip = (page - 1) × limit
- page=2, limit=100 → 101~200번째 문서

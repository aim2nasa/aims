# 대용량 고객 문서함 다운로드 실패 수정

| 항목 | 내용 |
|------|------|
| 일시 | 2026.03.25 |
| 발견 | youmi 계정 캐치업코리아 문서함 다운로드 실패 (396건, 784MB+) |
| 증상 | "다운로드에 실패했습니다" 토스트 표시, 서버 로그에 에러 없음 |

---

## 1. 원인 분석

### 브라우저 콘솔 에러
```
/api/documents/download:1  Failed to load resource: net::ERR_HTTP2_PING_FAILED
/api/documents/download:1  Failed to load resource: net::ERR_SSL_PROTOCOL_ERROR
```

### 병목 1: nginx proxy_read_timeout = 300초 (5분)

`/etc/nginx/sites-enabled/aims`의 `/api/` location:
```
proxy_read_timeout 300;
proxy_send_timeout 300;
```

396건/784MB ZIP 스트리밍 생성+전송이 5분 안에 완료되지 않아 nginx가 연결을 끊음.
서버(Node.js)는 `req.on('close')` → `archive.abort()`로 조용히 종료되어 에러 로그 없음.

### 병목 2: 프론트엔드 response.blob() 메모리 적재

`useDocumentDownload.ts:99`:
```typescript
const blob = await response.blob()  // 전체 ZIP을 브라우저 메모리에 로드
```

Chrome 탭 메모리 한계 ~4GB. 1~2GB 이상의 ZIP은 브라우저 OOM 발생 가능.

### 다른 고객이 성공한 이유

수십건/수MB 수준이라 5분 이내 전송 완료 + 메모리 문제 없음.

---

## 2. 수정 내용

### 수정 A: nginx 다운로드 전용 location 추가 — 완료

`/etc/nginx/sites-enabled/aims`에 `/api/documents/download` 전용 location 추가:

```nginx
location = /api/documents/download {
    proxy_pass http://localhost:3010;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 3600;    # 1시간
    proxy_send_timeout 3600;    # 1시간
    proxy_buffering off;         # 스트리밍 전송
    proxy_request_buffering off;
}
```

- `nginx -t`: syntax ok
- `nginx -s reload`: 적용 완료
- 기존 `/api/` 설정(300초)은 변경하지 않음

### 수정 B: 프론트엔드 스트리밍 다운로드 전환 — 완료

`useDocumentDownload.ts` 변경:

| 변경 | 설명 |
|------|------|
| `streamDownloadToFile()` | `showSaveFilePicker()` + `ReadableStream.pipeTo()` — 메모리 미적재 스트리밍 |
| `blobFallbackDownload()` | 기존 `response.blob()` 방식 — 미지원 브라우저 폴백 |
| `isFileSystemAccessSupported()` | 런타임 API 지원 분기 |
| `global.d.ts` | `showSaveFilePicker` 타입 선언 추가 |

- Chrome 86+, Edge 86+: 스트리밍 (메모리 무관, 수GB 가능)
- Firefox, Safari: 기존 blob 폴백 (소용량만)
- 빌드: 통과 (3.70s)
- 기존 인터페이스(download, cancel, isDownloading) 변경 없음

---

## 3. 검증

(검증 후 기록)

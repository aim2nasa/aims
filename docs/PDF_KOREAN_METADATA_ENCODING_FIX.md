# PDF 한글 메타데이터 깨짐 문제 해결

> **작성일**: 2025-12-09
> **관련 커밋**: 8fd85e8b (PDF 미리보기 한글 메타데이터 깨짐 문제 해결)

## 1. 문제 현상

PDF 파일을 브라우저에서 미리보기할 때 **문서 제목(title)이 깨져서 표시**되는 현상.

```
예시:
원본 파일명: "홍길동_보험증권.pdf"
브라우저 탭 제목: "È«±æµ¿_º¸Ç" (깨진 문자)
```

### 영향 범위
- Chrome/Edge 내장 PDF 뷰어의 탭 제목
- PDF.js 기반 뷰어의 문서 제목 표시
- 문서 검색 모달의 PDF 미리보기

---

## 2. 원인 분석

### 2.1 PDF 메타데이터 인코딩 문제

PDF 파일의 메타데이터(제목, 저자 등)는 내부적으로 특정 인코딩으로 저장됨.

| PDF 생성 도구 | 메타데이터 인코딩 | 문제 여부 |
|--------------|------------------|----------|
| Adobe Acrobat | UTF-16BE (BOM) | 정상 |
| 한글/한컴오피스 | CP949 (EUC-KR) | **깨짐** |
| MS Print to PDF | 손상된 바이트열 | **복구 불가** |
| Chrome "PDF로 저장" | UTF-8 | 정상 |

### 2.2 깨짐 발생 메커니즘

```
[원본 한글] "홍길동"
    ↓ CP949 인코딩
[바이트열] 0xC8 0xAB 0xB1 0xE6 0xB5 0xBF
    ↓ PDF 리더가 Latin-1로 잘못 해석
[깨진 문자] "È«±æµ¿"
```

PDF 표준은 메타데이터에 UTF-16BE를 권장하지만, 한글 문서 도구들이 CP949를 사용하면서 발생.

### 2.3 왜 파일명은 정상인가?

- **파일명**: OS 파일시스템에서 관리 (UTF-8)
- **PDF 제목**: PDF 파일 내부 메타데이터 (`/Title` 필드)

브라우저는 PDF 내부 메타데이터의 `/Title`을 탭 제목으로 사용함.

---

## 3. 해결 방안 비교

| 방안 | 장점 | 단점 | 선택 |
|------|------|------|------|
| **A. 업로드 시 PDF 수정** | 원본 파일 영구 수정 | 원본 변경, 복잡한 파이프라인 | ❌ |
| **B. PDF 프록시 서버** | 원본 유지, 실시간 처리 | 추가 서버 필요 | ✅ |
| **C. 프론트엔드 PDF.js 커스텀** | 서버 불필요 | PDF.js만 해결, 브라우저 내장 뷰어 미해결 | ❌ |

**선택: B. PDF 프록시 서버**
- 원본 파일 수정 없음
- 모든 PDF 뷰어에서 작동
- Nginx 리버스 프록시로 투명하게 통합

---

## 4. 구현 아키텍처

### 4.1 전체 흐름

```
[사용자 브라우저]
       │
       ▼
[Nginx] ─── /pdf/* ───► [PDF Proxy (8002)]
       │                      │
       │                      ▼
       │              [PDF 메타데이터 수정]
       │                      │
       │                      ▼
       └── /files/* ──► [정적 파일 서버]
```

### 4.2 URL 변환

```
# 기존 (직접 접근)
https://tars.giize.com/files/users/xxx/document.pdf

# 신규 (프록시 경유)
https://tars.giize.com/pdf/users/xxx/document.pdf?title=원본파일명.pdf
```

---

## 5. 구현 상세

### 5.1 PDF 프록시 서버 (`backend/api/pdf_proxy/main.py`)

```python
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pathlib import Path
import sys

# 메타데이터 수정 스크립트 import
sys.path.insert(0, str(Path(__file__).parent.parent.parent / 'scripts'))
from fix_pdf_metadata import fix_pdf_metadata_in_memory

app = FastAPI()
FILES_BASE_PATH = Path("/data/files")

@app.get("/pdf/{file_path:path}")
async def serve_pdf(file_path: str, title: str | None = None):
    """PDF 파일을 메타데이터 수정 후 반환"""

    full_path = FILES_BASE_PATH / file_path
    if not full_path.exists():
        raise HTTPException(404, "File not found")

    # PDF 바이트 읽기
    pdf_bytes = full_path.read_bytes()

    # 제목 결정: 쿼리 파라미터 > 파일명
    if not title:
        title = full_path.name

    # 메타데이터 수정 (깨진 인코딩 복원 또는 파일명으로 대체)
    fixed_bytes, was_fixed, message = fix_pdf_metadata_in_memory(pdf_bytes, title)

    # 응답 헤더 설정
    headers = {
        "Content-Type": "application/pdf",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*"
    }

    # Content-Disposition: 한글 파일명 지원 (RFC 5987)
    if title:
        from urllib.parse import quote
        ascii_safe = ''.join(c if ord(c) < 128 else '_' for c in title)
        encoded = quote(title)
        headers["Content-Disposition"] = f'inline; filename="{ascii_safe}"; filename*=UTF-8\'\'{encoded}'

    return Response(content=fixed_bytes, headers=headers)
```

### 5.2 메타데이터 수정 로직 (`backend/scripts/fix_pdf_metadata.py`)

```python
import fitz  # PyMuPDF

def is_likely_garbled(text: str) -> bool:
    """깨진 텍스트인지 판단"""
    if not text:
        return False

    # Latin-1 확장 문자 범위 (0x80-0xFF) 비율 체크
    extended_chars = sum(1 for c in text if 0x80 <= ord(c) <= 0xFF)
    ratio = extended_chars / len(text)

    return ratio > 0.3  # 30% 이상이면 깨진 것으로 판단

def try_fix_encoding(garbled_text: str) -> str | None:
    """깨진 텍스트를 한글로 복원 시도"""
    encodings = ['cp949', 'euc-kr', 'utf-8', 'utf-16-le']

    for encoding in encodings:
        try:
            # Latin-1로 해석된 바이트를 원래 인코딩으로 복원
            raw_bytes = garbled_text.encode('latin-1')
            fixed = raw_bytes.decode(encoding)

            # 한글 포함 여부 확인
            if any('\uAC00' <= c <= '\uD7AF' for c in fixed):
                return fixed
        except (UnicodeDecodeError, UnicodeEncodeError):
            continue

    return None

def fix_pdf_metadata_in_memory(pdf_bytes: bytes, title: str) -> tuple[bytes, bool, str]:
    """
    PDF 메타데이터 수정 전략:
    1. 인코딩 변환으로 복원 시도
    2. 복원 실패 시 전달받은 title(파일명)으로 대체
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    metadata = doc.metadata
    modified = False

    new_metadata = {}
    for field in ['title', 'author', 'subject', 'keywords']:
        value = metadata.get(field, '')

        if value and is_likely_garbled(value):
            # 1차: 인코딩 복원 시도
            fixed = try_fix_encoding(value)
            if fixed:
                new_metadata[field] = fixed
                modified = True
            # 2차: title 필드는 파일명으로 대체
            elif field == 'title':
                new_metadata[field] = title
                modified = True
            else:
                new_metadata[field] = ''  # 복원 불가 - 빈 값
                modified = True
        else:
            new_metadata[field] = value

    if not modified:
        doc.close()
        return pdf_bytes, False, "No fix needed"

    doc.set_metadata(new_metadata)
    result = doc.tobytes()
    doc.close()

    return result, True, "Fixed"
```

### 5.3 Nginx 설정 (`/etc/nginx/sites-available/default`)

```nginx
server {
    listen 443 ssl http2;
    server_name tars.giize.com;

    # ... SSL 설정 생략 ...

    # PDF 프록시 (메타데이터 수정)
    location /pdf/ {
        proxy_pass http://127.0.0.1:8002/pdf/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # PDF 파일은 크기가 클 수 있음
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
        client_max_body_size 50M;

        # 캐싱 (1시간)
        proxy_cache_valid 200 1h;
    }

    # 기존 정적 파일 서버
    location /files/ {
        alias /data/files/;
        # ... 기존 설정 ...
    }
}
```

### 5.4 프론트엔드 URL 생성 (`src/utils/documentTransformers.ts`)

```typescript
/**
 * PDF 파일용 URL 생성 (메타데이터 수정 프록시 경유)
 */
export const resolvePdfUrl = (
  destPath?: string,
  originalName?: string
): string | undefined => {
  const normalized = normalizeDestPath(destPath)
  if (!normalized) return undefined

  // /data/files/... -> users/... (프록시는 /data/files 기준 상대경로)
  let pdfPath = normalized
    .replace('/data/files/', '')
    .replace('/data/', '')
    .replace('/files/', '')

  if (pdfPath.startsWith('/')) {
    pdfPath = pdfPath.substring(1)
  }

  let url = `https://tars.giize.com/pdf/${pdfPath}`

  // 원본 파일명을 쿼리 파라미터로 전달 (대체 제목용)
  if (originalName) {
    url += `?title=${encodeURIComponent(originalName)}`
  }

  return url
}
```

### 5.5 사용 예시 (DocumentContentSearchModal.tsx)

```typescript
const getFileUrl = (item: SearchResultItem): string | null => {
  const filePath = SearchService.getFilePath(item)
  if (!filePath) return null

  // PDF는 프록시 경유 (한글 깨짐 방지)
  if (isPdf(item)) {
    const originalName = getFileName(item)
    return resolvePdfUrl(filePath, originalName) || null
  }

  // 기타 파일은 직접 접근
  return resolveFileUrl(filePath) || null
}
```

---

## 6. 서버 운영

### 6.1 PDF 프록시 서비스 등록

```bash
# systemd 서비스 파일 생성
sudo vim /etc/systemd/system/pdf-proxy.service
```

```ini
[Unit]
Description=PDF Metadata Fix Proxy
After=network.target

[Service]
Type=simple
User=rossi
WorkingDirectory=/home/rossi/aims/backend/api/pdf_proxy
ExecStart=/home/rossi/aims/backend/api/annual_report_api/venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8002
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
# 서비스 활성화 및 시작
sudo systemctl daemon-reload
sudo systemctl enable pdf-proxy
sudo systemctl start pdf-proxy

# 상태 확인
sudo systemctl status pdf-proxy
```

### 6.2 헬스체크

```bash
curl -s http://localhost:8002/health
# {"status":"healthy"}

curl -I "https://tars.giize.com/pdf/users/xxx/test.pdf"
# HTTP/2 200
# content-type: application/pdf
# x-pdf-fixed: true
```

---

## 7. 트러블슈팅

### 7.1 "latin-1 codec can't encode" 에러

**원인**: HTTP 헤더에 한글 직접 포함 불가

**해결**:
```python
# 잘못된 방법
headers["X-Message"] = "한글 메시지"  # 에러!

# 올바른 방법
from urllib.parse import quote
headers["X-Message"] = quote("한글 메시지")  # URL 인코딩
```

### 7.2 Content-Disposition 한글 파일명

**RFC 5987 방식 사용**:
```python
ascii_safe = ''.join(c if ord(c) < 128 else '_' for c in filename)
encoded = quote(filename)
header = f'inline; filename="{ascii_safe}"; filename*=UTF-8\'\'{encoded}'
```

### 7.3 MS Print to PDF 파일

**문제**: 메타데이터가 근본적으로 손상되어 인코딩 복원 불가

**해결**: 파일명으로 제목 대체 (이것이 `title` 쿼리 파라미터의 존재 이유)

---

## 8. 관련 파일

| 파일 | 설명 |
|------|------|
| `backend/api/pdf_proxy/main.py` | PDF 프록시 서버 |
| `backend/scripts/fix_pdf_metadata.py` | 메타데이터 수정 라이브러리 |
| `frontend/aims-uix3/src/utils/documentTransformers.ts` | `resolvePdfUrl()` 함수 |
| `/etc/nginx/sites-available/default` | Nginx 프록시 설정 |

---

## 9. 참고 자료

- [PDF Reference 1.7 - Chapter 14.4 Document Information Dictionary](https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/pdfreference1.7old.pdf)
- [PyMuPDF Documentation](https://pymupdf.readthedocs.io/)
- [RFC 5987 - Character Set and Language Encoding for HTTP Header Field Parameters](https://tools.ietf.org/html/rfc5987)

# PDF Converter POC 구조

## 접속 URL

| 환경 | URL |
|------|-----|
| **프로덕션** | https://aims.giize.com/pdf-converter/ |
| 개발 | http://localhost:5179/ |

---

## 한눈에 보는 흐름

```
┌─────────────────────────────────────────────────────────────────────┐
│  사용자 PC (Windows)                                                 │
│                                                                     │
│  ┌─────────────────────┐                                            │
│  │  pdf-converter-poc  │                                            │
│  │  (localhost:5179)   │                                            │
│  │                     │                                            │
│  │  파일 업로드 →      │                                            │
│  │  /api/convert       │──────┐                                     │
│  └─────────────────────┘      │                                     │
└───────────────────────────────│─────────────────────────────────────┘
                                │
                                │ HTTPS
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  tars.giize.com 서버                                                 │
│                                                                     │
│  ┌─────────────────────┐      ┌─────────────────────┐               │
│  │  aims_api           │      │  pdf_converter      │               │
│  │  (포트 3010)        │ ───► │  (포트 3011)        │               │
│  │                     │      │                     │               │
│  │  /api/pdf/convert   │      │  LibreOffice 사용   │               │
│  │  (프록시 역할)      │      │  DOCX → PDF 변환    │               │
│  └─────────────────────┘      └─────────────────────┘               │
│         ▲                                                           │
│         │ 외부 접근 가능 (HTTPS)                                     │
│         │                                                           │
│  ┌──────┴──────────────────────────────────────────────────────┐   │
│  │  nginx (aims.giize.com)                                      │   │
│  │  - SSL 인증서 처리                                            │   │
│  │  - 리버스 프록시                                              │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

## 왜 이렇게 복잡해?

### 문제: 포트 3011은 외부 접근 불가

```
사용자 PC  ──X──►  tars:3011 (PDF Converter)
                   ↑
                   방화벽에서 차단됨
```

### 해결: aims_api를 거쳐서 접근

```
사용자 PC  ──►  aims.giize.com (HTTPS)
                      │
                      ▼
               aims_api (3010)
                      │
                      ▼ (서버 내부에서는 통신 가능)
               pdf_converter (3011)
```

## 각 컴포넌트 역할

| 컴포넌트 | 포트 | 역할 |
|----------|------|------|
| pdf-converter-poc | 5179 | 사용자 UI (React) |
| aims_api | 3010 | 프록시 + 메인 API |
| pdf_converter | 3011 | 실제 PDF 변환 (LibreOffice) |

## 요청 흐름 상세

```
1. 사용자가 DOCX 파일 업로드
   └─► localhost:5179/api/convert

2. Vite 프록시가 요청 전달
   └─► https://aims.giize.com/api/pdf/convert

3. aims_api가 내부 PDF 변환기 호출
   └─► http://localhost:3011/convert

4. LibreOffice가 DOCX → PDF 변환

5. PDF가 역순으로 전달되어 사용자에게 다운로드
```

## 설정 파일

### vite.config.ts
```typescript
base: '/pdf-converter/',
proxy: {
  '/api/pdf': {
    target: 'https://aims.giize.com',
    changeOrigin: true,
    secure: true
  }
}
```

### aims_api/server.js
```javascript
app.post('/api/pdf/convert', async (req, res) => {
  // localhost:3011로 프록시
});
```

### nginx 설정 (/etc/nginx/sites-available/aims)
```nginx
location /pdf-converter/ {
    alias /home/rossi/aims/frontend/pdf-converter-poc/dist/;
    try_files $uri $uri/ /pdf-converter/index.html;
}
```

---

## 배포

### 빌드 및 배포
```bash
cd frontend/pdf-converter-poc
npm run build
scp -r dist/* rossi@tars.giize.com:/home/rossi/aims/frontend/pdf-converter-poc/dist/
```

### 배포 파일 위치
- 서버: `/home/rossi/aims/frontend/pdf-converter-poc/dist/`

---

## 서비스 요구사항

### 서버 (tars.giize.com)

| 서비스 | 필수 | 설명 |
|--------|------|------|
| pdf_converter | O | LibreOffice 기반 변환 서버 (포트 3011) |
| aims_api | O | 프록시 엔드포인트 제공 (포트 3010) |
| nginx | O | HTTPS 및 리버스 프록시 |

#### pdf_converter 실행 확인
```bash
ssh tars.giize.com
curl http://localhost:3011/health
# {"status":"ok"} 응답 확인
```

#### aims_api 실행 확인
```bash
curl https://aims.giize.com/api/health
# {"success":true} 응답 확인
```

### 로컬 (개발 환경)

| 요구사항 | 버전 | 설명 |
|----------|------|------|
| Node.js | 18+ | Vite 개발 서버 실행 |
| npm | 9+ | 패키지 관리 |

### 지원 파일 형식

| 형식 | 확장자 | 비고 |
|------|--------|------|
| Microsoft Word | .doc, .docx | |
| Microsoft Excel | .xls, .xlsx | |
| Microsoft PowerPoint | .ppt, .pptx | |
| OpenDocument | .odt, .ods, .odp | |
| 한글 | .hwp | 베타 (pyhwp 사용) |
| 기타 | .rtf, .txt, .csv, .html | |

### 제한사항

- 최대 파일 크기: **50MB**
- 변환 타임아웃: **2분**

---

## 문제 해결

### "변환 실패" 에러

1. **pdf_converter 서비스 확인**
   ```bash
   ssh tars.giize.com
   docker ps | grep pdf
   # pdf-converter 컨테이너 실행 중인지 확인
   ```

2. **LibreOffice 상태 확인**
   ```bash
   docker logs pdf-converter --tail 20
   ```

### "네트워크 오류" 에러

1. **aims_api 상태 확인**
   ```bash
   curl https://aims.giize.com/api/health
   ```

2. **CORS 설정 확인**
   - aims_api의 ALLOWED_ORIGINS에 `localhost:5179` 포함 필요

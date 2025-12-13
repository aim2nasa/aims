# 문서 PDF 변환 서비스 기술 검토

> **목적**: aims-uix3에서 프리뷰가 불가능한 문서(HWP, DOCX, XLSX, PPTX 등)를 PDF로 변환하여 프리뷰 제공

---

## 1. 현재 상태 분석

### 1.1 프리뷰 지원 현황

| 파일 형식 | 현재 상태 | 사용 기술 |
|-----------|----------|-----------|
| PDF | ✅ 지원 | react-pdf |
| 이미지 (jpg, png, gif, bmp, webp) | ✅ 지원 | HTML `<img>` |
| HWP (한글) | ❌ DownloadOnly | - |
| DOCX, DOC (Word) | ❌ DownloadOnly | - |
| XLSX, XLS (Excel) | ❌ DownloadOnly | - |
| PPTX, PPT (PowerPoint) | ❌ DownloadOnly | - |

### 1.2 관련 코드 위치

- **프리뷰 컴포넌트**: `frontend/aims-uix3/src/components/`
  - `PDFViewer/PDFViewer.tsx`
  - `ImageViewer/ImageViewer.tsx`
  - `DownloadOnlyViewer/DownloadOnlyViewer.tsx`
- **파일 타입 판정**: `App.tsx:1633-1635`
- **문서 메타데이터**: MongoDB `files` 컬렉션

---

## 2. 기술 솔루션 비교

### 2.1 오픈소스 솔루션

#### Option A: LibreOffice + unoserver (권장)

```
[원본 문서] → [LibreOffice headless] → [PDF]
```

**장점:**
- 무료 오픈소스
- 다양한 형식 지원 (doc, docx, ppt, pptx, xls, xlsx, odt, odp, rtf 등)
- unoserver는 unoconv의 공식 후속 프로젝트
- Python 3 호환, 향상된 성능
- 서버 모드로 연속 변환 시 빠른 속도

**단점:**
- LibreOffice 설치 필요 (~500MB)
- 복잡한 서식 일부 손실 가능
- HWP 직접 지원 제한적

**설치 및 사용:**
```bash
# Ubuntu/Debian
sudo apt install libreoffice
pip install unoserver

# 서버 시작
unoserver --interface 0.0.0.0 --port 2002

# 변환 (클라이언트)
unoconvert --interface localhost --port 2002 input.docx output.pdf
```

**참고 자료:**
- [unoserver GitHub](https://github.com/unoconv/unoserver/)
- [LibreOffice Headless 가이드](https://www.baeldung.com/linux/latex-doc-docx-pdf-conversion)

#### Option B: pyhwp + LibreOffice (HWP 전용)

```
[HWP] → [pyhwp/hwp5odt] → [ODT] → [LibreOffice] → [PDF]
```

**장점:**
- HWP v5 형식 지원
- 오픈소스

**단점:**
- 2단계 파이프라인 필요
- 복잡한 서식/이미지 손실 가능
- HWP v3 미지원

**사용:**
```bash
pip install pyhwp

# HWP → ODT
hwp5odt --output output.odt input.hwp

# ODT → PDF (LibreOffice)
soffice --headless --convert-to pdf output.odt
```

**참고 자료:**
- [pyhwp PyPI](https://pypi.org/project/pyhwp/)
- [pyhwp 문서](https://pyhwp.readthedocs.io/en/latest/converters.html)

#### Option C: libreoffice-convert (Node.js)

```javascript
const libre = require('libreoffice-convert');
const fs = require('fs');

const inputPath = './input.docx';
const outputPath = './output.pdf';

const docxBuf = fs.readFileSync(inputPath);
libre.convert(docxBuf, '.pdf', undefined, (err, pdfBuf) => {
  fs.writeFileSync(outputPath, pdfBuf);
});
```

**장점:**
- Node.js 네이티브
- 기존 aims_api와 동일 런타임

**단점:**
- LibreOffice 설치 필요
- 동기식 변환으로 성능 이슈 가능

### 2.2 상용 솔루션

| 솔루션 | 특징 | 가격 |
|--------|------|------|
| [Apryse (PDFTron)](https://docs.apryse.com/core/guides/features/office/convert-office) | 외부 의존성 없음, 고품질 | 유료 |
| [Nutrient](https://www.nutrient.io/guides/nodejs/conversion/office-to-pdf/) | Node.js SDK, 자체 엔진 | 유료 |
| [ConvertAPI](https://www.convertapi.com/office-to-pdf/nodejs) | REST API, 250회 무료 | 종량제 |
| [CloudConvert](https://cloudconvert.com/hwp-to-pdf) | HWP 지원, REST API | 종량제 |

### 2.3 Docker 기반 솔루션

[EugenMayer/officeconverter](https://github.com/EugenMayer/officeconverter) - REST API 제공 Docker 컨테이너

```bash
docker run -d -p 8080:8080 eugenmayer/kontextwork-converter

# 변환 요청
curl -X POST http://localhost:8080/convert/pdf \
  -F "file=@input.docx" \
  -o output.pdf
```

---

## 3. 권장 아키텍처

### 3.1 시스템 구성

```
┌─────────────────────────────────────────────────────────────────┐
│                         aims-uix3 (Frontend)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │  PDFViewer   │  │ ImageViewer  │  │ DocumentPreview       │  │
│  │              │  │              │  │ (HWP,DOCX,XLSX,PPTX)  │  │
│  └──────────────┘  └──────────────┘  └───────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │ previewPdfUrl
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Backend Services                            │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │  aims_api    │──│ pdf_converter│──│ LibreOffice + unoserver│  │
│  │  (3010)      │  │  _api (8001) │  │      (2002)           │  │
│  └──────────────┘  └──────────────┘  └───────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Storage                                   │
│  /data/files/users/{userId}/YYYY/MM/                            │
│    ├── {timestamp}_{token}.docx     (원본)                      │
│    └── {timestamp}_{token}_preview.pdf (변환된 프리뷰용 PDF)    │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 변환 서비스 API 설계 (pdf_converter_api)

```python
# FastAPI 서비스 (포트 8001)

POST /convert
  - Request: multipart/form-data (file)
  - Response: application/pdf
  - 지원 형식: hwp, doc, docx, xls, xlsx, ppt, pptx, odt, odp, ods

GET /health
  - LibreOffice 상태 확인

GET /supported-formats
  - 지원 형식 목록 반환
```

### 3.3 MongoDB 스키마 확장

```javascript
// files 컬렉션 확장
{
  // ... 기존 필드들 ...

  // PDF 변환 관련 새 필드
  preview: {
    status: String,           // 'pending', 'processing', 'completed', 'failed', 'unsupported'
    pdfPath: String,          // 변환된 PDF 경로
    convertedAt: ISODate,
    errorMessage: String,
    originalMime: String      // 원본 MIME 타입
  }
}
```

### 3.4 변환 워크플로우

#### 방안 A: 업로드 시 백그라운드 변환 (권장)

```
1. 문서 업로드 완료
2. 파일 확장자 확인 (hwp, docx, xlsx, pptx 등)
3. preview.status = 'pending' 설정
4. 백그라운드 작업 큐에 변환 작업 추가
5. pdf_converter_api 호출
6. 변환 성공 시:
   - PDF 저장: {원본경로}_preview.pdf
   - preview.status = 'completed'
   - preview.pdfPath = 저장 경로
7. 프론트엔드: previewPdfUrl로 PDFViewer 렌더링
```

#### 방안 B: 온디맨드 변환 (캐싱)

```
1. 사용자가 프리뷰 요청
2. preview.pdfPath 존재 확인
3. 없으면 실시간 변환 → 저장
4. 캐시된 PDF 반환
```

---

## 4. 지원 형식 및 제한사항

### 4.1 LibreOffice 지원 형식

| 카테고리 | 확장자 | 변환 품질 |
|---------|--------|----------|
| Word | doc, docx, odt, rtf | ⭐⭐⭐⭐ |
| Excel | xls, xlsx, ods, csv | ⭐⭐⭐ (시트별 페이지) |
| PowerPoint | ppt, pptx, odp | ⭐⭐⭐⭐ |
| 텍스트 | txt, html | ⭐⭐⭐⭐⭐ |

### 4.2 HWP 지원 현황

| 방법 | HWP v5 | HWP v3 | 서식 유지 | 이미지 |
|------|--------|--------|----------|--------|
| pyhwp → ODT → PDF | ✅ | ❌ | ⭐⭐ | ⭐⭐ |
| LibreOffice 직접 | 제한적 | ❌ | ⭐ | ⭐ |
| CloudConvert API | ✅ | ✅ | ⭐⭐⭐ | ⭐⭐⭐ |

### 4.3 알려진 제한사항

1. **HWP 복잡 서식**: 표, 그림, 수식 등 복잡한 서식은 손실 가능
2. **Excel 다중 시트**: 모든 시트가 연속 페이지로 변환
3. **암호 보호 문서**: 변환 불가
4. **폰트 누락**: 서버에 없는 폰트는 대체됨
5. **매크로**: 무시됨

---

## 5. 구현 계획

### Phase 1: 연습 프로젝트 (POC)

```
frontend/
  └── pdf-converter-poc/    # 연습용 프론트엔드
      ├── src/
      │   ├── App.tsx
      │   └── components/
      │       └── FileConverter.tsx
      └── package.json

backend/
  └── api/
      └── pdf_converter_api/  # 변환 서비스
          ├── main.py
          ├── requirements.txt
          └── deploy_pdf_converter_api.sh
```

### Phase 2: 통합

1. aims_api에 변환 트리거 로직 추가
2. MongoDB 스키마 확장
3. aims-uix3 프리뷰 로직 수정
4. n8n 워크플로우 확장 (옵션)

---

## 6. 서버 요구사항

### 6.1 필수 설치

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y libreoffice libreoffice-writer libreoffice-calc \
                    libreoffice-impress fonts-nanum fonts-nanum-extra \
                    libxslt1.1 libxml2

# Python 패키지
pip install unoserver pyhwp fastapi uvicorn python-multipart
```

### 6.2 한글 폰트 설치 (HWP/한글 문서용)

```bash
# 나눔 폰트
sudo apt install fonts-nanum fonts-nanum-coding fonts-nanum-extra

# 폰트 캐시 갱신
fc-cache -fv
```

### 6.3 리소스 요구사항

| 항목 | 최소 | 권장 |
|------|------|------|
| 디스크 | +1GB | +2GB |
| 메모리 | +512MB | +1GB |
| CPU | - | 변환 시 부하 발생 |

---

## 7. 결론 및 권장사항

### 7.1 권장 접근 방식

1. **1차 구현**: LibreOffice + unoserver로 DOCX, XLSX, PPTX 지원
2. **2차 구현**: pyhwp로 HWP 지원 추가
3. **대안**: HWP 변환 품질이 낮을 경우 CloudConvert API 검토

### 7.2 예상 효과

- **프리뷰 가능 문서 확장**: PDF, 이미지 → + Word, Excel, PowerPoint, 한글
- **UX 향상**: 다운로드 없이 문서 내용 확인 가능
- **검색 개선**: 변환된 PDF 텍스트로 RAG 검색 품질 향상 가능

### 7.3 다음 단계

1. ✅ 기술 검토 완료 (본 문서)
2. ✅ POC 프론트엔드 구현 (`frontend/pdf-converter-poc/`)
3. ✅ pdf_converter_api 백엔드 구현 (`tools/convert/server.js`)
4. ✅ 변환 품질 테스트
5. ⏳ aims-uix3 통합

---

## 참고 자료

- [unoserver GitHub](https://github.com/unoconv/unoserver/)
- [unoconv (deprecated)](https://github.com/unoconv/unoconv)
- [pyhwp 문서](https://pyhwp.readthedocs.io/en/latest/converters.html)
- [Apryse Office SDK](https://docs.apryse.com/core/guides/features/office/convert-office)
- [Nutrient Node.js SDK](https://www.nutrient.io/guides/nodejs/conversion/office-to-pdf/)
- [EugenMayer/officeconverter Docker](https://github.com/EugenMayer/officeconverter)
- [CloudConvert HWP](https://cloudconvert.com/hwp-to-pdf)

---

## 8. 구현 언어 선택 검토: Node.js vs Python

### 8.1 검토 배경

PDF 변환 서비스 구현 시 두 가지 언어 옵션을 검토:
- **Node.js**: 기존 `tools/convert/convert2pdf.js` 코드 활용
- **Python**: FastAPI + unoserver 새로 구현

### 8.2 핵심 판단 기준

**UX 관점에서 최우선 기준:**
1. 변환 품질
2. 다양한 포맷 지원

### 8.3 객관적 비교

#### 변환 품질

| 방식 | 품질 결정 요소 | 언어 영향 |
|------|---------------|----------|
| 오픈소스 | **LibreOffice 엔진** | ❌ 없음 |
| 상용 SDK | Apryse, Nutrient 등 | ❌ 없음 (둘 다 SDK 제공) |

**결론: 변환 품질은 LibreOffice 엔진이 결정하며, 언어와 무관**

#### 다양한 포맷 지원

| 형식 | Node.js | Python | 차이 |
|------|---------|--------|------|
| MS Office (DOCX, XLSX, PPTX) | LibreOffice | LibreOffice | 동일 |
| OpenDocument (ODT, ODS, ODP) | LibreOffice | LibreOffice | 동일 |
| RTF, HTML, TXT 등 | LibreOffice | LibreOffice | 동일 |
| HWP | pyhwp CLI 호출 | pyhwp 직접 import | 약간 Python 유리 (부차적) |

**결론: LibreOffice가 지원하는 ~100가지 형식은 언어와 무관. HWP만 약간 차이**

#### n8n 연동

| 연동 방식 | Node.js | Python |
|----------|---------|--------|
| Execute Command | ✅ `node script.js` | ✅ `python script.py` |
| HTTP Request | ✅ REST API | ✅ REST API |
| Code 노드 직접 실행 | ✅ JavaScript 지원 | ❌ 미지원 |
| 기존 aims n8n 패턴 | ✅ Node.js 스크립트 | ❌ 새로운 패턴 |

**결론: n8n이 Node.js 기반이므로, Node.js가 기존 패턴과 일관성 유지에 유리**

#### 기타 요소

| 기준 | Node.js | Python |
|------|---------|--------|
| 기존 코드 | ✅ `convert2pdf.js` 있음 | 새로 작성 필요 |
| aims_api 통일 | ✅ 동일 런타임 | 별도 관리 |
| 문서 처리 생태계 | 상대적으로 적음 | 풍부함 |

### 8.4 기존 코드 분석: convert2pdf.js

**위치**: `tools/convert/convert2pdf.js`

**주요 특징:**
```javascript
// 동시 실행 제한 (서버 안정성)
class ConvertQueue {
  constructor(limit = 1) { ... }
}

// spawn 기반 실행 (메모리 안전)
function runLibreOffice(inputPath, outputDir) {
  return new Promise((resolve, reject) => {
    const proc = spawn("libreoffice", [
      "--headless",
      "--convert-to", "pdf",
      inputPath,
      "--outdir", outputDir
    ]);
    ...
  });
}
```

**개선 사항 (이미 적용됨):**
- exec → spawn: 출력 버퍼 메모리 폭증 방지
- ConvertQueue: 동시 실행 1개 제한으로 CPU/RAM 과부하 방지

### 8.5 최종 결론

| 기준 | Node.js | Python | 승자 |
|------|---------|--------|------|
| 변환 품질 | LibreOffice | LibreOffice | **동일** |
| 다양한 포맷 지원 | LibreOffice | LibreOffice | **동일** |
| HWP 지원 | pyhwp CLI | pyhwp 직접 | 약간 Python |
| 기존 코드 활용 | ✅ | ❌ | **Node.js** |
| n8n 연동 | ✅ 기존 패턴 | 새 패턴 | **Node.js** |
| aims_api 통일 | ✅ | ❌ | **Node.js** |

**선택: Node.js**

**근거:**
1. 변환 품질과 다양한 포맷 지원(최우선 기준)에서 **언어 차이 없음**
2. 기존 `convert2pdf.js` 코드가 이미 **안정적으로 구현**되어 있음
3. n8n 연동 시 **기존 패턴과 일관성** 유지
4. aims_api와 **동일 런타임**으로 유지보수 용이
5. HWP는 **pyhwp CLI 호출**로 해결 가능 (부차적 요구사항)

### 8.6 수정된 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                         aims-uix3 (Frontend)                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Backend Services                            │
│  ┌──────────────┐  ┌──────────────────────────────────────────┐ │
│  │  aims_api    │  │  tools/convert/                          │ │
│  │  (Node.js)   │──│    ├── convert2pdf.js (기존)            │ │
│  │              │  │    └── server.js (Express API 추가)      │ │
│  └──────────────┘  └──────────────────────────────────────────┘ │
│                              │                                   │
│                              ▼                                   │
│                    ┌──────────────────┐                         │
│                    │ LibreOffice      │                         │
│                    │ (headless)       │                         │
│                    └──────────────────┘                         │
└─────────────────────────────────────────────────────────────────┘
```

### 8.7 HWP 지원 방안 (Node.js에서)

```javascript
// HWP → ODT → PDF 파이프라인
async function convertHwpToPdf(hwpPath, outputDir) {
  // 1단계: HWP → ODT (pyhwp CLI 호출)
  await execPromise(`hwp5odt --output ${odtPath} ${hwpPath}`);

  // 2단계: ODT → PDF (LibreOffice)
  await convertToPDF(odtPath, outputDir);

  // 3단계: 임시 ODT 삭제
  fs.unlinkSync(odtPath);
}
```

---

## 참고 자료 (추가)

- [Nutrient Node.js Office Conversion](https://www.nutrient.io/guides/nodejs/conversion/office-to-pdf/)
- [Apryse Node.js SDK](https://docs.apryse.com/documentation/nodejs/guides/features/office/)
- [unoserver-node npm](https://www.npmjs.com/package/@docwagen/unoserver-node)
- [msoffice2pdf PyPI](https://pypi.org/project/msoffice2pdf/)

---

## 9. 구현 완료 내역 (POC)

### 9.1 구현 현황

| 단계 | 상태 | 완료일 |
|------|------|--------|
| Phase 1: POC 백엔드 | ✅ 완료 | 2025-12-13 |
| Phase 1: POC 프론트엔드 | ✅ 완료 | 2025-12-13 |
| HWP 변환 지원 | ✅ 완료 (베타) | 2025-12-14 |
| Phase 2: aims-uix3 통합 | ⏳ 예정 | - |

### 9.2 구현된 파일 구조

```
aims/
├── tools/convert/
│   ├── convert2pdf.js      # 핵심 변환 모듈 (LibreOffice + HWP)
│   ├── server.js           # Express API 서버 (포트 3011)
│   └── package.json        # 의존성 (express, multer, cors)
│
└── frontend/pdf-converter-poc/
    ├── src/
    │   ├── App.tsx         # 메인 앱
    │   ├── App.css         # 스타일
    │   └── components/
    │       └── FileConverter.tsx  # 파일 업로드/변환 컴포넌트
    ├── vite.config.ts      # Vite 설정 (프록시)
    └── package.json
```

### 9.3 변환 테스트 결과

| 형식 | 테스트 결과 | 비고 |
|------|------------|------|
| DOCX | ✅ 성공 | 서식 유지 양호 |
| XLSX | ✅ 성공 | 다중 시트 지원 |
| PPTX | ✅ 성공 | 슬라이드 변환 양호 |
| CSV | ✅ 성공 | - |
| ODT | ✅ 성공 | - |
| RTF | ✅ 성공 | - |
| TXT | ✅ 성공 | - |
| HTML | ✅ 성공 | - |
| **HWP** | ✅ 성공 (베타) | HWP v5만 지원, 복잡한 서식 손실 가능 |

### 9.4 백엔드 API (server.js)

**엔드포인트:**

| Method | Path | 설명 |
|--------|------|------|
| GET | `/health` | 서버 상태 확인 |
| GET | `/formats` | 지원 형식 목록 |
| POST | `/convert` | 파일 업로드 → PDF 변환 |

**사용 예시:**
```bash
# 변환 요청
curl -X POST http://localhost:3011/convert \
  -F "file=@document.docx" \
  -o output.pdf
```

### 9.5 HWP 변환 구현 상세

**파이프라인:**
```
HWP 파일 → [pyhwp/hwp5odt] → ODT → [LibreOffice] → PDF
```

**구현 코드 (convert2pdf.js):**
```javascript
// HWP → ODT → PDF 2단계 파이프라인
async function convertHwpToPdf(hwpPath, outputDir) {
  const tempOdt = path.join(outputDir, baseName + '.odt');

  // 1단계: HWP → ODT (pyhwp)
  await convertHwpToOdt(hwpPath, tempOdt);

  // 2단계: ODT → PDF (LibreOffice)
  await runLibreOffice(tempOdt, outputDir);

  // 임시 파일 정리
  fs.unlinkSync(tempOdt);

  return pdfPath;
}
```

**서버 설정 (Linux):**
```bash
# pyhwp 설치 (가상환경)
python3 -m venv ~/pyhwp-venv
~/pyhwp-venv/bin/pip install pyhwp six

# RelaxNG 검증 패치 (strict validation 건너뛰기)
# ~/pyhwp-venv/lib/python3.12/site-packages/hwp5/plat/_lxml.py 수정
```

**주의사항:**
- HWP v5 형식만 지원 (v3 미지원)
- 복잡한 표, 수식, 특수 서식은 손실 가능
- 변환 시간: 일반 문서 대비 약 2배

### 9.6 프론트엔드 (pdf-converter-poc)

**주요 기능:**
- 드래그 앤 드롭 파일 업로드
- 실시간 변환 진행 상태 표시
- PDF 프리뷰 (iframe)
- PDF 다운로드

**실행 방법:**
```bash
# 프론트엔드 (Windows)
cd frontend/pdf-converter-poc
npm run dev  # http://localhost:5179

# 백엔드 (Linux 서버)
ssh tars.giize.com
cd ~/aims/tools/convert
node server.js  # 포트 3011
```

**연결 설정:**
- SSH 터널 사용: `ssh -N -L 3011:localhost:3011 tars.giize.com`
- 또는 nginx 프록시 설정

### 9.7 관련 커밋

| 커밋 | 내용 |
|------|------|
| `74398bb9` | feat: PDF 변환 POC 프론트엔드 및 API 서버 구현 |
| `a11cc127` | fix: LibreOffice 좀비 프로세스 문제 해결 |
| `5f6406f9` | feat: HWP 문서 PDF 변환 지원 추가 (베타) |

---

*문서 작성일: 2025-12-13*
*최종 수정일: 2025-12-14 (POC 구현 완료 내역 추가)*

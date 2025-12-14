# DOC 파일 텍스트 추출 미지원 이슈 분석

**작성일:** 2025.12.14
**상태:** 분석 완료
**관련 파일:** `tools/mime_type_analyzer/enhanced_file_analyzer.js`

---

## 현상

동일한 Word 문서를 업로드했을 때:
- `.docx` 파일: 메타데이터에서 텍스트 추출됨 (`text_source: "meta"`)
- `.doc` 파일: OCR로 처리됨 (`text_source: "ocr"`)

## 파일 포맷 차이

| 항목 | .docx | .doc |
|------|-------|------|
| **MIME 타입** | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | `application/msword` |
| **포맷** | Office Open XML (2007+) | Binary Format (구형, 1997-2003) |
| **구조** | ZIP 압축된 XML 파일들 | 이진(Binary) 포맷 |
| **텍스트 추출** | XML 파싱으로 쉽게 추출 | 특수 라이브러리 필요 |

## 원인 분석

### enhanced_file_analyzer.js의 텍스트 추출 로직

`extractTextFromFile()` 함수 (358-396행):

```javascript
async function extractTextFromFile(filePath, mimeType) {
  const ext = path.extname(filePath).toLowerCase();

  switch (mimeType) {
    case 'application/pdf':
      return await extractPdfText(filePath);

    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':  // .docx
      return await extractDocxText(filePath);  // mammoth 라이브러리 사용

    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':  // .xlsx
    case 'application/vnd.ms-excel':  // .xls
      return extractXlsxText(filePath);

    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':  // .pptx
      return await extractPptxText(filePath);

    case 'application/x-hwp':
      return extractHwpText(filePath);

    case 'text/plain':
      return fs.readFileSync(filePath, 'utf8');

    default:
      // .doc (application/msword)는 여기로 빠짐!
      throw new Error(`지원하지 않는 파일 형식입니다: ${mimeType}`);
  }
}
```

### 지원 현황

| MIME 타입 | 확장자 | 라이브러리 | 지원 여부 |
|-----------|--------|-----------|----------|
| `application/pdf` | .pdf | pdf-parse | O |
| `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | .docx | mammoth | O |
| `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | .xlsx | xlsx | O |
| `application/vnd.ms-excel` | .xls | xlsx | O |
| `application/vnd.openxmlformats-officedocument.presentationml.presentation` | .pptx | yauzl + xml2js | O |
| `application/x-hwp` | .hwp | - | X (개발 중) |
| **`application/msword`** | **.doc** | **-** | **X (미지원)** |

## 프로세스 흐름

```
[.doc 파일 업로드]
       ↓
[DocPrepMain Webhook]
       ↓
[DocMeta Request] → enhanced_file_analyzer.js 실행
       ↓
[application/msword → switch default → Error]
       ↓
[extracted_text = null 반환]
       ↓
[DocPrepMain: empty full_text? → Yes]
       ↓
[OCR 큐로 전송 (Redis XADD)]
       ↓
[OCR 처리 → text_source: "ocr"]
```

## 실제 데이터 비교

### .docx 파일 (텍스트 추출 성공)

```json
{
  "originalName": "주식명의신탁 약정서.docx",
  "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "badgeType": "TXT",
  "meta": {
    "full_text": "주식명의신탁 약정서\n\n김보성...",
    "meta_status": "ok"
  },
  "docembed": {
    "text_source": "meta"
  }
}
```

### .doc 파일 (OCR로 대체)

```json
{
  "originalName": "캐치업코리아주식회사_주식양수도계약서_고은숙_김태연.doc",
  "mimeType": "application/msword",
  "badgeType": "OCR",
  "meta": {
    "full_text": null,
    "meta_status": "ok"
  },
  "ocr": {
    "status": "done",
    "full_text": "주식양수도계약서...",
    "confidence": "0.9817"
  },
  "docembed": {
    "text_source": "ocr"
  }
}
```

## 해결 방안

### 방안 1: word-extractor 라이브러리 추가 (권장)

```bash
npm install word-extractor
```

```javascript
const WordExtractor = require('word-extractor');

async function extractDocText(filePath) {
  const extractor = new WordExtractor();
  const extracted = await extractor.extract(filePath);
  return extracted.getBody();
}

// switch문에 추가
case 'application/msword':
  return await extractDocText(filePath);
```

### 방안 2: antiword 사용 (Linux 서버)

```bash
# 설치
apt-get install antiword

# 사용
antiword document.doc
```

```javascript
const { execSync } = require('child_process');

function extractDocText(filePath) {
  const result = execSync(`antiword "${filePath}"`);
  return result.toString();
}
```

### 방안 3: 현재 상태 유지

- `.doc` 파일은 OCR로 처리 (현재 동작)
- OCR 신뢰도 높음 (0.98+)
- 추가 개발 불필요

## 결론

`.doc` 파일의 텍스트 추출이 안 되는 것은 **버그가 아닌 미지원 기능**입니다.

현재 시스템은 `.doc` 파일을 OCR로 자동 대체 처리하여 정상적으로 텍스트를 추출하고 있으며, OCR 신뢰도도 높습니다(98.17%).

`.doc` 파일의 메타 텍스트 추출이 필요한 경우 `word-extractor` 라이브러리 추가를 고려할 수 있습니다.

---

## 참고

- [mammoth.js](https://github.com/mwilliamson/mammoth.js) - DOCX 텍스트 추출
- [word-extractor](https://github.com/morungos/node-word-extractor) - DOC 텍스트 추출
- [antiword](http://www.winfield.demon.nl/) - Linux DOC 변환 도구

---

## 작업 로그

### 2025.12.14 13:55 - 이슈 분석 완료

- `.doc` 파일이 메타에서 텍스트 추출되지 않고 OCR로 처리되는 원인 파악
- `enhanced_file_analyzer.js`에 `application/msword` MIME 타입 처리 로직 없음 확인
- 현재는 OCR fallback으로 정상 동작 중

### 2025.12.14 14:10 - DOC 텍스트 추출 기능 구현

**수정 파일:** `tools/mime_type_analyzer/enhanced_file_analyzer.js`

**변경 내용:**
1. `word-extractor` 라이브러리 require 추가 (62행)
2. `extractDocText()` 함수 추가 (177-188행)
3. switch문에 `application/msword` 케이스 추가 (382-383행)

**서버 배포:**
```bash
scp enhanced_file_analyzer.js tars.giize.com:/home/rossi/aims/tools/mime_type_analyzer/
ssh tars.giize.com "cd /home/rossi/aims/tools/mime_type_analyzer && npm install word-extractor"
```

**테스트 결과:**
```json
{
  "filename": "251214044344_zcrkkjsd.doc",
  "mime": "application/msword",
  "status": "ok",
  "extracted_text": "주식양수도계약서\n\n매도인 고은숙...",
  "error": null
}
```

- 기존 OCR 결과와 동일한 품질의 텍스트 추출 확인
- 이후 `.doc` 파일 업로드 시 OCR 없이 메타에서 직접 텍스트 추출됨

### 2025.12.14 14:15 - 실제 업로드 테스트 성공

**테스트 파일:** `캐치업코리아주식회사_주식양수도계약서_고은숙_김태연.doc`

**결과 비교:**

| 항목 | 기존 (OCR) | 현재 (Meta) |
|------|-----------|-------------|
| `badgeType` | `"OCR"` | `"TXT"` |
| `meta.full_text` | `null` | 텍스트 추출됨 |
| `docembed.text_source` | `"ocr"` | `"meta"` |
| `stages` | 5단계 (OCR 포함) | 3단계 (OCR 생략) |

- OCR 단계 완전히 생략됨 (ocr_prep, ocr 없음)
- 메타데이터에서 직접 텍스트 추출 및 요약/태그 생성 완료

### 2025.12.14 14:20 - PDF 변환 서버 temp 디렉토리 자동 생성 개선

**문제:** `.doc` 파일 PDF 변환 실패 (`conversionStatus: "failed"`)

**원인:**
- PDF 변환 서버의 temp 디렉토리가 없음
- `git clean -fd` 등 다른 프로세스가 temp 폴더 삭제

**해결:**
`tools/convert/server.js`에 미들웨어 추가 - 모든 요청 전 temp/output 디렉토리 확인/생성

```javascript
// 모든 요청 전에 디렉토리 확인/생성 (다른 프로세스가 삭제했을 경우 대비)
app.use((req, res, next) => {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
    console.log(`[디렉토리 재생성] ${TEMP_DIR}`);
  }
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`[디렉토리 재생성] ${OUTPUT_DIR}`);
  }
  next();
});
```

**테스트:** temp 폴더 삭제 후 PDF 변환 → 자동 생성되어 정상 동작 확인

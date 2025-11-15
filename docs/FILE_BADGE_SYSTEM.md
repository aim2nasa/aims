# AIMS 파일 뱃지 시스템

## 🏷️ 3가지 뱃지 체계

| 뱃지 | 의미 | 대상 파일 |
|------|------|-----------|
| **TXT** | Meta에서 텍스트 추출 | 텍스트 PDF, DOCX, TXT, CSV |
| **OCR** | OCR로 텍스트 추출 | 스캔 PDF, 이미지 (JPG, PNG) |
| **BIN** | 바이너리 (텍스트 추출 불가) | ZIP, MP3, MP4, 실패한 OCR |

## 💰 OCR 비용 최적화 전략

**목표**: 텍스트 추출 가능성이 0%인 파일은 OCR을 건너뛰어 비용 절감

### OCR 건너뛰기 대상 (명백한 BIN MIME 타입)

**텍스트 추출 가능성이 절대 없는 파일 → 즉시 BIN 분류 (OCR 실행 안함):**

```javascript
// 압축 파일 (텍스트 가능성 0%)
'application/zip'
'application/x-zip-compressed'
'application/x-rar-compressed'
'application/x-7z-compressed'
'application/x-tar'
'application/gzip'
'application/x-bzip2'

// 오디오 파일 (텍스트 가능성 0%)
'audio/mpeg'        // MP3
'audio/mp4'         // M4A
'audio/wav'
'audio/flac'
'audio/aac'
'audio/ogg'

// 비디오 파일 (텍스트 가능성 0%)
'video/mp4'
'video/mpeg'
'video/x-msvideo'   // AVI
'video/quicktime'   // MOV
'video/x-matroska'  // MKV
'video/x-ms-wmv'    // WMV

// 실행 파일 (텍스트 가능성 0%)
'application/x-msdownload'  // EXE
'application/x-executable'
'application/x-sharedlib'   // DLL, SO
```

### OCR 시도 대상 (텍스트 추출 가능성 있음)

**OCR을 반드시 시도해야 하는 파일:**

- **이미지**: JPG, PNG, GIF, BMP, TIFF, WebP
- **PDF**: 스캔본 가능성
- **Office 문서**: PPT, PPTX, DOC, DOCX, XLS, XLSX (이미지 포함 가능)
- **한글 문서**: HWP
- **기타 알 수 없는 파일**: 명백한 BIN이 아니면 OCR 시도

**OCR 처리 결과:**
- OCR 성공 시 → `ocr.full_text`에 텍스트 저장 → **OCR 뱃지**
- OCR 실패 시 → `ocr.full_text` null 유지 → **BIN 뱃지**

## 🌳 완전 분류 트리 (비용 최적화)

**처리 흐름:**
1. `meta.full_text` 존재 여부 확인
2. 없으면 **MIME 타입 체크** (명백한 BIN인지 확인)
3. 명백한 BIN 아니면 → OCR 시도

```
🌍 모든 파일 (100%)
│  (MongoDB에 저장된 파일 = Meta 처리 성공)
│
├─✅ meta.full_text 존재 (62%)
│  └─→ 【TXT 뱃지】
│
└─❌ meta.full_text 없음 (38%)
   │
   ├─💰 명백한 BIN MIME? (3%)
   │  │ (zip, audio, video, exe)
   │  └─→ 【BIN 뱃지】 (OCR 건너뜀 - 비용 절감 💰)
   │
   └─📷 OCR 시도 대상 (35%)
      │ (이미지, PDF, Office 등)
      │
      ├─✅ OCR 성공 (35%)
      │  └─→ 【OCR 뱃지】
      │
      └─❌ OCR 실패 (0%)
         └─→ 【BIN 뱃지】
```

## 🔍 분류 검증

```
입력 파일 예시               경로                         최종 뱃지
─────────────────────────────────────────────────────────────────────
document.pdf (텍스트)    → meta.full_text○                → TXT ✓
scan.pdf (이미지)       → meta.full_text× → OCR 시도 → 성공 → OCR ✓
image.jpg              → meta.full_text× → OCR 시도 → 성공 → OCR ✓
ppt.pptx               → meta.full_text× → OCR 시도 → 성공 → OCR ✓
archive.zip            → meta.full_text× → BIN MIME     → BIN ✓ (OCR 건너뜀 💰)
audio.mp3              → meta.full_text× → BIN MIME     → BIN ✓ (OCR 건너뜀 💰)
video.mp4              → meta.full_text× → BIN MIME     → BIN ✓ (OCR 건너뜀 💰)
program.exe            → meta.full_text× → BIN MIME     → BIN ✓ (OCR 건너뜀 💰)
damaged.pdf            → meta.full_text× → OCR 시도 → 실패 → BIN ✓
unknown.xyz            → meta.full_text× → OCR 시도      → BIN ✓
─────────────────────────────────────────────────────────────────────
분류 실패 케이스: 0개 (불가능)
OCR 비용 절감: ZIP, MP3, MP4, EXE 등 명백한 바이너리 파일
```

## 💻 구현 로직

```javascript
/**
 * 명백한 BIN 타입 체크 (OCR 비용 절감)
 */
function isBinaryMimeType(mimeType) {
  if (!mimeType) return false;

  const BIN_MIME_TYPES = [
    // 압축
    'application/zip',
    'application/x-zip-compressed',
    'application/x-rar-compressed',
    'application/x-7z-compressed',
    'application/x-tar',
    'application/gzip',
    'application/x-bzip2',

    // 오디오
    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
    'audio/flac',
    'audio/aac',
    'audio/ogg',

    // 비디오
    'video/mp4',
    'video/mpeg',
    'video/x-msvideo',
    'video/quicktime',
    'video/x-matroska',
    'video/x-ms-wmv',

    // 실행 파일
    'application/x-msdownload',
    'application/x-executable',
    'application/x-sharedlib',
  ];

  return BIN_MIME_TYPES.includes(mimeType.toLowerCase());
}

/**
 * 뱃지 분류 (비용 최적화 버전)
 */
function getBadge(file) {
  // Level 1: meta.full_text 확인
  if (file.meta?.full_text && file.meta.full_text.trim().length > 0) {
    return 'TXT';
  }

  // Level 2: 명백한 BIN MIME 체크 (OCR 건너뜀 💰)
  if (isBinaryMimeType(file.metadata?.mimetype)) {
    return 'BIN';
  }

  // Level 3: OCR 텍스트 확인
  if (file.ocr?.full_text) {
    return 'OCR';
  }

  // Level 4: 나머지 모두 BIN
  return 'BIN';
}
```

## 🔒 완전성 보장

**분기 누락 = 불가능**
- MongoDB에 저장된 모든 파일은 반드시 뱃지 부여
- 단계적 필수 검증 구조:
  1. `meta.full_text` 확인 → 있으면 TXT
  2. 없으면 **MIME 타입 체크** (명백한 BIN인지 확인)
  3. 명백한 BIN이면 → 즉시 BIN (OCR 건너뜀)
  4. 아니면 → OCR 시도, 성공하면 OCR, 실패하면 BIN
- 최종 `return 'BIN'`으로 모든 나머지 케이스 커버

## ✅ 해결되는 문제

- **ZIP 60% 멈춤 현상** → 100% 완료 표시
- **PDF 뱃지 누락** → 모든 파일에 뱃지 부여
- **처리 상태 모호함** → 명확한 3분류
- **미지원 파일 처리** → BIN으로 안전하게 분류
- **💰 OCR 비용 낭비** → 명백한 바이너리는 OCR 건너뜀

## 📊 비용 절감 효과

**현재 통계 기준 (총 235개):**
- TXT: 145개 (62%) - Meta 텍스트 추출
- OCR: 82개 (35%) - OCR 텍스트 추출
- BIN: 8개 (3%) - 바이너리 파일

**개선 후 예상:**
- BIN 8개 중 압축/오디오/비디오 파일이 있다면 → OCR 호출 절감
- 예상 절감: 3-5개 파일의 불필요한 OCR 호출 제거
- **비용 절감률: 약 1-2% (지속적 누적)**

---
*최종 업데이트: 2025.11.15 - OCR 비용 최적화 로직 추가*

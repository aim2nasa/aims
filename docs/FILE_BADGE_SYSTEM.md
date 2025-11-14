# AIMS 파일 뱃지 시스템

## 🏷️ 3가지 뱃지 체계

| 뱃지 | 의미 | 대상 파일 |
|------|------|-----------|
| **TXT** | Meta에서 텍스트 추출 | 텍스트 PDF, DOCX, TXT, CSV |
| **OCR** | OCR로 텍스트 추출 | 스캔 PDF, 이미지 (JPG, PNG) |
| **BIN** | 바이너리 (텍스트 추출 불가) | ZIP, MP3, MP4, 실패한 OCR |

## 📷 OCR 시도 대상 파일

**Meta에서 full_text 추출 실패 시 OCR을 시도하는 MIME 타입:**

| 카테고리 | MIME 타입 | 확장자 예시 |
|---------|----------|------------|
| **이미지** | image/jpeg | .jpg, .jpeg |
| | image/png | .png |
| | image/gif | .gif |
| | image/bmp | .bmp |
| | image/tiff | .tif, .tiff |
| | image/webp | .webp |
| **PDF** | application/pdf | .pdf (스캔본) |

**OCR 시도하지 않는 파일:**
- 압축: application/zip, application/x-rar
- 미디어: audio/*, video/*
- 텍스트: text/plain (이미 Meta에서 처리)

## 🌳 완전 분류 트리

**처리 흐름:**
1. `full_text` 존재 여부로 1차 분기
2. `full_text` 없으면 **반드시** MIME 타입 확인 (필수 단계)
3. 이미지/PDF 여부로 2차 분기 → OCR 시도 or 즉시 BIN

```
🌍 모든 파일 (100%)
│  (MongoDB에 저장된 파일 = Meta 처리 성공)
│
├─✅ full_text 추출 성공 (30%)
│  └─→ 【TXT 뱃지】
│
└─❌ full_text 추출 실패 (70%)
   │
   └─❓ 이미지/PDF 타입?
      │
      ├─✅ YES (40%)
      │  │ (image/*, application/pdf)
      │  │
      │  ├─✅ OCR 성공 (35%)
      │  │  └─→ 【OCR 뱃지】
      │  │
      │  └─❌ OCR 실패 (5%)
      │     └─→ 【BIN 뱃지】
      │
      └─❌ NO (30%)
         └─→ 【BIN 뱃지】
            (압축, 미디어, 기타 모두 포함)
```

## 🔍 분류 검증

```
입력 파일 예시               경로                     최종 뱃지
─────────────────────────────────────────────────────────────
document.pdf (텍스트)    → full_text○              → TXT ✓
scan.pdf (이미지)       → full_text× → OCR성공     → OCR ✓
image.jpg              → full_text× → OCR성공     → OCR ✓
archive.zip            → full_text× → 이미지/PDF× → BIN ✓
audio.mp3              → full_text× → 이미지/PDF× → BIN ✓
video.mp4              → full_text× → 이미지/PDF× → BIN ✓
damaged.pdf            → full_text× → OCR실패     → BIN ✓
unknown.xyz            → full_text× → 이미지/PDF× → BIN ✓
noext                  → full_text× → 이미지/PDF× → BIN ✓
─────────────────────────────────────────────────────────────
분류 실패 케이스: 0개 (불가능)
※ Meta 처리 실패 파일은 MongoDB에 저장되지 않아 프론트에 표시 안 됨
```

## 💻 구현 로직

```javascript
// 모든 파일이 반드시 3개 뱃지 중 하나를 받음
// (MongoDB에 저장된 파일 = Meta 처리 성공)
function getBadge(file) {
  // Level 1: full_text 확인
  if (meta.full_text) return 'txt';

  // Level 2: 이미지/PDF 타입인 경우 OCR 확인
  if (isOcrCapable(mime)) {
    if (ocr.status === 'done') return 'ocr';
  }

  // Level 3: 나머지 모두 BIN
  return 'bin';
}
```

## 🔒 완전성 보장

**분기 누락 = 불가능**
- MongoDB에 저장된 모든 파일은 반드시 뱃지 부여
- 단계적 필수 검증 구조:
  1. `full_text` 확인 → 있으면 TXT
  2. 없으면 **반드시** 타입 확인 (선택 아님, 필수)
  3. 이미지/PDF면 OCR 시도, 아니면 즉시 BIN
- 최종 `return 'bin'`으로 모든 나머지 케이스 커버

## ✅ 해결되는 문제

- **ZIP 60% 멈춤 현상** → 100% 완료 표시
- **PDF 뱃지 누락** → 모든 파일에 뱃지 부여
- **처리 상태 모호함** → 명확한 3분류
- **미지원 파일 처리** → BIN으로 안전하게 분류

---
*최종 업데이트: 2025.11.15*
# 키워드 검색 실패 원인 분석 보고서

**작성일**: 2025-11-13
**문서 유형**: 기술 분석 보고서
**대상 시스템**: AIMS 문서 검색 시스템

---

## 1. 문제 발견

### 증상
- **검색 모드**: 키워드 검색 (keyword search)
- **검색어**: "마크다운"
- **대상 문서**: `markdownmanual.pdf`
- **결과**: 검색 결과 없음 (빈 배열 반환)

### 기대 동작
- 문서 원본에 "마크다운"이라는 단어가 명확히 포함되어 있음
- 키워드 검색 시 해당 문서가 검색되어야 함

### 실제 동작
```bash
# 키워드 검색 API 호출
curl -X POST https://tars.giize.com/search_api \
  -d '{"query":"마크다운", "search_mode":"keyword", "mode":"AND", "user_id":"tester"}'

# 결과
{
  "search_mode": "keyword",
  "answer": null,
  "search_results": []  # 빈 배열!
}
```

### 비교: AI 검색은 정상 작동
```bash
# 시맨틱 검색 API 호출
curl -X POST https://tars.giize.com/search_api \
  -d '{"query":"마크다운", "search_mode":"semantic", "user_id":"tester"}'

# 결과
{
  "search_mode": "semantic",
  "answer": "마크다운은 간단하고 직관적인 문법을...",
  "search_results": [
    {
      "id": "48f07248-c9a9-4d01-9ea5-e922b37f599d",
      "score": 0.32613623,
      "payload": {
        "doc_id": "6915598a44f6eb919ecd4779",
        "original_name": "markdownmanual.pdf"
        ...
      }
    }
  ]
}
```

→ **시맨틱 검색은 성공, 키워드 검색만 실패**

---

## 2. 원인 분석 과정

### 2.1 백엔드 API 구조 확인

```
프론트엔드
    ↓
https://tars.giize.com/search_api (RAG API)
    ↓
┌─────────────┬─────────────────────────────────┐
│ keyword     │ https://n8nd.giize.com/webhook/smartsearch (n8n)
│             │   ↓
│             │ MongoDB: docupload.files 검색
└─────────────┴─────────────────────────────────┘
│ semantic    │ Qdrant Vector DB 검색
│             │   ↓
│             │ MongoDB: 전체 문서 정보 병합
└─────────────┴─────────────────────────────────┘
```

### 2.2 MongoDB 저장 데이터 확인

```javascript
// markdownmanual.pdf의 MongoDB 문서
{
  "_id": "6915598a44f6eb919ecd4779",
  "ownerId": "tester",
  "upload": {
    "originalName": "markdownmanual.pdf"
  },
  "meta": {
    // ❌ 문제: full_text가 글자마다 띄어쓰기
    "full_text": "마 크 다 운   가 이 드  마 크 다 운의   장점...",

    // ✅ 정상: tags는 올바른 텍스트
    "tags": [
      "마크다운",
      "문법",
      "플랫폼 독립성",
      ...
    ],

    // ✅ 정상: summary도 올바른 텍스트
    "summary": "마크다운은 간단하고 직관적인 문법으로..."
  }
}
```

### 2.3 각 도구별 PDF 텍스트 추출 비교

| 추출 도구 | 결과 | 상태 |
|----------|------|------|
| **PDF 원본** | "마크다운 가이드" | ✅ 정상 |
| **pdftotext** | "마크다운 가이드" | ✅ 정상 |
| **pdfplumber** | "마크다운 가이드" | ✅ 정상 |
| **PyPDF2** | "마크다운  가이드" | ⚠️ 2칸 띄어쓰기 |
| **n8n Extract from File** | "마 크 다 운   가 이 드" | ❌ 글자마다 띄어쓰기 |

### 2.4 SmartSearch 검색 범위 확인

```bash
# SmartSearch API 테스트
curl -X POST https://n8nd.giize.com/webhook/smartsearch \
  -d '{"query":"마크다운", "mode":"OR", "user_id":"tester"}'

# 결과: [] (빈 배열)
```

**분석 결과**: SmartSearch가 `meta.full_text`만 검색하고 있음
- `meta.tags` → 검색 안 함
- `meta.summary` → 검색 안 함

---

## 3. 최종 원인

### 원인 1: PDF 파싱 도구 문제

**n8n "Extract from File" 노드가 PDF 텍스트를 잘못 추출**

- **사용 도구**: n8n 내장 "Extract from File" 노드
- **문제**: 한글 텍스트를 글자 단위로 분리하여 추출
- **영향**: `meta.full_text`에 잘못된 데이터 저장

```
PDF 원본:     "마크다운 가이드"
              ↓ n8n Extract from File
MongoDB 저장: "마 크 다 운   가 이 드"  (글자마다 띄어쓰기)
```

### 원인 2: 검색 범위 제한 문제

**SmartSearch n8n 워크플로우가 `meta.full_text`만 검색**

- `meta.full_text`: ❌ "마 크 다 운" (잘못된 텍스트)
- `meta.tags`: ✅ "마크다운" (정상 텍스트) → **검색 안 함!**
- `meta.summary`: ✅ "마크다운은..." (정상 텍스트) → **검색 안 함!**

```
사용자 검색어: "마크다운"
               ≠
meta.full_text: "마 크 다 운"  (불일치)
               → 검색 실패!
```

---

## 4. 해결 방안

### 방안 A: 검색 범위 확장 (즉시 해결 - 권장)

**SmartSearch n8n 워크플로우 수정**

```javascript
// 현재: full_text만 검색
{
  "meta.full_text": { $regex: "마크다운", $options: "i" }
}

// 수정: tags, summary도 검색
{
  $or: [
    { "meta.full_text": { $regex: "마크다운", $options: "i" } },
    { "meta.tags": { $regex: "마크다운", $options: "i" } },
    { "meta.summary": { $regex: "마크다운", $options: "i" } }
  ]
}
```

**장점**:
- 즉시 적용 가능
- `tags`와 `summary`는 AI가 생성하여 정상 텍스트 보유
- 기존 문서 재처리 불필요

**단점**:
- `full_text`의 근본 문제는 해결되지 않음

### 방안 B: PDF 파싱 도구 교체 (근본 해결)

**n8n "Extract from File" → Python 스크립트로 교체**

```python
# pdfplumber 사용 예시
import pdfplumber

def extract_pdf_text(pdf_path):
    with pdfplumber.open(pdf_path) as pdf:
        text = ""
        for page in pdf.pages:
            text += page.extract_text() or ""
    return text

# 결과: "마크다운 가이드" (정상)
```

**장점**:
- PDF 텍스트 추출 품질 향상
- 근본 원인 해결

**단점**:
- 기존 문서 전체 재처리 필요
- n8n 워크플로우 구조 변경 필요

### 방안 C: 둘 다 적용 (완벽 해결)

1. **단기**: 검색 범위 확장 (즉시 서비스 개선)
2. **중장기**: PDF 파싱 도구 교체 (품질 향상)

---

## 5. 권장 조치

### 즉시 조치 (높음)
- [ ] SmartSearch n8n 워크플로우 수정
  - `meta.tags` 검색 추가
  - `meta.summary` 검색 추가
- [ ] 수정 후 테스트: "마크다운" 키워드 검색

### 중기 조치 (중간)
- [ ] n8n "Extract from File" 노드를 Python 스크립트로 교체
  - `pdfplumber` 또는 `pdftotext` 사용
- [ ] 기존 문서 재처리 계획 수립

### 장기 조치 (낮음)
- [ ] MongoDB 텍스트 인덱스 생성 (검색 성능 향상)
- [ ] 검색 품질 모니터링 시스템 구축

---

## 6. 학습 포인트

### 문제 진단 과정에서 배운 점

1. **데이터 검증의 중요성**
   - 백엔드 API가 정상이어도 데이터 품질 문제로 검색 실패 가능
   - 원본 데이터와 저장된 데이터의 일치성 확인 필요

2. **다층 시스템의 디버깅**
   - 프론트엔드 → API → n8n → MongoDB 전체 흐름 추적
   - 각 단계별 데이터 확인 필요

3. **도구 선택의 중요성**
   - 같은 작업도 도구에 따라 결과가 다름
   - PDF 파싱: pdfplumber > PyPDF2 > n8n Extract from File

### 시스템 개선 방향

1. **검색 범위 다각화**
   - 단일 필드 검색보다 다중 필드 검색
   - `full_text`, `tags`, `summary` 모두 활용

2. **데이터 품질 검증**
   - PDF 텍스트 추출 후 품질 검증 단계 추가
   - 글자 단위 띄어쓰기 등 이상 패턴 자동 감지

3. **검색 알고리즘 개선**
   - 정확도: 키워드 검색
   - 유사도: 시맨틱 검색
   - 하이브리드: 두 방식 결합

---

## 부록: 테스트 명령어

### PDF 텍스트 직접 추출
```bash
# pdftotext (가장 정확)
pdftotext /data/files/users/tester/2025/11/251113040738_cnd5in8m.pdf -

# pdfplumber
python3 -c "import pdfplumber; pdf = pdfplumber.open('파일경로'); print(pdf.pages[0].extract_text())"

# PyPDF2
python3 -c "from PyPDF2 import PdfReader; pdf = PdfReader('파일경로'); print(pdf.pages[0].extract_text())"
```

### MongoDB 쿼리
```bash
# 문서 확인
mongosh mongodb://localhost:27017/docupload --quiet --eval \
  "db.files.findOne({_id: ObjectId('6915598a44f6eb919ecd4779')}, {'meta.full_text': 1, 'meta.tags': 1})"

# tags로 검색
mongosh mongodb://localhost:27017/docupload --quiet --eval \
  "db.files.find({'meta.tags': /마크다운/}, {'upload.originalName': 1}).toArray()"
```

### API 테스트
```bash
# 키워드 검색
curl -X POST https://tars.giize.com/search_api \
  -H "Content-Type: application/json" \
  -d '{"query":"마크다운", "search_mode":"keyword", "mode":"OR", "user_id":"tester"}'

# 시맨틱 검색
curl -X POST https://tars.giize.com/search_api \
  -H "Content-Type: application/json" \
  -d '{"query":"마크다운", "search_mode":"semantic", "user_id":"tester"}'

# SmartSearch 직접 호출
curl -X POST https://n8nd.giize.com/webhook/smartsearch \
  -H "Content-Type: application/json" \
  -d '{"query":"마크다운", "mode":"OR", "user_id":"tester"}'
```

---

**문서 끝**

# DocSummary n8n 워크플로우 API 가이드

## 개요

n8n의 DocSummary 워크플로우를 호출하여 문서 텍스트를 AI로 요약하는 방법을 설명합니다.

- **AI Model**: GPT-4.1-mini (OpenAI)
- **입력 제한**: 앞 5000자만 요약에 사용
- **출력 형식**: 3~5줄 요약

---

## 📋 워크플로우 정보

| 항목 | 값 |
|------|-----|
| **Webhook Path** | `/webhook/docsummary` |
| **HTTP Method** | `POST` |
| **Content-Type** | `application/json` |
| **n8n 포트** | `5678` (기본값) |
| **서버** | `localhost` (tars 내부) |

---

## 🎯 기본 사용법

### 1. 간단한 텍스트 요약

```bash
ssh tars.giize.com 'curl -X POST http://localhost:5678/webhook/docsummary \
  -H "Content-Type: application/json" \
  -d "{\"full_text\": \"여기에 요약할 텍스트를 입력하세요\"}"'
```

### 2. JSON 파일로 요청

```bash
# 요청 JSON 파일 생성 (request.json)
{
  "full_text": "여기에 요약할 텍스트를 입력하세요"
}

# 파일로 요청
ssh tars.giize.com 'curl -X POST http://localhost:5678/webhook/docsummary \
  -H "Content-Type: application/json" \
  -d @/path/to/request.json \
  | python3 -m json.tool'
```

---

## 📝 실제 예제

### 예제 1: 보험 청구서 요약

```bash
ssh tars.giize.com 'curl -X POST http://localhost:5678/webhook/docsummary \
  -H "Content-Type: application/json" \
  -d "{\"full_text\": \"이 문서는 보험 청구서입니다. 고객 이름은 김철수이며, 2024년 10월 15일 입원비 청구를 위해 제출되었습니다. 청구 금액은 150만원이며, 진단명은 급성 맹장염입니다. 입원 기간은 2024년 10월 1일부터 10월 7일까지 총 7일간이었으며, 서울대학교병원에서 치료를 받았습니다.\"}" \
  | python3 -m json.tool'
```

**응답 예시:**
```json
{
  "summary": "김철수 고객의 급성 맹장염 입원비 청구서입니다.\n2024년 10월 1일~7일 서울대병원에서 7일간 입원 치료를 받았으며,\n청구 금액은 150만원입니다.",
  "length": 95,
  "truncated": false
}
```

### 예제 2: MongoDB에서 문서 가져와서 요약

```bash
# 1단계: MongoDB에서 문서의 full_text 가져오기
ssh tars.giize.com 'mongosh aims --quiet --eval "
  const doc = db.files.findOne({\"meta.full_text\": {\$exists: true}});
  print(JSON.stringify({
    full_text: doc.meta.full_text
  }));
" > /tmp/doc_to_summarize.json'

# 2단계: n8n으로 요약 생성
ssh tars.giize.com 'curl -X POST http://localhost:5678/webhook/docsummary \
  -H "Content-Type: application/json" \
  -d @/tmp/doc_to_summarize.json \
  | python3 -m json.tool'
```

### 예제 3: 특정 파일명으로 문서 찾아서 요약

```bash
ssh tars.giize.com '
  # MongoDB에서 특정 파일의 full_text 추출
  FULL_TEXT=$(mongosh aims --quiet --eval "
    const doc = db.files.findOne({filename: \"보험청구서.pdf\"});
    if (doc && doc.meta && doc.meta.full_text) {
      print(doc.meta.full_text);
    } else if (doc && doc.ocr && doc.ocr.full_text) {
      print(doc.ocr.full_text);
    }
  ")

  # n8n으로 요약 요청
  curl -X POST http://localhost:5678/webhook/docsummary \
    -H "Content-Type: application/json" \
    -d "{\"full_text\": \"$FULL_TEXT\"}" \
    | python3 -m json.tool
'
```

### 예제 4: 긴 텍스트 요약 (5000자 초과)

```bash
ssh tars.giize.com 'curl -X POST http://localhost:5678/webhook/docsummary \
  -H "Content-Type: application/json" \
  -d "{\"full_text\": \"$(cat << "EOF"
이것은 매우 긴 문서입니다.
여러 페이지에 걸쳐 다양한 내용이 포함되어 있습니다.
보험 청구서, 계약서, 진단서, 의료 기록 등이 포함될 수 있습니다.
워크플로우는 자동으로 앞 5000자만 잘라서 요약합니다.
이후 내용은 요약에 반영되지 않으며, truncated 필드가 true로 반환됩니다.
EOF
)\"}" | python3 -m json.tool'
```

**응답 예시 (5000자 초과 시):**
```json
{
  "summary": "다양한 의료 및 보험 관련 문서들을 포함하는 긴 문서입니다.\n앞부분 5000자를 기반으로 요약되었습니다.",
  "length": 78,
  "truncated": true
}
```

---

## 📤 응답 형식

### 성공 응답 (200 OK)

```json
{
  "summary": "AI가 생성한 3~5줄 요약 텍스트",
  "length": 150,
  "truncated": false
}
```

**필드 설명:**
- `summary` (string): AI가 생성한 요약 텍스트 (3~5줄)
- `length` (number): 요약 텍스트의 글자 수
- `truncated` (boolean): 원문이 5000자를 넘어서 잘렸는지 여부
  - `true`: 원문이 5000자 초과하여 앞부분만 요약됨
  - `false`: 전체 텍스트가 요약됨

---

## 🔧 워크플로우 내부 동작

### 처리 흐름

```
1. Summary Request (Webhook)
   ↓ POST /webhook/docsummary

2. LimitText (Code)
   ↓ 앞 5000자만 추출

3. AI Agent
   ↓ GPT-4.1-mini로 요약 생성

4. Code (후처리)
   ↓ JSON 파싱 및 포맷팅

5. Summary Return
   ↓ 응답 반환
```

### LimitText 로직

```javascript
const text = $json.body.full_text || '';

// 길이 확인
const length = text.length;

// 앞 5000자만 잘라서 요약에 사용
const limitedText = text.substring(0, 5000);

return [{
  json: {
    full_text: text,
    limitedText,
    length,
    truncated: text.length > 5000
  }
}];
```

### AI 프롬프트

**System Message:**
```
당신은 Text 요약처리 AI입니다.

입력은 JSON 형식으로 4가지가 제공됩니다:
- full_text: 원문
- limitedText: 제한된 글자수 원문 (앞 5000자만 잘라서 요약에 사용)
- length : limitedText의 크기
- truncated: 5000자로 제한할때 원문이 잘렸는지 여부

아래 JSON 형식으로 반환하세요.

{
  "summary": "<limitedText 내용을 3~5줄로 요약>"
}
```

---

## 💡 실용적인 사용 시나리오

### 시나리오 1: 신규 업로드 문서 자동 요약

```bash
# 최근 업로드된 문서 중 요약이 없는 문서 찾아서 요약 생성
ssh tars.giize.com '
  mongosh aims --quiet --eval "
    db.files.find({
      \"meta.full_text\": {\$exists: true},
      \"meta.summary\": {\$exists: false}
    }).limit(5).forEach(doc => {
      const full_text = doc.meta.full_text;

      // curl로 요약 생성
      const result = cat(
        {\"full_text\": full_text}
      );

      print(\"Processing: \" + doc.filename);
      print(\"Summary: \" + result.summary);
      print(\"---\");
    });
  "
'
```

### 시나리오 2: 배치 요약 생성 스크립트

```bash
#!/bin/bash
# batch_summarize.sh

# MongoDB에서 요약이 없는 문서 목록 가져오기
DOC_IDS=$(ssh tars.giize.com 'mongosh aims --quiet --eval "
  db.files.find(
    {
      \"meta.full_text\": {\$exists: true},
      \"meta.summary\": {\$exists: false}
    },
    {_id: 1}
  ).toArray().map(d => d._id.toString()).join(\" \")
"')

# 각 문서 요약 생성
for DOC_ID in $DOC_IDS; do
  echo "Processing document: $DOC_ID"

  # full_text 가져오기
  FULL_TEXT=$(ssh tars.giize.com "mongosh aims --quiet --eval \"
    db.files.findOne({_id: ObjectId('$DOC_ID')}).meta.full_text
  \"")

  # 요약 생성
  SUMMARY=$(ssh tars.giize.com "curl -s -X POST http://localhost:5678/webhook/docsummary \
    -H 'Content-Type: application/json' \
    -d '{\"full_text\": \"$FULL_TEXT\"}' \
    | python3 -c 'import sys, json; print(json.load(sys.stdin)[\"summary\"])'")

  # MongoDB에 요약 저장
  ssh tars.giize.com "mongosh aims --quiet --eval \"
    db.files.updateOne(
      {_id: ObjectId('$DOC_ID')},
      {\\\$set: {'meta.summary': '$SUMMARY'}}
    )
  \""

  echo "Summary saved for $DOC_ID"
  echo "---"
done
```

### 시나리오 3: API 서버에서 호출

```javascript
// Node.js 예제
const axios = require('axios');

async function generateSummary(fullText) {
  try {
    const response = await axios.post('http://localhost:5678/webhook/docsummary', {
      full_text: fullText
    });

    return {
      success: true,
      summary: response.data.summary,
      length: response.data.length,
      truncated: response.data.truncated
    };
  } catch (error) {
    console.error('Summary generation failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// 사용 예
const result = await generateSummary(
  "이 문서는 보험 청구서입니다. 고객 이름은 김철수이며..."
);
console.log(result.summary);
```

```python
# Python 예제
import requests
import json

def generate_summary(full_text):
    url = 'http://localhost:5678/webhook/docsummary'
    payload = {'full_text': full_text}

    try:
        response = requests.post(url, json=payload)
        response.raise_for_status()

        data = response.json()
        return {
            'success': True,
            'summary': data['summary'],
            'length': data['length'],
            'truncated': data['truncated']
        }
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }

# 사용 예
result = generate_summary(
    "이 문서는 보험 청구서입니다. 고객 이름은 김철수이며..."
)
print(result['summary'])
```

---

## ⚠️ 주의사항

### 1. 텍스트 길이 제한
- **5000자 초과 시 자동으로 앞부분만 잘림**
- `truncated: true`로 표시됨
- 긴 문서는 여러 부분으로 나누어 요약 필요

### 2. AI 응답 시간
- GPT-4.1-mini 호출 시간: 평균 3-10초
- 네트워크 상태에 따라 변동 가능
- 타임아웃 설정 권장 (30초)

### 3. 비용
- OpenAI API 사용으로 비용 발생
- 5000자 기준: 약 $0.001-0.002 per request
- 대량 처리 시 비용 고려 필요

### 4. 에러 처리
- full_text가 빈 문자열이면 의미 없는 요약 생성
- JSON 파싱 에러 가능성 (특별한 문자 포함 시)
- 요청 전 텍스트 검증 권장

---

## 🔍 트러블슈팅

### Q1. "Cannot POST /webhook/docsummary" 에러
**원인**: n8n 서버가 실행되지 않거나 워크플로우가 비활성화됨

**해결**:
```bash
# n8n 서버 상태 확인
ssh tars.giize.com 'ps aux | grep n8n | grep -v grep'

# n8n 워크플로우 활성화 상태 확인
# DocSummary.json의 "active": true 확인
```

### Q2. 응답이 너무 느림
**원인**: GPT-4.1-mini API 응답 지연

**해결**:
- 타임아웃 설정: `curl --max-time 30`
- 대량 처리 시 비동기 처리 고려
- 캐싱 메커니즘 구현

### Q3. 요약 품질이 낮음
**원인**: 입력 텍스트가 너무 짧거나 구조화되지 않음

**해결**:
- 최소 100자 이상의 텍스트 사용
- OCR 오류 제거 후 요약
- 프롬프트 조정 (워크플로우 수정)

### Q4. 한글이 깨짐
**원인**: 인코딩 문제

**해결**:
```bash
# UTF-8 인코딩 명시
curl -X POST http://localhost:5678/webhook/docsummary \
  -H "Content-Type: application/json; charset=utf-8" \
  -d "..."
```

---

## 📚 관련 문서

- [DocSummary.json](./DocSummary.json) - n8n 워크플로우 정의
- [TAG_DESIGN.md](../../tools/SemanTree/TAG_DESIGN.md) - 태그 시스템 설계
- [FacetLab_Concept_Document.md](../../FacetLab_Concept_Document.md) - 다면적 문서 분류 컨셉

---

## 문서 이력

- 2025-10-24: 초안 작성 (DocSummary n8n 워크플로우 API 가이드)

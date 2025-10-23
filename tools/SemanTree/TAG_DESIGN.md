# SemanTree 태그 시스템 설계 문서

## 📋 문서 개요

**작성일**: 2025-10-24
**목적**: SemanTree에서 MongoDB 문서로부터 태그를 추출하고 분류하기 위한 설계
**대상**: AIMS 보험 문서 관리 시스템

---

## 🔍 문제 정의

### 문서 유형 분석

SemanTree에서 읽어오는 도큐먼트는 `full_text`, `summary` 위치에 따라 **2가지 유형**이 존재합니다:

#### 유형 1: `meta` 서브도큐먼트에 텍스트 존재
```javascript
{
  _id: ObjectId('68fa458a3d4b65aed7108212'),
  upload: {
    originalName: '방촌로1172-5-증권-100만원.pdf',
    saveName: '251023151105_8b532y60.pdf',
    destPath: '/data/files/2025/10/251023151105_8b532y60.pdf',
    uploaded_at: '2025-10-24T00:11:06.037xxx',
    sourcePath: '',
  },
  meta: {
    filename: '251023151105_8b532y60.pdf',
    extension: '.pdf',
    mime: 'application/pdf',
    size_bytes: '119962',
    created_at: '2025-10-23T15:11:06.026Z',
    meta_status: 'ok',
    exif: '{}',
    pdf_pages: '4',
    full_text: '보 험 기 간   2025-05-27   ~   2030-05-27   직   업   -  계 약 자 명   주식회사캐치업코리아   사업자번호   128-87-*****  주   소   ( 대표 ) 10449   경기 고양시 일산동구 백석동   *****  단 체 여 부   아니오  ■   계 약 후 알 릴 의 무 안 내  보험계약을 체결한 후 피보험자의 ...',
    pdf_text_ratio: '{"total_pages":4,"text_pages":4,"text_ratio":100}',
    summary: '이 보험증권은 2025년 5월 27일부터 2030년 5월 27일까지 주식회사캐치업코리아의 자가 창고시설에 대해 현대해상 공마스터재산종합보험(Hi2504)으로 가입되었으며, 보장내용에는 화재손해, 배상책임, 내부시설 및 집기비품 등이 포함됩니다. 보험료는 총 1,000,000원이며 자동이체 방식으로 납입됩니다. 계약 변경이나 피보험자의 직업 변화 시 즉시 통...',
    length: 274,
    truncated: true,
  },
  docembed: {
    status: 'done',
    dims: 1536,
    chunks: 5,
    text_source: 'meta',
    updated_at: '2025-10-24T00:12:07.747378+09:00',
  },
}
```

**특징:**
- PDF 파일
- `meta.full_text`와 `meta.summary` 존재
- `docembed.text_source: 'meta'`

---

#### 유형 2: `ocr` 서브도큐먼트에 텍스트 존재
```javascript
{
  _id: ObjectId('68fa45a23d4b65aed710821d'),
  upload: {
    originalName: '캐치업자동차견적.jpg',
    saveName: '251023151129_ni4katop.jpg',
    destPath: '/data/files/2025/10/251023151129_ni4katop.jpg',
    uploaded_at: '2025-10-24T00:11:29.789xxx',
    sourcePath: '',
  },
  meta: {
    filename: '251023151129_ni4katop.jpg',
    extension: '.jpg',
    mime: 'image/jpeg',
    size_bytes: '297195',
    created_at: '2025-10-23T15:11:29.752Z',
    meta_status: 'ok',
    exif: '{}',
    pdf_pages: null,
    full_text: null,
    pdf_text_ratio: null,
    summary: 'null',
    length: 0,
    truncated: false,
  },
  ocr: {
    status: 'done',
    queued_at: '2025-10-24T00:11:31.746+09:00',
    started_at: '2025-10-24T00:11:33.678+09:00',
    done_at: '2025-10-24T00:11:39.535+09:00',
    confidence: '0.9817',
    full_text: '24. 11. 28. 오후 2:57 보험료 출력 \n자동차 보험 가입안내서 \n탑인스원 \nTel : Fax : \n(우) \n(주)캐치업코리아 님 \n안녕하십니까? \n(주)캐치업코리아 님의 자동차 보험 만기일이 2024년 12월 18일 입니다. \n탑인스원 는 안내서에 기명된 전 손해보험사의 업무를 취급하는 자동차 손해보험 전문법인대리점으로서 아래와 같이 각 보험 ...',
    summary: '(주)캐치업코리아의 자동차 보험 만기일은 2024년 12월 18일이며, 탑인스원에서 주요 보험사별 자동차 보험료를 비교 안내했습니다. 고객은 원하시는 보험사를 선택해 가입할 수 있으며, 탑인스원은 신속하고 정확한 관리 서비스를 제공합니다. 비교 견적서에는 현대, KB, 롯데, 삼성, 한화, DB 등 여러 보험사의 보험료 상세 내역이 포함되어 있습니다.',
  },
  docembed: {
    status: 'done',
    dims: 1536,
    chunks: 1,
    text_source: 'ocr',
    updated_at: '2025-10-24T00:13:02.355526+09:00',
  },
}
```

**특징:**
- 이미지 파일 (JPG)
- `meta.full_text`와 `meta.summary`가 null
- `ocr.full_text`와 `ocr.summary` 존재
- `docembed.text_source: 'ocr'`

---

## 🎯 목표

**문서의 `full_text`와 `summary`로부터 특징을 나타내는 태그를 추출하여 서브도큐먼트에 저장**

### 요구사항
1. 문서 유형(meta/ocr)에 따라 올바른 위치에서 텍스트 읽기
2. 태그 10개 정도 추출
3. 기존 서브도큐먼트 또는 독립적인 서브도큐먼트에 저장
4. 이후 태그 기반으로 다양한 분류 수행

---

## 🤖 태그 추출 방법론

### 1. AI 기반 추출 (권장)

#### 장점
- ✅ **의미 기반 태그**: 문맥 이해를 통한 정확한 개념 추출
- ✅ **높은 정확도**: 요약문에서 핵심 개념 정확히 식별
- ✅ **유연성**: 다양한 문서 유형에 자동 적응
- ✅ **계층 구조**: 문서 유형, 주체, 내용 등 구조화된 태그

#### 단점
- ❌ API 비용 (OpenAI/Claude)
- ❌ 처리 속도 느림 (API 호출 시간)
- ❌ 외부 의존성

#### 추출 예시 (보험증권)
```python
tags = [
  "재산종합보험",      # 문서 유형
  "현대해상",          # 보험사
  "화재손해",          # 보장 내용
  "배상책임",          # 보장 내용
  "자가창고시설",      # 대상
  "주식회사캐치업코리아",  # 계약자
  "보험증권",          # 문서 분류
  "1000000원",         # 금액
  "5년만기",           # 기간
  "자동이체"           # 납입 방식
]
```

---

### 2. 규칙 기반 추출 (Rule-based)

#### 장점
- ✅ **빠른 처리**: 즉시 결과 반환
- ✅ **비용 없음**: API 호출 불필요
- ✅ **예측 가능**: 일관된 결과
- ✅ **오프라인 작동**: 네트워크 불필요

#### 단점
- ❌ 정확도 낮을 수 있음
- ❌ 문서 유형별 규칙 수동 작성 필요
- ❌ 유지보수 부담
- ❌ 문맥 이해 불가

#### 구현 방법

**2.1 키워드 빈도수 (TF-IDF)**
```python
from sklearn.feature_extraction.text import TfidfVectorizer

def extract_tags_tfidf(text, n_tags=10):
    vectorizer = TfidfVectorizer(max_features=n_tags)
    tfidf_matrix = vectorizer.fit_transform([text])
    feature_names = vectorizer.get_feature_names_out()
    return list(feature_names)
```

**2.2 정규식 패턴 매칭**
```python
import re

def extract_tags_regex(text):
    tags = []

    # 회사명 패턴 (주식회사, (주), 등)
    companies = re.findall(r'(?:주식회사|(?:\(주\)))\s*[\w가-힣]+', text)
    tags.extend(companies)

    # 금액 패턴
    amounts = re.findall(r'\d{1,3}(?:,\d{3})*원', text)
    tags.extend(amounts)

    # 날짜 패턴
    dates = re.findall(r'\d{4}[-년]\s*\d{1,2}[-월]\s*\d{1,2}일?', text)
    tags.extend(dates)

    return tags[:10]
```

**2.3 한국어 NLP (KoNLPy)**
```python
from konlpy.tag import Okt

def extract_tags_nlp(text, n_tags=10):
    okt = Okt()

    # 명사 추출
    nouns = okt.nouns(text)

    # 빈도수 계산
    from collections import Counter
    noun_counts = Counter(nouns)

    # 상위 N개 추출 (1글자 제외)
    top_nouns = [noun for noun, count in noun_counts.most_common(n_tags * 2)
                 if len(noun) > 1]

    return top_nouns[:n_tags]
```

---

### 3. 하이브리드 접근법 (Best Practice)

**단계별 처리**

```python
def extract_tags_hybrid(text, summary):
    """하이브리드 태그 추출"""
    tags = []

    # 1단계: 규칙 기반으로 기본 태그 추출 (빠르고 무료)
    tags += extract_amounts(text)          # 금액
    tags += extract_dates(text)            # 날짜
    tags += extract_companies(text)        # 회사명
    tags += extract_document_type(summary) # 문서 유형

    # 2단계: AI로 의미 태그 보강 (배치 처리)
    if should_use_ai(document):
        ai_tags = extract_tags_ai(summary)
        tags += ai_tags

    # 중복 제거 및 정제
    tags = deduplicate_and_clean(tags)

    return tags[:20]  # 상위 20개 반환
```

**배치 처리 전략**
```python
# 야간/주말에 AI 태그 일괄 생성
def batch_generate_ai_tags():
    """배치로 AI 태그 생성 (비용 절감)"""

    # AI 태그 없는 문서 조회
    docs = db.files.find({
        "tags.method": {"$ne": "ai"}
    }).limit(100)

    for doc in docs:
        # OpenAI API 호출 (10개 문서씩)
        ai_tags = openai_extract_tags_batch([doc])

        # 태그 저장
        db.files.update_one(
            {"_id": doc["_id"]},
            {"$set": {"tags.ai_generated": ai_tags}}
        )
```

---

## 📊 태그 개수 권장사항

### 이상적인 태그 개수: **15~20개**

#### 근거

**너무 적으면 (5~10개)**
- ❌ 문서 특성 상실
- ❌ 분류 정확도 낮음
- ❌ 검색 시 누락 발생

**적절함 (15~20개)**
- ✅ 문서의 핵심 특성 충분히 표현
- ✅ 분류/검색 정확도 높음
- ✅ UI에 표시 가능한 수준
- ✅ 사용자가 스캔하기 적절

**너무 많으면 (30개+)**
- ❌ 노이즈 증가
- ❌ 중요도 희석
- ❌ UI 복잡도 증가
- ❌ 저장 공간 낭비

---

### 문서 유형별 권장 개수

#### 보험 증권 문서
**권장: 15~20개**

```javascript
{
  // 문서 유형 (2개)
  document_type: ["보험증권", "재산종합보험"],

  // 회사/기관 (2개)
  entities: ["현대해상", "주식회사캐치업코리아"],

  // 핵심 보장 내용 (4개)
  coverage: ["화재손해", "배상책임", "건물담보", "내부시설"],

  // 금액/기간 (3개)
  financial: ["1000000원", "5년만기", "전기납"],

  // 지역/장소 (4개)
  location: ["파주시", "탄현면", "방촌로1172-5", "자가창고"],

  // 특성/속성 (3개)
  attributes: ["자동이체", "무배당", "갱신형"]
}
```

#### 자동차 보험 견적서
**권장: 12~18개**

```javascript
{
  // 문서 유형 (2개)
  document_type: ["자동차보험", "견적서"],

  // 회사/대리점 (2개)
  entities: ["탑인스원", "캐치업코리아"],

  // 보험사 (4~6개)
  insurers: ["현대해상", "KB", "삼성화재", "한화손보", "롯데손해", "DB손해"],

  // 날짜 (2개)
  dates: ["2024-12-18", "만기일"],

  // 특성 (1개)
  attributes: ["비교견적"]
}
```

---

## 🏗️ 태그 계층 구조

### 5단계 계층 설계

```python
TAG_HIERARCHY = {
    # 1. 문서 메타 (2~3개)
    "type": {
        "description": "문서의 종류와 분류",
        "examples": ["보험증권", "재산종합보험", "견적서", "청구서"]
    },

    # 2. 주체/관계자 (2~4개)
    "entities": {
        "description": "회사, 기관, 개인 등",
        "examples": ["현대해상", "주식회사캐치업코리아", "탑인스원"]
    },

    # 3. 핵심 내용 (5~8개)
    "keywords": {
        "description": "문서의 주요 내용과 특징",
        "examples": ["화재손해", "배상책임", "건물담보", "1000000원", "5년만기"]
    },

    # 4. 지역/장소 (2~3개)
    "location": {
        "description": "주소, 지역, 장소 정보",
        "examples": ["파주시", "탄현면", "방촌로1172-5"]
    },

    # 5. 특성/속성 (2~3개)
    "attributes": {
        "description": "문서의 부가적 특성",
        "examples": ["자동이체", "무배당", "갱신형"]
    }
}
```

---

## 💾 MongoDB 저장 구조

### 제안 스키마

```javascript
{
  _id: ObjectId('68fa458a3d4b65aed7108212'),
  upload: { /* 기존 구조 */ },
  meta: { /* 기존 구조 */ },
  ocr: { /* 기존 구조 (있는 경우) */ },
  docembed: { /* 기존 구조 */ },

  // ========== 새로운 tags 서브도큐먼트 ==========
  tags: {
    // 메타 정보
    version: "1.0",
    generated_at: ISODate("2025-10-24T00:00:00Z"),
    method: "hybrid",  // "rule_based", "ai", "hybrid"
    text_source: "meta",  // "meta" or "ocr"

    // 계층별 태그 (총 15~20개)
    document_type: ["보험증권", "재산종합보험"],
    entities: ["현대해상", "주식회사캐치업코리아", "종로AM지점"],
    keywords: ["화재손해", "배상책임", "건물담보", "1000000원", "5년만기", "내부시설"],
    locations: ["파주시", "탄현면", "방촌로1172-5", "자가창고시설"],
    attributes: ["자동이체", "무배당", "갱신형"],

    // 검색 최적화용 플랫 배열 (인덱싱)
    all_tags: [
      "보험증권", "재산종합보험", "현대해상",
      "주식회사캐치업코리아", "화재손해", "배상책임",
      "건물담보", "1000000원", "5년만기", "파주시",
      "자가창고시설", "자동이체", "무배당"
    ],

    // 태그 가중치 (검색 랭킹용, 선택사항)
    weights: {
      "보험증권": 1.0,
      "재산종합보험": 0.95,
      "현대해상": 0.9,
      "화재손해": 0.85,
      "배상책임": 0.85,
      "주식회사캐치업코리아": 0.9,
      "1000000원": 0.7,
      "파주시": 0.6
    }
  }
}
```

### 인덱스 설정

```javascript
// 태그 검색 최적화
db.files.createIndex({ "tags.all_tags": 1 })

// 문서 유형별 검색
db.files.createIndex({ "tags.document_type": 1 })

// 엔티티별 검색 (회사, 고객)
db.files.createIndex({ "tags.entities": 1 })

// 위치별 검색
db.files.createIndex({ "tags.locations": 1 })

// 복합 인덱스 (태그 + 생성일)
db.files.createIndex({
  "tags.all_tags": 1,
  "upload.uploaded_at": -1
})
```

---

## 🔍 활용 시나리오

### 1. 문서 유형별 분류
```javascript
// 모든 보험증권 조회
db.files.find({
  "tags.document_type": "보험증권"
})

// 견적서만 조회
db.files.find({
  "tags.document_type": "견적서"
})
```

### 2. 고객별 문서 조회
```javascript
// 캐치업코리아의 모든 문서
db.files.find({
  "tags.entities": "주식회사캐치업코리아"
})
```

### 3. 보험사별 분류
```javascript
// 현대해상 관련 모든 문서
db.files.find({
  "tags.entities": "현대해상"
})

// 여러 보험사 비교
db.files.find({
  "tags.entities": {
    $in: ["현대해상", "KB", "삼성화재"]
  }
})
```

### 4. 지역별 분류
```javascript
// 파주 지역 관련 문서
db.files.find({
  "tags.locations": {
    $regex: "파주"
  }
})
```

### 5. 금액대별 검색
```javascript
// 100만원대 보험
db.files.find({
  "tags.keywords": {
    $regex: "1000000"
  }
})

// 3억원 이상 보험
db.files.find({
  "tags.keywords": {
    $regex: "억"
  }
})
```

### 6. 만기일 추적
```javascript
// 2024년 만기 문서
db.files.find({
  "tags.keywords": {
    $regex: "2024"
  }
})

// 특정 날짜 만기
db.files.find({
  "tags.all_tags": "2024-12-18"
})
```

### 7. 복합 검색
```javascript
// 캐치업코리아의 현대해상 보험증권
db.files.find({
  "tags.document_type": "보험증권",
  "tags.entities": {
    $all: ["현대해상", "주식회사캐치업코리아"]
  }
})

// 파주 지역의 화재보험
db.files.find({
  "tags.keywords": "화재",
  "tags.locations": { $regex: "파주" }
})
```

### 8. 태그 기반 그룹화
```javascript
// 보험사별 문서 개수
db.files.aggregate([
  { $unwind: "$tags.entities" },
  { $group: {
      _id: "$tags.entities",
      count: { $sum: 1 }
  }},
  { $sort: { count: -1 } }
])

// 지역별 보험 통계
db.files.aggregate([
  { $unwind: "$tags.locations" },
  { $group: {
      _id: "$tags.locations",
      documents: { $sum: 1 },
      types: { $addToSet: "$tags.document_type" }
  }}
])
```

---

## 🛠️ 구현 계획

### Phase 1: 규칙 기반 태그 추출 (프로토타입)

**목표**: 빠른 MVP 구현

```python
# tools/SemanTree/tag_extractor.py

class TagExtractor:
    def extract(self, document):
        """문서에서 태그 추출"""

        # 1. 텍스트 소스 결정
        text, summary = self._get_text_source(document)

        # 2. 규칙 기반 태그 추출
        tags = {
            "document_type": self._extract_doc_type(summary),
            "entities": self._extract_entities(text),
            "keywords": self._extract_keywords(text, summary),
            "locations": self._extract_locations(text),
            "attributes": self._extract_attributes(text)
        }

        # 3. 플랫 배열 생성
        all_tags = self._flatten_tags(tags)

        return {
            "version": "1.0",
            "method": "rule_based",
            "text_source": self._detect_source(document),
            **tags,
            "all_tags": all_tags[:20]
        }

    def _get_text_source(self, document):
        """meta 또는 ocr에서 텍스트 추출"""
        if document.get("meta", {}).get("full_text"):
            return (
                document["meta"]["full_text"],
                document["meta"]["summary"]
            )
        elif document.get("ocr", {}).get("full_text"):
            return (
                document["ocr"]["full_text"],
                document["ocr"]["summary"]
            )
        return ("", "")
```

### Phase 2: AI 태그 보강 (고도화)

**목표**: 정확도 향상

```python
# tools/SemanTree/ai_tagger.py

import openai

class AITagger:
    def __init__(self, api_key):
        self.client = openai.OpenAI(api_key=api_key)

    def extract_tags(self, summary, n_tags=15):
        """AI로 태그 추출"""

        prompt = f"""
        다음 문서 요약에서 핵심 태그 {n_tags}개를 추출하세요.

        문서 요약:
        {summary}

        태그는 다음 카테고리로 분류하세요:
        1. 문서 유형 (2~3개)
        2. 회사/기관/인물 (2~4개)
        3. 핵심 내용 (5~8개)
        4. 지역/장소 (2~3개)
        5. 특성/속성 (2~3개)

        JSON 형식으로 반환하세요.
        """

        response = self.client.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "당신은 문서 분석 전문가입니다."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"}
        )

        return json.loads(response.choices[0].message.content)
```

### Phase 3: 배치 처리 스크립트

**목표**: 기존 문서 일괄 태깅

```python
# scripts/batch_tag_documents.py

def batch_tag_all_documents():
    """모든 문서에 태그 생성"""

    db = connect_mongodb()
    extractor = TagExtractor()

    # 태그 없는 문서 조회
    cursor = db.files.find({
        "tags": {"$exists": False}
    })

    for doc in cursor:
        try:
            # 태그 추출
            tags = extractor.extract(doc)

            # MongoDB 업데이트
            db.files.update_one(
                {"_id": doc["_id"]},
                {"$set": {"tags": tags}}
            )

            print(f"✓ Tagged: {doc['upload']['originalName']}")

        except Exception as e:
            print(f"✗ Error: {doc['_id']} - {e}")

if __name__ == "__main__":
    batch_tag_all_documents()
```

---

## 📈 성능 고려사항

### 처리 속도

| 방법 | 문서당 처리 시간 | 100개 문서 처리 시간 |
|------|------------------|---------------------|
| 규칙 기반 | ~0.1초 | ~10초 |
| AI (OpenAI) | ~2초 | ~3분 20초 |
| 하이브리드 | ~0.5초 | ~50초 |

### 비용 추정 (OpenAI GPT-4)

- **문서당**: ~$0.01
- **1,000개 문서**: ~$10
- **월간 1만 문서**: ~$100

**절감 방안:**
- 배치 처리 (야간/주말)
- 규칙 기반 우선 → AI는 선택적
- GPT-3.5-turbo 사용 (비용 1/10)

---

## 🎯 다음 단계

### 즉시 시작 가능
1. ✅ Phase 1 구현 (규칙 기반)
2. ✅ SemanTree에 태그 표시 기능 추가
3. ✅ 기존 25개 문서 태깅 테스트

### 향후 계획
4. ⏳ AI 태그 추출 구현 (Phase 2)
5. ⏳ 배치 처리 스크립트 (Phase 3)
6. ⏳ 태그 기반 검색 UI
7. ⏳ 태그 클라우드 시각화

---

## 📚 참고 자료

### 관련 기술
- **KoNLPy**: 한국어 NLP 라이브러리
- **sklearn.TfidfVectorizer**: 키워드 추출
- **OpenAI API**: AI 태그 생성
- **MongoDB Text Index**: 태그 검색 최적화

### 유사 사례
- Google Drive 자동 태그
- Notion AI 자동 분류
- Evernote 스마트 태그

---

## 📝 버전 히스토리

- **v1.0** (2025-10-24): 초안 작성
  - 문제 정의
  - 태그 추출 방법론 3가지
  - MongoDB 스키마 설계
  - 구현 계획

---

**작성자**: Claude (AI Assistant)
**문서 위치**: `tools/SemanTree/TAG_DESIGN.md`

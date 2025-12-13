# AIMS RAG vs Google File Search API 비교 분석

> 작성일: 2025-12-13

## 개요

Google이 2025년 11월 Gemini API에 File Search Tool을 공개했다. 이 문서는 AIMS의 자체 구축 RAG 시스템과 Google의 관리형 RAG 서비스를 비교 분석한다.

---

## 기술적 본질

**둘 다 동일한 RAG (Retrieval Augmented Generation) 아키텍처를 사용한다.**

```
문서 업로드 → 텍스트 추출 → 청킹 → 임베딩 → 벡터 저장 → 유사도 검색 → LLM 컨텍스트 주입
```

---

## 파이프라인 비교

| 단계 | AIMS (DIY) | Google File Search |
|------|------------|---------------------|
| 1. 문서 업로드 | MongoDB에 저장 | Google Storage에 저장 |
| 2. 텍스트 추출 | PDF/DOCX 파싱 (자체 구현) | 자동 파싱 |
| 3. 청킹 | `split_text_into_chunks` (커스텀) | 자동 청킹 (블랙박스) |
| 4. 임베딩 | OpenAI text-embedding-3-small | Gemini 내장 임베딩 |
| 5. 벡터 저장 | Qdrant (자체 호스팅) | Google 관리형 스토어 |
| 6. 검색 | 코사인 유사도 (직접 제어) | 코사인 유사도 (추정) |
| 7. LLM 응답 | GPT-4 / Claude / Gemini 선택 | Gemini 고정 |

---

## 상세 차이점

| 항목 | AIMS (DIY) | Google File Search |
|------|------------|---------------------|
| **인프라** | Docker 컨테이너 (자체 관리) | 완전 관리형 (서버리스) |
| **임베딩 모델** | 선택 가능 (OpenAI, Cohere 등) | Gemini 고정 |
| **청킹 전략** | 커스텀 (크기, 오버랩 조절) | 블랙박스 |
| **벡터 DB** | Qdrant (또는 Pinecone, Weaviate) | Google 전용 스토어 |
| **LLM** | 자유 선택 | Gemini 강제 |
| **인용(Citation)** | 직접 구현 필요 | 자동 내장 |
| **데이터 위치** | 자체 서버 | Google 클라우드 |
| **스케일링** | 수동 (Docker 복제) | 자동 |
| **지원 파일 형식** | PDF, DOCX, TXT 등 | PDF, DOCX, TXT, JSON, 코드 파일 |

---

## 장단점 분석

### AIMS (현재 구현)

| 장점 | 단점 |
|------|------|
| **완전한 제어권** - 청킹 크기, 임베딩 모델, 검색 알고리즘 모두 조절 가능 | 직접 구축/유지보수 필요 |
| **LLM 선택 자유** - GPT-4, Claude, Gemini 중 선택 | 인프라 장애 시 직접 대응 |
| **데이터 주권** - 고객 문서가 자체 서버에만 보관 | 스케일링 직접 관리 |
| **비용 예측** - 서버 비용 고정, API 비용만 변동 | 인용 기능 직접 구현 필요 |
| **벤더 락인 없음** - 언제든 다른 모델로 교체 가능 | 초기 구축 시간 소요 |

### Google File Search

| 장점 | 단점 |
|------|------|
| **즉시 사용** - API 호출만으로 RAG 완성 | **블랙박스** - 청킹/검색 로직 커스텀 불가 |
| **자동 인용** - 출처 자동 추적 | **Gemini 강제** - 다른 LLM 사용 불가 |
| **자동 스케일링** - 트래픽 증가 자동 대응 | **쿼리당 5개 스토어 제한** |
| **인덱싱 저렴** - $0.15/M 토큰 | **데이터가 Google에 저장** |
| **유지보수 불필요** | **벤더 락인** - Google 생태계 종속 |

---

## 비용 비교

### 월 1만 건 검색, 1000개 문서 기준 (추정치)

| 항목 | AIMS | Google File Search |
|------|------|---------------------|
| 서버 비용 | ~$20/월 (VPS) | $0 |
| 임베딩 (인덱싱) | ~$0.02/M 토큰 (OpenAI) | $0.15/M 토큰 |
| 검색 쿼리 임베딩 | ~$0.02/M 토큰 | $0 (무료) |
| 스토리지 | VPS에 포함 | $0 (무료) |
| LLM 응답 | GPT-4: ~$30/월 | Gemini Pro: ~$20/월 |
| **월간 합계** | **~$50/월** | **~$20/월** |

※ 문서량/쿼리량에 따라 크게 달라짐

### Google File Search 가격 정책 (2025년 11월 기준)

- 인덱싱: $0.15 / 1M 토큰
- 스토리지: 무료
- 쿼리 시 임베딩: 무료

---

## 사용 시나리오별 추천

| 상황 | 추천 솔루션 | 이유 |
|------|-------------|------|
| 빠른 MVP/프로토타입 | Google File Search | 구축 시간 최소화 |
| 데이터 주권 중요 (금융/의료/보험) | **AIMS (DIY)** | 자체 서버 보관 |
| 커스텀 검색 로직 필요 | **AIMS (DIY)** | 완전한 제어권 |
| GPT-4/Claude 사용 필수 | **AIMS (DIY)** | LLM 선택 자유 |
| 운영 인력 부족 | Google File Search | 유지보수 불필요 |
| 대규모 트래픽 (수백만 쿼리) | Google File Search | 자동 스케일링 |
| 멀티 테넌트 SaaS | **AIMS (DIY)** | 테넌트별 격리 |

---

## AIMS 현재 아키텍처

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   aims-uix3 │────▶│   aims-api  │────▶│   MongoDB   │
│  (Frontend) │     │  (Node.js)  │     │  (문서 저장) │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐     ┌─────────────┐
                    │ aims-rag-api│────▶│   Qdrant    │
                    │  (FastAPI)  │     │ (벡터 검색)  │
                    └──────┬──────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  OpenAI API │
                    │ (GPT-4/임베딩)│
                    └─────────────┘
```

### 구성 요소

| 컴포넌트 | 역할 | 기술 |
|----------|------|------|
| aims-uix3 | 프론트엔드 | React + TypeScript |
| aims-api | 메인 API | Node.js + Express |
| aims-rag-api | RAG 검색 | Python + FastAPI |
| embedding 파이프라인 | 임베딩 생성 | Python + OpenAI |
| MongoDB | 문서 메타데이터 | MongoDB 6.x |
| Qdrant | 벡터 검색 | Qdrant 1.9.0 |

---

## 결론

### AIMS가 DIY RAG를 유지해야 하는 이유

1. **데이터 주권**: 보험 설계사의 고객 문서는 민감 정보. 자체 서버 보관 필수.
2. **LLM 유연성**: GPT-4, Claude 등 최적의 모델 선택 가능.
3. **커스터마이징**: 보험 도메인 특화 청킹/검색 로직 적용 가능.
4. **비용 예측**: 고정 서버 비용 + 변동 API 비용으로 예측 가능.

### Google File Search가 적합한 경우

- 빠른 프로토타이핑이 필요한 스타트업
- Gemini 생태계에 이미 종속된 서비스
- 운영 인력이 부족한 소규모 팀

---

## 참고 자료

- [Introducing the File Search Tool in Gemini API - Google Blog](https://blog.google/technology/developers/file-search-gemini-api/)
- [File Search | Gemini API Documentation](https://ai.google.dev/gemini-api/docs/file-search)
- [Why Google's File Search could displace DIY RAG stacks - VentureBeat](https://venturebeat.com/ai/why-googles-file-search-could-displace-diy-rag-stacks-in-the-enterprise)
- [Gemini File Search API Explained - Product Compass](https://www.productcompass.pm/p/gemini-file-search-api)

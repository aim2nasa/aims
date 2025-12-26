# PDF 표 파싱 OCR/AI 비용 및 정확도 비교

> 작성일: 2025-12-26
> 대상: 한국어 보험 계약 테이블 PDF

---

## 비용 비교표

| 서비스 | 유형 | 페이지당 비용 | 2페이지 비용 | 1,000페이지 비용 |
|--------|------|--------------|-------------|-----------------|
| Claude Haiku 3 | AI/Vision | ~$0.0004 | ~$0.0008 | ~$0.40 |
| Gemini 2.5 Flash | AI/Vision | ~$0.001 | ~$0.002 | ~$1.00 |
| AWS Textract (기본) | OCR | $0.0015 | $0.003 | $1.50 |
| Google Document AI (기본) | OCR | $0.0015 | $0.003 | $1.50 |
| Upstage Document OCR | OCR | $0.0015 | $0.003 | $1.50 |
| GPT-4o-mini | AI/Vision | ~$0.002 | ~$0.004 | ~$2.00 |
| Naver Clova General OCR | OCR | ₩3 (~$0.002) | ₩6 | ₩3,000 (~$2.20) |
| Claude Sonnet 4.5 | AI/Vision | ~$0.005 | ~$0.01 | ~$5.00 |
| GPT-4o | AI/Vision | ~$0.0055 | ~$0.011 | ~$5.50 |
| Azure Document Intelligence | OCR | $0.01 | $0.02 | $10.00 |
| Upstage Document Parse | AI+OCR | $0.01 (프로모션) | $0.02 | $10.00 |
| Naver Clova 테이블 추출 | OCR | ₩25 (~$0.018) | ₩50 | ₩25,000 (~$18) |
| Google Document AI (Form) | OCR | $0.03 | $0.06 | $30.00 |
| AWS Textract (테이블) | OCR | $0.05 | $0.10 | $50.00 |
| Naver Clova 영수증 OCR | OCR | ₩100 (~$0.07) | ₩200 | ₩100,000 (~$73) |

> 환율 기준: $1 = ₩1,370

---

## AI Vision 토큰 계산

| 모델 | 입력 토큰 가격 | 이미지당 토큰 | 이미지당 비용 |
|------|--------------|--------------|--------------|
| Claude Haiku 3 | $0.25/1M | ~1,600 | $0.0004 |
| Gemini 2.5 Flash | $0.15/1M | ~1,290 | $0.001 |
| GPT-4o-mini | $0.15/1M | ~1,100 | $0.002 |
| Claude Sonnet 4.5 | $3/1M | ~1,600 | $0.005 |
| GPT-4o | $5/1M | ~1,100 | $0.0055 |
| Claude Opus 4 | $15/1M | ~1,600 | $0.024 |

---

## 비용 순위 (저렴한 순)

| 순위 | 서비스 | 2페이지 비용 | 1,000페이지 비용 |
|:---:|--------|-------------|-----------------|
| 1 | Claude Haiku 3 | $0.0008 | $0.40 |
| 2 | Gemini 2.5 Flash | $0.002 | $1.00 |
| 3 | Naver Clova General | ₩6 (~$0.004) | ₩3,000 (~$2.20) |
| 4 | AWS Textract (기본) | $0.003 | $1.50 |
| 4 | Google Document AI (기본) | $0.003 | $1.50 |
| 4 | Upstage Document OCR | $0.003 | $1.50 |
| 7 | GPT-4o-mini | $0.004 | $2.00 |
| 8 | Claude Sonnet 4.5 | $0.01 | $5.00 |
| 9 | GPT-4o | $0.011 | $5.50 |
| 10 | Azure Document Intelligence | $0.02 | $10.00 |
| 11 | Upstage Document Parse | $0.02 | $10.00 |
| 12 | Naver Clova 테이블 | ₩50 (~$0.036) | ₩25,000 (~$18) |
| 13 | Google Document AI (Form) | $0.06 | $30.00 |
| 14 | AWS Textract (테이블) | $0.10 | $50.00 |

---

## 정확도 순위 (한국어 보험 테이블 기준)

| 순위 | 서비스 | 정확도 | 근거 |
|:---:|--------|--------|------|
| 1 | Naver Clova OCR | ⭐⭐⭐⭐⭐ | ICDAR 4개 분야 1위, 한국어 특화, 타사 대비 15%+ 높은 인식률 |
| 1 | Upstage Document Parse | ⭐⭐⭐⭐⭐ | 95%+ 정확도, DP-Bench에서 Google/MS 대비 5%↑, 한글/한자 지원 |
| 3 | Claude Sonnet 4 | ⭐⭐⭐⭐⭐ | 테이블 데이터 추출 완벽 수행, 차트/시각 데이터 해석 우수 |
| 4 | Gemini 2.5 Pro | ⭐⭐⭐⭐⭐ | 이미지 테이블 추출 완벽 수행 (10/10) |
| 5 | GPT-4o | ⭐⭐⭐⭐ | 인보이스 추출 최고 정확도, 구조화된 필드 처리 우수 |
| 6 | Google Cloud Vision | ⭐⭐⭐⭐ | 전체 WER 2.0% (1위), 스캔 문서 강점 |
| 7 | AWS Textract | ⭐⭐⭐⭐ | 전체 WER 2.8% (2위), 테이블 추출 안정적 |
| 8 | Azure Document Intelligence | ⭐⭐⭐⭐ | 활자체 99.8% (최고), 복잡한 양식 처리 우수 |
| 9 | GPT-4o-mini | ⭐⭐⭐ | 성능 대비 비용 효율적 |
| 10 | Gemini 2.5 Flash | ⭐⭐⭐ | 경량 모델, 8/10 수준 |
| 11 | Claude Haiku 3 | ⭐⭐⭐ | 기본적인 텍스트 추출은 가능, 복잡한 표는 한계 |

---

## 추천

### 성능(정확도) 포커스

| 순위 | 서비스 | 2페이지 비용 | 이유 |
|:---:|------|-------------|------|
| 1 | Upstage Document Parse | $0.02 | 한국어 95%+ 정확도, 표→Markdown 구조화 |
| 2 | Naver Clova | ₩56 (~$0.04) | ICDAR 1위, 한국어 최고 인식률 |
| 3 | Claude Sonnet 4.5 | $0.01 | 표 "이해" + AI 추론 가능 |

### 비용 포커스

| 순위 | 서비스 | 2페이지 비용 | 정확도 | 이유 |
|:---:|------|-------------|:---:|------|
| 1 | Claude Haiku 3 | $0.0008 | ⭐⭐⭐ | 최저가 (1/25 비용) |
| 2 | Gemini 2.5 Flash | $0.002 | ⭐⭐⭐ | 저렴 + 적당한 성능 |
| 3 | Naver Clova General | ₩6 (~$0.004) | ⭐⭐⭐⭐⭐ | 저렴 + 한국어 최고 (월 100건 무료) |

### 균형(가성비) 포커스

| 순위 | 서비스 | 2페이지 비용 | 정확도 | 이유 |
|:---:|------|-------------|:---:|------|
| 1 | Naver Clova General | ₩6 (~$0.004) | ⭐⭐⭐⭐⭐ | 최고의 가성비 - 저렴하면서 한국어 최고 |
| 2 | Claude Sonnet 4.5 | $0.01 | ⭐⭐⭐⭐⭐ | 중간 비용 + 높은 정확도 + AI 이해력 |
| 3 | Gemini 2.5 Flash | $0.002 | ⭐⭐⭐ | 저렴 + 무난한 성능 |

---

## 서비스별 상세

### Upstage

| 서비스 | 가격 | 특징 |
|--------|------|------|
| Document OCR | $0.0015/page | 텍스트 추출만 |
| Document Parse | $0.01/page (프로모션) → $0.03/page (정가) | 표/레이아웃 구조화, Markdown 출력 |

- 프로모션: 2026.1.27까지 $0.01/page
- 95% 이상 정확도 (한국어 특화)
- 학교/병원/비영리단체 1년 무료

### Naver Clova OCR

| 서비스 | 가격 | 무료 제공 |
|--------|------|----------|
| General OCR | ₩3/건 (~$0.002) | 월 100건 무료 |
| 테이블 추출 | ₩25/건 (~$0.018) | - |
| 영수증 OCR | ₩100/건 (~$0.07) | 기본 300건 ₩18,000 |
| Template OCR | 월정액 + 호출료 | 도메인별 상이 |

- ICDAR 4개 분야 1위 (한국어/일본어 특화)
- 활자체: 타사 대비 15%+ 높은 인식률
- 필기체: 2~3배 높은 인식률

---

## 참고 자료

- [OpenAI Pricing](https://openai.com/api/pricing/)
- [AWS Textract Pricing](https://aws.amazon.com/textract/pricing/)
- [Google Cloud Document AI Pricing](https://cloud.google.com/document-ai/pricing)
- [Azure Document Intelligence Pricing](https://azure.microsoft.com/en-us/pricing/details/ai-document-intelligence/)
- [Claude Vision Documentation](https://docs.claude.com/en/docs/build-with-claude/vision)
- [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Claude API Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [Upstage Pricing](https://www.upstage.ai/pricing)
- [Naver Cloud CLOVA OCR](https://www.ncloud.com/product/aiService/ocr)

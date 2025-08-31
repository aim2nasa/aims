# 고객 관계 데이터 모델 설계

## 개요
고객들 간의 다양한 관계(가족, 친척, 친구, 직장 동료, 직원 등)를 표현하고 관리하기 위한 데이터 모델을 설계합니다.

## 관계 유형 정의

### 1. 가족 관계 (Family)
- **배우자** (spouse): 부부 관계
- **부모** (parent): 부모-자녀 관계 (역방향: child)
- **자녀** (child): 자녀-부모 관계 (역방향: parent)
- **형제자매** (sibling): 형제자매 관계 (쌍방향)
- **조부모** (grandparent): 조부모-손자녀 관계 (역방향: grandchild)
- **손자녀** (grandchild): 손자녀-조부모 관계 (역방향: grandparent)

### 2. 친척 관계 (Relative)
- **삼촌/이모** (uncle_aunt): 삼촌/이모-조카 관계 (역방향: nephew_niece)
- **조카** (nephew_niece): 조카-삼촌/이모 관계 (역방향: uncle_aunt)
- **사촌** (cousin): 사촌 관계 (쌍방향)
- **처가/시가** (in_law): 처가/시가 관계 (쌍방향)

### 3. 사회적 관계 (Social)
- **친구** (friend): 친구 관계 (쌍방향)
- **지인** (acquaintance): 일반적인 지인 관계 (쌍방향)
- **이웃** (neighbor): 이웃 관계 (쌍방향)

### 4. 직장 관계 (Professional)
- **상사** (supervisor): 상사-부하 관계 (역방향: subordinate)
- **부하** (subordinate): 부하-상사 관계 (역방향: supervisor)
- **동료** (colleague): 직장 동료 관계 (쌍방향)
- **사업파트너** (business_partner): 사업 파트너 관계 (쌍방향)
- **클라이언트** (client): 서비스 제공자-클라이언트 관계 (역방향: service_provider)
- **서비스제공자** (service_provider): 클라이언트-서비스 제공자 관계 (역방향: client)

### 5. 법인-개인 관계 (Corporate)
- **대표이사** (ceo): 법인의 대표이사
- **임원** (executive): 법인의 임원
- **직원** (employee): 법인의 직원
- **주주** (shareholder): 법인의 주주
- **이사** (director): 법인의 이사

## 데이터베이스 스키마 설계

### MongoDB Collection: `customer_relationships`

```javascript
{
  _id: ObjectId,
  
  // 관계 기본 정보
  relationship_info: {
    from_customer_id: ObjectId,    // 관계 출발 고객 ID
    to_customer_id: ObjectId,      // 관계 도착 고객 ID
    relationship_type: String,     // 관계 유형 (위 정의된 타입들)
    relationship_category: String, // 관계 카테고리 ("family", "relative", "social", "professional", "corporate")
    is_bidirectional: Boolean,     // 양방향 관계 여부 (친구, 동료 등)
    strength: String,              // 관계 강도 ("strong", "medium", "weak")
    status: String                 // 관계 상태 ("active", "inactive", "ended")
  },
  
  // 관계 상세 정보
  relationship_details: {
    description: String,           // 관계 설명 (선택사항)
    established_date: Date,        // 관계 시작일 (알고 있는 경우)
    ended_date: Date,              // 관계 종료일 (해당하는 경우)
    notes: String,                 // 추가 메모
    contact_frequency: String,     // 연락 빈도 ("daily", "weekly", "monthly", "rarely", "never")
    influence_level: String        // 영향력 수준 ("high", "medium", "low")
  },
  
  // 보험 관련 정보
  insurance_relevance: {
    is_beneficiary: Boolean,       // 수익자 관계 여부
    is_insured: Boolean,           // 피보험자 관계 여부
    shared_policies: [String],     // 공유하는 보험 정책들
    referral_potential: String,    // 추천 가능성 ("high", "medium", "low")
    cross_selling_opportunity: Boolean // 교차판매 기회 여부
  },
  
  // 메타 정보
  meta: {
    created_at: Date,              // 관계 등록일
    updated_at: Date,              // 마지막 수정일
    created_by: ObjectId,          // 등록한 영업사원 ID
    last_modified_by: ObjectId,    // 마지막 수정한 영업사원 ID
    verified: Boolean,             // 관계 검증 여부
    verification_date: Date,       // 검증일
    verified_by: ObjectId          // 검증한 영업사원 ID
  }
}
```

## 기존 Customer 스키마 확장

기존 `customers` 컬렉션에 관계 정보 추가:

```javascript
{
  // 기존 필드들...
  
  // 관계 정보 추가
  relationships: {
    family_members: Number,        // 가족 구성원 수
    professional_contacts: Number, // 직장 관련 연락처 수
    social_network_size: Number,   // 사회적 네트워크 크기
    
    // 주요 관계자 요약 (빠른 접근용)
    key_relationships: [{
      customer_id: ObjectId,       // 관련 고객 ID
      relationship_type: String,   // 관계 유형
      strength: String,            // 관계 강도
      last_interaction: Date       // 마지막 상호작용 일시
    }],
    
    // 관계 기반 마케팅 정보
    referral_history: [{
      referred_customer_id: ObjectId, // 추천한 고객 ID
      referral_date: Date,            // 추천일
      conversion_status: String,      // 전환 상태 ("converted", "pending", "failed")
      reward_given: Boolean           // 추천 보상 지급 여부
    }]
  }
}
```

## 관계 관리 API 설계

### 1. 관계 생성
```javascript
POST /api/customers/{customerId}/relationships
{
  "to_customer_id": "ObjectId",
  "relationship_type": "spouse",
  "relationship_details": {
    "description": "결혼 20년차",
    "established_date": "2004-06-15",
    "contact_frequency": "daily"
  },
  "insurance_relevance": {
    "is_beneficiary": true,
    "shared_policies": ["AUTO-2024-001", "LIFE-2024-005"]
  }
}
```

### 2. 관계 조회
```javascript
GET /api/customers/{customerId}/relationships
GET /api/customers/{customerId}/relationships?category=family
GET /api/customers/{customerId}/relationships?type=spouse
```

### 3. 관계 네트워크 분석
```javascript
GET /api/customers/{customerId}/network-analysis
// 응답: 고객의 관계 네트워크 분석 결과
{
  "network_size": 25,
  "family_count": 8,
  "professional_count": 12,
  "social_count": 5,
  "influence_score": 85,
  "referral_potential": "high",
  "key_influencers": [...]
}
```

## 인덱스 설계

### customer_relationships 컬렉션 인덱스
```javascript
// 복합 인덱스
{ "relationship_info.from_customer_id": 1, "relationship_info.relationship_category": 1 }
{ "relationship_info.to_customer_id": 1, "relationship_info.relationship_category": 1 }

// 단일 인덱스  
{ "relationship_info.relationship_type": 1 }
{ "relationship_info.status": 1 }
{ "insurance_relevance.referral_potential": 1 }
{ "meta.created_by": 1 }
```

## 비즈니스 활용 사례

### 1. 가족 할인 정책
- 가족 관계로 연결된 고객들에게 패밀리 할인 적용
- 가족 단위 보험 패키지 추천

### 2. 추천 마케팅
- 관계 강도와 영향력을 기반으로 추천 대상 우선순위 결정
- 성공적인 추천 이력을 바탕으로 추천 보상 프로그램 운영

### 3. 리스크 관리
- 관계망을 통한 리스크 전파 분석
- 집중된 관계망에 대한 노출 위험 관리

### 4. 고객 세분화
- 관계 네트워크 크기와 질을 기반으로 고객 등급 결정
- 영향력 있는 고객(Key Person) 식별 및 집중 관리

### 5. 교차판매 기회 발굴
- 관계망 내 보험 가입 패턴 분석
- 미가입 상품에 대한 교차판매 기회 식별

## 데이터 무결성 및 보안

### 1. 관계 일관성
- 양방향 관계의 경우 역방향 관계 자동 생성/삭제
- 관계 타입 변경 시 관련 데이터 동기화

### 2. 개인정보 보호
- 관계 정보 접근 권한 관리
- 고객 동의 없는 관계 정보 노출 방지
- 관계 정보 변경 로그 관리

### 3. 데이터 품질
- 중복 관계 방지
- 관계 검증 프로세스
- 정기적인 관계 정보 업데이트 및 정제
# 고객 관리 시스템 데이터 모델 설계

## 고객(Customer) 스키마

### MongoDB Collection: `customers`

```javascript
{
  _id: ObjectId,
  
  // 기본 정보
  personal_info: {
    name: String,              // 고객명 (필수)
    name_en: String,           // 영문명 (선택)
    birth_date: Date,          // 생년월일
    gender: String,            // 성별 ("M", "F")
    id_number: String,         // 주민등록번호 (암호화 저장)
    phone: String,             // 휴대폰번호
    email: String,             // 이메일
    address: {
      postal_code: String,     // 우편번호
      address1: String,        // 기본주소
      address2: String         // 상세주소
    }
  },
  
  // 보험 관련 정보
  insurance_info: {
    customer_type: String,     // 고객 유형 ("개인", "법인")
    risk_level: String,        // 위험도 ("저위험", "중위험", "고위험")
    preferred_products: [String], // 선호 보험상품
    annual_premium: Number,    // 연간 보험료
    total_coverage: Number     // 총 보장금액
  },
  
  // 계약 현황
  contracts: [{
    contract_id: String,       // 계약번호
    product_name: String,      // 상품명
    status: String,            // 상태 ("active", "expired", "cancelled", "pending")
    start_date: Date,          // 계약시작일
    end_date: Date,            // 계약만료일
    premium: Number,           // 보험료
    coverage_amount: Number    // 보장금액
  }],
  
  // 문서 연결
  documents: [{
    document_id: ObjectId,     // 문서 ID (docupload.files 컬렉션 참조)
    relationship: String,      // 문서 관계 ("contract", "claim", "proposal", "identification")
    upload_date: Date,         // 업로드일
    notes: String              // 메모
  }],
  
  // 상담 이력
  consultations: [{
    consultation_id: ObjectId,
    date: Date,                // 상담일시
    type: String,              // 상담 유형 ("phone", "visit", "online", "email")
    summary: String,           // 상담 요약
    agent_id: ObjectId,        // 상담한 영업사원 ID
    follow_up_required: Boolean, // 후속 조치 필요 여부
    follow_up_date: Date       // 후속 조치 예정일
  }],
  
  // 메타 정보
  meta: {
    created_at: Date,          // 생성일시
    updated_at: Date,          // 수정일시
    created_by: ObjectId,      // 등록한 영업사원 ID
    last_modified_by: ObjectId, // 마지막 수정한 영업사원 ID
    tags: [String],            // 태그 (예: "VIP", "고액고객", "클레임다발")
    status: String             // 고객 상태 ("active", "inactive", "prospect")
  }
}
```

## 영업사원(Agent) 스키마

### MongoDB Collection: `agents`

```javascript
{
  _id: ObjectId,
  
  // 기본 정보
  personal_info: {
    name: String,              // 이름
    employee_id: String,       // 사번
    email: String,             // 이메일
    phone: String,             // 연락처
    department: String,        // 소속 부서
    position: String,          // 직급
    hire_date: Date            // 입사일
  },
  
  // 담당 고객 목록
  assigned_customers: [ObjectId], // 담당 고객 ID 목록
  
  // 실적 정보
  performance: {
    total_customers: Number,    // 총 담당 고객 수
    active_contracts: Number,   // 진행중인 계약 수
    monthly_premium: Number,    // 월 보험료 실적
    target_achievement: Number  // 목표 달성률 (%)
  },
  
  // 메타 정보
  meta: {
    created_at: Date,
    updated_at: Date,
    status: String             // 재직 상태 ("active", "inactive", "resigned")
  }
}
```

## 케이스(Case) 스키마

### MongoDB Collection: `cases`

```javascript
{
  _id: ObjectId,
  
  // 케이스 기본 정보
  case_info: {
    case_number: String,       // 케이스 번호 (자동 생성)
    title: String,             // 케이스 제목
    type: String,              // 케이스 유형 ("claim", "consultation", "renewal", "new_contract")
    priority: String,          // 우선순위 ("high", "medium", "low")
    status: String,            // 상태 ("open", "in_progress", "resolved", "closed")
    description: String        // 케이스 설명
  },
  
  // 관련 정보
  related_info: {
    customer_id: ObjectId,     // 관련 고객 ID
    agent_id: ObjectId,        // 담당 영업사원 ID
    contract_id: String,       // 관련 계약번호 (선택)
    documents: [ObjectId],     // 관련 문서 ID 목록
  },
  
  // 진행 상황
  progress: {
    created_at: Date,          // 케이스 생성일
    due_date: Date,            // 처리 기한
    resolved_at: Date,         // 해결일
    resolution_notes: String,   // 해결 내용
    follow_up_required: Boolean, // 후속 조치 필요
    follow_up_date: Date       // 후속 조치 예정일
  },
  
  // 메타 정보
  meta: {
    created_by: ObjectId,      // 생성한 영업사원
    last_modified_by: ObjectId,
    updated_at: Date
  }
}
```

## 인덱스 설계

### customers 컬렉션
- `personal_info.name`: 이름 검색
- `personal_info.phone`: 전화번호 검색  
- `personal_info.id_number`: 주민번호 검색 (해시 인덱스)
- `meta.created_by`: 영업사원별 고객 조회
- `meta.status`: 고객 상태별 필터링

### agents 컬렉션
- `personal_info.employee_id`: 사번 검색
- `personal_info.email`: 이메일 검색

### cases 컬렉션
- `related_info.customer_id`: 고객별 케이스 조회
- `related_info.agent_id`: 영업사원별 케이스 조회
- `case_info.status`: 상태별 케이스 필터링
- `case_info.type`: 케이스 유형별 필터링

## 문서 연결 확장

기존 `docupload.files` 컬렉션에 고객 정보 추가:

```javascript
{
  // 기존 필드들...
  
  // 고객 연결 정보 추가
  customer_relation: {
    customer_id: ObjectId,     // 연결된 고객 ID
    case_id: ObjectId,         // 연결된 케이스 ID (선택)
    relationship_type: String, // 문서 관계 ("contract", "claim", "id_verification", "medical")
    assigned_by: ObjectId,     // 연결을 생성한 영업사원 ID
    assigned_at: Date,         // 연결 생성일
    notes: String              // 연결 메모
  }
}
```
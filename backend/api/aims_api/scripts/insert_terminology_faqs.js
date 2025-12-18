/**
 * 용어(Terminology) FAQ 삽입 스크립트
 * AIMS에서 사용하는 도메인 용어 정의
 * P(민수) 제작 → V(정은) 검증
 */

const now = new Date();

const faqs = [
  // ========================================
  // 고객 관련 용어 (10개)
  // ========================================
  {
    question: "[용어] '개인' 고객이란?",
    answer: "개인 고객은 자연인(사람) 고객을 의미합니다.\n\n특징:\n• 고객명 = 개인 이름\n• 생년월일, 성별 입력 가능\n• 휴대폰, 이메일, 주소 관리\n• 아이콘: 파란색 사람 모양\n\n법인이 아닌 모든 고객은 개인 고객으로 등록합니다.",
    category: "general",
    order: 101,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "[용어] '법인' 고객이란?",
    answer: "법인 고객은 회사, 단체 등 법적 조직체를 의미합니다.\n\n특징:\n• 고객명 = 법인명 (회사명)\n• 사업자등록번호, 대표자명 입력\n• 회사 전화번호, 이메일, 주소 관리\n• 아이콘: 주황색 건물 모양\n\n법인 고객에는 대표, 임원, 직원 관계를 연결할 수 있습니다.",
    category: "general",
    order: 102,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "[용어] '활성' 상태란?",
    answer: "활성(Active) 상태는 현재 관리 중인 고객을 의미합니다.\n\n• 기본 목록에 표시됨\n• 문서/계약 등록 가능\n• 일반적인 고객 상태\n\n고객 등록 시 기본값은 '활성'입니다.",
    category: "general",
    order: 103,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "[용어] '휴면' 상태란?",
    answer: "휴면(Inactive) 상태는 일시적으로 관리에서 제외된 고객입니다.\n\n특징:\n• 기본 목록에서 숨겨짐\n• 필터를 '전체' 또는 '휴면'으로 설정해야 표시\n• 언제든 '활성'으로 복원 가능\n• 삭제와 다름 (데이터 유지됨)\n\n장기간 연락이 없거나 계약이 종료된 고객에게 사용합니다.",
    category: "general",
    order: 104,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "[용어] '고객명'이란?",
    answer: "고객명은 고객을 식별하는 이름입니다.\n\n규칙:\n• 같은 설계사 내에서 중복 불가\n• 개인: 실명 사용 권장\n• 법인: 법인명(회사명) 사용\n• 동명이인: 식별자 추가 (예: 홍길동(강남))\n\n고객명은 문서/계약 연결, 검색 등에서 핵심 식별자로 사용됩니다.",
    category: "general",
    order: 105,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "[용어] '가족대표'란?",
    answer: "가족대표(Family Representative)는 가족 그룹의 중심 고객입니다.\n\n역할:\n• 가족 관계 트리의 루트(기준점)\n• 가족 그룹을 대표하는 고객\n• 관계별 고객 보기에서 그룹 헤더로 표시\n\n가족 관계를 등록할 때 첫 번째 고객이 가족대표가 됩니다. 나중에 변경할 수 있습니다.",
    category: "general",
    order: 106,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "[용어] '수익자'란?",
    answer: "수익자(Beneficiary)는 보험금을 받는 대상자입니다.\n\n특징:\n• 계약자와 다를 수 있음\n• 주로 가족 관계로 지정\n• 관계 정보에서 'is_beneficiary'로 표시\n\n예: 계약자=본인, 수익자=배우자/자녀",
    category: "general",
    order: 107,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "[용어] '동명이인'이란?",
    answer: "동명이인은 이름이 같은 다른 사람을 의미합니다.\n\nAIMS에서의 처리:\n• 같은 설계사 내 고객명 중복 불가\n• 식별자를 추가하여 구분\n  - 예: '홍길동(강남)', '홍길동(서초)'\n  - 예: '김철수A', '김철수B'\n\n일괄등록 시에도 동명이인 처리가 필요합니다.",
    category: "general",
    order: 108,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },

  // ========================================
  // 관계 유형 용어 (8개)
  // ========================================
  {
    question: "[용어] 가족 관계 유형에는 무엇이 있나요?",
    answer: "AIMS에서 지원하는 가족 관계 유형:\n\n• 배우자(Spouse): 결혼 관계의 파트너\n• 부모(Parent): 상위 세대 (아버지/어머니)\n• 자녀(Child): 하위 세대 (아들/딸)\n\n가족 관계는 '관계별 고객 보기'에서 트리 형태로 표시됩니다.",
    category: "general",
    order: 109,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "[용어] 법인 관계 유형에는 무엇이 있나요?",
    answer: "AIMS에서 지원하는 법인 관계 유형:\n\n• 대표(CEO): 법인의 대표이사\n• 임원(Executive): 법인의 임원진\n• 직원(Employee): 법인의 일반 직원\n\n법인 고객에 개인 고객을 연결하여 조직 구조를 표현합니다.",
    category: "general",
    order: 110,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },

  // ========================================
  // 문서 관련 용어 (15개)
  // ========================================
  {
    question: "[용어] 'OCR'이란?",
    answer: "OCR(Optical Character Recognition)은 이미지에서 텍스트를 추출하는 기술입니다.\n\nAIMS에서의 활용:\n• 스캔된 문서, 사진에서 텍스트 인식\n• 인식된 텍스트로 검색 가능\n• AI 검색에 활용\n\nOCR 처리된 문서는 'OCR' 배지가 표시됩니다.",
    category: "general",
    order: 111,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "[용어] 'OCR 신뢰도'란?",
    answer: "OCR 신뢰도는 텍스트 인식의 정확도를 나타내는 지표입니다.\n\n5단계 분류:\n• 매우 높음 (95% 이상): 거의 완벽한 인식\n• 높음 (85~94%): 대부분 정확\n• 보통 (70~84%): 일부 오류 가능\n• 낮음 (50~69%): 상당한 오류 예상\n• 매우 낮음 (50% 미만): 수동 확인 필요\n\n신뢰도가 낮으면 원본 문서 확인을 권장합니다.",
    category: "general",
    order: 112,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "[용어] 문서 배지 'OCR/TXT/BIN'의 의미는?",
    answer: "문서 유형을 나타내는 배지입니다:\n\n• OCR: 이미지 기반으로 OCR 처리된 문서\n  - 스캔 문서, 사진 등\n• TXT: 텍스트 추출이 가능한 문서\n  - 디지털 PDF, 텍스트 파일 등\n• BIN: 텍스트 추출이 불가능한 바이너리 파일\n  - 압축파일, 미디어 파일 등\n\n배지는 문서 목록에서 파일명 옆에 표시됩니다.",
    category: "general",
    order: 113,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "[용어] '메타데이터'란?",
    answer: "메타데이터는 문서에 대한 부가 정보입니다.\n\n포함 정보:\n• 파일명 (원본/저장)\n• 파일 크기\n• MIME 타입 (파일 형식)\n• 업로드 일시\n• 연결된 고객 정보\n• 처리 상태\n\n메타데이터는 문서 검색과 관리에 활용됩니다.",
    category: "general",
    order: 114,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "[용어] '임베딩'이란?",
    answer: "임베딩(Embedding)은 문서 내용을 AI가 이해할 수 있는 벡터로 변환하는 것입니다.\n\n용도:\n• AI 시맨틱 검색의 기반\n• 문서 간 유사도 계산\n• 의미 기반 검색 가능\n\n문서 업로드 후 자동으로 임베딩 처리됩니다. '상세 문서 검색'에서 활용됩니다.",
    category: "general",
    order: 115,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "[용어] 문서 처리 상태의 종류는?",
    answer: "문서가 거치는 처리 상태:\n\n• 대기(Pending): 처리 시작 전\n• 처리 중(Processing): 진행 중\n• 완료(Completed): 성공적으로 처리됨\n• 오류(Error): 처리 중 문제 발생\n• 시간 초과(Timeout): 처리 시간 초과\n\n상태 배지로 현재 진행 상황을 확인할 수 있습니다.",
    category: "general",
    order: 116,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "[용어] '전문(Full Text)'이란?",
    answer: "전문은 문서에서 추출된 전체 텍스트를 의미합니다.\n\n추출 방식:\n• PDF: 내장 텍스트 또는 OCR\n• 이미지: OCR 처리\n• 텍스트 파일: 직접 읽기\n\n전문은 검색, AI 분석에 활용됩니다. '전문 보기' 버튼으로 확인 가능합니다.",
    category: "general",
    order: 117,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "[용어] 'MIME 타입'이란?",
    answer: "MIME 타입은 파일의 형식을 나타내는 표준 식별자입니다.\n\n예시:\n• application/pdf → PDF 문서\n• image/jpeg → JPEG 이미지\n• image/png → PNG 이미지\n• application/zip → ZIP 압축파일\n\nMIME 타입에 따라 미리보기 방식이 결정됩니다.",
    category: "general",
    order: 118,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },

  // ========================================
  // 계약 관련 용어 (10개)
  // ========================================
  {
    question: "[용어] '증권번호'란?",
    answer: "증권번호(Policy Number)는 보험 계약의 고유 식별 번호입니다.\n\n특징:\n• 보험사에서 발급하는 계약 고유 번호\n• AIMS 내에서 중복 불가\n• 계약 검색의 핵심 키\n\n증권번호는 보험증권이나 계약서에서 확인할 수 있습니다.",
    category: "general",
    order: 119,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "[용어] '계약자'란?",
    answer: "계약자는 보험 계약을 체결한 당사자입니다.\n\n특징:\n• 보험료 납입 의무자\n• 계약의 주체\n• AIMS에서는 '고객'과 동일\n\n계약자 ≠ 피보험자인 경우도 있습니다 (타인을 위한 보험).",
    category: "general",
    order: 120,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "[용어] '피보험자'란?",
    answer: "피보험자(Insured)는 보험의 대상이 되는 사람입니다.\n\n특징:\n• 보험 사고 발생 시 보상 대상\n• 계약자와 동일하거나 다를 수 있음\n• 생명보험: 사망/질병 보장 대상\n• 손해보험: 손해 보상 대상\n\n예: 부모(계약자)가 자녀(피보험자)를 위해 보험 가입",
    category: "general",
    order: 121,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "[용어] 계약 상태 '유지'란?",
    answer: "유지 상태는 정상적으로 효력이 유지되는 계약입니다.\n\n특징:\n• 보험료 정상 납입 중\n• 보장 효력 유효\n• 가장 일반적인 계약 상태\n\n대부분의 활성 계약은 '유지' 상태입니다.",
    category: "general",
    order: 122,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "[용어] 계약 상태 '완납'이란?",
    answer: "완납 상태는 보험료를 모두 납입 완료한 계약입니다.\n\n특징:\n• 더 이상 보험료 납입 불필요\n• 보장 효력은 계속 유효\n• 종신보험 등에서 발생\n\n완납 후에도 보장은 만기까지 유지됩니다.",
    category: "general",
    order: 123,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "[용어] 계약 상태 '실효'란?",
    answer: "실효 상태는 보험료 미납으로 효력이 상실된 계약입니다.\n\n특징:\n• 보험료 연체로 인한 효력 중단\n• 보장 받을 수 없음\n• 일정 기간 내 부활 가능한 경우도 있음\n\n실효된 계약은 보험사에 부활 절차를 문의하세요.",
    category: "general",
    order: 124,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "[용어] 계약 상태 '해지'란?",
    answer: "해지 상태는 계약이 중도에 종료된 상태입니다.\n\n특징:\n• 계약자 요청 또는 보험사 결정으로 종료\n• 해지환급금 발생 가능\n• 더 이상 보장 없음\n\n해지된 계약은 복원이 어렵습니다.",
    category: "general",
    order: 125,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "[용어] 계약 상태 '만기'란?",
    answer: "만기 상태는 보험 기간이 종료된 계약입니다.\n\n특징:\n• 정해진 보험 기간 완료\n• 만기환급금 발생 가능 (상품에 따라)\n• 갱신형은 재계약 가능\n\n만기 전에 갱신 여부를 확인하세요.",
    category: "general",
    order: 126,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "[용어] '납입주기'란?",
    answer: "납입주기는 보험료를 납입하는 간격입니다.\n\n종류:\n• 월납: 매월 납입\n• 연납: 1년에 한 번 납입 (할인 적용)\n• 일시납: 가입 시 전액 납입\n\n납입주기에 따라 총 납입 보험료가 달라질 수 있습니다.",
    category: "general",
    order: 127,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },

  // ========================================
  // 일괄등록/시스템 용어 (12개)
  // ========================================
  {
    question: "[용어] '시트(Sheet)'란?",
    answer: "시트는 엑셀 파일 내의 개별 워크시트를 의미합니다.\n\nAIMS 일괄등록 템플릿의 시트:\n• 개인고객 시트: 개인 고객 정보\n• 법인고객 시트: 법인 고객 정보\n• 계약 시트: 계약 정보\n\n각 시트는 독립적으로 처리되며, 필요한 시트만 작성하면 됩니다.",
    category: "general",
    order: 128,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "[용어] '템플릿'이란?",
    answer: "템플릿은 일괄등록에 사용하는 미리 정의된 엑셀 양식입니다.\n\n특징:\n• 필수/선택 필드가 정의됨\n• 입력 안내가 포함됨\n• 데이터 검증 규칙 포함\n\n'템플릿 다운로드' 버튼으로 받아서 사용하세요.",
    category: "general",
    order: 129,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "[용어] '매칭'이란?",
    answer: "매칭은 입력 데이터를 기존 데이터와 연결하는 과정입니다.\n\nAIMS에서의 매칭:\n• 상품명 매칭: 입력한 상품명 → 상품 DB\n• 고객명 매칭: 폴더명 → 등록된 고객\n• 색상 표시: 녹색(정확), 노란색(유사), 빨간색(불일치)\n\n매칭이 안 되면 수동으로 선택해야 합니다.",
    category: "general",
    order: 130,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "[용어] '설계사'란?",
    answer: "설계사(Agent)는 AIMS 시스템 사용자입니다.\n\n역할:\n• 보험 영업인 (Insurance Agent)\n• 고객/계약/문서 관리 주체\n• 시스템의 데이터 소유자\n\n각 설계사는 독립된 데이터 공간을 가지며, 다른 설계사의 데이터에 접근할 수 없습니다.",
    category: "general",
    order: 131,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "[용어] '티어(Tier)'란?",
    answer: "티어는 사용자의 서비스 등급입니다.\n\n등급 종류:\n• 무료체험: 30일, 5GB, 100MB/배치\n• 일반: 30GB, 500MB/배치\n• 프리미엄: 50GB, 1GB/배치\n• VIP: 100GB, 2GB/배치\n\n티어에 따라 저장 용량과 기능이 달라집니다.",
    category: "general",
    order: 132,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "[용어] '스토리지'란?",
    answer: "스토리지(Storage)는 파일 저장 공간입니다.\n\n관련 용어:\n• 사용량: 현재 사용 중인 용량\n• 할당량(쿼터): 최대 사용 가능 용량\n• 남은 용량: 추가 저장 가능한 용량\n\n스토리지가 가득 차면 새 파일을 업로드할 수 없습니다.",
    category: "general",
    order: 133,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "[용어] '쿼터(Quota)'란?",
    answer: "쿼터는 할당된 최대 사용량 한도입니다.\n\n종류:\n• 저장 쿼터: 총 저장 용량 한도\n• 배치 쿼터: 1회 일괄 업로드 한도\n• API 쿼터: AI 기능 사용 한도\n\n쿼터 초과 시 해당 기능 사용이 제한됩니다.",
    category: "general",
    order: 134,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "[용어] '시맨틱 검색'이란?",
    answer: "시맨틱 검색(Semantic Search)은 의미 기반 AI 검색입니다.\n\n특징:\n• 키워드가 정확히 일치하지 않아도 검색\n• 문맥과 의미를 이해\n• 유사한 내용의 문서도 찾아줌\n\n예: '암보험' 검색 → '암 진단비', '암치료 특약' 등 포함",
    category: "general",
    order: 135,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "[용어] 'Top-K'란?",
    answer: "Top-K는 검색 결과로 반환할 최대 문서 수입니다.\n\n설정:\n• 기본값: 10개\n• 범위: 3~20개\n• 상세 문서 검색에서 조정 가능\n\nK 값이 클수록 더 많은 결과를 보지만, 정확도가 낮은 결과도 포함될 수 있습니다.",
    category: "general",
    order: 136,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "[용어] '차단 확장자'란?",
    answer: "차단 확장자는 보안상 업로드가 금지된 파일 형식입니다.\n\n차단 대상:\n• 실행 파일: .exe, .msi, .bat, .cmd\n• 스크립트: .js, .vbs, .ps1\n• 라이브러리: .dll, .so\n\n이러한 파일은 악성코드 위험이 있어 업로드가 차단됩니다.",
    category: "general",
    order: 137,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "[용어] '연차보고서'란?",
    answer: "연차보고서(Annual Report)는 보험사에서 발송하는 연간 계약 안내서입니다.\n\nAIMS 처리:\n• PDF 업로드 시 자동 인식\n• 보험사, 계약번호, 상품명 등 자동 추출\n• 계약 정보와 연결 가능\n\n연차보고서를 업로드하면 계약 정보를 쉽게 관리할 수 있습니다.",
    category: "general",
    order: 138,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "[용어] '세션'이란?",
    answer: "세션(Session)은 로그인 상태가 유지되는 기간입니다.\n\n특징:\n• 로그인 후 일정 시간 동안 유지\n• 활동이 없으면 자동 만료\n• 만료 시 재로그인 필요\n\n보안을 위해 세션은 일정 시간 후 자동 종료됩니다.",
    category: "general",
    order: 139,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },

  // ========================================
  // 문의/도움말 용어 (5개)
  // ========================================
  {
    question: "[용어] 문의 카테고리의 종류는?",
    answer: "1:1 문의의 카테고리:\n\n• 버그 신고: 오류, 문제점 보고\n• 기능 제안: 새로운 기능 요청\n• 사용 문의: 사용 방법 질문\n• 기타: 위에 해당하지 않는 문의\n\n적절한 카테고리를 선택하면 빠른 답변에 도움이 됩니다.",
    category: "general",
    order: 140,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "[용어] '2FA'란?",
    answer: "2FA(Two-Factor Authentication)는 2단계 인증입니다.\n\n인증 단계:\n1. 비밀번호 입력 (1단계)\n2. 인증 앱 코드 입력 (2단계)\n\n2FA를 사용하면 비밀번호가 유출되어도 계정이 보호됩니다. Google Authenticator 등의 앱을 사용합니다.",
    category: "general",
    order: 141,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  }
];

// MongoDB 연결 및 삽입
db = db.getSiblingDB('docupload');

// 새 FAQ 삽입
const insertResult = db.faqs.insertMany(faqs);
print('용어 FAQ 삽입: ' + insertResult.insertedIds.length + '건');

// 결과 확인
const totalCount = db.faqs.countDocuments();
print('현재 총 FAQ 개수: ' + totalCount);

// 용어 FAQ 개수 (order 101 이상)
const termCount = db.faqs.countDocuments({ order: { $gte: 101 } });
print('용어 FAQ 개수: ' + termCount + '개');

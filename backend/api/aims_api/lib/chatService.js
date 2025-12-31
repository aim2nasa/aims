/**
 * chatService.js
 * AI 채팅 서비스 - OpenAI GPT-4o + MCP 연동
 * @since 1.0.0
 */

const OpenAI = require('openai');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { logTokenUsage, TOKEN_COSTS } = require('./tokenUsageService');
const backendLogger = require('./backendLogger');
const aiModelSettings = require('./aiModelSettings');

// OpenAI 클라이언트 초기화
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// MCP 서버 URL
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3011';

// Rate limit 재시도 설정
const RATE_LIMIT_MAX_RETRIES = 3;
const RATE_LIMIT_BASE_DELAY_MS = 1000;

/**
 * 지정된 시간만큼 대기
 * @param {number} ms - 대기 시간 (밀리초)
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Rate limit 오류인지 확인
 * @param {Error} error - 오류 객체
 * @returns {boolean}
 */
function isRateLimitError(error) {
  return error?.status === 429 ||
         error?.code === 'rate_limit_exceeded' ||
         error?.message?.includes('429') ||
         error?.message?.includes('Rate limit');
}

/**
 * API 크레딧 부족 오류인지 확인
 * @param {Error} error - 오류 객체
 * @returns {boolean}
 */
function isQuotaExceededError(error) {
  return error?.code === 'insufficient_quota' ||
         error?.message?.includes('insufficient_quota') ||
         error?.message?.includes('exceeded your current quota');
}

// 시스템 프롬프트
const SYSTEM_PROMPT = `당신은 AIMS(Agent Intelligent Management System)의 AI 어시스턴트입니다.
AIMS는 보험 설계사를 위한 지능형 고객 관리 시스템입니다.

## 🚨 가장 중요한 규칙 (CRITICAL - 반드시 준수!)
**고객, 계약, 문서 등 데이터를 조회할 때는 반드시 도구를 사용하세요.**
- 도구 호출 결과가 0건이면 "없습니다"라고 정확히 답변하세요.
- 절대로 가상의 데이터를 생성하지 마세요. 이는 사용자에게 심각한 혼란을 줍니다.
- 도구를 호출하지 않고 고객명, 계약 정보 등을 언급하면 안 됩니다.
- **🔴 "없습니다", "더 이상 없습니다" 라고 말하기 전에 반드시 도구를 호출해서 확인하세요!**
- **🔴 사용자가 고객명을 언급하면 반드시 search_customers 또는 list_contracts 도구를 호출하세요!**
- **🔴 절대로 추측하지 마세요! 항상 도구를 호출해서 실제 데이터를 확인하세요!**

## 당신의 역할 (42개 도구 활용)

### 고객 관리
- 고객 검색, 조회, 등록, 수정
- 휴면 고객 조회: search_customers 도구에 status: "inactive" 파라미터 사용
- 삭제된 고객 조회/복구: list_deleted_customers, restore_customer 도구 사용
- 고객명 중복 확인

### 계약 관리
- 계약 목록 조회 및 상세 정보 확인
- 만기 예정 계약 알림

### 문서 관리
- 시맨틱(의미 기반) 문서 검색 - 자연어로 문서를 찾아줍니다
- 키워드 문서 검색
- 문서 상세 조회 및 삭제

### 인사이트 분석
- 고객 가치 분석 (S/A/B/C/D 등급)
- 보장 공백 분석 (부족한 보험 영역 파악)
- 다음 액션 추천 (만기, 생일, 정기연락 등)

### Annual Report (연차보고서)
- 고객의 연보 목록 조회
- 연보 파싱 상태 확인 및 트리거

### 관계 네트워크
- 고객 간 관계 등록 (가족, 지인, 동료 등)
- 관계 네트워크 시각화 조회

### 유틸리티
- 저장소 사용량 확인
- 공지사항, FAQ, 사용 가이드 조회

### 상품 정보
- 보험 상품 검색 및 상세 정보

## 응답 규칙
1. 한국어로 응답합니다.
2. 날짜/시간은 YYYY.MM.DD HH:mm:ss 형식으로 표시합니다.
3. 금액은 천 단위 구분자(,)를 사용합니다.
4. **데이터 조회 시 반드시 도구를 사용하고, 결과를 그대로 전달합니다.**
5. **도구 결과가 비어있으면 "해당하는 데이터가 없습니다"라고 명확히 답변합니다.**
6. **사용자는 본인 고객의 모든 정보(연락처, 주소, 계약 등)에 접근 권한이 있습니다. 개인정보 보호를 이유로 거부하지 마세요.**
7. **특정 고객을 지정하지 않은 요청(예: "고객 연락처 알려줘")에는 "어느 고객의 정보를 원하시나요?"라고 물어보세요.**
8. 간결하고 명확하게 답변합니다.
9. 분석 결과는 핵심 인사이트를 먼저 제시하고, 상세 내용은 그 다음에 설명합니다.
10. 응답에 내부 시스템 ID(MongoDB ObjectId, 고객ID, 문서ID 등)를 절대 포함하지 않습니다. 사용자에게 유용한 정보(이름, 연락처, 상태 등)만 표시합니다.

## 🔴 문서 등록 응답 규칙 (CRITICAL!)
**사용자가 고객명을 언급하며 문서 등록/업로드를 원할 때:**
- 복잡한 안내 대신 "{고객명} 고객 문서를 첨부해주세요" 형식으로 **간단히** 응답
- 예: "김보성" → "김보성 고객 문서를 첨부해주세요"
- 예: "캐치업코리아에 문서 등록해줘" → "캐치업코리아 고객 문서를 첨부해주세요"
- **🚨 절대로 "파일명이나 주요 내용을 알려주세요" 같은 긴 설명 금지!**

## DB 쓰기 작업 규칙
- 고객 등록: **이름만 필수**입니다. 전화번호, 이메일, 주소 등은 선택사항입니다.
  - 이름만 제공된 경우: "전화번호나 이메일도 등록하시겠어요?" 한 번만 물어봅니다.
  - 사용자가 "없어", "그냥 등록해", "필수 아니야" 등으로 응답하면 즉시 등록합니다.
  - 절대 두 번 이상 추가 정보를 요청하지 마세요.
- 고객 수정: 먼저 어느 고객인지 확인하고, 수정할 내용을 확인한 뒤 진행합니다.
- **🚨 중요: update_customer 호출 전 반드시 search_customers로 고객을 먼저 검색하세요.**
  - 이전 대화에서 고객을 이미 검색했더라도, 수정 직전에 다시 검색해야 합니다.
  - 검색과 수정을 같은 턴에서 연속으로 실행하세요.
  - 이 규칙을 어기면 "고객을 찾을 수 없습니다" 오류가 발생합니다.
- **전화번호 수정**: 고객에게는 3가지 전화번호(휴대폰, 집 전화, 회사 전화)가 있습니다.
  - **절대로 임의로 전화번호 종류를 결정하지 마세요!**
  - 반드시 get_customer 도구로 현재 연락처를 먼저 조회하세요.
  - 현재 등록된 모든 번호를 보여주고 "어떤 번호를 수정하시겠습니까? (휴대폰/집 전화/회사 전화)" 라고 **반드시** 물어보세요.
  - 사용자가 "휴대폰", "집 전화", "회사 전화" 중 하나를 명시적으로 선택한 후에만 번호를 요청하세요.
  - 예시 흐름:
    1. 사용자: "전화번호 수정해줘"
    2. AI: "어느 고객의 전화번호를 수정하시겠습니까?"
    3. 사용자: "홍길동"
    4. AI: "홍길동 고객의 현재 연락처입니다:
       - 휴대폰: 010-1234-5678
       - 집 전화: (없음)
       - 회사 전화: (없음)
       어떤 번호를 수정하시겠습니까? (휴대폰/집 전화/회사 전화)"
    5. 사용자: "회사 전화"
    6. AI: "등록할 회사 전화번호를 알려주세요."
- **주소 수정**: 반드시 search_address 도구로 검증된 주소를 사용하세요.
  - **절대로 사용자가 말한 주소를 그대로 저장하지 마세요!**
  - 반드시 search_address 도구로 먼저 주소를 검색하세요.
  - 검색 결과 중 하나를 선택하게 하고, 선택된 주소로 수정하세요.
  - 상세주소(동/호수)는 사용자에게 별도로 물어보세요.
  - 예시 흐름:
    1. 사용자: "주소 변경해줘"
    2. AI: "어느 고객의 주소를 변경하시겠습니까?"
    3. 사용자: "홍길동"
    4. AI: "새 주소를 검색하기 위해 도로명 또는 지번주소를 알려주세요. (예: 테헤란로 123)"
    5. 사용자: "테헤란로 123"
    6. AI: (search_address 호출 후) "검색 결과입니다:
       1. [06236] 서울특별시 강남구 테헤란로 123
       2. [06237] 서울특별시 강남구 테헤란로 123-1
       몇 번 주소를 선택하시겠습니까?"
    7. 사용자: "1번"
    8. AI: "상세주소(동/호수 등)가 있으면 알려주세요. (없으면 '없음')"
    9. 사용자: "401호"
    10. AI: (update_customer 호출) "홍길동 고객의 주소가 [06236] 서울특별시 강남구 테헤란로 123, 401호 로 변경되었습니다."
- 메모 추가: 메모 내용을 확인한 뒤 추가합니다.
- 관계 등록: 두 고객을 확인하고 관계 유형을 확인한 뒤 등록합니다.

## 분석 도구 활용 가이드
- "중요한 고객" 질문 → analyze_customer_value 사용
- "보장 부족" 질문 → find_coverage_gaps 사용
- "오늘 할 일" 질문 → suggest_next_action 사용
- "휴면 고객" 질문 → search_customers (status: "inactive") 사용
- "삭제된 고객" 질문 → list_deleted_customers 사용

## 🔍 검색 도구 선택 가이드 (unified_search 사용)

### 1. 문서 검색 - documentsOnly: true
**"문서", "서류", "파일" 키워드가 있으면 문서만 검색!**
- "퇴직연금 관련 서류 찾아줘" → unified_search(documentsOnly: true)
- "자동차보험 문서 검색해줘" → unified_search(documentsOnly: true)
- "건강검진 서류 있어?" → unified_search(documentsOnly: true)
- "계약서 파일 보여줘" → unified_search(documentsOnly: true)

**문서 검색 결과 표시 (2가지 카테고리만):**
\`\`\`
"OOO" 문서 검색 결과:

### 🔤 키워드 일치 문서 (3건)
1. [파일명.pdf](doc:문서ID): 요약...

### 🤖 AI 검색 문서 (5건)
1. [파일명.pdf](doc:문서ID): 요약...
\`\`\`
**중요**: 문서명은 반드시 [파일명](doc:fileId) 형식으로 표시! 클릭 시 미리보기 가능

### 2. 통합 검색 - documentsOnly: false (기본값)
**단순 키워드나 사람 이름이면 통합 검색!**
- "퇴직연금" → unified_search (검색어만 있음)
- "캐치업코리아" → unified_search (회사명)
- "김보성" → unified_search (사람 이름 = 고객도 검색)

**통합 검색 결과 표시 (4가지 카테고리 모두):**
\`\`\`
"OOO" 검색 결과:

### 🔤 키워드 일치 문서 (3건)
1. [파일명.pdf](doc:문서ID): 요약...

### 🤖 AI 검색 문서 (5건)
1. [파일명.pdf](doc:문서ID): 요약...

### 👤 고객 (0건)
해당하는 고객이 없습니다.

### 📋 계약 (0건)
해당하는 계약이 없습니다.
\`\`\`
**중요**: 통합 검색에서는 0건인 카테고리도 반드시 표시!
**중요**: 문서명은 반드시 [파일명](doc:fileId) 형식으로 표시! 클릭 시 미리보기 가능

### search_products는 언제 사용?
- "상품 검색해줘" → search_products
- "무배당 종신보험 찾아줘" → search_products
- 사용자가 **명시적으로** "보험 상품"을 요청할 때만 search_products 사용
- **주의: 일반 검색어에 search_products 사용하지 마세요!**

## 🔴 문서 내용 조회 규칙 (CRITICAL!)
**사용자가 특정 문서의 내용/요약을 물어볼 때:**
1. **요약이 있으면 무조건 보여주세요!** "상세하지 않습니다" 같은 변명 금지!
2. 요약 내용을 그대로 표시하고, 추가 질문이 있으면 물어보라고 안내
3. 요약이 정말 비어있는 경우에만 "요약 정보가 없습니다"라고 답변

**올바른 응답 예시:**
\`\`\`
"문서명.pdf" 요약:
- 9DOF-IMU 센서의 상황별 설정 방법과 사용 가이드
- 제품 설치 및 초기화, 센서 설정 방법 설명
- 환경 변화에 따른 센서 보정 절차와 문제 해결 팁

더 궁금한 부분이 있으시면 말씀해주세요!
\`\`\`

**잘못된 응답 예시 (절대 금지!):**
\`\`\`
❌ "문서를 찾았으나, 요약된 내용이 상세하지 않습니다."
❌ "특정 부분이나 궁금한 내용을 알려주시면 확인해드리겠습니다."
\`\`\`

## 목록 조회 규칙 (페이지네이션)
- 고객/계약/문서 목록 조회 시 한 번에 최대 10개만 표시합니다.
- 고객 목록 조회 시 응답 첫 줄에 다음 형식으로 요약 표시:
  "전체 N명 (개인 X명, 법인 Y명) | 1/P 페이지 (10개씩)"
  예: "전체 25명 (개인 20명, 법인 5명) | 1/3 페이지 (10개씩)"
- 계약 목록 조회 시 응답 첫 줄에 다음 형식으로 요약 표시:
  "전체 N건 | 1/P 페이지 (10개씩)"
  예: "전체 45건 | 1/5 페이지 (10개씩)"
- **🔴 hasMore 필드를 반드시 확인하세요!**
  - hasMore=true → "다음 페이지를 보시겠습니까?" 물어보기
  - hasMore=false → "모든 데이터를 보셨습니다" 가능
  - **🚨 hasMore=true인데 "모든 문서/고객/계약을 보셨습니다"라고 하면 안 됩니다!**

## 🚫 AI 어시스턴트에서 지원하지 않는 기능
다음 기능은 AI 어시스턴트에서 처리할 수 없으며, **웹에서만** 가능합니다:

1. **고객/계약 일괄등록**: 엑셀 파일을 통한 대량 등록
   → 안내: "고객/계약 일괄등록은 웹에서 **좌측 메뉴 > 빠른작업 > 고객, 계약 일괄등록**을 이용해주세요."

2. **문서 일괄등록**: 여러 파일을 한 번에 업로드
   → 안내: "문서 일괄등록은 웹에서 **좌측 메뉴 > 빠른 작업 > 문서 일괄등록**을 이용해주세요."

**사용자가 위 기능을 요청하면 웹 메뉴 경로를 안내해주세요.**

## 🚨🚨🚨 다음 페이지 요청 - 절대 규칙 (CRITICAL!) 🚨🚨🚨
**사용자가 "응", "네", "예", "ㅇㅇ", "더 보여줘", "계속", "다음" 등으로 응답하면:**
1. **반드시 도구(list_contracts, search_customers 등)를 다시 호출해야 합니다.**
2. **이전 조회와 동일한 파라미터(search 등)를 유지하고, offset만 증가시킵니다.**
3. **절대로 "더 이상 없습니다", "추가 정보가 없습니다" 등으로 응답하면 안 됩니다!**
4. **도구를 호출하지 않고 응답하는 것은 금지입니다!**

### 페이지네이션 예시 (반드시 따르세요!)

예시 1 - 계약 목록 다음 페이지:
\`\`\`
사용자: "캐치업코리아 계약 보여줘"
AI: [list_contracts 호출 with search="캐치업코리아", offset=0]
    → 결과: 10건 표시, totalCount=20, hasMore=true
    "전체 20건 | 1/2 페이지... 다음 페이지를 보시겠습니까?"
사용자: "응"
AI: [list_contracts 호출 with search="캐치업코리아", offset=10]  ← 반드시 도구 호출!
    → 결과: 10건 표시, totalCount=20, hasMore=false
    "2/2 페이지입니다. (나머지 10건)"
\`\`\`

예시 2 - 고객 목록 다음 페이지:
\`\`\`
사용자: "고객 목록 보여줘"
AI: [search_customers 호출 with offset=0]
    → 결과: 10명 표시, totalCount=35, hasMore=true
    "다음 페이지를 보시겠습니까?"
사용자: "ㅇㅇ"
AI: [search_customers 호출 with offset=10]  ← 반드시 도구 호출!
\`\`\`

예시 3 - 고객 문서 목록 다음 페이지:
\`\`\`
사용자: "캐치업코리아 문서 목록 보여줘"
AI: [list_customer_documents 호출 with customerId="6947f716ea0d306a0ac63b61", offset=0, limit=10]
    → 결과: {
        customerId: "6947f716ea0d306a0ac63b61",
        count: 10, totalCount: 25, hasMore: true,
        nextOffset: 10,
        _paginationHint: "다음 페이지: list_customer_documents(customerId=\"6947f716ea0d306a0ac63b61\", offset=10)"
      }
    "전체 25건 중 10건을 표시합니다. 다음 페이지를 보시겠습니까?"
사용자: "응"
AI: [_paginationHint 그대로 사용! → list_customer_documents(customerId="6947f716ea0d306a0ac63b61", offset=10)]
    → 결과: { count: 10, totalCount: 25, hasMore: true, nextOffset: 20 }
    "11-20번 문서입니다. 다음 페이지를 보시겠습니까?"
사용자: "응"
AI: [list_customer_documents(customerId="6947f716ea0d306a0ac63b61", offset=20)]
    → 결과: { count: 5, totalCount: 25, hasMore: false, nextOffset: null }
    "나머지 5건입니다. 모든 문서를 보셨습니다."
\`\`\`

**🚨🚨🚨 CRITICAL: _paginationHint 필드를 반드시 확인하고 그대로 사용하세요!**
- hasMore=true일 때 응답에 _paginationHint가 포함됩니다
- 사용자가 "응", "더 보여줘" 등으로 응답하면 _paginationHint에 있는 도구 호출을 그대로 실행하세요
- customerId와 nextOffset을 직접 추출해서 사용해도 됩니다
- **절대 새로운 검색을 하거나 customerId를 잃어버리면 안 됩니다!**

## 🚨🚨🚨 페이지네이션 응답 형식 규칙 (CRITICAL!) 🚨🚨🚨
**hasMore=true일 때 반드시 아래 형식으로 응답하세요:**

1. **고객 문서 목록**: 응답 첫 줄에 고객명과 ID를 함께 표시
   형식: "**고객명**(ID:고객ID)의 문서 N건 중 X-Y번입니다."
   예시: "**캐치업코리아**(ID:6947f716ea0d306a0ac63b61)의 문서 25건 중 1-10번입니다."

2. **계약 목록**: 검색어와 함께 표시
   형식: "**검색어** 계약 N건 중 X-Y번입니다."
   예시: "**캐치업코리아** 계약 20건 중 1-10번입니다."

3. **고객 목록**: 전체 수와 범위 표시
   형식: "전체 N명 중 X-Y번입니다."
   예시: "전체 35명 중 1-10번입니다."

**🔴 반드시 (ID:xxx) 형태로 고객 ID를 응답에 포함하세요!**
사용자가 "응"이라고 하면, 이전 응답에서 "(ID:xxx)" 패턴을 찾아서 다음 페이지를 조회해야 합니다.

**🔴 다음 페이지 요청 처리 (사용자가 "응", "더 보여줘" 등 응답 시):**
- 이전 응답에서 "(ID:xxx)" 패턴을 찾아 customerId로 사용
- 이전에 보여준 범위(X-Y번)를 확인하여 다음 offset 계산 (예: 1-10번이었으면 offset=10)
- **⛔ unified_search 절대 사용 금지!** 반드시 동일한 도구(list_customer_documents 등)를 사용
- **⛔ 새로운 고객 검색(search_customers) 금지!** 이전 응답의 ID를 그대로 사용`;

// GPT-4o 비용 (TOKEN_COSTS에 없는 경우를 위해)
const GPT4O_COSTS = { input: 0.0025, output: 0.01 };  // per 1K tokens

/**
 * MCP 서버에서 tool 목록을 가져와 OpenAI functions 형식으로 변환
 * @returns {Promise<Array>} OpenAI tools 배열
 */
async function getMCPToolsAsOpenAIFunctions() {
  try {
    const response = await axios.get(`${MCP_SERVER_URL}/tools`, {
      timeout: 10000
    });

    const mcpTools = response.data.tools || [];

    return mcpTools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema || { type: 'object', properties: {} }
      }
    }));
  } catch (error) {
    console.error('[ChatService] MCP tools 로드 실패:', error.message);
    backendLogger.error('ChatService', 'MCP tools 로드 실패', error);
    return [];
  }
}

/**
 * MCP tool 호출
 * @param {string} toolName - 도구 이름
 * @param {Object} args - 인자
 * @param {string} userId - 사용자 ID
 * @returns {Promise<string>} 결과 문자열
 */
async function callMCPTool(toolName, args, userId) {
  try {
    const response = await axios.post(
      `${MCP_SERVER_URL}/tools/${toolName}`,
      args,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': userId
        },
        timeout: 30000
      }
    );

    // MCP 응답 형식: { success: true, result: { content: [{ type: 'text', text: '...' }] } }
    if (response.data.success && response.data.result?.content?.[0]?.text) {
      return response.data.result.content[0].text;
    }

    return JSON.stringify(response.data);
  } catch (error) {
    console.error(`[ChatService] MCP tool ${toolName} 호출 실패:`, error.message);
    backendLogger.error('ChatService', `MCP tool ${toolName} 호출 실패`, error);
    throw new Error(`도구 호출 실패: ${error.message}`);
  }
}

/**
 * 채팅 스트리밍 응답 생성 (Generator 함수)
 * @param {Array} messages - 대화 히스토리
 * @param {string} userId - 사용자 ID
 * @param {Db} analyticsDb - MongoDB aims_analytics 인스턴스
 * @yields {Object} SSE 이벤트
 */
async function* streamChatResponse(messages, userId, analyticsDb) {
  const requestId = uuidv4();
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  const toolCallsExecuted = [];

  try {
    // MCP tools 로드
    const tools = await getMCPToolsAsOpenAIFunctions();

    if (tools.length === 0) {
      console.warn('[ChatService] MCP tools가 없습니다. 기본 대화만 가능합니다.');
    }

    // 현재 날짜/시간 정보 (KST)
    const now = new Date();
    const kstOffset = 9 * 60;  // UTC+9
    const kstTime = new Date(now.getTime() + (kstOffset + now.getTimezoneOffset()) * 60000);
    const dateInfo = `현재 날짜: ${kstTime.getFullYear()}년 ${kstTime.getMonth() + 1}월 ${kstTime.getDate()}일 (${['일','월','화','수','목','금','토'][kstTime.getDay()]}요일)`;

    // 시스템 메시지 추가 (현재 날짜 포함)
    const fullMessages = [
      { role: 'system', content: `${dateInfo}\n\n${SYSTEM_PROMPT}` },
      ...messages
    ];

    let currentMessages = fullMessages;
    let iterationCount = 0;
    const MAX_ITERATIONS = 5;  // 무한 루프 방지

    // AI 모델 설정 조회 (캐싱됨)
    const chatModel = await aiModelSettings.getModel('chat');

    while (iterationCount < MAX_ITERATIONS) {
      iterationCount++;

      // OpenAI API 호출
      const streamOptions = {
        model: chatModel,
        messages: currentMessages,
        stream: true,
        stream_options: { include_usage: true },
        max_tokens: 4096
      };

      // tools가 있을 때만 포함
      if (tools.length > 0) {
        streamOptions.tools = tools;
      }

      // OpenAI API 호출 (Rate limit 재시도 포함, 인라인 처리로 실시간 알림)
      let stream = null;
      let lastError = null;

      for (let attempt = 1; attempt <= RATE_LIMIT_MAX_RETRIES; attempt++) {
        try {
          stream = await openai.chat.completions.create(streamOptions);
          break;  // 성공
        } catch (error) {
          lastError = error;

          // 크레딧 부족 오류는 재시도하지 않고 즉시 실패
          if (isQuotaExceededError(error)) {
            console.error('[ChatService] API 크레딧 부족:', error.message);
            throw error;
          }

          if (isRateLimitError(error) && attempt < RATE_LIMIT_MAX_RETRIES) {
            const delayMs = RATE_LIMIT_BASE_DELAY_MS * attempt;
            console.warn(`[ChatService] Rate limit 발생, ${delayMs}ms 후 재시도 (${attempt}/${RATE_LIMIT_MAX_RETRIES})`);

            // 실시간으로 재시도 알림 전송
            yield {
              type: 'rate_limit_retry',
              attempt,
              maxAttempts: RATE_LIMIT_MAX_RETRIES,
              delayMs
            };

            await sleep(delayMs);
            continue;
          }

          throw error;
        }
      }

      if (!stream) {
        throw lastError;
      }

      let toolCalls = [];
      let assistantContent = '';
      let finishReason = null;

      for await (const chunk of stream) {
        // Usage 정보 수집
        if (chunk.usage) {
          totalPromptTokens += chunk.usage.prompt_tokens || 0;
          totalCompletionTokens += chunk.usage.completion_tokens || 0;
        }

        const choice = chunk.choices[0];
        if (!choice) continue;

        finishReason = choice.finish_reason;
        const delta = choice.delta;
        if (!delta) continue;

        // 텍스트 응답 스트리밍
        if (delta.content) {
          assistantContent += delta.content;
          yield { type: 'content', content: delta.content };
        }

        // Tool calls 수집
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            if (idx !== undefined) {
              if (!toolCalls[idx]) {
                toolCalls[idx] = {
                  id: '',
                  function: { name: '', arguments: '' }
                };
              }
              if (tc.id) toolCalls[idx].id = tc.id;
              if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
              if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
            }
          }
        }
      }

      // Tool call이 없으면 종료
      if (toolCalls.length === 0 || finishReason === 'stop') {
        break;
      }

      // Tool calls 실행
      yield { type: 'tool_start', tools: toolCalls.map(tc => tc.function.name) };

      // Assistant 메시지 추가 (tool_calls 포함)
      const assistantMessage = {
        role: 'assistant',
        content: assistantContent || null,
        tool_calls: toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: tc.function
        }))
      };
      currentMessages = [...currentMessages, assistantMessage];

      // 각 tool 실행
      for (const tc of toolCalls) {
        const toolName = tc.function.name;
        yield { type: 'tool_calling', name: toolName };

        try {
          const args = JSON.parse(tc.function.arguments || '{}');
          console.log(`[ChatService] Tool 호출: ${toolName}`, JSON.stringify(args));
          const result = await callMCPTool(toolName, args, userId);
          console.log(`[ChatService] Tool 결과: ${toolName}`, result.substring(0, 200));

          toolCallsExecuted.push({ name: toolName, success: true });
          yield { type: 'tool_result', name: toolName, success: true };

          // Tool 결과 메시지 추가
          currentMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: result
          });
        } catch (error) {
          toolCallsExecuted.push({ name: toolName, success: false, error: error.message });
          yield { type: 'tool_result', name: toolName, success: false, error: error.message };
          backendLogger.error('ChatService', `Tool 실행 실패: ${toolName}`, error);

          // 에러 결과도 메시지로 추가
          currentMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: `Error: ${error.message}`
          });
        }
      }
    }

    // 토큰 사용량 로깅
    if (analyticsDb && (totalPromptTokens > 0 || totalCompletionTokens > 0)) {
      try {
        await logTokenUsage(analyticsDb, {
          user_id: userId,
          source: 'chat',
          request_id: requestId,
          model: 'gpt-4o',
          prompt_tokens: totalPromptTokens,
          completion_tokens: totalCompletionTokens,
          metadata: {
            messageCount: messages.length,
            toolCalls: toolCallsExecuted.map(tc => tc.name),
            toolCallCount: toolCallsExecuted.length
          }
        });
      } catch (logError) {
        console.error('[ChatService] 토큰 로깅 실패:', logError.message);
        backendLogger.error('ChatService', '토큰 로깅 실패', logError);
      }
    }

    // 완료 이벤트
    yield {
      type: 'done',
      usage: {
        prompt_tokens: totalPromptTokens,
        completion_tokens: totalCompletionTokens,
        total_tokens: totalPromptTokens + totalCompletionTokens
      }
    };

  } catch (error) {
    console.error('[ChatService] 스트리밍 오류:', error);
    backendLogger.error('ChatService', '스트리밍 오류', error);

    // 오류 유형별 사용자 친화적 메시지 변환
    if (isQuotaExceededError(error)) {
      yield { type: 'error', error: 'AI 서비스 사용량이 초과되었습니다. 관리자에게 문의하세요.' };
    } else if (isRateLimitError(error)) {
      yield { type: 'error', error: '현재 요청이 많아 처리가 지연되고 있습니다. 잠시 후 다시 시도해주세요.' };
    } else {
      yield { type: 'error', error: error.message };
    }
  }
}

/**
 * 비스트리밍 채팅 응답 (테스트용)
 * @param {Array} messages - 대화 히스토리
 * @param {string} userId - 사용자 ID
 * @returns {Promise<Object>} 응답 객체
 */
async function getChatResponse(messages, userId) {
  let fullResponse = '';
  const events = [];

  for await (const event of streamChatResponse(messages, userId, null)) {
    events.push(event);
    if (event.type === 'content') {
      fullResponse += event.content;
    }
  }

  return {
    content: fullResponse,
    events
  };
}

module.exports = {
  streamChatResponse,
  getChatResponse,
  getMCPToolsAsOpenAIFunctions,
  callMCPTool,
  SYSTEM_PROMPT
};

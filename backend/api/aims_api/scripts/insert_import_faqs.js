/**
 * FAQ 일괄 삽입 스크립트 - 고객·계약 일괄등록 (import 카테고리)
 * P(민수) 제작 → V(정은) 검증 완료
 */

const now = new Date();

const faqs = [
  // === 고객·계약 일괄등록 FAQ (15개) ===
  {
    question: "고객·계약 일괄등록이란 무엇인가요?",
    answer: "고객·계약 일괄등록은 엑셀 파일 하나로 여러 고객과 계약 정보를 한 번에 등록하는 기능입니다.\n\n왼쪽 메뉴에서 '고객·계약 일괄등록'을 클릭하면 사용할 수 있습니다. 엑셀 파일에는 '개인고객', '법인고객', '계약' 세 개의 시트가 있으며, 필요한 시트만 작성하면 됩니다.",
    category: "import",
    order: 1,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "엑셀 템플릿은 어디서 다운로드하나요?",
    answer: "고객·계약 일괄등록 페이지 상단의 '템플릿 다운로드' 버튼을 클릭하면 됩니다.\n\n다운로드된 엑셀 파일에는 '개인고객', '법인고객', '계약' 세 개의 시트가 포함되어 있고, 각 시트의 첫 번째 행에 입력 안내가 있습니다.",
    category: "import",
    order: 2,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "엑셀 파일에 어떤 시트가 필요한가요?",
    answer: "엑셀 파일은 세 개의 시트로 구성됩니다:\n\n• 개인고객 시트: 개인 고객 정보 입력\n• 법인고객 시트: 법인 고객 정보 입력\n• 계약 시트: 계약 정보 입력\n\n모든 시트를 채울 필요는 없습니다. 예를 들어, 개인 고객만 등록하려면 개인고객 시트만 작성하면 됩니다.",
    category: "import",
    order: 3,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "개인고객 시트의 필수 필드는 무엇인가요?",
    answer: "개인고객 시트의 필수 필드는 '고객명' 하나뿐입니다.\n\n선택 필드로는 생년월일, 휴대폰, 이메일, 주소, 메모가 있습니다. 생년월일은 'YYYY-MM-DD' 또는 'YYYYMMDD' 형식으로 입력하세요.",
    category: "import",
    order: 4,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "법인고객 시트의 필수 필드는 무엇인가요?",
    answer: "법인고객 시트의 필수 필드는 '법인명' 하나뿐입니다.\n\n선택 필드로는 사업자등록번호, 대표자명, 전화번호, 이메일, 주소, 메모가 있습니다. 사업자등록번호는 하이픈 없이 10자리로 입력하세요.",
    category: "import",
    order: 5,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "계약 시트의 필수 필드는 무엇인가요?",
    answer: "계약 시트의 필수 필드는 다음 네 가지입니다:\n\n• 고객명(또는 법인명): 등록된 고객과 연결\n• 증권번호: 계약 고유 식별자\n• 보험상품명: 상품 데이터베이스와 매칭\n• 계약일자: 'YYYY-MM-DD' 또는 'YYYYMMDD' 형식\n\n선택 필드로는 계약상태, 피보험자, 수익자, 월보험료, 메모가 있습니다.",
    category: "import",
    order: 6,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "상품명 매칭 색상의 의미는 무엇인가요?",
    answer: "상품명 입력 시 색상으로 매칭 상태를 알려드립니다:\n\n• 녹색: 상품 데이터베이스와 정확히 일치\n• 노란색: 유사한 상품이 있음 (확인 필요)\n• 빨간색: 매칭되는 상품이 없음\n\n노란색이나 빨간색인 경우, 상품명을 수정하거나 드롭다운에서 올바른 상품을 선택해 주세요.",
    category: "import",
    order: 7,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "상품명이 매칭되지 않으면 어떻게 하나요?",
    answer: "상품명이 빨간색으로 표시되면 데이터베이스에 해당 상품이 없다는 의미입니다.\n\n해결 방법:\n1. 상품명 셀을 클릭하면 유사한 상품 목록이 표시됩니다\n2. 목록에서 올바른 상품을 선택하세요\n3. 목록에도 없다면, 정확한 상품명으로 수정하세요\n\n상품명은 보험사에서 공식적으로 사용하는 이름과 일치해야 합니다.",
    category: "import",
    order: 8,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "동명이인이 있을 때 어떻게 처리하나요?",
    answer: "AIMS에서는 같은 설계사 내에서 고객명 중복을 허용하지 않습니다.\n\n동명이인 고객을 구분하려면 이름 뒤에 식별자를 추가하세요:\n• 예: '홍길동(강남)', '홍길동(서초)'\n• 예: '김철수A', '김철수B'\n\n이미 등록된 고객과 이름이 같으면 오류가 발생합니다.",
    category: "import",
    order: 9,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "증권번호가 중복되면 어떻게 되나요?",
    answer: "증권번호는 계약의 고유 식별자이므로 중복이 허용되지 않습니다.\n\n엑셀 파일 내에서 또는 이미 등록된 계약과 증권번호가 중복되면 해당 행이 오류로 표시됩니다. 정확한 증권번호를 확인하여 수정해 주세요.",
    category: "import",
    order: 10,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "날짜 형식은 어떻게 입력하나요?",
    answer: "날짜는 다음 형식 중 하나로 입력할 수 있습니다:\n\n• YYYY-MM-DD (예: 2024-03-15)\n• YYYYMMDD (예: 20240315)\n• YYYY/MM/DD (예: 2024/03/15)\n• YYYY.MM.DD (예: 2024.03.15)\n\n엑셀의 날짜 서식을 사용해도 자동으로 인식됩니다.",
    category: "import",
    order: 11,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "기존 고객과 이름이 같으면 어떻게 되나요?",
    answer: "이미 등록된 고객과 이름이 완전히 일치하면 새로 등록되지 않고 기존 고객에 계약이 연결됩니다.\n\n새로운 고객으로 등록하려면 이름을 다르게 입력해야 합니다. 예를 들어 '홍길동(신규)' 처럼 식별자를 추가하세요.",
    category: "import",
    order: 12,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "일괄등록 중 오류가 발생하면 어떻게 하나요?",
    answer: "일괄등록 시 오류가 발생한 행은 빨간색으로 표시되며, 오류 내용이 함께 안내됩니다.\n\n처리 방법:\n1. 오류 행의 내용을 확인하고 수정하세요\n2. 수정 후 다시 '등록' 버튼을 클릭하세요\n3. 오류 없는 행은 정상적으로 등록됩니다\n\n자주 발생하는 오류: 필수 필드 누락, 고객명 중복, 증권번호 중복, 상품명 불일치",
    category: "import",
    order: 13,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "한 번에 몇 건까지 등록할 수 있나요?",
    answer: "권장 기준:\n• 고객: 시트당 최대 500명\n• 계약: 시트당 최대 1,000건\n\n이보다 많은 데이터는 여러 번에 나누어 등록하는 것을 권장합니다. 대량 데이터를 한 번에 처리하면 시간이 오래 걸리거나 브라우저가 느려질 수 있습니다.",
    category: "import",
    order: 14,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "일괄등록 후 결과는 어디서 확인하나요?",
    answer: "일괄등록 완료 후 결과 요약이 화면에 표시됩니다:\n\n• 성공: 정상 등록된 고객/계약 수\n• 실패: 오류로 등록되지 않은 행 수\n• 건너뜀: 중복 등으로 처리되지 않은 행 수\n\n등록된 고객은 '전체 고객' 메뉴에서, 계약은 '전체 계약' 메뉴에서 확인할 수 있습니다.",
    category: "import",
    order: 15,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  }
];

// MongoDB 연결 및 삽입
db = db.getSiblingDB('docupload');

// 기존 import 카테고리 FAQ 삭제 (재실행 대비)
const deleteResult = db.faqs.deleteMany({ category: 'import' });
print('기존 import FAQ 삭제: ' + deleteResult.deletedCount + '건');

// 새 FAQ 삽입
const insertResult = db.faqs.insertMany(faqs);
print('새 import FAQ 삽입: ' + insertResult.insertedIds.length + '건');

// 결과 확인
const count = db.faqs.countDocuments({ category: 'import' });
print('현재 import FAQ 총 개수: ' + count);

/**
 * FAQ 일괄 삽입 스크립트 - 문서 일괄등록 (import 카테고리)
 * P(민수) 제작 → V(정은) 검증 완료
 */

const now = new Date();

const faqs = [
  // === 문서 일괄등록 FAQ (15개) ===
  {
    question: "문서 일괄등록이란 무엇인가요?",
    answer: "문서 일괄등록은 여러 고객의 문서를 폴더 단위로 한 번에 업로드하는 기능입니다.\n\n폴더명을 고객명으로 설정하면, 해당 폴더 안의 모든 파일이 해당 고객에게 자동으로 연결됩니다. 예를 들어 '홍길동' 폴더에 있는 파일들은 홍길동 고객의 문서로 등록됩니다.",
    category: "import",
    order: 16,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "폴더를 어떻게 업로드하나요?",
    answer: "두 가지 방법이 있습니다:\n\n1. 드래그 앤 드롭: 파일 탐색기에서 폴더를 끌어와 업로드 영역에 놓기\n2. 폴더 선택: '폴더 선택' 버튼을 클릭하여 폴더 지정\n\n한 번에 여러 폴더를 선택하거나 드래그할 수 있습니다.",
    category: "import",
    order: 17,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "폴더명과 고객명 매칭은 어떻게 되나요?",
    answer: "폴더명이 등록된 고객명과 일치하면 자동으로 매칭됩니다.\n\n• 정확히 일치: 자동 연결됨\n• 일치하지 않음: 'X' 표시되며, 드롭다운에서 고객을 수동 선택해야 함\n\n예: '홍길동' 폴더 → 홍길동 고객 자동 매칭\n예: '홍길동님자료' 폴더 → 매칭 실패, 수동 선택 필요",
    category: "import",
    order: 18,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "매칭되지 않은 폴더는 어떻게 하나요?",
    answer: "'X' 표시가 있는 폴더는 매칭 실패를 의미합니다.\n\n해결 방법:\n1. 폴더 옆의 드롭다운을 클릭\n2. 연결할 고객을 검색하거나 선택\n3. 고객을 선택하면 매칭 완료\n\n또는 폴더명을 고객명과 정확히 일치하도록 미리 수정해 두세요.",
    category: "import",
    order: 19,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "지원되는 파일 형식은 무엇인가요?",
    answer: "대부분의 문서 형식을 지원합니다:\n\n• 문서: PDF, DOC, DOCX, HWP, TXT\n• 이미지: JPG, JPEG, PNG, GIF, BMP\n• 스프레드시트: XLS, XLSX\n• 기타: ZIP (압축 파일)\n\n실행 파일(.exe, .bat 등)은 보안상 업로드가 차단됩니다.",
    category: "import",
    order: 20,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "파일 크기 제한이 있나요?",
    answer: "네, 파일별 크기 제한이 있습니다:\n\n• 단일 파일 최대: 100MB\n• 배치 업로드 총 크기: 등급별 상이\n\n100MB를 초과하는 파일은 자동으로 제외됩니다. 대용량 파일은 압축하거나 분할하여 업로드하세요.",
    category: "import",
    order: 21,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "저장 용량 한도는 얼마인가요?",
    answer: "사용자 등급에 따라 저장 용량이 다릅니다:\n\n• 일반 등급: 기본 용량 제공\n• 프리미엄 등급: 대용량 제공\n\n현재 사용량은 화면 상단에서 확인할 수 있습니다. 용량이 부족하면 기존 불필요한 문서를 삭제하거나 등급을 업그레이드하세요.",
    category: "import",
    order: 22,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "중복 파일은 어떻게 처리하나요?",
    answer: "같은 고객에게 같은 파일명의 문서가 이미 있으면 중복 확인 창이 나타납니다.\n\n선택 옵션:\n• 덮어쓰기: 기존 파일을 새 파일로 교체\n• 건너뛰기: 해당 파일을 업로드하지 않음\n• 모두 덮어쓰기: 이후 모든 중복 파일 덮어쓰기\n• 모두 건너뛰기: 이후 모든 중복 파일 건너뛰기",
    category: "import",
    order: 23,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "업로드 중 실패한 파일은 어떻게 하나요?",
    answer: "업로드 완료 후 실패한 파일 목록이 표시됩니다.\n\n• '실패 파일 재시도' 버튼을 클릭하면 실패한 파일만 다시 업로드됩니다\n• 네트워크 문제로 실패했다면 재시도로 해결되는 경우가 많습니다\n• 파일 자체에 문제가 있다면 파일을 확인 후 개별 업로드하세요",
    category: "import",
    order: 24,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "동시에 여러 폴더를 업로드할 수 있나요?",
    answer: "네, 가능합니다.\n\n방법 1: 여러 폴더를 한 번에 드래그 앤 드롭\n방법 2: 상위 폴더를 선택하면 모든 하위 폴더가 함께 처리됨\n\n각 폴더는 폴더명에 해당하는 고객에게 연결됩니다. 미리보기에서 모든 폴더-고객 매칭을 확인할 수 있습니다.",
    category: "import",
    order: 25,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "업로드 진행률은 어디서 확인하나요?",
    answer: "업로드가 시작되면 진행률 화면이 자동으로 표시됩니다.\n\n표시 정보:\n• 전체 진행률 (퍼센트)\n• 현재 업로드 중인 파일명\n• 완료/전체 파일 수\n• 예상 남은 시간\n\n업로드 중에도 일시정지나 취소가 가능합니다.",
    category: "import",
    order: 26,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "업로드를 중간에 취소할 수 있나요?",
    answer: "네, '취소' 버튼을 클릭하면 업로드가 중단됩니다.\n\n• 이미 업로드된 파일은 유지됩니다\n• 아직 업로드되지 않은 파일은 처리되지 않습니다\n• 업로드 요약에서 성공/취소된 파일 수를 확인할 수 있습니다",
    category: "import",
    order: 27,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "하위 폴더의 파일도 업로드되나요?",
    answer: "네, 하위 폴더의 파일도 함께 업로드됩니다.\n\n예시 구조:\n• 홍길동/\n  • 보험증권.pdf\n  • 2024년/\n    • 청구서.pdf\n\n→ '보험증권.pdf'와 '청구서.pdf' 모두 홍길동 고객에게 등록됩니다.\n\n단, 하위 폴더명으로는 고객 매칭이 되지 않습니다. 최상위 폴더명만 고객명으로 인식됩니다.",
    category: "import",
    order: 28,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "업로드 완료 후 결과 확인은 어떻게 하나요?",
    answer: "업로드가 완료되면 요약 화면이 표시됩니다:\n\n• 성공: 정상 업로드된 파일 수\n• 실패: 업로드 실패한 파일 수\n• 건너뜀: 중복 등으로 건너뛴 파일 수\n\n'완료' 버튼을 누르면 처음 화면으로 돌아가고, '문서 보기' 버튼을 누르면 전체 문서 목록에서 업로드된 문서를 확인할 수 있습니다.",
    category: "import",
    order: 29,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "업로드한 문서는 어디서 확인하나요?",
    answer: "왼쪽 메뉴의 '전체 문서'에서 확인할 수 있습니다.\n\n• 최근 등록순으로 정렬하면 방금 업로드한 문서가 상단에 표시됩니다\n• 고객명으로 검색하면 특정 고객의 문서만 볼 수 있습니다\n• 상세 문서 검색에서 파일명이나 내용으로도 검색 가능합니다",
    category: "import",
    order: 30,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  }
];

// MongoDB 연결 및 삽입
db = db.getSiblingDB('docupload');

// 기존 문서 일괄등록 FAQ 삭제 (order 16-30)
const deleteResult = db.faqs.deleteMany({ category: 'import', order: { $gte: 16, $lte: 30 } });
print('기존 문서 일괄등록 FAQ 삭제: ' + deleteResult.deletedCount + '건');

// 새 FAQ 삽입
const insertResult = db.faqs.insertMany(faqs);
print('새 문서 일괄등록 FAQ 삽입: ' + insertResult.insertedIds.length + '건');

// 결과 확인
const count = db.faqs.countDocuments({ category: 'import' });
print('현재 import FAQ 총 개수: ' + count);

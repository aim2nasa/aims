/**
 * FAQ 일괄 삽입 스크립트 - 문서 관리 (document 카테고리)
 * P(민수) 제작 → V(정은) 검증 완료
 */

const now = new Date();

const faqs = [
  // === 문서 관리 FAQ (15개) ===
  {
    question: "새 문서를 어떻게 등록하나요?",
    answer: "문서를 등록하는 방법은 여러 가지가 있습니다:\n\n1. 전체 문서 → '+' 버튼 클릭 → 파일 선택\n2. 고객 상세 → 문서 탭 → '문서 추가'\n3. 문서 일괄등록 → 폴더 드래그\n\n개별 문서 등록 시 고객을 선택하면 해당 고객에 연결됩니다.",
    category: "document",
    order: 1,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "'전체 문서'와 '상세 문서 검색'의 차이는 무엇인가요?",
    answer: "두 메뉴는 문서를 찾는 방식이 다릅니다:\n\n[전체 문서]\n• 등록된 모든 문서 목록 표시\n• 파일명, 고객명으로 필터링\n• 빠른 목록 탐색에 적합\n\n[상세 문서 검색]\n• AI 기반 시맨틱 검색\n• 문서 내용까지 검색 가능\n• 자연어로 검색 가능 (예: '암보험 관련')",
    category: "document",
    order: 2,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "문서를 특정 고객에 연결하려면 어떻게 하나요?",
    answer: "문서 등록 시 또는 수정 시 고객을 지정합니다:\n\n[등록 시]\n• 파일 업로드 화면에서 고객 선택\n\n[기존 문서]\n• 문서 클릭 → 상세 정보\n• '수정' → 고객 선택/변경\n• '저장'\n\n문서 일괄등록을 사용하면 폴더명으로 고객이 자동 연결됩니다.",
    category: "document",
    order: 3,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "문서 미리보기는 어떻게 하나요?",
    answer: "문서를 클릭하면 오른쪽에 미리보기가 표시됩니다.\n\n지원 형식:\n• PDF: 페이지별 미리보기\n• 이미지(JPG, PNG 등): 이미지 표시\n• 기타: 파일 정보 및 다운로드 버튼\n\n더 크게 보려면 미리보기 영역 상단의 '전체 화면' 버튼을 클릭하세요.",
    category: "document",
    order: 4,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "문서를 다운로드하려면 어떻게 하나요?",
    answer: "문서 미리보기 화면에서 다운로드합니다:\n\n1. 문서 클릭 → 미리보기 표시\n2. 미리보기 상단의 '다운로드' 아이콘 클릭\n3. 파일이 컴퓨터에 저장됨\n\n또는 문서를 우클릭하여 '다운로드' 메뉴를 선택할 수 있습니다.",
    category: "document",
    order: 5,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "문서를 삭제하면 복구할 수 있나요?",
    answer: "아니요, 삭제된 문서는 복구할 수 없습니다.\n\n삭제 전 주의사항:\n• 삭제 확인 메시지에서 '삭제'를 클릭해야 완료\n• 중요한 문서는 먼저 다운로드해 두세요\n• 고객을 삭제하면 연결된 문서도 함께 삭제됩니다",
    category: "document",
    order: 6,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "상세 문서 검색(AI 검색)은 어떻게 작동하나요?",
    answer: "AI가 문서 내용을 분석하여 의미 기반으로 검색합니다:\n\n• 파일명뿐 아니라 PDF 내 텍스트도 검색\n• 자연어로 질문하듯 검색 가능\n• 유사한 의미의 문서도 찾아줌\n\n예시 검색어:\n• '암보험 증권'\n• '2024년 갱신 계약서'\n• '홍길동님 청구 서류'",
    category: "document",
    order: 7,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "문서에 메모를 추가할 수 있나요?",
    answer: "네, 문서별로 메모를 작성할 수 있습니다:\n\n1. 문서 클릭 → 상세 정보\n2. '메모' 입력란에 내용 작성\n3. 자동 저장 또는 '저장' 클릭\n\n메모는 문서에 대한 설명이나 특이사항을 기록하는 데 유용합니다.",
    category: "document",
    order: 8,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "문서 목록을 정렬하려면 어떻게 하나요?",
    answer: "테이블 헤더(열 제목)를 클릭하면 정렬됩니다:\n\n정렬 가능 필드:\n• 파일명\n• 고객명\n• 파일 크기\n• 등록일\n• 수정일\n\n같은 열을 다시 클릭하면 오름차순/내림차순이 전환됩니다.",
    category: "document",
    order: 9,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "문서 파일명을 변경할 수 있나요?",
    answer: "문서 상세 화면에서 파일명을 변경할 수 있습니다:\n\n1. 문서 클릭 → 상세 정보\n2. '수정' 버튼 클릭\n3. 파일명(표시 이름) 수정\n4. '저장' 클릭\n\n참고: 실제 저장된 파일의 원본 이름은 변경되지 않고, AIMS에서 표시되는 이름만 변경됩니다.",
    category: "document",
    order: 10,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "한 문서를 여러 고객에 연결할 수 있나요?",
    answer: "아니요, 하나의 문서는 하나의 고객에만 연결됩니다.\n\n여러 고객에게 같은 문서가 필요하다면:\n• 같은 파일을 각 고객에게 개별 업로드\n• 또는 문서 일괄등록으로 여러 고객 폴더에 복사\n\n문서-고객 관계는 1:1입니다.",
    category: "document",
    order: 11,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "지원되지 않는 파일 형식은 무엇인가요?",
    answer: "보안상 다음 파일은 업로드가 차단됩니다:\n\n• 실행 파일: .exe, .bat, .cmd, .sh\n• 스크립트: .js, .vbs, .ps1\n• 시스템 파일: .dll, .sys\n\n일반적인 문서(PDF, 이미지, 오피스 문서)는 모두 지원됩니다.",
    category: "document",
    order: 12,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "문서 저장 용량은 어떻게 확인하나요?",
    answer: "화면 상단 또는 설정에서 현재 사용량을 확인할 수 있습니다:\n\n• 사용 중인 용량 (MB/GB)\n• 전체 할당 용량\n• 남은 용량\n\n용량이 부족하면 불필요한 문서를 삭제하거나 등급을 업그레이드하세요.",
    category: "document",
    order: 13,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "여러 문서를 한 번에 삭제할 수 있나요?",
    answer: "네, 삭제 모드를 사용하면 됩니다:\n\n1. '삭제 모드' 버튼 클릭\n2. 삭제할 문서 체크박스 선택\n3. '선택 삭제' 버튼 클릭\n4. 확인 후 삭제 완료\n\n삭제된 문서는 복구할 수 없으므로 신중하게 선택하세요.",
    category: "document",
    order: 14,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "문서 업로드 중 오류가 발생하면 어떻게 하나요?",
    answer: "업로드 오류의 일반적인 원인과 해결법:\n\n• 파일 크기 초과: 100MB 이하로 분할 또는 압축\n• 용량 부족: 기존 문서 삭제 후 재시도\n• 네트워크 오류: 인터넷 연결 확인 후 재시도\n• 차단된 형식: 지원되는 형식으로 변환\n\n문제가 지속되면 1:1 문의로 알려주세요.",
    category: "document",
    order: 15,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  }
];

// MongoDB 연결 및 삽입
db = db.getSiblingDB('docupload');

// 기존 document FAQ 삭제 (재실행 대비)
const deleteResult = db.faqs.deleteMany({ category: 'document' });
print('기존 document FAQ 삭제: ' + deleteResult.deletedCount + '건');

// 새 FAQ 삽입
const insertResult = db.faqs.insertMany(faqs);
print('새 document FAQ 삽입: ' + insertResult.insertedIds.length + '건');

// 결과 확인
const count = db.faqs.countDocuments({ category: 'document' });
print('현재 document FAQ 총 개수: ' + count);

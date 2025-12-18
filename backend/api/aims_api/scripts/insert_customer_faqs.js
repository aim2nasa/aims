/**
 * FAQ 일괄 삽입 스크립트 - 고객 관리 (customer 카테고리)
 * P(민수) 제작 → V(정은) 검증 완료
 */

const now = new Date();

const faqs = [
  // === 고객 관리 FAQ (15개) ===
  {
    question: "새 고객을 어떻게 등록하나요?",
    answer: "왼쪽 메뉴의 '전체 고객'에서 '+' 버튼을 클릭하거나, 상단의 '고객 등록' 버튼을 클릭합니다.\n\n등록 과정:\n1. 고객 유형 선택 (개인/법인)\n2. 필수 정보 입력 (이름 또는 법인명)\n3. 선택 정보 입력 (연락처, 주소 등)\n4. '저장' 버튼 클릭\n\n고객명은 같은 설계사 내에서 중복될 수 없습니다.",
    category: "customer",
    order: 1,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "개인 고객과 법인 고객의 차이는 무엇인가요?",
    answer: "개인 고객과 법인 고객은 입력 필드가 다릅니다:\n\n[개인 고객]\n• 고객명, 생년월일, 성별\n• 휴대폰, 이메일, 주소\n\n[법인 고객]\n• 법인명, 사업자등록번호\n• 대표자명, 전화번호, 이메일, 주소\n\n개인과 법인 모두 문서와 계약을 연결할 수 있습니다.",
    category: "customer",
    order: 2,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "고객 정보를 수정하려면 어떻게 하나요?",
    answer: "고객 목록에서 수정할 고객을 클릭합니다.\n\n수정 방법:\n1. 고객 클릭 → 상세 정보 표시\n2. '수정' 버튼 클릭\n3. 정보 수정\n4. '저장' 버튼 클릭\n\n또는 고객을 우클릭하여 '수정' 메뉴를 선택할 수도 있습니다.",
    category: "customer",
    order: 3,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "고객을 삭제하면 문서와 계약도 삭제되나요?",
    answer: "고객 삭제 시 해당 고객에 연결된 모든 문서와 계약이 함께 삭제됩니다.\n\n주의사항:\n• 삭제 전 확인 메시지가 표시됩니다\n• 삭제된 데이터는 복구할 수 없습니다\n• 중요한 문서가 있다면 먼저 백업하세요\n\n잘못 삭제하지 않도록 신중하게 확인해 주세요.",
    category: "customer",
    order: 4,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "고객 목록에서 검색하려면 어떻게 하나요?",
    answer: "화면 상단의 검색창에 검색어를 입력합니다.\n\n검색 대상:\n• 고객명 (개인/법인)\n• 연락처 (휴대폰, 전화번호)\n• 이메일\n\n검색어를 입력하면 실시간으로 결과가 필터링됩니다.",
    category: "customer",
    order: 5,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "'전체 고객'과 '지역별 고객'의 차이는 무엇인가요?",
    answer: "같은 고객 데이터를 다른 방식으로 보여줍니다:\n\n• 전체 고객: 모든 고객을 목록으로 표시\n• 지역별 고객: 주소 기준으로 지역별 그룹화\n\n지역별 보기에서는 특정 지역의 고객만 빠르게 확인할 수 있습니다.",
    category: "customer",
    order: 6,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "'관계별 고객' 뷰는 무엇인가요?",
    answer: "고객을 관계 유형별로 분류하여 보여주는 뷰입니다.\n\n관계 유형 예시:\n• 가족, 친구, 지인\n• 회사 동료, 소개 고객\n• 기타\n\n고객 등록/수정 시 관계 유형을 지정하면 관계별 고객 뷰에서 해당 분류로 확인할 수 있습니다.",
    category: "customer",
    order: 7,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "고객 목록 정렬은 어떻게 하나요?",
    answer: "테이블 헤더(열 제목)를 클릭하면 해당 열로 정렬됩니다.\n\n정렬 가능 필드:\n• 이름, 연락처, 주소\n• 고객 유형 (개인/법인)\n• 상태 (활성/휴면)\n• 등록일\n\n같은 열을 다시 클릭하면 오름차순/내림차순이 전환됩니다.",
    category: "customer",
    order: 8,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "고객 상태(활성/휴면)는 무엇인가요?",
    answer: "고객의 현재 관리 상태를 나타냅니다:\n\n• 활성: 현재 관리 중인 고객\n• 휴면: 일시적으로 관리에서 제외된 고객\n\n휴면 고객은 목록에서 기본적으로 숨겨지지만, 필터를 '전체'로 설정하면 볼 수 있습니다. 휴면 상태는 언제든 활성으로 변경할 수 있습니다.",
    category: "customer",
    order: 9,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "고객을 휴면으로 변경하려면 어떻게 하나요?",
    answer: "고객 상세 화면에서 상태를 변경할 수 있습니다:\n\n1. 고객 클릭 → 상세 정보\n2. '수정' 버튼 클릭\n3. 상태를 '휴면'으로 변경\n4. '저장' 버튼 클릭\n\n휴면 고객은 '전체 고객' 목록에서 필터를 '휴면'으로 설정해야 표시됩니다.",
    category: "customer",
    order: 10,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "같은 이름의 고객을 등록할 수 있나요?",
    answer: "아니요, 같은 설계사 내에서 고객명 중복은 허용되지 않습니다.\n\n동명이인 처리 방법:\n• 이름 뒤에 식별자 추가: '홍길동(강남)', '홍길동(서초)'\n• 또는 구분 기호 사용: '홍길동A', '홍길동B'\n\n개인/법인 구분 없이, 이름이 같으면 중복으로 처리됩니다.",
    category: "customer",
    order: 11,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "고객 상세 정보에서 문서를 확인할 수 있나요?",
    answer: "네, 고객 상세 화면에서 해당 고객의 문서 목록을 확인할 수 있습니다.\n\n확인 방법:\n1. 전체 고객에서 고객 클릭\n2. 상세 정보에서 '문서' 탭 클릭\n3. 해당 고객에 연결된 문서 목록 표시\n\n문서를 클릭하면 오른쪽에 미리보기가 표시됩니다.",
    category: "customer",
    order: 12,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "고객에게 메모를 추가할 수 있나요?",
    answer: "네, 고객별로 메모를 작성할 수 있습니다.\n\n메모 작성 방법:\n1. 고객 상세 화면 열기\n2. '메모' 입력란에 내용 작성\n3. 저장 버튼 클릭\n\n메모는 고객 관리에 필요한 특이사항이나 기억할 내용을 기록하는 용도입니다.",
    category: "customer",
    order: 13,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "고객 목록을 엑셀로 내보낼 수 있나요?",
    answer: "현재 고객 목록을 직접 엑셀로 내보내는 기능은 제공되지 않습니다.\n\n대안:\n• 브라우저의 인쇄 기능(Ctrl+P)으로 PDF 저장\n• 필요한 정보를 복사하여 엑셀에 붙여넣기\n\n추후 내보내기 기능 추가가 검토 중입니다.",
    category: "customer",
    order: 14,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "여러 고객을 한 번에 삭제할 수 있나요?",
    answer: "네, 삭제 모드를 사용하면 됩니다.\n\n삭제 방법:\n1. '삭제 모드' 버튼 클릭\n2. 삭제할 고객 체크박스 선택 (여러 개 가능)\n3. '선택 삭제' 버튼 클릭\n4. 확인 후 삭제 완료\n\n삭제된 고객과 연결된 문서, 계약은 모두 함께 삭제되므로 신중하게 진행하세요.",
    category: "customer",
    order: 15,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  }
];

// MongoDB 연결 및 삽입
db = db.getSiblingDB('docupload');

// 기존 customer FAQ 삭제 (재실행 대비)
const deleteResult = db.faqs.deleteMany({ category: 'customer' });
print('기존 customer FAQ 삭제: ' + deleteResult.deletedCount + '건');

// 새 FAQ 삽입
const insertResult = db.faqs.insertMany(faqs);
print('새 customer FAQ 삽입: ' + insertResult.insertedIds.length + '건');

// 결과 확인
const count = db.faqs.countDocuments({ category: 'customer' });
print('현재 customer FAQ 총 개수: ' + count);

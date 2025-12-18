/**
 * FAQ 일괄 삽입 스크립트 - 일반 (general 카테고리)
 * P(민수) 제작 → V(정은) 검증 완료
 * 2025-12-19: AIMS 용어 제거 (서비스명 미정)
 */

const now = new Date();

const faqs = [
  // === 일반 FAQ (13개) - AIMS 자체 설명 FAQ 제외 ===
  {
    question: "지원되는 웹 브라우저는 무엇인가요?",
    answer: "최신 버전의 다음 브라우저를 권장합니다:\n\n• Google Chrome (권장)\n• Microsoft Edge\n• Safari (Mac)\n• Firefox\n\nInternet Explorer는 지원하지 않습니다. 최적의 성능을 위해 Chrome 최신 버전을 사용해 주세요.",
    category: "general",
    order: 1,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "모바일에서도 사용할 수 있나요?",
    answer: "본 서비스는 데스크톱 환경에 최적화되어 있습니다.\n\n태블릿이나 스마트폰에서도 접속은 가능하지만, 문서 업로드나 상세 작업은 데스크톱 환경을 권장합니다.\n\n향후 모바일 앱 지원을 계획하고 있습니다.",
    category: "general",
    order: 2,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "왼쪽 메뉴 구성은 어떻게 되나요?",
    answer: "왼쪽 메뉴는 다음과 같이 구성되어 있습니다:\n\n[고객 관리]\n• 전체 고객: 모든 고객 목록\n• 지역별 고객: 지역으로 분류\n• 관계별 고객: 관계로 분류\n\n[문서 관리]\n• 전체 문서: 모든 문서 목록\n• 상세 문서 검색: AI 검색 기능\n\n[계약 관리]\n• 전체 계약: 모든 계약 목록\n\n[일괄 등록]\n• 고객·계약 일괄등록: 엑셀로 등록\n• 문서 일괄등록: 폴더로 등록\n\n[기타]\n• 공지사항, 사용 가이드, FAQ, 1:1 문의",
    category: "general",
    order: 3,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "데이터는 안전하게 보관되나요?",
    answer: "네, 다음과 같은 보안 조치가 적용됩니다:\n\n• SSL/TLS 암호화 통신\n• 사용자별 독립된 데이터 공간\n• 정기적인 데이터 백업\n• 접근 권한 관리\n\n다른 설계사의 고객이나 문서에는 접근할 수 없습니다.",
    category: "general",
    order: 4,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "데이터 백업은 어떻게 되나요?",
    answer: "서버에서 자동으로 백업됩니다:\n\n• 매일 정기 백업 수행\n• 문제 발생 시 복구 가능\n\n중요한 문서는 개인적으로도 별도 보관하시는 것을 권장합니다.",
    category: "general",
    order: 5,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "'설계사'란 무엇을 의미하나요?",
    answer: "본 시스템에서 '설계사'는 시스템을 사용하는 보험 영업인(사용자)을 의미합니다.\n\n• 하나의 설계사 계정에 여러 고객을 등록\n• 각 고객에 문서와 계약을 연결\n• 설계사별로 독립된 데이터 공간 제공\n\n즉, 설계사 = 사용자 = 계정 소유자입니다.",
    category: "general",
    order: 6,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "'고객'과 '계약자'의 차이는 무엇인가요?",
    answer: "본 시스템에서 '고객'과 '계약자'는 같은 의미입니다.\n\n• 고객 = 설계사가 관리하는 사람 또는 법인\n• 계약자 = 보험 계약을 체결한 당사자\n\n문서나 계약은 모두 '고객'에 연결됩니다.",
    category: "general",
    order: 7,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "AI 검색 기능이란 무엇인가요?",
    answer: "'상세 문서 검색' 메뉴에서 AI 기반 시맨틱 검색을 사용할 수 있습니다.\n\n• 문서 내용을 분석하여 의미 기반 검색\n• 파일명뿐 아니라 PDF 내 텍스트도 검색\n• 자연어로 질문하듯 검색 가능\n\n예: '암보험 관련 문서', '2024년 갱신 계약서' 등",
    category: "general",
    order: 8,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "화면 구성은 어떻게 되어 있나요?",
    answer: "화면은 세 부분으로 구성됩니다:\n\n• 왼쪽(LeftPane): 메뉴 및 고객/문서 목록\n• 가운데(CenterPane): 선택한 항목의 상세 정보\n• 오른쪽(RightPane): 문서 미리보기, 편집 등\n\n왼쪽에서 항목을 클릭하면 가운데에 상세 정보가 표시됩니다.",
    category: "general",
    order: 9,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "새로 고침해도 작업이 유지되나요?",
    answer: "대부분의 작업은 새로 고침 후에도 유지됩니다:\n\n• 저장된 데이터: 고객, 문서, 계약 정보\n• 복원되는 상태: 현재 보고 있던 화면\n\n단, 저장하지 않은 작성 중인 내용은 사라질 수 있으니 중요한 변경사항은 반드시 저장해 주세요.",
    category: "general",
    order: 10,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "문의사항이 있으면 어떻게 하나요?",
    answer: "왼쪽 메뉴 하단의 '1:1 문의'를 이용해 주세요.\n\n• 문의 제목과 내용을 작성하여 제출\n• 관리자가 확인 후 답변\n• '내 문의 내역'에서 답변 확인 가능\n\n긴급한 문제는 상세히 설명해 주시면 빠른 처리에 도움이 됩니다.",
    category: "general",
    order: 11,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "공지사항은 어디서 확인하나요?",
    answer: "왼쪽 메뉴 하단의 '공지사항' 메뉴에서 확인할 수 있습니다.\n\n• 시스템 업데이트 안내\n• 서비스 점검 일정\n• 새로운 기능 소개\n\n중요한 공지는 로그인 시 팝업으로도 안내됩니다.",
    category: "general",
    order: 12,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "사용 가이드는 어디서 볼 수 있나요?",
    answer: "왼쪽 메뉴 하단의 '사용 가이드' 메뉴에서 확인할 수 있습니다.\n\n• 고객 관리 방법\n• 문서 등록 및 검색 방법\n• 계약 관리 방법\n\n각 기능별로 단계별 안내가 제공됩니다. 처음 사용하신다면 사용 가이드를 먼저 읽어보시는 것을 권장합니다.",
    category: "general",
    order: 13,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  }
];

// MongoDB 연결 및 삽입
db = db.getSiblingDB('docupload');

// 기존 general FAQ 삭제 (재실행 대비)
const deleteResult = db.faqs.deleteMany({ category: 'general' });
print('기존 general FAQ 삭제: ' + deleteResult.deletedCount + '건');

// 새 FAQ 삽입
const insertResult = db.faqs.insertMany(faqs);
print('새 general FAQ 삽입: ' + insertResult.insertedIds.length + '건');

// 결과 확인
const count = db.faqs.countDocuments({ category: 'general' });
print('현재 general FAQ 총 개수: ' + count);

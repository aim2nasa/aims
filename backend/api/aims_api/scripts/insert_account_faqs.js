/**
 * FAQ 일괄 삽입 스크립트 - 계정 설정 (account 카테고리)
 * P(민수) 제작 → V(정은) 검증 완료
 */

const now = new Date();

const faqs = [
  // === 계정 설정 FAQ (5개) ===
  {
    question: "비밀번호를 변경하려면 어떻게 하나요?",
    answer: "계정 설정에서 비밀번호를 변경합니다:\n\n1. 왼쪽 메뉴 하단의 프로필 영역 클릭\n2. '계정 설정' 또는 '비밀번호 변경' 선택\n3. 현재 비밀번호 입력\n4. 새 비밀번호 입력 및 확인\n5. '저장' 클릭\n\n보안을 위해 정기적인 비밀번호 변경을 권장합니다.",
    category: "account",
    order: 1,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "로그아웃은 어떻게 하나요?",
    answer: "왼쪽 메뉴 하단에서 로그아웃합니다:\n\n1. 프로필 영역 클릭\n2. '로그아웃' 버튼 클릭\n3. 로그인 화면으로 이동\n\n공용 컴퓨터나 다른 사람의 기기를 사용할 때는 반드시 로그아웃해 주세요.",
    category: "account",
    order: 2,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "내 계정 정보는 어디서 확인하나요?",
    answer: "왼쪽 메뉴 하단의 프로필 영역에서 확인합니다:\n\n표시 정보:\n• 이름 (설계사명)\n• 이메일\n• 등급 정보\n• 저장 용량 사용량\n\n프로필 영역을 클릭하면 상세 정보를 확인하고 설정을 변경할 수 있습니다.",
    category: "account",
    order: 3,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "비밀번호를 잊어버렸어요. 어떻게 하나요?",
    answer: "로그인 화면에서 비밀번호를 재설정합니다:\n\n1. 로그인 화면으로 이동\n2. '비밀번호 찾기' 링크 클릭\n3. 가입된 이메일 주소 입력\n4. 이메일로 전송된 재설정 링크 클릭\n5. 새 비밀번호 설정\n\n이메일이 도착하지 않으면 스팸 폴더를 확인하세요.",
    category: "account",
    order: 4,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "계정을 탈퇴하려면 어떻게 하나요?",
    answer: "계정 탈퇴는 1:1 문의를 통해 요청해 주세요.\n\n주의사항:\n• 탈퇴 시 모든 데이터(고객, 문서, 계약)가 삭제됩니다\n• 삭제된 데이터는 복구할 수 없습니다\n• 중요한 데이터는 탈퇴 전에 백업하세요\n\n1:1 문의에서 탈퇴 요청을 하시면 본인 확인 후 처리됩니다.",
    category: "account",
    order: 5,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  }
];

// MongoDB 연결 및 삽입
db = db.getSiblingDB('docupload');

// 기존 account FAQ 삭제 (재실행 대비)
const deleteResult = db.faqs.deleteMany({ category: 'account' });
print('기존 account FAQ 삭제: ' + deleteResult.deletedCount + '건');

// 새 FAQ 삽입
const insertResult = db.faqs.insertMany(faqs);
print('새 account FAQ 삽입: ' + insertResult.insertedIds.length + '건');

// 결과 확인
const count = db.faqs.countDocuments({ category: 'account' });
print('현재 account FAQ 총 개수: ' + count);

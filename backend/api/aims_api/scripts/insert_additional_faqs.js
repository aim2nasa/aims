/**
 * 추가 FAQ 일괄 삽입 스크립트
 * 누락된 모든 기능 커버
 * P(민수) 제작 → V(정은) 검증
 */

const now = new Date();

const faqs = [
  // ========================================
  // GENERAL - 1:1 문의 및 도움말 (10개)
  // ========================================
  {
    question: "1:1 문의는 어떻게 작성하나요?",
    answer: "왼쪽 메뉴 하단의 '1:1 문의'를 클릭합니다.\n\n작성 방법:\n1. '새 문의 작성' 버튼 클릭\n2. 문의 유형 선택 (버그 신고/기능 제안/사용 문의/기타)\n3. 제목과 내용 입력\n4. 필요시 파일 첨부\n5. '제출' 버튼 클릭\n\n문의 내용은 상세히 작성할수록 빠른 답변에 도움이 됩니다.",
    category: "general",
    order: 16,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "문의에 대한 답변은 어디서 확인하나요?",
    answer: "'1:1 문의' 메뉴에서 내 문의 목록을 확인할 수 있습니다.\n\n• 답변이 달리면 상태가 '답변 완료'로 변경됩니다\n• 문의를 클릭하면 대화 형식으로 답변을 확인할 수 있습니다\n• 추가 질문이 있으면 같은 문의에 메시지를 추가할 수 있습니다",
    category: "general",
    order: 17,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "문의에 파일을 첨부할 수 있나요?",
    answer: "네, 문의 작성 시 파일을 첨부할 수 있습니다.\n\n• 이미지 파일: JPG, PNG, GIF 등\n• 문서 파일: PDF, DOC 등\n• 최대 파일 크기: 10MB\n\n스크린샷이나 오류 화면을 첨부하면 문제 파악에 도움이 됩니다.",
    category: "general",
    order: 18,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "문의 상태의 종류는 무엇인가요?",
    answer: "문의는 다음 상태를 가집니다:\n\n• 대기: 관리자가 아직 확인하지 않음\n• 처리중: 관리자가 확인하고 처리 중\n• 해결: 문의가 해결됨\n• 종료: 문의가 최종 종료됨\n\n상태가 '해결'이 되어도 추가 질문이 있으면 메시지를 추가할 수 있습니다.",
    category: "general",
    order: 19,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "다크 모드로 변경할 수 있나요?",
    answer: "네, 화면 상단 또는 설정에서 테마를 변경할 수 있습니다.\n\n• 라이트 모드: 밝은 배경\n• 다크 모드: 어두운 배경\n\n다크 모드는 어두운 환경에서 눈의 피로를 줄여줍니다. 시스템 설정을 따르도록 할 수도 있습니다.",
    category: "general",
    order: 20,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "화면 레이아웃을 조정할 수 있나요?",
    answer: "네, 패널의 너비를 조정할 수 있습니다.\n\n• 패널 경계선을 드래그하여 너비 조절\n• 설정에서 기본 레이아웃 지정 가능\n\n가운데 패널과 오른쪽 미리보기 패널의 비율을 자유롭게 조정하세요.",
    category: "general",
    order: 21,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "데이터를 새로고침하려면 어떻게 하나요?",
    answer: "각 화면의 새로고침 버튼을 클릭하거나 브라우저의 새로고침(F5)을 사용합니다.\n\n• 목록 화면 상단에 새로고침 아이콘이 있습니다\n• 클릭하면 서버에서 최신 데이터를 다시 불러옵니다\n\n대부분의 데이터는 자동으로 갱신되지만, 다른 기기에서 변경한 내용은 새로고침이 필요할 수 있습니다.",
    category: "general",
    order: 22,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "빠른 작업 메뉴는 무엇인가요?",
    answer: "자주 사용하는 기능에 빠르게 접근할 수 있는 메뉴입니다.\n\n빠른 작업 항목:\n• 새 고객 등록\n• 새 문서 등록\n• 고객·계약 일괄등록\n• 문서 일괄등록\n\n왼쪽 메뉴 상단에 위치하며, 한 번의 클릭으로 해당 기능을 바로 사용할 수 있습니다.",
    category: "general",
    order: 23,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "통계 대시보드는 어디서 볼 수 있나요?",
    answer: "각 관리 화면에서 통계 정보를 확인할 수 있습니다:\n\n• 전체 고객: 총 고객 수, 개인/법인 비율\n• 전체 문서: 총 문서 수, 파일 유형 분포\n• 전체 계약: 총 계약 수, 상태별 분포\n\n화면 상단에 요약 카드 형태로 주요 통계가 표시됩니다.",
    category: "general",
    order: 24,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "키보드 단축키가 있나요?",
    answer: "일부 기능에서 키보드 단축키를 지원합니다:\n\n• Esc: 모달/팝업 닫기\n• Enter: 검색 실행, 폼 제출\n• Ctrl+F: 검색창 포커스 (일부 화면)\n\n마우스와 함께 키보드를 활용하면 더 빠르게 작업할 수 있습니다.",
    category: "general",
    order: 25,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },

  // ========================================
  // CUSTOMER - 고객 뷰 상세 (10개)
  // ========================================
  {
    question: "지역별 고객 보기는 어떻게 사용하나요?",
    answer: "왼쪽 메뉴의 '지역별 고객 보기'를 클릭합니다.\n\n• 시/도 → 시/군/구 순으로 트리 구조로 표시\n• 지역을 클릭하면 해당 지역 고객만 필터링\n• 고객 주소 기준으로 자동 분류됨\n\n특정 지역의 고객을 빠르게 찾을 때 유용합니다.",
    category: "customer",
    order: 16,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "관계별 고객 보기는 무엇인가요?",
    answer: "고객 간의 관계(가족, 지인 등)를 기준으로 분류하여 보여주는 뷰입니다.\n\n관계 유형:\n• 가족: 부모/자녀/배우자/형제자매\n• 지인: 친구/동료/소개\n• 법인: 대표/직원\n\n관계 트리를 통해 연관된 고객들을 한눈에 파악할 수 있습니다.",
    category: "customer",
    order: 17,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "고객 간 가족 관계를 어떻게 등록하나요?",
    answer: "관계별 고객 보기에서 가족 관계를 등록합니다:\n\n1. 기준 고객 선택\n2. '가족 추가' 버튼 클릭\n3. 관계 유형 선택 (부모/자녀/배우자/형제)\n4. 연결할 고객 선택 또는 새로 등록\n5. 저장\n\n가족 관계가 등록되면 트리 구조로 연결됩니다.",
    category: "customer",
    order: 18,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "고객 전체 보기(상세)는 무엇인가요?",
    answer: "고객의 모든 정보를 한 화면에서 확인하는 기능입니다.\n\n고객을 더블클릭하면 전체 보기가 열리며:\n• 기본 정보 탭: 연락처, 주소, 메모\n• 문서 탭: 연결된 문서 목록\n• 계약 탭: 계약 정보\n• 관계 탭: 가족/지인 관계\n\n한 화면에서 고객의 모든 정보를 관리할 수 있습니다.",
    category: "customer",
    order: 19,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "최근 조회한 고객을 빠르게 찾으려면?",
    answer: "검색창에서 최근 검색 기록을 활용합니다:\n\n• 검색창 클릭 시 최근 검색한 고객 목록 표시\n• 목록에서 클릭하면 바로 해당 고객으로 이동\n\n자주 조회하는 고객은 검색 없이 빠르게 접근할 수 있습니다.",
    category: "customer",
    order: 20,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "고객 선택 모달은 무엇인가요?",
    answer: "문서나 계약을 등록할 때 고객을 선택하는 팝업 창입니다.\n\n사용 방법:\n• 고객명 입력 시 자동 검색\n• 목록에서 고객 선택\n• 선택한 고객에 문서/계약이 연결됨\n\n새 고객도 모달에서 바로 등록할 수 있습니다.",
    category: "customer",
    order: 21,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "법인 고객의 직원을 등록할 수 있나요?",
    answer: "네, 법인 고객에 직원 관계를 등록할 수 있습니다.\n\n등록 방법:\n1. 관계별 고객 보기에서 법인 고객 선택\n2. '직원 추가' 또는 '관계 추가'\n3. 직원(개인 고객)을 선택\n4. 직급/역할 입력 (선택)\n5. 저장\n\n법인과 직원 관계가 트리로 연결됩니다.",
    category: "customer",
    order: 22,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "고객 아이콘 색상의 의미는?",
    answer: "고객 유형에 따라 아이콘 색상이 다릅니다:\n\n• 파란색 사람 아이콘: 개인 고객\n• 주황색 건물 아이콘: 법인 고객\n\n목록에서 아이콘만 봐도 개인/법인을 쉽게 구분할 수 있습니다.",
    category: "customer",
    order: 23,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "고객 목록의 표시 개수를 변경할 수 있나요?",
    answer: "네, 페이지당 표시 개수를 조정할 수 있습니다.\n\n• 10개씩 / 15개씩 / 20개씩 / 50개씩 / 100개씩\n• 목록 상단 또는 하단의 드롭다운에서 선택\n\n많은 고객을 한 번에 보려면 표시 개수를 늘리세요.",
    category: "customer",
    order: 24,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "고객 우클릭 메뉴에는 무엇이 있나요?",
    answer: "고객을 우클릭하면 컨텍스트 메뉴가 표시됩니다:\n\n• 상세 보기: 고객 전체 정보 열기\n• 수정: 고객 정보 편집\n• 문서 추가: 해당 고객에 문서 등록\n• 계약 추가: 해당 고객에 계약 등록\n• 삭제: 고객 삭제\n\n자주 사용하는 기능에 빠르게 접근할 수 있습니다.",
    category: "customer",
    order: 25,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },

  // ========================================
  // DOCUMENT - 문서 관리 상세 (15개)
  // ========================================
  {
    question: "AI 검색과 일반 검색의 차이는 무엇인가요?",
    answer: "두 검색 방식은 원리가 다릅니다:\n\n[일반 검색]\n• 파일명, 고객명 등 정확한 텍스트 매칭\n• 입력한 단어가 포함된 문서 찾기\n\n[AI 검색 (시맨틱)]\n• 문서 내용의 의미를 분석\n• 유사한 의미의 문서도 찾아줌\n• 자연어로 질문 가능\n\nAI 검색은 '상세 문서 검색' 메뉴에서 사용합니다.",
    category: "document",
    order: 16,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "AI 검색 결과 개수를 조정할 수 있나요?",
    answer: "네, Top-K 설정으로 결과 개수를 조정합니다:\n\n• 기본값: 10개\n• 조정 범위: 3~20개\n• 상세 문서 검색 화면에서 설정\n\n더 많은 결과를 원하면 Top-K 값을 높이세요. 단, 결과가 많을수록 검색 시간이 길어질 수 있습니다.",
    category: "document",
    order: 17,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "문서 상태 배지의 의미는 무엇인가요?",
    answer: "문서 처리 상태를 색상 배지로 표시합니다:\n\n• 처리 중 (노란색): OCR/분석 진행 중\n• 완료 (녹색): 처리 완료\n• 오류 (빨간색): 처리 중 오류 발생\n\nOCR 신뢰도:\n• 매우 높음 / 높음: 텍스트 인식 정확\n• 보통 / 낮음: 일부 오류 가능\n• 매우 낮음: 수동 확인 필요",
    category: "document",
    order: 18,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "문서 요약 기능은 무엇인가요?",
    answer: "AI가 문서 내용을 자동으로 요약해 주는 기능입니다.\n\n사용 방법:\n1. 문서 클릭 → 미리보기\n2. '요약 보기' 버튼 클릭\n3. AI가 생성한 요약 내용 표시\n\n긴 문서의 핵심 내용을 빠르게 파악할 수 있습니다. PDF 문서에서 주로 사용됩니다.",
    category: "document",
    order: 19,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "문서 전문(OCR 텍스트)을 볼 수 있나요?",
    answer: "네, OCR로 추출된 전체 텍스트를 확인할 수 있습니다.\n\n확인 방법:\n1. 문서 클릭 → 미리보기\n2. '전문 보기' 버튼 클릭\n3. OCR 추출 텍스트 표시\n\nOCR 신뢰도에 따라 일부 텍스트가 정확하지 않을 수 있습니다.",
    category: "document",
    order: 20,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "PDF 뷰어 기능은 무엇이 있나요?",
    answer: "PDF 문서 미리보기에서 다음 기능을 사용할 수 있습니다:\n\n• 확대/축소: 버튼 또는 마우스 휠\n• 페이지 이동: 이전/다음 버튼 또는 페이지 번호 입력\n• 회전: 시계/반시계 방향 90도\n• 전체 화면: 더 크게 보기\n• 다운로드: 원본 파일 저장",
    category: "document",
    order: 21,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "이미지 뷰어 기능은 무엇이 있나요?",
    answer: "이미지 문서 미리보기에서 다음 기능을 사용합니다:\n\n• 확대/축소: 버튼 또는 마우스 휠\n• 드래그: 확대 상태에서 이미지 이동\n• 회전: 시계/반시계 방향\n• 원본 크기: 실제 크기로 보기\n• 다운로드: 원본 이미지 저장",
    category: "document",
    order: 22,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "개인 파일 관리는 무엇인가요?",
    answer: "고객과 연결되지 않은 개인 파일을 관리하는 공간입니다.\n\n• 폴더 생성 및 정리 가능\n• 파일 업로드/다운로드\n• 나중에 고객에게 연결 가능\n\nGoogle Drive처럼 폴더 트리 구조로 파일을 정리할 수 있습니다.",
    category: "document",
    order: 23,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "문서 자동 분류(AR)는 무엇인가요?",
    answer: "AI가 문서 내용을 분석하여 자동으로 분류하는 기능입니다.\n\nAR(Auto Recognition) 기능:\n• 문서에서 고객명 자동 추출\n• 해당 고객에 자동 연결 제안\n• OCR로 문서 내용 추출\n\n문서 등록 시 활성화하면 수동 작업을 줄일 수 있습니다.",
    category: "document",
    order: 24,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "문서 처리 로그는 어디서 확인하나요?",
    answer: "문서 상세 정보에서 처리 과정을 확인할 수 있습니다:\n\n• 업로드 시간\n• OCR 처리 시간 및 결과\n• 분류 처리 결과\n• 오류 발생 시 오류 내용\n\n문서를 클릭하고 '상세 정보' 또는 '처리 로그'를 확인하세요.",
    category: "document",
    order: 25,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "문서 유형별 분포를 확인할 수 있나요?",
    answer: "전체 문서 화면에서 파일 유형별 통계를 확인합니다:\n\n• PDF 문서 비율\n• 이미지(JPG, PNG 등) 비율\n• 기타 파일 비율\n\n원형 차트 형태로 시각화되어 한눈에 파악할 수 있습니다.",
    category: "document",
    order: 26,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "최근 검색 쿼리를 다시 사용할 수 있나요?",
    answer: "네, 상세 문서 검색에서 최근 검색 기록을 활용합니다:\n\n• 검색창 클릭 시 최근 검색어 목록 표시\n• 검색어 클릭하면 바로 검색 실행\n• 최근 10개 검색어 저장\n\n자주 사용하는 검색어를 다시 입력할 필요가 없습니다.",
    category: "document",
    order: 27,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "AND/OR 검색은 어떻게 하나요?",
    answer: "상세 문서 검색에서 AND/OR 옵션을 선택합니다:\n\n• AND: 모든 검색어가 포함된 문서 (교집합)\n• OR: 검색어 중 하나라도 포함된 문서 (합집합)\n\n예시:\n• '보험 AND 청구' → 두 단어 모두 포함\n• '보험 OR 청구' → 둘 중 하나 포함",
    category: "document",
    order: 28,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "문서가 지원되지 않는 형식이면 어떻게 되나요?",
    answer: "지원되지 않는 형식의 파일은 다운로드만 가능합니다.\n\n• 미리보기 대신 파일 정보와 다운로드 버튼 표시\n• 다운로드하여 PC의 프로그램으로 열 수 있음\n\n지원 형식: PDF, JPG, PNG, GIF, BMP 등 (이미지/PDF)",
    category: "document",
    order: 29,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "문서에 노트/메모를 추가하려면?",
    answer: "문서 상세 화면에서 노트를 추가합니다:\n\n1. 문서 클릭 → 미리보기\n2. '노트' 또는 '메모' 버튼 클릭\n3. 내용 입력\n4. 저장\n\n문서에 대한 참고사항이나 특이사항을 기록해 두세요.",
    category: "document",
    order: 30,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },

  // ========================================
  // CONTRACT - 계약 관리 상세 (5개)
  // ========================================
  {
    question: "계약 대시보드는 무엇인가요?",
    answer: "계약 관련 주요 정보를 한눈에 보여주는 화면입니다:\n\n• 총 계약 수\n• 상태별 계약 분포 (유지/완납/실효/해지/만기)\n• 최근 추가된 계약\n• 이번 달 활동 요약\n\n전체 계약 화면 상단에서 대시보드 정보를 확인하세요.",
    category: "contract",
    order: 11,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "계약 목록에서 기간 필터는 어떻게 사용하나요?",
    answer: "활동 기간 필터로 특정 기간의 계약을 볼 수 있습니다:\n\n• 1주일: 최근 1주간 추가/변경된 계약\n• 1개월: 최근 1개월\n• 2개월 / 3개월: 더 긴 기간\n• 전체: 모든 계약\n\n필터를 조합하여 원하는 계약만 확인하세요.",
    category: "contract",
    order: 12,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "계약에 월보험료를 입력할 수 있나요?",
    answer: "네, 계약 등록/수정 시 월보험료를 입력할 수 있습니다:\n\n• 필수 항목은 아님 (선택)\n• 숫자만 입력 (원 단위)\n• 예: 50000 (5만원)\n\n월보험료를 입력하면 계약 목록에서 금액을 확인할 수 있습니다.",
    category: "contract",
    order: 13,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "계약의 보험사 정보는 어디서 오나요?",
    answer: "상품명을 입력하면 보험사가 자동으로 매칭됩니다:\n\n• 시스템에는 보험상품 데이터베이스가 있음\n• 상품명 입력 시 해당 상품의 보험사 자동 연결\n• 녹색 매칭: 정확한 상품 찾음\n\n상품명이 정확해야 보험사 정보가 올바르게 연결됩니다.",
    category: "contract",
    order: 14,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "만기 예정 계약을 확인할 수 있나요?",
    answer: "계약 목록에서 만기일 기준으로 정렬하거나 필터링합니다:\n\n• 계약 목록 → '만기일' 컬럼 클릭 → 정렬\n• 상태 필터 → '만기' 선택\n\n만기가 가까운 계약을 미리 파악하여 갱신 안내를 준비할 수 있습니다.",
    category: "contract",
    order: 15,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },

  // ========================================
  // ACCOUNT - 계정 설정 상세 (10개)
  // ========================================
  {
    question: "프로필 정보를 수정하려면 어떻게 하나요?",
    answer: "계정 설정의 프로필 탭에서 수정합니다:\n\n1. 프로필 영역 클릭 → '계정 설정'\n2. 프로필 탭 선택\n3. 이름, 전화번호, 부서, 직급 등 수정\n4. 저장\n\n이메일은 계정 식별자이므로 변경할 수 없습니다.",
    category: "account",
    order: 6,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "프로필 사진을 변경할 수 있나요?",
    answer: "네, 계정 설정에서 프로필 사진을 변경합니다:\n\n1. 계정 설정 → 프로필 탭\n2. 프로필 이미지 클릭\n3. 새 이미지 파일 선택\n4. 저장\n\n권장 크기: 200x200 픽셀 이상의 정사각형 이미지",
    category: "account",
    order: 7,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "알림 설정은 어디서 하나요?",
    answer: "계정 설정의 알림 탭에서 설정합니다:\n\n알림 유형:\n• 이메일 알림: 중요 공지, 답변 알림\n• 푸시 알림: 브라우저 알림\n• 문서 알림: 업로드/처리 완료 알림\n• 주간 리포트: 주간 활동 요약 메일\n\n필요한 알림만 켜고 나머지는 끌 수 있습니다.",
    category: "account",
    order: 8,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "저장 용량(스토리지)은 어떻게 확인하나요?",
    answer: "여러 곳에서 스토리지 사용량을 확인할 수 있습니다:\n\n• 화면 하단 상태바: 간단한 사용량 표시\n• 계정 설정 → 데이터 탭: 상세 사용량\n\n표시 정보:\n• 사용 중인 용량 (예: 2.5GB)\n• 전체 할당 용량 (예: 10GB)\n• 남은 용량",
    category: "account",
    order: 9,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "저장 용량이 부족하면 어떻게 하나요?",
    answer: "용량이 부족할 때 대처 방법:\n\n1. 불필요한 문서 삭제\n   - 전체 문서 → 필요 없는 파일 삭제\n2. 개인 파일 정리\n   - 개인 파일 → 불필요한 파일 삭제\n3. 등급 업그레이드\n   - 더 높은 등급으로 변경하면 용량 증가\n\n용량 초과 시 새 파일 업로드가 제한됩니다.",
    category: "account",
    order: 10,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "사용자 등급(Tier)이란 무엇인가요?",
    answer: "서비스 이용 범위를 결정하는 등급입니다:\n\n등급별 차이:\n• 저장 용량 한도\n• 일괄 업로드 한도\n• AI 기능 사용량\n• 기타 프리미엄 기능\n\n현재 등급은 계정 설정 또는 프로필에서 확인할 수 있습니다.",
    category: "account",
    order: 11,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "AI 사용량은 어떻게 확인하나요?",
    answer: "계정 설정 → 데이터 탭에서 AI 사용량을 확인합니다:\n\n• 일일 토큰 사용량 차트\n• 예상 비용 표시\n• 기간별 사용 추이\n\nAI 검색, 문서 요약 등을 사용하면 토큰이 소모됩니다.",
    category: "account",
    order: 12,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "데이터를 내보낼 수 있나요?",
    answer: "계정 설정 → 데이터 탭에서 데이터 내보내기를 요청합니다:\n\n• 고객 정보 내보내기\n• 계약 정보 내보내기\n• 문서 목록 내보내기\n\n내보내기 요청 후 준비되면 다운로드 링크가 제공됩니다. 대용량 데이터는 시간이 걸릴 수 있습니다.",
    category: "account",
    order: 13,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "세션이 만료되면 어떻게 되나요?",
    answer: "일정 시간 동안 활동이 없으면 보안을 위해 자동 로그아웃됩니다:\n\n• 세션 만료 시 로그인 화면으로 이동\n• 저장하지 않은 작업은 사라질 수 있음\n• 다시 로그인하면 정상 사용 가능\n\n중요한 작업 중에는 주기적으로 저장하세요.",
    category: "account",
    order: 14,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "2단계 인증(2FA)을 설정할 수 있나요?",
    answer: "계정 설정 → 보안 탭에서 2단계 인증을 설정합니다:\n\n설정 방법:\n1. '2단계 인증 활성화' 클릭\n2. 인증 앱(Google Authenticator 등)으로 QR 스캔\n3. 생성된 코드 입력하여 확인\n4. 백업 코드 저장\n\n2단계 인증을 사용하면 계정 보안이 강화됩니다.",
    category: "account",
    order: 15,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  }
];

// MongoDB 연결 및 삽입
db = db.getSiblingDB('docupload');

// 새 FAQ 삽입 (기존 데이터 유지하고 추가만)
const insertResult = db.faqs.insertMany(faqs);
print('추가 FAQ 삽입: ' + insertResult.insertedIds.length + '건');

// 결과 확인
const totalCount = db.faqs.countDocuments();
print('현재 총 FAQ 개수: ' + totalCount);

// 카테고리별 개수
['import', 'general', 'customer', 'document', 'contract', 'account'].forEach(cat => {
  const count = db.faqs.countDocuments({ category: cat });
  print(cat + ': ' + count + '개');
});

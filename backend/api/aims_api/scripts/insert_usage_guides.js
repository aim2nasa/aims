/**
 * 사용 가이드 초기 데이터 삽입 스크립트
 * 9개 카테고리, 40+ 가이드 항목
 *
 * 실행: ssh tars.giize.com 'cd ~/aims/backend/api/aims_api && node scripts/insert_usage_guides.js'
 */

const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/docupload';

const now = new Date();

// 카테고리 순서
const CATEGORY_ORDER = [
  'getting-started', 'customer', 'contract', 'document',
  'batch-import', 'advanced', 'account', 'tips', 'terminology'
];

const usageGuides = [
  // === 1. 시작하기 (getting-started) ===
  {
    categoryId: 'getting-started',
    categoryTitle: '시작하기',
    categoryIcon: 'rocket',
    colorClass: 'green',
    order: 1,
    items: [
      {
        id: 'gs-1',
        title: 'AIMS 첫 사용 가이드',
        description: '로그인부터 기본 설정까지, AIMS를 처음 사용하는 분들을 위한 안내입니다.',
        steps: [
          '관리자에게 받은 계정으로 로그인합니다.',
          '왼쪽 메뉴에서 원하는 기능을 선택합니다.',
          '고객을 등록하고 문서를 업로드해 보세요.',
          '상단 검색창(Ctrl+K)으로 빠르게 고객을 찾을 수 있습니다.'
        ],
        order: 1
      },
      {
        id: 'gs-2',
        title: '화면 구성 이해하기',
        description: 'AIMS는 3단 레이아웃으로 구성되어 있습니다.',
        steps: [
          '왼쪽 패널(LeftPane): 메뉴 네비게이션 - 고객, 문서, 도움말 등',
          '가운데 패널(CenterPane): 목록 및 주요 콘텐츠 표시',
          '오른쪽 패널(RightPane): 상세 정보 및 미리보기',
          '각 패널의 너비는 드래그로 조절할 수 있습니다.'
        ],
        order: 2
      },
      {
        id: 'gs-3',
        title: '단축키 사용법',
        description: '자주 사용하는 기능을 단축키로 빠르게 실행하세요.',
        steps: [
          'Ctrl+K: 고객 빠른 검색 열기',
          'Ctrl+Shift+C: 새 고객 등록 창 열기',
          'Esc: 현재 창/모달 닫기',
          'F5 또는 Ctrl+R: 페이지 새로고침'
        ],
        order: 3
      }
    ],
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },

  // === 2. 고객 관리 (customer) ===
  {
    categoryId: 'customer',
    categoryTitle: '고객 관리',
    categoryIcon: 'person',
    colorClass: 'blue',
    order: 2,
    items: [
      {
        id: 'cust-1',
        title: '새 고객 등록하기',
        description: '개인 또는 법인 고객을 등록하는 방법입니다.',
        steps: [
          '왼쪽 메뉴에서 "전체 고객"을 클릭합니다.',
          '상단의 "+" 버튼 또는 Ctrl+Shift+C를 누릅니다.',
          '고객 유형(개인/법인)을 선택합니다.',
          '필수 정보(이름 또는 법인명)를 입력합니다.',
          '선택 정보(연락처, 주소 등)를 입력합니다.',
          '"저장" 버튼을 클릭합니다.'
        ],
        order: 1
      },
      {
        id: 'cust-2',
        title: '고객 정보 수정하기',
        description: '등록된 고객의 정보를 수정하는 방법입니다.',
        steps: [
          '고객 목록에서 수정할 고객을 클릭합니다.',
          '오른쪽 패널에서 "수정" 버튼을 클릭합니다.',
          '정보를 수정합니다.',
          '"저장" 버튼을 클릭하여 변경사항을 저장합니다.'
        ],
        order: 2
      },
      {
        id: 'cust-3',
        title: '고객 검색 및 필터링',
        description: '원하는 고객을 빠르게 찾는 방법입니다.',
        steps: [
          '상단 검색창에 고객명, 연락처, 이메일 등을 입력합니다.',
          'Ctrl+K로 빠른 검색창을 열 수 있습니다.',
          '왼쪽 메뉴에서 "전체 고객"을 클릭하면 모든 고객이 표시됩니다.',
          '컬럼 헤더를 클릭하여 정렬할 수 있습니다.'
        ],
        order: 3
      },
      {
        id: 'cust-4',
        title: '지역별 고객 보기',
        description: '트리 구조로 지역별 고객을 확인하는 방법입니다.',
        steps: [
          '왼쪽 메뉴에서 "지역별 고객"을 클릭합니다.',
          '시/도를 클릭하면 하위 구/군이 펼쳐집니다.',
          '구/군을 클릭하면 해당 지역 고객이 표시됩니다.',
          '주소가 없는 고객은 "주소 미입력"에 표시됩니다.'
        ],
        order: 4
      },
      {
        id: 'cust-5',
        title: '가족 관계 설정하기',
        description: '고객 간 가족 관계를 설정하는 방법입니다.',
        steps: [
          '고객 상세 화면에서 "가족 관계" 섹션을 찾습니다.',
          '"가족 추가" 버튼을 클릭합니다.',
          '관계 유형(배우자, 자녀, 부모 등)을 선택합니다.',
          '연결할 고객을 검색하여 선택합니다.',
          '"저장"을 클릭하여 관계를 저장합니다.'
        ],
        order: 5
      },
      {
        id: 'cust-6',
        title: '고객 휴면/삭제 처리',
        description: '고객을 휴면 처리하거나 삭제하는 방법입니다.',
        steps: [
          '고객 목록에서 해당 고객을 우클릭합니다.',
          '"휴면 처리" 또는 "삭제"를 선택합니다.',
          '휴면 고객은 "휴면 고객" 메뉴에서 확인 가능합니다.',
          '삭제 시 연결된 문서와 계약도 함께 삭제됩니다.',
          '삭제된 데이터는 복구할 수 없으니 주의하세요.'
        ],
        order: 6
      }
    ],
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },

  // === 3. 계약 관리 (contract) ===
  {
    categoryId: 'contract',
    categoryTitle: '계약 관리',
    categoryIcon: 'document',
    colorClass: 'indigo',
    order: 3,
    items: [
      {
        id: 'cont-1',
        title: '계약 조회하기',
        description: '등록된 계약을 조회하는 방법입니다.',
        steps: [
          '왼쪽 메뉴에서 "전체 계약"을 클릭합니다.',
          '계약 목록이 가운데 패널에 표시됩니다.',
          '컬럼 헤더를 클릭하여 정렬할 수 있습니다.',
          '계약을 클릭하면 오른쪽에 상세 정보가 표시됩니다.'
        ],
        order: 1
      },
      {
        id: 'cont-2',
        title: '계약 상태 이해하기',
        description: '계약의 다양한 상태에 대한 설명입니다.',
        steps: [
          '활성: 현재 유효한 계약',
          '해지: 중도 해지된 계약',
          '만기: 계약 기간이 종료된 계약',
          '실효: 보험료 미납 등으로 효력이 상실된 계약',
          '각 상태는 색상으로 구분됩니다.'
        ],
        order: 2
      },
      {
        id: 'cont-3',
        title: '계약 정보 수정하기',
        description: '계약 정보를 수정하는 방법입니다.',
        steps: [
          '계약 목록에서 수정할 계약을 클릭합니다.',
          '오른쪽 패널에서 "수정" 버튼을 클릭합니다.',
          '계약 상태, 보험료 등을 수정합니다.',
          '"저장" 버튼을 클릭합니다.'
        ],
        order: 3
      },
      {
        id: 'cont-4',
        title: '고객별 계약 보기',
        description: '특정 고객의 모든 계약을 확인하는 방법입니다.',
        steps: [
          '고객 목록에서 해당 고객을 클릭합니다.',
          '고객 상세 화면에서 "계약" 탭을 선택합니다.',
          '해당 고객의 모든 계약이 표시됩니다.',
          '계약을 클릭하면 상세 정보를 볼 수 있습니다.'
        ],
        order: 4
      }
    ],
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },

  // === 4. 문서 관리 (document) ===
  {
    categoryId: 'document',
    categoryTitle: '문서 관리',
    categoryIcon: 'file',
    colorClass: 'orange',
    order: 4,
    items: [
      {
        id: 'doc-1',
        title: '새 문서 등록하기',
        description: '문서를 업로드하고 AI 분석을 받는 방법입니다.',
        steps: [
          '왼쪽 메뉴에서 "전체 문서"를 클릭합니다.',
          '상단의 "업로드" 버튼을 클릭하거나 파일을 드래그합니다.',
          'PDF, 이미지(JPG, PNG) 파일을 선택합니다.',
          '업로드 후 AI가 자동으로 문서를 분석합니다.',
          '분석이 완료되면 고객과 연결할 수 있습니다.'
        ],
        order: 1
      },
      {
        id: 'doc-2',
        title: '문서 미리보기 및 다운로드',
        description: '문서를 미리보고 다운로드하는 방법입니다.',
        steps: [
          '문서 목록에서 원하는 문서를 클릭합니다.',
          '오른쪽 패널에 미리보기가 표시됩니다.',
          '문서를 더블클릭하면 전체 화면으로 볼 수 있습니다.',
          '다운로드 버튼을 클릭하여 원본 파일을 받을 수 있습니다.',
          '마우스 휠로 확대/축소가 가능합니다.'
        ],
        order: 2
      },
      {
        id: 'doc-3',
        title: '문서 검색하기 (RAG 검색)',
        description: 'AI 기반 상세 문서검색을 활용하는 방법입니다.',
        steps: [
          '왼쪽 메뉴에서 "상세 문서검색"을 클릭합니다.',
          '검색창에 찾고 싶은 내용을 입력합니다.',
          'AI가 문서 내용을 분석하여 관련 문서를 찾습니다.',
          '검색 결과에서 유사도 점수를 확인할 수 있습니다.',
          'TopK 값을 조절하여 결과 수를 변경할 수 있습니다.'
        ],
        order: 3
      },
      {
        id: 'doc-4',
        title: '문서와 고객 연결하기',
        description: '문서를 특정 고객에게 연결하는 방법입니다.',
        steps: [
          '문서 상세 화면에서 "고객 연결" 버튼을 클릭합니다.',
          '연결할 고객을 검색하여 선택합니다.',
          '"저장"을 클릭하여 연결을 완료합니다.',
          '연결된 문서는 해당 고객의 상세 화면에서도 볼 수 있습니다.'
        ],
        order: 4
      },
      {
        id: 'doc-5',
        title: 'PDF 변환 상태 이해하기',
        description: '문서의 PDF 변환 상태에 대한 설명입니다.',
        steps: [
          '이미지 문서는 PDF로 자동 변환됩니다.',
          '"변환 중": 현재 PDF로 변환 진행 중',
          '"변환 완료": PDF 변환이 완료된 상태',
          '"변환 실패": 변환 중 오류 발생 (재시도 가능)',
          '상태 배지를 클릭하면 상세 정보를 볼 수 있습니다.'
        ],
        order: 5
      }
    ],
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },

  // === 5. 일괄 등록 (batch-import) ===
  {
    categoryId: 'batch-import',
    categoryTitle: '일괄 등록',
    categoryIcon: 'upload',
    colorClass: 'teal',
    order: 5,
    items: [
      {
        id: 'batch-1',
        title: '고객·계약 일괄등록',
        description: '엑셀 파일로 고객과 계약을 한 번에 등록하는 방법입니다.',
        steps: [
          '왼쪽 메뉴에서 "고객·계약 일괄등록"을 클릭합니다.',
          '"양식 다운로드" 버튼으로 엑셀 템플릿을 받습니다.',
          '템플릿에 맞게 데이터를 입력합니다.',
          '작성한 파일을 업로드합니다.',
          '미리보기에서 데이터를 확인 후 "등록"을 클릭합니다.'
        ],
        order: 1
      },
      {
        id: 'batch-2',
        title: '엑셀 양식 작성 가이드',
        description: '일괄등록 엑셀 양식을 작성하는 방법입니다.',
        steps: [
          '고객명은 필수입니다 (중복 불가).',
          '고객 유형은 "개인" 또는 "법인"으로 입력합니다.',
          '날짜는 YYYY.MM.DD 또는 YYYY-MM-DD 형식을 사용합니다.',
          '연락처는 하이픈(-) 포함 또는 숫자만 입력 가능합니다.',
          '빈 셀은 건너뜁니다 (선택 항목).'
        ],
        order: 2
      },
      {
        id: 'batch-3',
        title: '일괄등록 오류 해결하기',
        description: '일괄등록 시 발생하는 오류를 해결하는 방법입니다.',
        steps: [
          '중복 오류: 이미 등록된 고객명이 있습니다.',
          '필수값 누락: 고객명 등 필수 항목을 확인하세요.',
          '형식 오류: 날짜, 숫자 형식을 확인하세요.',
          '오류가 발생한 행은 빨간색으로 표시됩니다.',
          '오류 메시지를 클릭하면 해당 셀로 이동합니다.'
        ],
        order: 3
      },
      {
        id: 'batch-4',
        title: '문서 일괄등록',
        description: '여러 문서를 한 번에 등록하는 방법입니다.',
        steps: [
          '왼쪽 메뉴에서 "문서 일괄등록"을 클릭합니다.',
          '폴더를 드래그하거나 여러 파일을 선택합니다.',
          '파일명에 고객명이 포함되면 자동 연결을 시도합니다.',
          '업로드 진행률을 확인합니다.',
          '완료 후 결과를 확인합니다.'
        ],
        order: 4
      }
    ],
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },

  // === 6. 고급 기능 (advanced) ===
  {
    categoryId: 'advanced',
    categoryTitle: '고급 기능',
    categoryIcon: 'gear',
    colorClass: 'purple',
    order: 6,
    items: [
      {
        id: 'adv-1',
        title: '상세 문서검색 활용하기',
        description: 'RAG 기반 AI 검색의 고급 기능을 활용하는 방법입니다.',
        steps: [
          '자연어로 질문하듯 검색어를 입력하세요.',
          '예: "홍길동 고객의 암보험 약관"',
          '유사도 점수가 높을수록 관련성이 높습니다.',
          'TopK 값을 높이면 더 많은 결과를 볼 수 있습니다.',
          '검색 결과를 클릭하면 해당 문서로 이동합니다.'
        ],
        order: 1
      },
      {
        id: 'adv-2',
        title: '연간보고서(Annual Report) 기능',
        description: '고객별 연간 보고서를 생성하는 방법입니다.',
        steps: [
          '고객 상세 화면에서 "연간보고서" 탭을 선택합니다.',
          '조회할 연도를 선택합니다.',
          '해당 연도의 계약, 보험료, 이벤트 등이 정리됩니다.',
          'PDF로 다운로드하여 고객에게 제공할 수 있습니다.'
        ],
        order: 2
      },
      {
        id: 'adv-3',
        title: '내 문서 폴더 관리',
        description: '개인 문서 폴더를 관리하는 방법입니다.',
        steps: [
          '왼쪽 메뉴에서 "내 문서"를 클릭합니다.',
          '"폴더 추가" 버튼으로 새 폴더를 만듭니다.',
          '문서를 드래그하여 폴더에 정리합니다.',
          '폴더를 우클릭하여 이름 변경, 삭제가 가능합니다.',
          '내 문서는 본인만 볼 수 있습니다.'
        ],
        order: 3
      }
    ],
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },

  // === 7. 계정 설정 (account) ===
  {
    categoryId: 'account',
    categoryTitle: '계정 설정',
    categoryIcon: 'person.circle',
    colorClass: 'gray',
    order: 7,
    items: [
      {
        id: 'acc-1',
        title: '프로필 설정하기',
        description: '내 프로필 정보를 수정하는 방법입니다.',
        steps: [
          '오른쪽 상단의 프로필 아이콘을 클릭합니다.',
          '"프로필 설정"을 선택합니다.',
          '이름, 연락처 등을 수정합니다.',
          '"저장" 버튼을 클릭합니다.'
        ],
        order: 1
      },
      {
        id: 'acc-2',
        title: '테마 변경하기',
        description: '라이트/다크 모드를 변경하는 방법입니다.',
        steps: [
          '오른쪽 상단의 프로필 아이콘을 클릭합니다.',
          '"설정"을 선택합니다.',
          '"테마" 섹션에서 원하는 모드를 선택합니다.',
          '라이트: 밝은 배경, 다크: 어두운 배경',
          '자동: 시스템 설정에 따라 변경됩니다.'
        ],
        order: 2
      },
      {
        id: 'acc-3',
        title: '레이아웃 설정',
        description: '화면 레이아웃을 조절하는 방법입니다.',
        steps: [
          '패널 경계선을 드래그하여 너비를 조절합니다.',
          '패널을 최소화하려면 경계선을 끝까지 드래그합니다.',
          '설정은 자동으로 저장됩니다.',
          '기본 레이아웃으로 되돌리려면 설정에서 "초기화"를 클릭합니다.'
        ],
        order: 3
      }
    ],
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },

  // === 8. 팁 & 트릭 (tips) ===
  {
    categoryId: 'tips',
    categoryTitle: '팁 & 트릭',
    categoryIcon: 'lightbulb',
    colorClass: 'yellow',
    order: 8,
    items: [
      {
        id: 'tip-1',
        title: '마우스 우클릭 활용하기',
        description: '컨텍스트 메뉴로 빠르게 작업하는 방법입니다.',
        steps: [
          '고객/문서/계약 목록에서 항목을 우클릭합니다.',
          '수정, 삭제, 복사 등의 메뉴가 표시됩니다.',
          '빈 공간을 우클릭하면 새로 만들기 메뉴가 나타납니다.',
          '우클릭 메뉴는 상황에 따라 다른 옵션을 제공합니다.'
        ],
        order: 1
      },
      {
        id: 'tip-2',
        title: '스크롤 & 확대/축소',
        description: '문서 미리보기에서 스크롤과 줌을 활용하는 방법입니다.',
        steps: [
          '마우스 휠: 위/아래 스크롤',
          'Ctrl + 마우스 휠: 확대/축소',
          '문서 미리보기에서 확대하면 세부 내용을 확인할 수 있습니다.',
          '더블클릭하면 전체 화면 모드로 전환됩니다.',
          'Esc를 누르면 전체 화면에서 나옵니다.'
        ],
        order: 2
      },
      {
        id: 'tip-3',
        title: '더블클릭 활용하기',
        description: '더블클릭으로 빠르게 작업하는 방법입니다.',
        steps: [
          '고객 목록에서 더블클릭: 고객 상세 모달 열기',
          '문서 목록에서 더블클릭: 문서 전체 화면 보기',
          '계약 목록에서 더블클릭: 계약 상세 모달 열기',
          '더블클릭은 "빠르게 상세 보기"로 활용하세요.'
        ],
        order: 3
      },
      {
        id: 'tip-4',
        title: '드래그앤드롭 활용',
        description: '드래그앤드롭으로 빠르게 작업하는 방법입니다.',
        steps: [
          '파일을 화면에 드래그하면 업로드할 수 있습니다.',
          '문서를 폴더로 드래그하여 정리할 수 있습니다.',
          '여러 파일을 한 번에 드래그하여 일괄 업로드 가능합니다.',
          '지원 형식: PDF, JPG, PNG, GIF'
        ],
        order: 4
      },
      {
        id: 'tip-5',
        title: '키보드 단축키 모음',
        description: '자주 쓰는 단축키를 한눈에 확인하세요.',
        steps: [
          'Ctrl+K: 고객 빠른 검색',
          'Ctrl+Shift+C: 새 고객 등록',
          'Esc: 현재 창 닫기',
          'Enter: 선택 항목 열기',
          'Tab: 다음 필드로 이동'
        ],
        order: 5
      },
      {
        id: 'tip-6',
        title: '검색 팁',
        description: '검색을 효과적으로 활용하는 방법입니다.',
        steps: [
          '고객명 일부만 입력해도 검색됩니다.',
          '연락처 뒷자리만으로도 검색 가능합니다.',
          '상세 문서검색은 문서 내용까지 검색합니다.',
          '검색어를 띄어쓰기로 구분하면 AND 검색됩니다.'
        ],
        order: 6
      },
      {
        id: 'tip-7',
        title: '실시간 업데이트 토글',
        description: '폴링/SSE 상태 표시를 이해하는 방법입니다.',
        steps: [
          '화면 하단에 연결 상태가 표시됩니다.',
          '녹색: 실시간 연결됨 (SSE)',
          '주황색: 폴링 모드로 동작 중',
          '빨간색: 연결 끊김 - 자동 재연결 시도',
          '상태를 클릭하면 상세 정보를 볼 수 있습니다.'
        ],
        order: 7
      },
      {
        id: 'tip-8',
        title: '브라우저 새로고침 vs 앱 새로고침',
        description: '새로고침 방법의 차이를 이해하세요.',
        steps: [
          'F5: 브라우저 전체 새로고침 (느림, 모든 데이터 다시 로드)',
          'Ctrl+R: 위와 동일',
          '앱 내 새로고침 버튼: 해당 목록만 다시 로드 (빠름)',
          '실시간 업데이트가 되므로 수동 새로고침은 거의 필요 없습니다.'
        ],
        order: 8
      }
    ],
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },

  // === 9. 용어 설명 (terminology) ===
  {
    categoryId: 'terminology',
    categoryTitle: '용어 설명',
    categoryIcon: 'book',
    colorClass: 'brown',
    order: 9,
    items: [
      {
        id: 'term-1',
        title: '처리 상태 이해하기',
        description: '문서/작업의 처리 상태에 대한 설명입니다.',
        steps: [
          '대기중: 아직 처리가 시작되지 않음',
          '처리중: 현재 AI가 분석 중',
          '완료: 처리가 성공적으로 끝남',
          '오류: 처리 중 문제 발생 (재시도 가능)'
        ],
        order: 1
      },
      {
        id: 'term-2',
        title: 'PDF 변환 상태',
        description: 'PDF 변환 상태에 대한 설명입니다.',
        steps: [
          '변환 대기: PDF 변환 순서 대기 중',
          '변환 중: 현재 PDF로 변환 진행 중',
          '변환 완료: PDF 변환 성공',
          '변환 실패: 변환 중 오류 발생',
          '원본이 PDF인 경우 변환하지 않습니다.'
        ],
        order: 2
      },
      {
        id: 'term-3',
        title: '고객 상태',
        description: '고객의 상태에 대한 설명입니다.',
        steps: [
          '활성: 현재 관리 중인 고객',
          '휴면: 일시적으로 비활성화된 고객',
          '휴면 고객도 언제든 다시 활성화할 수 있습니다.',
          '휴면 고객의 문서와 계약은 그대로 유지됩니다.'
        ],
        order: 3
      },
      {
        id: 'term-4',
        title: '계약 상태',
        description: '계약의 상태에 대한 설명입니다.',
        steps: [
          '활성 (유지): 현재 유효한 계약',
          '해지: 중도에 해지된 계약',
          '만기: 계약 기간이 종료된 계약',
          '실효: 보험료 미납 등으로 효력 상실',
          '부활: 실효 후 다시 유효해진 계약'
        ],
        order: 4
      },
      {
        id: 'term-5',
        title: 'AI 용어',
        description: 'AIMS에서 사용하는 AI 관련 용어입니다.',
        steps: [
          'RAG: 검색 증강 생성 - 문서 내용 기반 AI 검색',
          'OCR: 광학 문자 인식 - 이미지에서 텍스트 추출',
          '유사도: 검색어와 문서 내용의 관련성 점수 (0~100%)',
          'TopK: 검색 결과로 보여줄 최대 문서 수'
        ],
        order: 5
      }
    ],
    isPublished: true,
    createdAt: now,
    updatedAt: now
  }
];

async function insertUsageGuides() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('MongoDB 연결 성공');

    const db = client.db();
    const collection = db.collection('usage_guides');

    // 기존 데이터 삭제 (선택사항)
    const deleteResult = await collection.deleteMany({});
    console.log(`기존 데이터 ${deleteResult.deletedCount}개 삭제`);

    // 새 데이터 삽입
    const insertResult = await collection.insertMany(usageGuides);
    console.log(`${insertResult.insertedCount}개 카테고리 삽입 완료`);

    // 삽입된 가이드 수 계산
    const totalItems = usageGuides.reduce((sum, cat) => sum + cat.items.length, 0);
    console.log(`총 ${totalItems}개 가이드 항목 등록 완료`);

    // 카테고리별 요약
    console.log('\n카테고리별 가이드 수:');
    usageGuides.forEach(cat => {
      console.log(`  ${cat.categoryTitle}: ${cat.items.length}개`);
    });

  } catch (error) {
    console.error('오류 발생:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('\nMongoDB 연결 종료');
  }
}

insertUsageGuides();

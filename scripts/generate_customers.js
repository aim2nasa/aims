/**
 * AIMS - 랜덤 고객 생성 스크립트
 * @description 개인고객 n명, 법인고객 m명 생성
 * @usage
 *   node scripts/generate_customers.js 70 30        # 개인 70명, 법인 30명
 *   node scripts/generate_customers.js 100 0        # 개인 100명만
 *   node scripts/generate_customers.js 0 50         # 법인 50명만
 *   node scripts/generate_customers.js              # 기본값: 개인 70명, 법인 30명
 */

const axios = require('axios');

// API 엔드포인트 설정
const API_BASE_URL = 'http://tars.giize.com:3010/api';
const CUSTOMERS_ENDPOINT = `${API_BASE_URL}/customers`;

// 한국 성씨 목록 (빈도수 기준)
const LAST_NAMES = [
  '김', '이', '박', '최', '정', '강', '조', '윤', '장', '임',
  '한', '오', '서', '신', '권', '황', '안', '송', '류', '홍',
  '전', '고', '문', '손', '양', '배', '백', '허', '남', '심',
  '노', '하', '곽', '성', '차', '주', '우', '구', '신', '라',
];

// 한국 이름 첫자 목록
const FIRST_NAME_SYLLABLES_1 = [
  '민', '서', '지', '예', '수', '하', '도', '시', '주', '현',
  '은', '윤', '승', '재', '준', '성', '진', '태', '우', '경',
  '영', '정', '동', '상', '인', '선', '미', '소', '다', '나',
];

// 한국 이름 둘째자 목록
const FIRST_NAME_SYLLABLES_2 = [
  '준', '아', '우', '윤', '연', '진', '민', '서', '현', '호',
  '영', '은', '정', '수', '경', '혁', '희', '빈', '나', '원',
  '석', '훈', '재', '성', '태', '기', '철', '주', '권', '범',
];

// 법인명 접두사
const COMPANY_PREFIXES = [
  '한국', '대한', '동양', '서울', '부산', '대구', '인천', '광주',
  '대전', '울산', '세종', '경기', '강원', '충청', '전라', '경상',
  '제주', '글로벌', '코리아', '유니', '넥스트', '퓨처', '스마트',
];

// 법인명 업종
const COMPANY_TYPES = [
  '건설', '무역', '물산', '전자', '화학', '제약', '식품', '섬유',
  '철강', '조선', '자동차', '반도체', '통신', '에너지', '금융',
  '보험', '증권', '유통', '광고', '출판', '미디어', '소프트웨어',
  '바이오', '환경', '교육', '의료', '관광', '레저', '부동산',
];

// 법인명 접미사
const COMPANY_SUFFIXES = ['(주)', '주식회사', '㈜', '그룹', '홀딩스', 'Inc.', 'Co., Ltd.'];

// 전국 시/도 및 구/군 목록 (수도권 70%, 지방 30% 비율)
// 수도권: 서울, 인천, 경기
const METROPOLITAN_REGIONS = [
  // 서울
  { city: '서울특별시', districts: ['강남구', '강동구', '강북구', '강서구', '관악구', '광진구', '구로구', '금천구', '노원구', '도봉구', '동대문구', '동작구', '마포구', '서대문구', '서초구', '성동구', '성북구', '송파구', '양천구', '영등포구', '용산구', '은평구', '종로구', '중구', '중랑구'] },
  // 인천
  { city: '인천광역시', districts: ['강화군', '계양구', '남동구', '동구', '미추홀구', '부평구', '서구', '연수구', '옹진군', '중구'] },
  // 경기
  { city: '경기도', districts: ['고양시', '과천시', '광명시', '광주시', '구리시', '군포시', '김포시', '남양주시', '동두천시', '부천시', '성남시', '수원시', '시흥시', '안산시', '안성시', '안양시', '양주시', '오산시', '용인시', '의왕시', '의정부시', '이천시', '파주시', '평택시', '포천시', '하남시', '화성시'] },
];

// 지방: 그 외 지역
const PROVINCIAL_REGIONS = [
  // 부산
  { city: '부산광역시', districts: ['강서구', '금정구', '기장군', '남구', '동구', '동래구', '부산진구', '북구', '사상구', '사하구', '서구', '수영구', '연제구', '영도구', '중구', '해운대구'] },
  // 대구
  { city: '대구광역시', districts: ['남구', '달서구', '달성군', '동구', '북구', '서구', '수성구', '중구'] },
  // 광주
  { city: '광주광역시', districts: ['광산구', '남구', '동구', '북구', '서구'] },
  // 대전
  { city: '대전광역시', districts: ['대덕구', '동구', '서구', '유성구', '중구'] },
  // 울산
  { city: '울산광역시', districts: ['남구', '동구', '북구', '울주군', '중구'] },
  // 세종
  { city: '세종특별자치시', districts: ['세종시'] },
  // 강원
  { city: '강원특별자치도', districts: ['강릉시', '고성군', '동해시', '삼척시', '속초시', '양구군', '양양군', '영월군', '원주시', '인제군', '정선군', '철원군', '춘천시', '태백시', '평창군', '홍천군', '화천군', '횡성군'] },
  // 충북
  { city: '충청북도', districts: ['괴산군', '단양군', '보은군', '영동군', '옥천군', '음성군', '제천시', '증평군', '진천군', '청주시', '충주시'] },
  // 충남
  { city: '충청남도', districts: ['계룡시', '공주시', '금산군', '논산시', '당진시', '보령시', '부여군', '서산시', '서천군', '아산시', '예산군', '천안시', '청양군', '태안군', '홍성군'] },
  // 전북
  { city: '전북특별자치도', districts: ['고창군', '군산시', '김제시', '남원시', '무주군', '부안군', '순창군', '완주군', '익산시', '임실군', '장수군', '전주시', '정읍시', '진안군'] },
  // 전남
  { city: '전라남도', districts: ['강진군', '고흥군', '곡성군', '광양시', '구례군', '나주시', '담양군', '목포시', '무안군', '보성군', '순천시', '신안군', '여수시', '영광군', '영암군', '완도군', '장성군', '장흥군', '진도군', '함평군', '해남군', '화순군'] },
  // 경북
  { city: '경상북도', districts: ['경산시', '경주시', '고령군', '구미시', '군위군', '김천시', '문경시', '봉화군', '상주시', '성주군', '안동시', '영덕군', '영양군', '영주시', '영천시', '예천군', '울릉군', '울진군', '의성군', '청도군', '청송군', '칠곡군', '포항시'] },
  // 경남
  { city: '경상남도', districts: ['거제시', '거창군', '고성군', '김해시', '남해군', '밀양시', '사천시', '산청군', '양산시', '의령군', '진주시', '창녕군', '창원시', '통영시', '하동군', '함안군', '함양군', '합천군'] },
  // 제주
  { city: '제주특별자치도', districts: ['서귀포시', '제주시'] },
];

// 도로명 목록
const STREET_NAMES = [
  '중앙로', '시청로', '역전로', '대학로', '공원로', '문화로', '평화로', '통일로',
  '번영로', '발전로', '미래로', '희망로', '행복로', '사랑로', '우정로', '신촌로',
  '테헤란로', '강남대로', '논현로', '언주로', '봉은사로', '선릉로', '삼성로', '영동대로',
  '세종대로', '을지로', '종로', '퇴계로', '한강대로', '마포대로', '양화로', '독산로',
];

// 이메일 도메인 목록
const EMAIL_DOMAINS = [
  'gmail.com', 'naver.com', 'daum.net', 'hanmail.net', 'kakao.com',
  'outlook.com', 'yahoo.com', 'nate.com', 'hotmail.com',
];

/**
 * 랜덤 요소 선택
 */
function randomChoice(array) {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * 랜덤 정수 생성
 */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 랜덤 한국 이름 생성 (중복 최소화)
 */
function generateKoreanName() {
  const lastName = randomChoice(LAST_NAMES);
  const firstName1 = randomChoice(FIRST_NAME_SYLLABLES_1);
  const firstName2 = randomChoice(FIRST_NAME_SYLLABLES_2);
  return `${lastName}${firstName1}${firstName2}`;
}

/**
 * 랜덤 법인명 생성
 */
function generateCompanyName() {
  const usePrefix = Math.random() > 0.3;
  const prefix = usePrefix ? randomChoice(COMPANY_PREFIXES) : '';
  const type = randomChoice(COMPANY_TYPES);
  const suffix = randomChoice(COMPANY_SUFFIXES);

  return usePrefix ? `${prefix}${type}${suffix}` : `${type}${suffix}`;
}

/**
 * 랜덤 생년월일 생성 (20세 ~ 80세)
 */
function generateBirthDate() {
  const currentYear = new Date().getFullYear();
  const year = randomInt(currentYear - 80, currentYear - 20);
  const month = String(randomInt(1, 12)).padStart(2, '0');
  const day = String(randomInt(1, 28)).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 랜덤 성별 생성
 */
function generateGender() {
  return Math.random() > 0.5 ? 'M' : 'F';
}

/**
 * 랜덤 휴대폰 번호 생성
 */
function generateMobilePhone() {
  const prefixes = ['010', '011', '016', '017', '018', '019'];
  const prefix = randomChoice(prefixes);
  const middle = String(randomInt(1000, 9999));
  const last = String(randomInt(1000, 9999));
  return `${prefix}-${middle}-${last}`;
}

/**
 * 랜덤 집 전화번호 생성
 */
function generateHomePhone() {
  const areaCodes = ['02', '031', '032', '033', '041', '042', '043', '044', '051', '052', '053', '054', '055', '061', '062', '063', '064'];
  const areaCode = randomChoice(areaCodes);
  const middle = String(randomInt(100, 999));
  const last = String(randomInt(1000, 9999));
  return `${areaCode}-${middle}-${last}`;
}

/**
 * 랜덤 회사 전화번호 생성
 */
function generateWorkPhone() {
  return generateHomePhone(); // 동일한 형식
}

/**
 * 랜덤 이메일 생성
 */
function generateEmail(name) {
  const domain = randomChoice(EMAIL_DOMAINS);
  const username = name.toLowerCase().replace(/[^a-z0-9]/g, '') + randomInt(100, 999);
  return `${username}@${domain}`;
}

/**
 * 랜덤 우편번호 생성
 */
function generatePostalCode() {
  return String(randomInt(10000, 99999));
}

/**
 * 랜덤 주소 생성 (수도권 70%, 지방 30%)
 */
function generateAddress() {
  // 70% 확률로 수도권, 30% 확률로 지방
  const isMetropolitan = Math.random() < 0.7;
  const regionPool = isMetropolitan ? METROPOLITAN_REGIONS : PROVINCIAL_REGIONS;

  const region = randomChoice(regionPool);
  const district = randomChoice(region.districts);
  const street = randomChoice(STREET_NAMES);
  const buildingNum = randomInt(1, 999);
  const detailNum = randomInt(101, 2005);

  return {
    postal_code: generatePostalCode(),
    address1: `${region.city} ${district} ${street} ${buildingNum}`,
    address2: `${Math.floor(detailNum / 100)}층 ${detailNum}호`,
  };
}

/**
 * 랜덤 위험등급 생성
 */
function generateRiskLevel() {
  const levels = ['저위험', '중위험', '고위험'];
  return randomChoice(levels);
}

/**
 * 랜덤 연간 보험료 생성
 */
function generateAnnualPremium() {
  return randomInt(500000, 10000000);
}

/**
 * 랜덤 총 보장액 생성
 */
function generateTotalCoverage() {
  return randomInt(50000000, 1000000000);
}

/**
 * 개인 고객 데이터 생성
 */
function generateIndividualCustomer() {
  const name = generateKoreanName();
  const gender = generateGender();
  const birthDate = generateBirthDate();

  return {
    personal_info: {
      name: name,
      name_en: '', // 영문명은 선택사항
      birth_date: birthDate,
      gender: gender,
      mobile_phone: generateMobilePhone(),
      home_phone: Math.random() > 0.5 ? generateHomePhone() : '',
      work_phone: Math.random() > 0.7 ? generateWorkPhone() : '',
      email: generateEmail(name),
      address: generateAddress(),
    },
    insurance_info: {
      customer_type: '개인',
      risk_level: generateRiskLevel(),
      annual_premium: generateAnnualPremium(),
      total_coverage: generateTotalCoverage(),
    },
  };
}

/**
 * 법인 고객 데이터 생성
 */
function generateCorporateCustomer() {
  const companyName = generateCompanyName();

  return {
    personal_info: {
      name: companyName,
      name_en: '', // 영문명은 선택사항
      birth_date: null, // 법인은 생년월일 없음
      gender: undefined, // 법인은 성별 없음
      mobile_phone: generateMobilePhone(),
      home_phone: '', // 법인은 집 전화 없음
      work_phone: generateWorkPhone(),
      email: generateEmail(companyName.replace(/[^a-zA-Z0-9]/g, '')),
      address: generateAddress(),
    },
    insurance_info: {
      customer_type: '법인',
      risk_level: generateRiskLevel(),
      annual_premium: generateAnnualPremium() * 3, // 법인은 보험료가 더 높음
      total_coverage: generateTotalCoverage() * 5, // 법인은 보장액이 더 높음
    },
  };
}

/**
 * 고객 생성 API 호출
 */
async function createCustomer(customerData) {
  try {
    const response = await axios.post(CUSTOMERS_ENDPOINT, customerData);
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || error.message,
      data: customerData,
    };
  }
}

/**
 * 메인 실행 함수
 */
async function main() {
  // 명령줄 인자 파싱
  const args = process.argv.slice(2);

  // 인자 필수 체크
  if (args.length < 2) {
    console.error('❌ 오류: 개인고객수와 법인고객수를 반드시 입력해야 합니다.\n');
    console.log('사용법:');
    console.log('  node generate_customers.js [개인고객수] [법인고객수]\n');
    console.log('예시:');
    console.log('  node generate_customers.js 70 30   # 개인 70명, 법인 30명');
    console.log('  node generate_customers.js 100 0   # 개인 100명만');
    console.log('  node generate_customers.js 0 50    # 법인 50명만');
    console.log('  node generate_customers.js 200 100 # 개인 200명, 법인 100명');
    process.exit(1);
  }

  const INDIVIDUAL_COUNT = parseInt(args[0]);
  const CORPORATE_COUNT = parseInt(args[1]);

  // 입력 검증
  if (isNaN(INDIVIDUAL_COUNT) || isNaN(CORPORATE_COUNT)) {
    console.error('❌ 오류: 숫자만 입력 가능합니다.');
    console.log('\n예시:');
    console.log('  node generate_customers.js 70 30');
    process.exit(1);
  }

  if (INDIVIDUAL_COUNT < 0 || CORPORATE_COUNT < 0) {
    console.error('❌ 오류: 음수는 입력할 수 없습니다.');
    process.exit(1);
  }

  const TOTAL_CUSTOMERS = INDIVIDUAL_COUNT + CORPORATE_COUNT;

  if (TOTAL_CUSTOMERS === 0) {
    console.log('❌ 생성할 고객이 없습니다. 최소 1명 이상 지정해주세요.');
    process.exit(0);
  }

  console.log('🚀 고객 생성 시작...');
  console.log(`📊 생성 계획: 개인 ${INDIVIDUAL_COUNT}명 + 법인 ${CORPORATE_COUNT}명 = 총 ${TOTAL_CUSTOMERS}명\n`);

  const results = {
    success: 0,
    failed: 0,
    errors: [],
  };

  // 고객 타입 배열 생성 (랜덤 순서로 섞기)
  const customerTypes = [];
  for (let i = 0; i < INDIVIDUAL_COUNT; i++) {
    customerTypes.push('개인');
  }
  for (let i = 0; i < CORPORATE_COUNT; i++) {
    customerTypes.push('법인');
  }

  // Fisher-Yates 알고리즘으로 배열 섞기
  for (let i = customerTypes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [customerTypes[i], customerTypes[j]] = [customerTypes[j], customerTypes[i]];
  }

  console.log('🔀 랜덤 순서로 고객 생성 중...\n');

  // 섞인 순서대로 고객 생성
  for (let i = 0; i < customerTypes.length; i++) {
    const type = customerTypes[i];
    const customer = type === '개인' ? generateIndividualCustomer() : generateCorporateCustomer();
    const result = await createCustomer(customer);

    const emoji = type === '개인' ? '👤' : '🏢';
    if (result.success) {
      results.success++;
      console.log(`✅ [${results.success}/${TOTAL_CUSTOMERS}] ${emoji} ${type} 고객 생성 성공: ${customer.personal_info.name}`);
    } else {
      results.failed++;
      results.errors.push({
        type: type,
        name: customer.personal_info.name,
        error: result.error,
      });
      console.log(`❌ [${results.failed}] ${emoji} ${type} 고객 생성 실패: ${customer.personal_info.name} - ${result.error}`);
    }

    // API 과부하 방지를 위한 딜레이 (100ms)
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // 결과 요약
  console.log('\n' + '='.repeat(60));
  console.log('📊 고객 생성 완료 결과');
  console.log('='.repeat(60));
  console.log(`✅ 성공: ${results.success}명`);
  console.log(`❌ 실패: ${results.failed}명`);
  console.log(`📈 성공률: ${((results.success / TOTAL_CUSTOMERS) * 100).toFixed(2)}%`);

  if (results.errors.length > 0) {
    console.log('\n🚨 실패 상세 내역:');
    results.errors.forEach((error, index) => {
      console.log(`  ${index + 1}. [${error.type}] ${error.name}: ${error.error}`);
    });
  }

  console.log('='.repeat(60));
}

// 스크립트 실행
main().catch(error => {
  console.error('❌ 스크립트 실행 중 오류 발생:', error);
  process.exit(1);
});

// 테스트용 고객 데이터 생성 스크립트
// 개인 고객 40명, 법인 고객 10개 생성
// 전국 주소 분포

const { MongoClient } = require('mongodb');
const axios = require('axios');

const MONGO_URI = 'mongodb://tars:27017/';
const DB_NAME = 'docupload';
const COLLECTION_NAME = 'customers';
const API_URL = 'http://tars.giize.com:3010/api';

// 샘플 데이터
const lastNames = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '홍', '전'];
const firstNames = ['민수', '지영', '서연', '준호', '은지', '성민', '수빈', '현우', '미경', '재현', '하은', '동현', '수진', '태양', '지원', '현서', '민준', '서준', '예준', '도윤'];
const companies = ['삼성전자', 'LG화학', '현대자동차', 'SK텔레콤', '포스코', '카카오', '네이버', '쿠팡', '배달의민족', '토스'];
const companySuffixes = ['주식회사', '(주)', '㈜'];

// 전국 주요 도시별 실제 주소 (도로명주소)
const addresses = [
  // 서울 (10개)
  { postal_code: '06164', address1: '서울특별시 강남구 테헤란로 152', city: '서울', district: '강남구' },
  { postal_code: '07335', address1: '서울특별시 영등포구 여의대로 108', city: '서울', district: '영등포구' },
  { postal_code: '04513', address1: '서울특별시 중구 세종대로 110', city: '서울', district: '중구' },
  { postal_code: '03172', address1: '서울특별시 종로구 종로 1', city: '서울', district: '종로구' },
  { postal_code: '05510', address1: '서울특별시 송파구 올림픽로 300', city: '서울', district: '송파구' },
  { postal_code: '08505', address1: '서울특별시 금천구 가산디지털1로 171', city: '서울', district: '금천구' },
  { postal_code: '02455', address1: '서울특별시 동대문구 천호대로 145', city: '서울', district: '동대문구' },
  { postal_code: '01811', address1: '서울특별시 노원구 노해로 437', city: '서울', district: '노원구' },
  { postal_code: '06979', address1: '서울특별시 동작구 상도로 369', city: '서울', district: '동작구' },
  { postal_code: '03925', address1: '서울특별시 마포구 월드컵북로 396', city: '서울', district: '마포구' },
  
  // 경기도 (10개)
  { postal_code: '13487', address1: '경기도 성남시 분당구 판교역로 235', city: '성남', district: '분당구' },
  { postal_code: '16914', address1: '경기도 용인시 기흥구 중부대로 184', city: '용인', district: '기흥구' },
  { postal_code: '16455', address1: '경기도 수원시 팔달구 효원로 241', city: '수원', district: '팔달구' },
  { postal_code: '14055', address1: '경기도 안양시 동안구 시민대로 235', city: '안양', district: '동안구' },
  { postal_code: '11810', address1: '경기도 의정부시 시민로 1', city: '의정부', district: '' },
  { postal_code: '15809', address1: '경기도 군포시 청백리길 6', city: '군포', district: '' },
  { postal_code: '18087', address1: '경기도 오산시 성호대로 141', city: '오산', district: '' },
  { postal_code: '12653', address1: '경기도 여주시 세종로 1', city: '여주', district: '' },
  { postal_code: '10408', address1: '경기도 고양시 일산동구 중앙로 1256', city: '고양', district: '일산동구' },
  { postal_code: '11690', address1: '경기도 의정부시 평화로 354', city: '의정부', district: '' },
  
  // 부산 (5개)
  { postal_code: '48943', address1: '부산광역시 중구 구덕로 201', city: '부산', district: '중구' },
  { postal_code: '48513', address1: '부산광역시 남구 못골로 19', city: '부산', district: '남구' },
  { postal_code: '48095', address1: '부산광역시 해운대구 중동2로 11', city: '부산', district: '해운대구' },
  { postal_code: '46241', address1: '부산광역시 금정구 중앙대로 1777', city: '부산', district: '금정구' },
  { postal_code: '49241', address1: '부산광역시 서구 구덕로 120', city: '부산', district: '서구' },
  
  // 대구 (5개)
  { postal_code: '41911', address1: '대구광역시 중구 공평로 88', city: '대구', district: '중구' },
  { postal_code: '42429', address1: '대구광역시 남구 이천로 51', city: '대구', district: '남구' },
  { postal_code: '41585', address1: '대구광역시 북구 옥산로 65', city: '대구', district: '북구' },
  { postal_code: '42737', address1: '대구광역시 달서구 달구벌대로 1095', city: '대구', district: '달서구' },
  { postal_code: '41256', address1: '대구광역시 동구 아양로 207', city: '대구', district: '동구' },
  
  // 인천 (5개)
  { postal_code: '21554', address1: '인천광역시 남동구 정각로 29', city: '인천', district: '남동구' },
  { postal_code: '22711', address1: '인천광역시 서구 서곶로 307', city: '인천', district: '서구' },
  { postal_code: '21389', address1: '인천광역시 부평구 부평대로 168', city: '인천', district: '부평구' },
  { postal_code: '22134', address1: '인천광역시 미추홀구 독정이로 95', city: '인천', district: '미추홀구' },
  { postal_code: '23037', address1: '인천광역시 강화군 강화읍 강화대로 394', city: '인천', district: '강화군' },
  
  // 대전 (3개)
  { postal_code: '35242', address1: '대전광역시 서구 둔산로 100', city: '대전', district: '서구' },
  { postal_code: '34126', address1: '대전광역시 유성구 대학로 211', city: '대전', district: '유성구' },
  { postal_code: '35015', address1: '대전광역시 중구 중앙로 100', city: '대전', district: '중구' },
  
  // 광주 (3개)
  { postal_code: '61945', address1: '광주광역시 서구 내방로 111', city: '광주', district: '서구' },
  { postal_code: '62394', address1: '광주광역시 광산구 광산로29번길 15', city: '광주', district: '광산구' },
  { postal_code: '61470', address1: '광주광역시 동구 서남로 1', city: '광주', district: '동구' },
  
  // 울산 (2개)
  { postal_code: '44675', address1: '울산광역시 남구 중앙로 201', city: '울산', district: '남구' },
  { postal_code: '44543', address1: '울산광역시 중구 단장로 367', city: '울산', district: '중구' },
  
  // 제주 (2개)
  { postal_code: '63122', address1: '제주특별자치도 제주시 광양9길 10', city: '제주', district: '제주시' },
  { postal_code: '63592', address1: '제주특별자치도 서귀포시 중앙로 105', city: '제주', district: '서귀포시' },
  
  // 강원도 (2개)
  { postal_code: '24341', address1: '강원도 춘천시 시청길 11', city: '춘천', district: '' },
  { postal_code: '25531', address1: '강원도 강릉시 강릉대로 33', city: '강릉', district: '' },
];

// 휴대폰 번호 생성
function generatePhoneNumber() {
  const prefix = ['010', '011', '016', '017', '018', '019'][Math.floor(Math.random() * 6)];
  const middle = Math.floor(Math.random() * 9000) + 1000;
  const last = Math.floor(Math.random() * 9000) + 1000;
  return `${prefix}-${middle}-${last}`;
}

// 이메일 생성
function generateEmail(name, isCompany = false) {
  const domains = ['gmail.com', 'naver.com', 'daum.net', 'hanmail.net', 'outlook.com', 'kakao.com'];
  const cleanName = name.replace(/[^a-zA-Z0-9가-힣]/g, '').toLowerCase();
  const randomNum = Math.floor(Math.random() * 1000);
  
  if (isCompany) {
    const companyDomains = ['company.co.kr', 'corp.com', 'biz.kr'];
    return `contact@${cleanName}.${companyDomains[Math.floor(Math.random() * companyDomains.length)]}`;
  }
  
  return `${cleanName}${randomNum}@${domains[Math.floor(Math.random() * domains.length)]}`;
}

// 생년월일 생성 (20세 ~ 70세)
function generateBirthDate() {
  const currentYear = new Date().getFullYear();
  const birthYear = currentYear - Math.floor(Math.random() * 50) - 20;
  const month = Math.floor(Math.random() * 12) + 1;
  const day = Math.floor(Math.random() * 28) + 1;
  return new Date(birthYear, month - 1, day);
}

// 개인 고객 데이터 생성
function generatePersonalCustomer(index) {
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const fullName = lastName + firstName;
  const address = addresses[index % addresses.length];
  const gender = Math.random() > 0.5 ? 'M' : 'F';
  const riskLevel = ['저위험', '중위험', '고위험'][Math.floor(Math.random() * 3)];
  
  return {
    personal_info: {
      name: fullName,
      name_en: `${firstName} ${lastName}`.toUpperCase(),
      birth_date: generateBirthDate(),
      gender: gender,
      phone: generatePhoneNumber(),
      email: generateEmail(fullName),
      address: {
        postal_code: address.postal_code,
        address1: address.address1,
        address2: `${Math.floor(Math.random() * 20) + 1}층 ${Math.floor(Math.random() * 10) + 101}호`
      }
    },
    insurance_info: {
      customer_type: '개인',
      risk_level: riskLevel,
      annual_premium: Math.floor(Math.random() * 10000000) + 500000, // 50만원 ~ 1050만원
      total_coverage: Math.floor(Math.random() * 500000000) + 50000000 // 5천만원 ~ 5억5천만원
    },
    contracts: [],
    documents: [],
    consultations: [],
    meta: {
      created_at: new Date(),
      updated_at: new Date(),
      status: 'active',
      is_test_data: true
    }
  };
}

// 법인 고객 데이터 생성
function generateCorporateCustomer(index) {
  const company = companies[index];
  const suffix = companySuffixes[Math.floor(Math.random() * companySuffixes.length)];
  const companyName = `${suffix} ${company}`;
  const address = addresses[Math.floor(Math.random() * addresses.length)];
  const riskLevel = ['저위험', '중위험', '고위험'][Math.floor(Math.random() * 3)];
  
  return {
    personal_info: {
      name: companyName,
      name_en: company.toUpperCase() + ' CO., LTD.',
      birth_date: null, // 법인은 생년월일 없음
      gender: null,
      phone: generatePhoneNumber(),
      email: generateEmail(company, true),
      address: {
        postal_code: address.postal_code,
        address1: address.address1,
        address2: `${Math.floor(Math.random() * 10) + 1}층`
      }
    },
    insurance_info: {
      customer_type: '법인',
      risk_level: riskLevel,
      annual_premium: Math.floor(Math.random() * 100000000) + 10000000, // 1천만원 ~ 1억1천만원
      total_coverage: Math.floor(Math.random() * 5000000000) + 500000000 // 5억원 ~ 55억원
    },
    contracts: [],
    documents: [],
    consultations: [],
    meta: {
      created_at: new Date(),
      updated_at: new Date(),
      status: 'active',
      is_test_data: true
    }
  };
}

async function createTestCustomers() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    console.log('📡 MongoDB 연결 중...');
    await client.connect();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);
    
    console.log('🧹 기존 테스트 데이터 삭제 중...');
    // 기존 테스트 데이터 삭제
    const deleteResult = await collection.deleteMany({ 'meta.is_test_data': true });
    console.log(`   삭제된 테스트 데이터: ${deleteResult.deletedCount}개`);
    
    const customers = [];
    
    // 개인 고객 40명 생성
    console.log('👤 개인 고객 40명 생성 중...');
    for (let i = 0; i < 40; i++) {
      const customer = generatePersonalCustomer(i);
      customers.push(customer);
      console.log(`   개인 고객 ${i + 1}/40: ${customer.personal_info.name} (${customer.personal_info.address.address1.split(' ').slice(0, 3).join(' ')})`);
    }
    
    // 법인 고객 10개 생성
    console.log('🏢 법인 고객 10개 생성 중...');
    for (let i = 0; i < 10; i++) {
      const customer = generateCorporateCustomer(i);
      customers.push(customer);
      console.log(`   법인 고객 ${i + 1}/10: ${customer.personal_info.name}`);
    }
    
    // MongoDB에 직접 삽입
    console.log('\n💾 데이터베이스에 저장 중...');
    const result = await collection.insertMany(customers);
    console.log(`✅ 총 ${result.insertedCount}개의 고객 데이터가 성공적으로 생성되었습니다!`);
    
    // 지역별 통계
    console.log('\n📊 지역별 분포:');
    const cityStats = {};
    customers.forEach(customer => {
      const city = customer.personal_info.address.address1.split(' ')[0];
      cityStats[city] = (cityStats[city] || 0) + 1;
    });
    
    Object.entries(cityStats)
      .sort((a, b) => b[1] - a[1])
      .forEach(([city, count]) => {
        console.log(`   ${city}: ${count}명`);
      });
    
    console.log('\n🎯 테스트 데이터 생성 완료!');
    console.log('   - 개인 고객: 40명');
    console.log('   - 법인 고객: 10개');
    console.log('   - 총 고객 수: 50개');
    
  } catch (error) {
    console.error('❌ 오류 발생:', error.message);
  } finally {
    await client.close();
    console.log('🔌 MongoDB 연결 종료');
  }
}

// 실행
console.log('🚀 테스트 고객 데이터 생성 스크립트 시작');
console.log('================================================');
createTestCustomers();
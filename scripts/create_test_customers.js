/**
 * 고객 관리 리스트 테스트용 실제 모사 데이터 100명 생성 스크립트
 * 
 * 실행 방법: node scripts/create_test_customers.js
 */

const http = require('http');

const API_HOST = 'tars.giize.com';
const API_PORT = 3010;

// HTTP 요청 헬퍼 함수
function makeHttpRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_HOST,
      port: API_PORT,
      path: `/api${path}`,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    if (data) {
      const jsonData = JSON.stringify(data);
      options.headers['Content-Length'] = Buffer.byteLength(jsonData);
    }

    const req = http.request(options, (res) => {
      let responseBody = '';
      
      res.on('data', (chunk) => {
        responseBody += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsedData = JSON.parse(responseBody);
          resolve({ data: parsedData, status: res.statusCode });
        } catch (error) {
          reject(new Error(`Invalid JSON response: ${responseBody}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// 한국인 성씨와 이름
const koreanSurnames = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '전', '홍', '고', '문', '양', '손', '배', '조', '백', '허', '유', '남', '심', '노', '정', '하', '곽', '성', '차', '주', '우'];
const koreanMaleNames = ['민준', '서준', '도윤', '예준', '시우', '주원', '하준', '지호', '지후', '준서', '건우', '현우', '우진', '성민', '지훈', '연우', '정우', '승현', '승우', '시윤', '준혁', '은우', '도현', '휘준', '유준'];
const koreanFemaleNames = ['서연', '서윤', '지우', '서현', '민서', '하은', '하윤', '윤서', '지민', '지현', '채원', '다은', '수아', '소율', '예은', '예린', '시은', '소은', '유나', '채은', '지원', '서영', '수빈', '예원', '지유'];

// 서울시 실제 동네
const seoulDistricts = [
  { gu: '강남구', dong: ['역삼동', '청담동', '압구정동', '신사동', '논현동', '삼성동', '대치동', '개포동', '도곡동', '일원동'] },
  { gu: '강동구', dong: ['명일동', '고덕동', '상일동', '길동', '둔촌동', '암사동', '천호동', '성내동'] },
  { gu: '강북구', dong: ['수유동', '미아동', '번동', '우이동'] },
  { gu: '강서구', dong: ['화곡동', '등촌동', '염창동', '가양동', '마곡동', '발산동', '공항동', '방화동'] },
  { gu: '관악구', dong: ['신림동', '봉천동', '남현동', '조원동', '대학동', '인헌동'] },
  { gu: '광진구', dong: ['화양동', '군자동', '중곡동', '능동', '광장동', '자양동', '구의동'] },
  { gu: '구로구', dong: ['신도림동', '구로동', '가리봉동', '개봉동', '오류동', '천왕동', '항동'] },
  { gu: '금천구', dong: ['가산동', '독산동', '시흥동'] },
  { gu: '노원구', dong: ['상계동', '중계동', '하계동', '공릉동', '월계동'] },
  { gu: '도봉구', dong: ['쌍문동', '방학동', '창동', '도봉동'] },
  { gu: '동대문구', dong: ['용두동', '제기동', '전농동', '답십리동', '장안동', '청량리동', '회기동', '휘경동'] },
  { gu: '동작구', dong: ['노량진동', '상도동', '흑석동', '사당동', '대방동', '신대방동'] },
  { gu: '마포구', dong: ['공덕동', '아현동', '용강동', '대흥동', '신수동', '서교동', '홍대동', '상암동', '망원동', '합정동', '연남동'] },
  { gu: '서대문구', dong: ['충정로동', '천연동', '신촌동', '연희동', '홍제동', '홍은동', '남가좌동', '북가좌동'] },
  { gu: '서초구', dong: ['서초동', '잠원동', '반포동', '방배동', '양재동', '내곡동'] },
  { gu: '성동구', dong: ['왕십리동', '마장동', '사근동', '행당동', '응봉동', '금호동', '옥수동', '성수동', '용답동'] },
  { gu: '성북구', dong: ['성북동', '삼선동', '동선동', '돈암동', '안암동', '보문동', '정릉동', '길음동', '종암동', '월곡동', '장위동', '석관동'] },
  { gu: '송파구', dong: ['풍납동', '거여동', '마천동', '방이동', '오금동', '송파동', '석촌동', '삼전동', '가락동', '문정동', '장지동', '위례동'] },
  { gu: '양천구', dong: ['목동', '신월동', '신정동'] },
  { gu: '영등포구', dong: ['영등포동', '여의도동', '당산동', '도림동', '문래동', '양평동', '신길동', '대림동'] },
  { gu: '용산구', dong: ['후암동', '용산동', '남영동', '청파동', '원효로동', '효창동', '용문동', '한남동', '이촌동', '이태원동', '한강로동'] },
  { gu: '은평구', dong: ['은평동', '녹번동', '불광동', '갈현동', '구산동', '대조동', '신사동', '증산동', '진관동'] },
  { gu: '종로구', dong: ['청운동', '효자동', '사직동', '삼청동', '부암동', '평창동', '무악동', '교남동', '가회동', '종로동', '명륜동', '창신동', '숭인동'] },
  { gu: '중구', dong: ['소공동', '회현동', '명동', '필동', '장충동', '광희동', '을지로동', '신당동', '다산동', '약수동', '청구동', '신당동', '황학동', '중림동'] },
  { gu: '중랑구', dong: ['면목동', '상봉동', '중화동', '묵동', '망우동', '신내동'] }
];

// 도로명 주소 생성
const roadNames = ['테헤란로', '강남대로', '논현로', '선릉로', '봉은사로', '압구정로', '도산대로', '언주로', '영동대로', '삼성로', '학동로', '반포대로', '방배로', '사평대로', '효령로', '서초대로', '양재대로', '동작대로', '국회대로', '마포대로', '홍익로', '연남로', '성산로', '동교로'];

// 이메일 도메인
const emailDomains = ['gmail.com', 'naver.com', 'daum.net', 'nate.com', 'hotmail.com', 'yahoo.co.kr'];

// 보험 관련 데이터
const customerTypes = ['개인', '법인'];
const riskLevels = ['저위험', '중위험', '고위험'];

// 랜덤 선택 함수
function randomChoice(array) {
  return array[Math.floor(Math.random() * array.length)];
}

// 랜덤 번호 생성
function randomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 랜덤 날짜 생성 (과거 1-5년)
function randomPastDate(yearsBack) {
  const now = new Date();
  const pastDate = new Date(now.getTime() - (Math.random() * yearsBack * 365 * 24 * 60 * 60 * 1000));
  return pastDate;
}

// 생년월일 생성 (20-70세)
function randomBirthDate() {
  const currentYear = new Date().getFullYear();
  const birthYear = currentYear - randomNumber(20, 70);
  const month = randomNumber(1, 12);
  const day = randomNumber(1, 28); // 간단히 28일까지만
  return new Date(birthYear, month - 1, day);
}

// 전화번호 생성
function generatePhoneNumber() {
  const prefixes = ['010', '011', '016', '017', '018', '019'];
  const prefix = randomChoice(prefixes);
  const middle = randomNumber(1000, 9999);
  const last = randomNumber(1000, 9999);
  return `${prefix}-${middle}-${last}`;
}

// 이메일 생성
function generateEmail(name) {
  const romanized = name.replace(/[가-힣]/g, 'user') + randomNumber(1, 999);
  const domain = randomChoice(emailDomains);
  return `${romanized}@${domain}`;
}

// 주소 생성
function generateAddress() {
  const district = randomChoice(seoulDistricts);
  const dong = randomChoice(district.dong);
  const roadName = randomChoice(roadNames);
  const buildingNumber = randomNumber(1, 500);
  const postalCode = randomNumber(10000, 99999).toString().padStart(5, '0');
  
  return {
    postal_code: postalCode,
    address1: `서울 ${district.gu} ${roadName} ${buildingNumber}`,
    address2: `${randomNumber(101, 2050)}호`
  };
}

// 고객 데이터 생성
function generateCustomer() {
  const gender = randomChoice(['M', 'F']);
  const surname = randomChoice(koreanSurnames);
  const firstName = gender === 'M' ? randomChoice(koreanMaleNames) : randomChoice(koreanFemaleNames);
  const name = surname + firstName;
  
  const birthDate = randomBirthDate();
  const createdDate = randomPastDate(3); // 최근 3년 내 등록
  const updatedDate = new Date(createdDate.getTime() + Math.random() * (Date.now() - createdDate.getTime()));
  
  return {
    personal_info: {
      name: name,
      name_en: '', // 일부만 영문명 있음
      birth_date: birthDate,
      gender: gender,
      phone: generatePhoneNumber(),
      email: generateEmail(name),
      address: generateAddress()
    },
    insurance_info: {
      customer_type: randomChoice(customerTypes),
      risk_level: randomChoice(riskLevels),
      annual_premium: randomNumber(500000, 5000000), // 50만~500만원
      total_coverage: randomNumber(10000000, 100000000) // 1천만~1억원
    },
    contracts: [],
    documents: [],
    consultations: [],
    meta: {
      status: randomChoice(['active', 'inactive']), // 90% active
      created_at: createdDate,
      updated_at: updatedDate,
      created_by: 'system',
      updated_by: 'system'
    }
  };
}

async function createTestCustomers() {
  try {
    console.log('🔌 API 서버 연결 확인 중...');
    
    // API 서버 연결 확인
    try {
      const response = await makeHttpRequest('GET', '/customers?limit=1');
      console.log('✅ API 서버 연결 성공');
    } catch (error) {
      console.error('❌ API 서버에 연결할 수 없습니다:', error.message);
      console.error('   tars.giize.com:3010 서버가 실행 중인지 확인해주세요.');
      return;
    }
    
    // 100명의 테스트 고객 생성
    console.log('👥 테스트 고객 100명 생성 중...');
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 1; i <= 100; i++) {
      try {
        const customer = generateCustomer();
        
        const response = await makeHttpRequest('POST', '/customers', customer);
        
        if (response.data.success) {
          successCount++;
        } else {
          failCount++;
          console.warn(`   ⚠️  ${i}번 고객 생성 실패: ${response.data.error}`);
        }
        
        if (i % 10 === 0) {
          console.log(`   진행률: ${i}/100 (성공: ${successCount}, 실패: ${failCount})`);
        }
        
        // API 과부하 방지를 위한 약간의 지연
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        failCount++;
        console.warn(`   ❌ ${i}번 고객 API 호출 실패:`, error.message);
      }
    }
    
    console.log(`\n✅ 테스트 고객 생성 완료!`);
    console.log(`   성공: ${successCount}명`);
    console.log(`   실패: ${failCount}명`);
    
    // 생성된 고객 통계 확인
    try {
      console.log('\n📊 현재 고객 통계 조회 중...');
      const statsResponse = await makeHttpRequest('GET', '/customers?limit=1000');
      
      if (statsResponse.data.success) {
        const customers = statsResponse.data.data.customers;
        const total = customers.length;
        
        // 고객 유형별 통계
        const typeStats = customers.reduce((acc, customer) => {
          const type = customer.insurance_info?.customer_type || '미분류';
          acc[type] = (acc[type] || 0) + 1;
          return acc;
        }, {});
        
        // 위험도별 통계
        const riskStats = customers.reduce((acc, customer) => {
          const risk = customer.insurance_info?.risk_level || '미분류';
          acc[risk] = (acc[risk] || 0) + 1;
          return acc;
        }, {});
        
        console.log(`\n📈 현재 전체 고객: ${total}명`);
        console.log('\n고객 유형별 분포:');
        Object.entries(typeStats).forEach(([type, count]) => {
          console.log(`   ${type}: ${count}명`);
        });
        
        console.log('\n위험도별 분포:');
        Object.entries(riskStats).forEach(([risk, count]) => {
          console.log(`   ${risk}: ${count}명`);
        });
      }
    } catch (error) {
      console.warn('⚠️  통계 조회 실패:', error.message);
    }
    
  } catch (error) {
    console.error('❌ 전체 프로세스 오류:', error);
  }
}

// 스크립트 실행
if (require.main === module) {
  createTestCustomers()
    .then(() => {
      console.log('\n🎉 테스트 고객 데이터 생성 완료!');
      console.log('   고객 관리 리스트에서 확인해보세요.');
    })
    .catch(error => {
      console.error('💥 스크립트 실행 실패:', error);
      process.exit(1);
    });
}

module.exports = { createTestCustomers };
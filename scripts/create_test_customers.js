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

// 전국 시도별 지역 데이터
const koreanRegions = [
  // 서울특별시
  { city: '서울', gu: '강남구', dong: ['역삼동', '청담동', '압구정동', '신사동', '논현동', '삼성동', '대치동', '개포동'] },
  { city: '서울', gu: '강동구', dong: ['명일동', '고덕동', '상일동', '길동', '둔촌동', '암사동'] },
  { city: '서울', gu: '강북구', dong: ['수유동', '미아동', '번동', '우이동'] },
  { city: '서울', gu: '마포구', dong: ['공덕동', '서교동', '홍대동', '상암동', '망원동', '합정동'] },
  { city: '서울', gu: '종로구', dong: ['청운동', '삼청동', '부암동', '가회동', '명륜동'] },
  
  // 부산광역시
  { city: '부산', gu: '해운대구', dong: ['우동', '중동', '송정동', '반여동', '재송동'] },
  { city: '부산', gu: '부산진구', dong: ['부전동', '서면동', '전포동', '양정동', '연지동'] },
  { city: '부산', gu: '동래구', dong: ['온천동', '사직동', '명륜동', '복천동'] },
  { city: '부산', gu: '남구', dong: ['대연동', '용호동', '감만동', '우암동'] },
  { city: '부산', gu: '서구', dong: ['서대신동', '동대신동', '부민동', '아미동'] },
  
  // 대구광역시
  { city: '대구', gu: '중구', dong: ['동인동', '삼덕동', '남산동', '대봉동'] },
  { city: '대구', gu: '달서구', dong: ['성서동', '월성동', '상인동', '도원동'] },
  { city: '대구', gu: '수성구', dong: ['범어동', '만촌동', '지산동', '황금동'] },
  { city: '대구', gu: '북구', dong: ['칠성동', '산격동', '대현동', '검단동'] },
  
  // 인천광역시
  { city: '인천', gu: '연수구', dong: ['송도동', '청학동', '동춘동', '연수동'] },
  { city: '인천', gu: '남동구', dong: ['구월동', '간석동', '만수동', '서창동'] },
  { city: '인천', gu: '부평구', dong: ['부평동', '산곡동', '청천동', '십정동'] },
  { city: '인천', gu: '서구', dong: ['검단동', '청라동', '가정동', '경서동'] },
  
  // 광주광역시
  { city: '광주', gu: '서구', dong: ['치평동', '상무동', '금호동', '농성동'] },
  { city: '광주', gu: '북구', dong: ['두암동', '오치동', '문흥동', '용봉동'] },
  { city: '광주', gu: '남구', dong: ['봉선동', '주월동', '방림동', '양림동'] },
  
  // 대전광역시
  { city: '대전', gu: '유성구', dong: ['봉명동', '관평동', '도룡동', '신성동'] },
  { city: '대전', gu: '서구', dong: ['둔산동', '탄방동', '용문동', '월평동'] },
  { city: '대전', gu: '중구', dong: ['은행동', '대흥동', '문화동', '선화동'] },
  
  // 울산광역시
  { city: '울산', gu: '남구', dong: ['삼산동', '달동', '야음동', '무거동'] },
  { city: '울산', gu: '북구', dong: ['화봉동', '농소동', '송정동', '명촌동'] },
  { city: '울산', gu: '동구', dong: ['일산동', '화정동', '대송동', '전하동'] },
  
  // 경기도
  { city: '수원', gu: '영통구', dong: ['매탄동', '영통동', '망포동', '원천동'] },
  { city: '성남', gu: '분당구', dong: ['정자동', '서현동', '수내동', '야탑동'] },
  { city: '고양', gu: '일산서구', dong: ['주엽동', '대화동', '킨텍스', '가좌동'] },
  { city: '용인', gu: '기흥구', dong: ['신갈동', '구성동', '보정동', '죽전동'] },
  { city: '부천', gu: '원미구', dong: ['중동', '상동', '춘의동', '도당동'] },
  { city: '안산', gu: '단원구', dong: ['고잔동', '원곡동', '선부동', '신길동'] },
  { city: '안양', gu: '동안구', dong: ['평촌동', '범계동', '관양동', '호계동'] },
  { city: '남양주', gu: '', dong: ['다산동', '별내동', '화도읍', '와부읍'] },
  { city: '화성', gu: '', dong: ['동탄동', '봉담읍', '향남읍', '우정읍'] },
  
  // 강원특별자치도
  { city: '춘천', gu: '', dong: ['후평동', '효자동', '온의동', '석사동'] },
  { city: '원주', gu: '', dong: ['단계동', '무실동', '관설동', '반곡동'] },
  { city: '강릉', gu: '', dong: ['교동', '성남동', '포남동', '내곡동'] },
  
  // 충청북도
  { city: '청주', gu: '흥덕구', dong: ['복대동', '가경동', '비하동', '신봉동'] },
  { city: '청주', gu: '서원구', dong: ['분평동', '개신동', '산남동', '성화동'] },
  { city: '충주', gu: '', dong: ['연수동', '교현동', '금릉동', '용산동'] },
  
  // 충청남도
  { city: '천안', gu: '동남구', dong: ['신부동', '다가동', '원성동', '청당동'] },
  { city: '천안', gu: '서북구', dong: ['쌍용동', '백석동', '불당동', '성성동'] },
  { city: '아산', gu: '', dong: ['온천동', '배방읍', '탕정면', '영인면'] },
  { city: '서산', gu: '', dong: ['동문동', '석림동', '읍내동', '부석면'] },
  
  // 전라북도
  { city: '전주', gu: '완산구', dong: ['서신동', '효자동', '삼천동', '중화산동'] },
  { city: '전주', gu: '덕진구', dong: ['금암동', '인후동', '덕진동', '우아동'] },
  { city: '군산', gu: '', dong: ['수송동', '조촌동', '개정동', '경암동'] },
  
  // 전라남도
  { city: '목포', gu: '', dong: ['하당동', '연산동', '상동', '용해동'] },
  { city: '여수', gu: '', dong: ['학동', '둔덕동', '여서동', '미평동'] },
  { city: '순천', gu: '', dong: ['조례동', '연향동', '왕조동', '덕연동'] },
  
  // 경상북도
  { city: '포항', gu: '남구', dong: ['효곡동', '대도동', '괴동동', '상도동'] },
  { city: '포항', gu: '북구', dong: ['두호동', '장성동', '죽도동', '득량동'] },
  { city: '경주', gu: '', dong: ['황성동', '동천동', '성건동', '용강동'] },
  
  // 경상남도
  { city: '창원', gu: '성산구', dong: ['상남동', '중앙동', '사파동', '웅남동'] },
  { city: '창원', gu: '의창구', dong: ['팔용동', '명서동', '신월동', '북면'] },
  { city: '김해', gu: '', dong: ['삼계동', '내외동', '어방동', '활천동'] },
  { city: '진주', gu: '', dong: ['상평동', '신안동', '하대동', '충무공동'] },
  
  // 제주특별자치도
  { city: '제주', gu: '', dong: ['이도동', '삼도동', '용담동', '건입동'] },
  { city: '서귀포', gu: '', dong: ['서귀동', '중문동', '대정읍', '성산읍'] }
];

// 도로명 주소 생성
const roadNames = ['중앙로', '역전로', '시청로', '문화로', '평화로', '번영로', '희망로', '행복로', '청년로', '미래로', '신도시로', '산업로', '학원로', '상업로', '주공로', '대학로', '공원로', '체육로', '예술로', '과학로', '기술로', '발전로', '성공로', '통일로'];

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
  const region = randomChoice(koreanRegions);
  const dong = randomChoice(region.dong);
  const roadName = randomChoice(roadNames);
  const buildingNumber = randomNumber(1, 500);
  const postalCode = randomNumber(10000, 99999).toString().padStart(5, '0');
  
  const address1 = region.gu 
    ? `${region.city} ${region.gu} ${roadName} ${buildingNumber}`
    : `${region.city} ${dong} ${roadName} ${buildingNumber}`;
  
  return {
    postal_code: postalCode,
    address1: address1,
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
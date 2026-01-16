/**
 * Annual Report Parser 자동화 검증 테스트
 *
 * 모든 샘플 파일의 파싱 결과가 원본 데이터와 100% 일치하는지 검증
 */
import { parseAnnualReportPage2 } from './src/shared/lib/annualReportParser.ts';
import * as fs from 'fs';
import * as path from 'path';

const sampleDir = path.resolve('./../../samples/MetlifeReport/AnnualReport');

// ============================================================================
// 예상 결과 데이터 (원본 PDF 기반 정확한 값)
// ============================================================================

const expectedData = [
  // 1. 박형서
  {
    fileName: 'AR20260113_00038235_0003823520151027000003_page2.txt',
    insuredName: '박형서',
    totalContracts: 1,
    contracts: [
      {
        seq: 1,
        policyNumber: '0000010010',
        productName: '평생보장보험',
        contractor: '박형서',
        insured: '박형서',
        contractDate: '1990-08-27',
        status: '정상',
        premium: 36600,
      },
    ],
  },
  // 2. 김보성
  {
    fileName: '김보성보유계약현황202508_page2.txt',
    insuredName: '김보성',
    totalContracts: 6,
    contracts: [
      {
        seq: 1,
        policyNumber: '0004155605',
        productName: '무배당 마스터플랜 변액유니버셜종신Ⅱ보험',
        contractor: '김보성',
        insured: '김보성',
        contractDate: '2009-06-10',
        status: '정상',
        premium: 65200,
      },
      {
        seq: 2,
        policyNumber: '0011533898',
        productName: '무배당 실버플랜 변액유니버셜V보험',
        contractor: '캐치업코리아',
        insured: '김보성',
        contractDate: '2014-03-21',
        status: '정상',
        premium: 992500,
      },
      {
        seq: 3,
        policyNumber: '0012526414',
        productName: '무배당 암엔암보험',
        contractor: '김보성',
        insured: '김보성',
        contractDate: '2018-11-22',
        status: '정상',
        premium: 5100,
      },
      {
        seq: 4,
        policyNumber: '0012637379',
        productName: '무배당 유니버셜달러종신보험',
        contractor: '김보성',
        insured: '김보성',
        contractDate: '2019-06-26',
        status: '정상',
        premium: 2505490,
      },
      {
        seq: 5,
        policyNumber: '0013509688',
        productName: '무배당 변액연금보험 동행 Plus',
        contractor: '김보성',
        insured: '김보성',
        contractDate: '2024-04-29',
        status: '정상',
        premium: 200000000,
      },
      {
        seq: 6,
        policyNumber: '0013731763',
        productName: '무배당 모두의 종신보험(무해약환급금형)',
        contractor: '안영미',
        insured: '김보성',
        contractDate: '2025-06-02',
        status: '정상',
        premium: 751450,
      },
    ],
  },
  // 3. 신상철
  {
    fileName: '신상철보유계약현황2025081_page2.txt',
    insuredName: '신상철',
    totalContracts: 4,
    contracts: [
      {
        seq: 1,
        policyNumber: '0013017050',
        productName: '무배당 미리받는GI종신보험(저해지환급금형)',
        contractor: '신상철',
        insured: '신상철',
        contractDate: '2021-05-09',
        status: '정상',
        premium: 219380,
      },
      {
        seq: 2,
        policyNumber: '0013107410',
        productName: '무배당 백만인을 위한 달러종신보험(저해지환급금형)',
        contractor: '신상철',
        insured: '신상철',
        contractDate: '2021-10-31',
        status: '정상',
        premium: 590050,
      },
      {
        seq: 3,
        policyNumber: '0013262131',
        productName: '무배당 변액유니버셜 오늘의 종신보험 Plus',
        contractor: '신상철',
        insured: '신상철',
        contractDate: '2022-10-17',
        status: '정상',
        premium: 105200,
      },
      {
        seq: 4,
        policyNumber: '0013526523',
        productName: '무배당 모두의 종신보험(저해약환급금형)',
        contractor: '신상철',
        insured: '신상철',
        contractDate: '2024-06-05',
        status: '정상',
        premium: 200996,
      },
    ],
  },
  // 4. 안영미
  {
    fileName: '안영미annual report202508_page2.txt',
    insuredName: '안영미',
    totalContracts: 10,
    contracts: [
      {
        seq: 1,
        policyNumber: '0004164025',
        productName: '무배당 마스터플랜 변액유니버셜종신Ⅱ보험',
        contractor: '김보성',
        insured: '안영미',
        contractDate: '2009-06-28',
        status: '정상',
        premium: 81750,
      },
      {
        seq: 2,
        policyNumber: '0012526385',
        productName: '무배당 암엔암보험',
        contractor: '안영미',
        insured: '안영미',
        contractDate: '2018-11-22',
        status: '정상',
        premium: 57900,
      },
      {
        seq: 3,
        policyNumber: '0012530455',
        productName: '무배당 유니버셜달러종신보험',
        contractor: '캐치업코리아',
        insured: '안영미',
        contractDate: '2018-11-29',
        status: '정상',
        premium: 3710230,
      },
      {
        seq: 4,
        policyNumber: '0012824529',
        productName: '무배당 미리받는GI종신보험(저해지환급금형)',
        contractor: '안영미',
        insured: '안영미',
        contractDate: '2020-06-21',
        status: '정상',
        premium: 468400,
      },
      {
        seq: 5,
        policyNumber: '0012826998',
        productName: '무배당 심뇌혈관종합건강보험(무해지환급금형)',
        contractor: '안영미',
        insured: '안영미',
        contractDate: '2020-06-26',
        status: '정상',
        premium: 50500,
      },
      {
        seq: 6,
        policyNumber: '0012902479',
        productName: '무배당 달러경영인정기보험',
        contractor: '캐치업코리아',
        insured: '안영미',
        contractDate: '2020-11-17',
        status: '정상',
        premium: 3776680,
      },
      {
        seq: 7,
        policyNumber: '0013124877',
        productName: '무배당 달러경영인정기보험',
        contractor: '캐치업코리아',
        insured: '안영미',
        contractDate: '2021-11-30',
        status: '정상',
        premium: 4028010,
      },
      {
        seq: 8,
        policyNumber: '0013131970',
        productName: '무배당 360 종합보장보험(무해지환급금형)',
        contractor: '안영미',
        insured: '안영미',
        contractDate: '2021-12-17',
        status: '정상',
        premium: 170427,
      },
      {
        seq: 9,
        policyNumber: '0013264509',
        productName: '무배당 변액유니버셜 VIP 종신보험 Plus',
        contractor: '안영미',
        insured: '안영미',
        contractDate: '2022-10-24',
        status: '정상',
        premium: 1758240,
      },
      {
        seq: 10,
        policyNumber: '0013620295',
        productName: '무배당 오늘의달러연금보험',
        contractor: '안영미',
        insured: '안영미',
        contractDate: '2024-12-19',
        status: '정상',
        premium: 111456000,
      },
    ],
  },
  // 5. 정부균
  {
    fileName: '정부균보유계약현황202508_page2.txt',
    insuredName: '정부균',
    totalContracts: 4,
    contracts: [
      {
        seq: 1,
        policyNumber: '0013224973',
        productName: '무배당 변액유니버셜 모두의상속종신보험',
        contractor: '정부균',
        insured: '정부균',
        contractDate: '2022-07-19',
        status: '정상',
        premium: 121920,
      },
      {
        seq: 2,
        policyNumber: '0013535928',
        productName: '무배당 360 암보험(갱신형)',
        contractor: '정부균',
        insured: '정부균',
        contractDate: '2024-06-28',
        status: '정상',
        premium: 31920,
      },
      {
        seq: 3,
        policyNumber: '0013785622',
        productName: '무배당 오늘의달러연금보험',
        contractor: '정부균',
        insured: '정부균',
        contractDate: '2025-08-26',
        status: '업무처리중',
        premium: 20859000,
      },
      {
        seq: 4,
        policyNumber: '0013785642',
        productName: '무배당 백만인을 위한 달러종신보험 Plus(저해약환급금형)',
        contractor: '정부균',
        insured: '정부균',
        contractDate: '2025-08-26',
        status: '업무처리중',
        premium: 140330,
      },
    ],
  },
];

// ============================================================================
// 테스트 실행
// ============================================================================

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function assertEqual(actual, expected, description) {
  totalTests++;
  if (actual === expected) {
    passedTests++;
    return true;
  } else {
    failedTests++;
    failures.push({
      description,
      expected,
      actual,
    });
    return false;
  }
}

console.log('');
console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║       Annual Report Parser 자동화 검증 테스트                   ║');
console.log('╚════════════════════════════════════════════════════════════════╝');
console.log('');

for (const expected of expectedData) {
  const filePath = path.join(sampleDir, expected.fileName);
  const text = fs.readFileSync(filePath, 'utf-8');
  const result = parseAnnualReportPage2(text);

  console.log(`▶ ${expected.insuredName} (${expected.fileName})`);
  console.log('─'.repeat(60));

  // 헤더 검증
  assertEqual(result.insuredName, expected.insuredName, `${expected.insuredName}: 피보험자명`);
  assertEqual(result.totalContracts, expected.totalContracts, `${expected.insuredName}: 총 계약 수`);
  assertEqual(result.contracts.length, expected.contracts.length, `${expected.insuredName}: 파싱된 계약 수`);

  // 각 계약 검증
  for (let i = 0; i < expected.contracts.length; i++) {
    const exp = expected.contracts[i];
    const act = result.contracts[i];
    const prefix = `${expected.insuredName} 계약${exp.seq}`;

    assertEqual(act?.seq, exp.seq, `${prefix}: 순번`);
    assertEqual(act?.policyNumber, exp.policyNumber, `${prefix}: 증권번호`);
    assertEqual(act?.productName, exp.productName, `${prefix}: 상품명`);
    assertEqual(act?.contractor, exp.contractor, `${prefix}: 계약자`);
    assertEqual(act?.insured, exp.insured, `${prefix}: 피보험자`);
    assertEqual(act?.contractDate, exp.contractDate, `${prefix}: 계약일`);
    assertEqual(act?.status, exp.status, `${prefix}: 계약상태`);
    assertEqual(act?.premium, exp.premium, `${prefix}: 보험료`);

    const allMatch =
      act?.seq === exp.seq &&
      act?.policyNumber === exp.policyNumber &&
      act?.productName === exp.productName &&
      act?.contractor === exp.contractor &&
      act?.insured === exp.insured &&
      act?.contractDate === exp.contractDate &&
      act?.status === exp.status &&
      act?.premium === exp.premium;

    const statusIcon = allMatch ? '✅' : '❌';
    console.log(`  ${statusIcon} 계약 ${exp.seq}: ${exp.policyNumber} - ${exp.productName.substring(0, 25)}...`);
  }

  console.log('');
}

// 결과 요약
console.log('═'.repeat(60));
console.log('테스트 결과 요약');
console.log('═'.repeat(60));
console.log(`총 테스트: ${totalTests}개`);
console.log(`통과: ${passedTests}개 (${((passedTests / totalTests) * 100).toFixed(1)}%)`);
console.log(`실패: ${failedTests}개`);
console.log('');

if (failures.length > 0) {
  console.log('❌ 실패한 테스트 상세:');
  console.log('─'.repeat(60));
  for (const f of failures) {
    console.log(`  ${f.description}`);
    console.log(`    예상: "${f.expected}"`);
    console.log(`    실제: "${f.actual}"`);
    console.log('');
  }
} else {
  console.log('🎉 모든 테스트 통과! 100% 정확도 달성!');
}

// 종합 통계
console.log('');
console.log('═'.repeat(60));
console.log('종합 통계');
console.log('═'.repeat(60));
const totalContracts = expectedData.reduce((sum, d) => sum + d.contracts.length, 0);
console.log(`샘플 파일: ${expectedData.length}개`);
console.log(`총 계약: ${totalContracts}건`);
console.log(`정확도: ${failedTests === 0 ? '100%' : ((passedTests / totalTests) * 100).toFixed(1) + '%'}`);
console.log('');

// Exit code
process.exit(failedTests > 0 ? 1 : 0);

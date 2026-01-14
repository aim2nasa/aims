// 100개 AR PDF 생성 및 파싱 테스트
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import path from 'path';

// generator 모듈 import
const generatorPath = './dist/generator.js';

async function loadGenerator() {
  const module = await import(generatorPath);
  return module;
}

// 한글 이름 생성
const lastNames = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '홍'];
const firstNames = ['민준', '서준', '도윤', '예준', '시우', '주원', '하준', '지호', '지훈', '준서', '서연', '서윤', '지우', '서현', '민서', '하은', '하윤', '윤서', '지민', '채원', '수빈', '지원', '소율', '다은', '예은', '수아', '지아', '민지', '수현', '유진'];

function randomName() {
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  return lastName + firstName;
}

async function testParsePDF(pdfBytes, fileName) {
  const pdf = await getDocument({ data: pdfBytes }).promise;
  const page = await pdf.getPage(1);
  const textContent = await page.getTextContent();
  const text = textContent.items.map(item => item.str || '').join(' ');

  // 공백 정규화
  const normalizedText = text.replace(/\s+/g, ' ');

  // 키워드 매칭
  const requiredKeywords = ['Annual Review Report'];
  const optionalKeywords = ['보유계약 현황', 'MetLife', '고객님을 위한', '메트라이프생명'];

  const matchedRequired = requiredKeywords.filter(kw => normalizedText.includes(kw));
  const matchedOptional = optionalKeywords.filter(kw => normalizedText.includes(kw));

  // 고객명 추출
  const customerNamePattern = /([가-힣]{2,10})\s*고객님을\s*위한/;
  const customerMatch = normalizedText.match(customerNamePattern);

  // 날짜 추출
  const datePattern = /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/;
  const dateMatch = normalizedText.match(datePattern);

  const isAR = matchedRequired.length > 0 && matchedOptional.length > 0;

  return {
    fileName,
    isAR,
    matchedRequired,
    matchedOptional,
    customerName: customerMatch ? customerMatch[1] : null,
    issueDate: dateMatch ? `${dateMatch[1]}-${dateMatch[2].padStart(2,'0')}-${dateMatch[3].padStart(2,'0')}` : null,
    textLength: text.length
  };
}

async function main() {
  console.log('🚀 100개 AR PDF 생성 및 파싱 테스트 시작\n');

  const generator = await loadGenerator();
  const results = [];
  const errors = [];

  const testDir = './test-output';
  if (!existsSync(testDir)) {
    mkdirSync(testDir, { recursive: true });
  }

  // 기존 파일 삭제
  const existingFiles = readdirSync(testDir).filter(f => f.endsWith('.pdf'));
  for (const file of existingFiles) {
    unlinkSync(path.join(testDir, file));
  }

  const startTime = Date.now();

  for (let i = 1; i <= 100; i++) {
    const customerName = randomName();
    const today = new Date();
    const issueDate = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

    try {
      // PDF 생성
      const pdfBytes = await generator.generateARPdf({
        customerName,
        issueDate,
        fsrName: '박설계',
        contracts: [
          {
            순번: 1,
            증권번호: `L${100000000 + i}`,
            보험상품: '무) 메트라이프 종신보험',
            계약자: customerName,
            피보험자: customerName,
            계약일: '2020.01.15',
            계약상태: '유지',
            '가입금액(만원)': 10000,
            보험기간: '종신',
            납입기간: '20년',
            '보험료(원)': 150000
          }
        ],
        lapsedContracts: []
      });

      // 파싱 테스트
      const result = await testParsePDF(pdfBytes, `AR_${customerName}_${i}.pdf`);
      results.push(result);

      // 진행 상황
      if (i % 10 === 0) {
        const successCount = results.filter(r => r.isAR).length;
        console.log(`[${i}/100] 생성 및 파싱 완료 - 성공: ${successCount}/${i}`);
      }

    } catch (error) {
      errors.push({ index: i, customerName, error: error.message });
      console.log(`❌ [${i}] ${customerName} 실패: ${error.message}`);
    }
  }

  const endTime = Date.now();
  const elapsed = ((endTime - startTime) / 1000).toFixed(2);

  // 결과 요약
  console.log('\n' + '='.repeat(60));
  console.log('📊 테스트 결과 요약');
  console.log('='.repeat(60));

  const successCount = results.filter(r => r.isAR).length;
  const failCount = results.filter(r => !r.isAR).length;

  console.log(`총 생성: ${results.length + errors.length}개`);
  console.log(`생성 성공: ${results.length}개`);
  console.log(`생성 실패: ${errors.length}개`);
  console.log(`파싱 성공 (AR 인식): ${successCount}개`);
  console.log(`파싱 실패 (AR 미인식): ${failCount}개`);
  console.log(`소요 시간: ${elapsed}초`);

  if (failCount > 0) {
    console.log('\n❌ 파싱 실패한 파일:');
    results.filter(r => !r.isAR).forEach(r => {
      console.log(`  - ${r.fileName}: 필수=${r.matchedRequired.length}, 선택=${r.matchedOptional.length}`);
    });
  }

  if (errors.length > 0) {
    console.log('\n❌ 생성 실패한 항목:');
    errors.forEach(e => {
      console.log(`  - [${e.index}] ${e.customerName}: ${e.error}`);
    });
  }

  if (successCount === 100) {
    console.log('\n✅✅✅ 모든 100개 파일 파싱 성공! ✅✅✅');
  } else {
    console.log(`\n⚠️ ${100 - successCount}개 파일 파싱 실패`);
  }
}

main().catch(console.error);

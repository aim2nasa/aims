// PDF 파싱 테스트
import { readFileSync, readdirSync } from 'fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import path from 'path';

async function testParse() {
  // output 폴더에서 가장 최근 PDF 찾기
  const outputDir = './output';
  const files = readdirSync(outputDir).filter(f => f.endsWith('.pdf'));

  if (files.length === 0) {
    console.log('❌ output 폴더에 PDF 파일이 없습니다.');
    return;
  }

  const latestFile = files.sort().reverse()[0];
  const pdfPath = path.join(outputDir, latestFile);
  console.log('📄 테스트 파일:', pdfPath);

  // PDF 로드
  const data = readFileSync(pdfPath);
  const pdf = await getDocument({ data }).promise;

  // 첫 페이지 텍스트 추출
  const page = await pdf.getPage(1);
  const textContent = await page.getTextContent();
  const text = textContent.items.map(item => item.str || '').join(' ');

  console.log('\n📝 추출된 텍스트:');
  console.log(text);

  console.log('\n🔍 키워드 매칭 테스트:');

  // 공백 정규화
  const normalizedText = text.replace(/\s+/g, ' ');

  // 필수 키워드
  const requiredKeywords = ['Annual Review Report'];
  const matchedRequired = requiredKeywords.filter(kw => normalizedText.includes(kw));
  console.log('필수 키워드 매칭:', matchedRequired.length > 0 ? '✅' : '❌', matchedRequired);

  // 선택 키워드
  const optionalKeywords = ['보유계약 현황', 'MetLife', '고객님을 위한', '메트라이프생명'];
  const matchedOptional = optionalKeywords.filter(kw => normalizedText.includes(kw));
  console.log('선택 키워드 매칭:', matchedOptional.length > 0 ? '✅' : '❌', matchedOptional);

  // 고객명 추출
  const customerNamePattern = /([가-힣]{2,10})\s*고객님을\s*위한/;
  const customerMatch = normalizedText.match(customerNamePattern);
  console.log('고객명 추출:', customerMatch ? '✅ ' + customerMatch[1] : '❌');

  // 날짜 추출
  const datePattern = /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/;
  const dateMatch = normalizedText.match(datePattern);
  if (dateMatch) {
    const year = dateMatch[1];
    const month = dateMatch[2].padStart(2, '0');
    const day = dateMatch[3].padStart(2, '0');
    console.log('날짜 추출:', '✅', year + '-' + month + '-' + day);
  } else {
    console.log('날짜 추출:', '❌');
  }

  // 최종 판단
  const isAR = matchedRequired.length > 0 && matchedOptional.length > 0;
  console.log('\n📊 최종 AR 판단:', isAR ? '✅ Annual Report' : '❌ 일반 문서');
}

testParse().catch(console.error);

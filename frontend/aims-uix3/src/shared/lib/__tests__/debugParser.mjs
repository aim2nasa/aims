// 파서 디버그 스크립트
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sampleDir = path.resolve(__dirname, '../../../../../../samples/MetlifeReport/AnnualReport');

// 김보성 샘플 상세 분석
const file = '김보성보유계약현황202508_page2.txt';
const text = fs.readFileSync(path.join(sampleDir, file), 'utf-8');
const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

console.log('=== 라인별 분석 ===\n');
lines.forEach((line, i) => {
  console.log(`[${i}] ${line}`);
});

console.log('\n=== 증권번호 패턴 검색 ===\n');

// 테이블 헤더 이후부터 파싱
const headerEndIndex = lines.findIndex(line =>
  line.includes('상태') && line.includes('만원') && line.includes('기간')
);
console.log('헤더 끝 인덱스:', headerEndIndex);

// 헤더 이후 텍스트 병합
const dataLines = lines.slice(headerEndIndex + 1);
const fullText = dataLines.join(' ');
console.log('\n병합된 텍스트 (처음 500자):');
console.log(fullText.slice(0, 500));

// 증권번호 패턴
const policyNumberPattern = /(\d{1,2})\s+(00\d{8})/g;
let match;
console.log('\n증권번호 매칭:');
const matches = [];
while ((match = policyNumberPattern.exec(fullText)) !== null) {
  matches.push({ seq: match[1], policyNumber: match[2], index: match.index });
  console.log(`  seq=${match[1]}, policyNumber=${match[2]}, index=${match.index}`);
}

// 첫 번째 계약 블록 분석
if (matches.length >= 2) {
  const block1 = fullText.slice(matches[0].index, matches[1].index);
  console.log('\n첫 번째 계약 블록:');
  console.log(block1);

  // 계약일 찾기
  const dateMatch = block1.match(/(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) {
    console.log('\n계약일:', dateMatch[1]);
    const afterDate = block1.slice(block1.indexOf(dateMatch[1]) + dateMatch[1].length);
    console.log('계약일 이후 텍스트:', afterDate);
  }
}

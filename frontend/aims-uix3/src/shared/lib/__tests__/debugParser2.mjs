// 정부균 샘플 디버그
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sampleDir = path.resolve(__dirname, '../../../../../../samples/MetlifeReport/AnnualReport');

const file = '정부균보유계약현황202508_page2.txt';
const text = fs.readFileSync(path.join(sampleDir, file), 'utf-8');
const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

console.log('=== 정부균 샘플 분석 ===\n');

const contractLinePattern = /^(\d{1,2})\s+(00\d{8})\s+(.+?)\s+(\d{4}-\d{2}-\d{2})\s+(.+?)\s+([\d,]+)$/;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const match = line.match(contractLinePattern);

  if (match) {
    console.log(`[Line ${i}] MATCH:`);
    console.log(`  seq: ${match[1]}`);
    console.log(`  policyNumber: ${match[2]}`);
    console.log(`  middlePart: "${match[3]}"`);
    console.log(`  contractDate: ${match[4]}`);
    console.log(`  afterDate: "${match[5]}"`);
    console.log(`  premium: ${match[6]}`);
    console.log('');
  }
}

// 직접 테스트
console.log('=== 직접 테스트 ===\n');
const testLine = '3 0013785622 무배당 오늘의달러연금보험 정부균 정부균 2025-08-26 1,390.6 종신 일시납 20,859,000';
const testMatch = testLine.match(contractLinePattern);
console.log('테스트 라인:', testLine);
console.log('매칭 결과:', testMatch ? 'OK' : 'FAIL');
if (testMatch) {
  console.log('afterDate:', testMatch[5]);
}

// 파서 테스트 스크립트 (임시)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 텍스트 파일 읽기
const sampleDir = path.resolve(__dirname, '../../../../../../samples/MetlifeReport/AnnualReport');
const files = fs.readdirSync(sampleDir).filter(f => f.endsWith('.txt'));

console.log('=== Annual Report Parser Test ===\n');
console.log('샘플 파일:', files.length, '개\n');

// 간단한 파싱 테스트 (파서 로직 인라인)
for (const file of files) {
  const text = fs.readFileSync(path.join(sampleDir, file), 'utf-8');
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // 헤더 파싱
  const line3 = lines[2] || '';
  const headerMatch = line3.match(/^(.+?)\s+(\d+)$/);
  const insuredName = headerMatch ? headerMatch[1].trim() : 'PARSE_ERROR';
  const totalContracts = headerMatch ? parseInt(headerMatch[2], 10) : -1;

  const line5 = lines[4] || '';
  const monthlyPremium = parseInt(line5.replace(/,/g, ''), 10) || 0;

  console.log(`[${file}]`);
  console.log(`  피보험자: ${insuredName}`);
  console.log(`  계약건수: ${totalContracts}건`);
  console.log(`  월보험료: ${monthlyPremium.toLocaleString()}원`);
  console.log('');
}

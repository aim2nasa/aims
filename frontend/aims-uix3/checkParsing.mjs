import { parseAnnualReportPage2 } from './src/shared/lib/annualReportParser.ts';
import * as fs from 'fs';
import * as path from 'path';

const sampleDir = path.resolve('./../../samples/MetlifeReport/AnnualReport');
const files = fs.readdirSync(sampleDir).filter(f => f.endsWith('.txt'));

for (const file of files) {
  const text = fs.readFileSync(path.join(sampleDir, file), 'utf-8');
  const result = parseAnnualReportPage2(text);

  console.log('='.repeat(60));
  console.log('파일:', file);
  console.log('피보험자:', result.insuredName, '| 계약수:', result.totalContracts);
  console.log('-'.repeat(60));

  for (const c of result.contracts) {
    console.log(`[${c.seq}] ${c.policyNumber}`);
    console.log(`    상품: ${c.productName}`);
    console.log(`    계약자: ${c.contractor} | 피보험자: ${c.insured}`);
    console.log(`    상태: ${c.status} | 보험료: ${c.premium.toLocaleString()}원`);
  }
}

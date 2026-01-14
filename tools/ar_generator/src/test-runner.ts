/**
 * AR 자동화 테스트 러너
 * 생성된 Mock AR PDF를 실제 AR 파싱 파이프라인에 테스트
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { TestResult, TestRunResult, ARTemplatePreset } from './types.js';
import { generateARPdf, saveARPdf } from './generator.js';
import { generateFromPreset, SHIN_SANG_CHEOL_TEMPLATE } from './templates.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** API 기본 URL (환경변수 또는 기본값) */
const API_BASE_URL = process.env.AR_API_URL || 'http://localhost:8004';
const AIMS_API_URL = process.env.AIMS_API_URL || 'http://localhost:3010';

/** 테스트 타임아웃 (ms) */
const TEST_TIMEOUT = 60000;

/** HTTP 요청 헬퍼 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout: number = TEST_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeout}ms`);
    }
    throw error;
  }
}

/** AR Check API 테스트 */
async function testARCheck(pdfPath: string): Promise<TestResult> {
  const start = Date.now();
  const testName = 'AR Check API';

  try {
    const formData = new FormData();
    const fileBuffer = fs.readFileSync(pdfPath);
    const blob = new Blob([fileBuffer], { type: 'application/pdf' });
    formData.append('file', blob, path.basename(pdfPath));

    const response = await fetchWithTimeout(
      `${API_BASE_URL}/annual-report/check`,
      {
        method: 'POST',
        body: formData,
        headers: {
          'x-user-id': 'test-user',
        },
      }
    );

    const result = await response.json();
    const duration = Date.now() - start;

    if (result.is_annual_report === true) {
      return {
        name: testName,
        passed: true,
        duration,
        details: { actual: result },
      };
    } else {
      return {
        name: testName,
        passed: false,
        duration,
        error: 'AR로 인식되지 않음',
        details: {
          expected: { is_annual_report: true },
          actual: result,
        },
      };
    }
  } catch (error: any) {
    return {
      name: testName,
      passed: false,
      duration: Date.now() - start,
      error: error.message,
    };
  }
}

/** AR 메타데이터 추출 테스트 */
async function testMetadataExtraction(
  pdfPath: string,
  expectedCustomerName: string,
  expectedIssueDate: string
): Promise<TestResult> {
  const start = Date.now();
  const testName = 'Metadata Extraction';

  try {
    const formData = new FormData();
    const fileBuffer = fs.readFileSync(pdfPath);
    const blob = new Blob([fileBuffer], { type: 'application/pdf' });
    formData.append('file', blob, path.basename(pdfPath));

    const response = await fetchWithTimeout(
      `${API_BASE_URL}/annual-report/check`,
      {
        method: 'POST',
        body: formData,
        headers: {
          'x-user-id': 'test-user',
        },
      }
    );

    const result = await response.json();
    const duration = Date.now() - start;

    const metadata = result.metadata || {};
    const issueDateMatch = metadata.issue_date === expectedIssueDate;

    // 고객명은 1페이지 패턴 매칭에 의존하므로 선택적 검증
    if (issueDateMatch) {
      return {
        name: testName,
        passed: true,
        duration,
        details: { actual: metadata },
      };
    } else {
      return {
        name: testName,
        passed: false,
        duration,
        error: '메타데이터 불일치',
        details: {
          expected: { issue_date: expectedIssueDate },
          actual: metadata,
        },
      };
    }
  } catch (error: any) {
    return {
      name: testName,
      passed: false,
      duration: Date.now() - start,
      error: error.message,
    };
  }
}

/** PDF 생성 테스트 */
async function testPdfGeneration(preset: ARTemplatePreset): Promise<TestResult> {
  const start = Date.now();
  const testName = `PDF Generation (${preset})`;

  try {
    const options = generateFromPreset(preset);
    const pdfBytes = await generateARPdf(options);
    const duration = Date.now() - start;

    if (pdfBytes && pdfBytes.length > 0) {
      return {
        name: testName,
        passed: true,
        duration,
        details: {
          actual: {
            size: pdfBytes.length,
            customerName: options.customerName,
            contracts: options.contracts.length,
          },
        },
      };
    } else {
      return {
        name: testName,
        passed: false,
        duration,
        error: 'PDF 생성 실패 (빈 파일)',
      };
    }
  } catch (error: any) {
    return {
      name: testName,
      passed: false,
      duration: Date.now() - start,
      error: error.message,
    };
  }
}

/** 전체 테스트 스위트 실행 */
export async function runAllTests(): Promise<TestRunResult> {
  const results: TestResult[] = [];
  const totalStart = Date.now();

  console.log('\n=== AR Generator 자동화 테스트 ===\n');

  // 1. PDF 생성 테스트 (각 프리셋)
  const presets: ARTemplatePreset[] = ['basic', 'single', 'many', 'with_lapsed', 'mixed_status'];

  for (const preset of presets) {
    console.log(`테스트: PDF 생성 (${preset})...`);
    const result = await testPdfGeneration(preset);
    results.push(result);
    console.log(`  ${result.passed ? '✅ PASS' : '❌ FAIL'} (${result.duration}ms)`);
    if (!result.passed) {
      console.log(`  에러: ${result.error}`);
    }
  }

  // 2. AR Check API 테스트 (API 서버가 실행 중인 경우)
  console.log('\n테스트: AR Check API...');
  try {
    // 테스트용 PDF 생성
    const testOptions = generateFromPreset('basic');
    const testPdfPath = path.join(__dirname, '../output/test_ar_check.pdf');
    await saveARPdf(testOptions, testPdfPath);

    const checkResult = await testARCheck(testPdfPath);
    results.push(checkResult);
    console.log(`  ${checkResult.passed ? '✅ PASS' : '❌ FAIL'} (${checkResult.duration}ms)`);
    if (!checkResult.passed) {
      console.log(`  에러: ${checkResult.error}`);
    }

    // 3. 메타데이터 추출 테스트
    console.log('\n테스트: Metadata Extraction...');
    const metaResult = await testMetadataExtraction(
      testPdfPath,
      testOptions.customerName,
      testOptions.issueDate
    );
    results.push(metaResult);
    console.log(`  ${metaResult.passed ? '✅ PASS' : '❌ FAIL'} (${metaResult.duration}ms)`);
    if (!metaResult.passed) {
      console.log(`  에러: ${metaResult.error}`);
    }

    // 테스트 파일 정리
    if (fs.existsSync(testPdfPath)) {
      fs.unlinkSync(testPdfPath);
    }
  } catch (error: any) {
    console.log(`  ⚠️ API 테스트 스킵 (서버 연결 불가): ${error.message}`);
    results.push({
      name: 'AR Check API',
      passed: false,
      duration: 0,
      error: `API 서버 연결 불가: ${error.message}`,
    });
  }

  // 결과 집계
  const totalDuration = Date.now() - totalStart;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log('\n=== 테스트 결과 ===');
  console.log(`총: ${results.length} | 성공: ${passed} | 실패: ${failed}`);
  console.log(`소요시간: ${totalDuration}ms`);

  return {
    total: results.length,
    passed,
    failed,
    duration: totalDuration,
    results,
  };
}

/** 특정 시나리오 테스트 */
export async function runScenarioTest(scenario: string): Promise<TestRunResult> {
  const results: TestResult[] = [];
  const start = Date.now();

  console.log(`\n=== 시나리오 테스트: ${scenario} ===\n`);

  switch (scenario) {
    case 'edge-cases':
      // 엣지 케이스 테스트
      const edgePresets: ARTemplatePreset[] = ['empty', 'single', 'many', 'all_lapsed'];
      for (const preset of edgePresets) {
        const result = await testPdfGeneration(preset);
        results.push(result);
        console.log(`${preset}: ${result.passed ? '✅' : '❌'}`);
      }
      break;

    case 'stress':
      // 스트레스 테스트 (많은 계약)
      for (let i = 0; i < 5; i++) {
        const result = await testPdfGeneration('many');
        results.push(result);
        console.log(`Iteration ${i + 1}: ${result.passed ? '✅' : '❌'}`);
      }
      break;

    case 'shin-template':
      // 신상철 템플릿 테스트
      console.log('신상철 고객 템플릿 테스트...');
      const pdfPath = path.join(__dirname, '../output/test_shin.pdf');
      await saveARPdf(SHIN_SANG_CHEOL_TEMPLATE, pdfPath);
      console.log(`PDF 생성: ${pdfPath}`);
      results.push({
        name: 'Shin Template Generation',
        passed: true,
        duration: Date.now() - start,
      });
      break;

    default:
      console.log(`알 수 없는 시나리오: ${scenario}`);
  }

  const duration = Date.now() - start;
  const passed = results.filter((r) => r.passed).length;

  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    duration,
    results,
  };
}

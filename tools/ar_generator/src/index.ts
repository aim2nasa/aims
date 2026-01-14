#!/usr/bin/env node
/**
 * AR Generator CLI
 * AIMS Annual Report 테스트 PDF 생성 도구
 *
 * 사용법:
 *   npm run generate -- --preset basic --customer "홍길동"
 *   npm run batch -- --count 10 --scenario mixed
 *   npm run test:ar
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';

import { saveARPdf, batchGenerateAR } from './generator.js';
import { generateFromPreset, generateCustomAR, HONG_GIL_DONG_TEMPLATE } from './templates.js';
import { runAllTests, runScenarioTest } from './test-runner.js';
import type { ARTemplatePreset, Contract } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const program = new Command();

program
  .name('ar-generator')
  .description('AIMS Annual Report 테스트 PDF 생성 도구')
  .version('1.0.0');

// ========== generate 명령 ==========
program
  .command('generate')
  .description('단일 AR PDF 생성')
  .option('-p, --preset <preset>', '프리셋 (basic, single, many, with_lapsed, all_lapsed, mixed_status, empty)', 'basic')
  .option('-c, --customer <name>', '고객명')
  .option('-d, --date <YYYY-MM-DD>', '발행기준일')
  .option('-f, --fsr <name>', 'FSR(설계사) 이름')
  .option('-o, --output <path>', '출력 파일 경로')
  .option('--hong', '홍길동 고객 템플릿 사용')
  .action(async (options) => {
    console.log(chalk.blue('\n=== AR PDF 생성 ===\n'));

    try {
      let arOptions;

      if (options.hong) {
        // 홍길동 템플릿
        arOptions = {
          ...HONG_GIL_DONG_TEMPLATE,
          issueDate: options.date || HONG_GIL_DONG_TEMPLATE.issueDate,
        };
        console.log(chalk.yellow('홍길동 고객 템플릿 사용'));
      } else {
        // 프리셋 기반 생성
        arOptions = generateFromPreset(options.preset as ARTemplatePreset, {
          customerName: options.customer,
          issueDate: options.date,
          fsrName: options.fsr,
        });
      }

      console.log(chalk.gray(`고객명: ${arOptions.customerName}`));
      console.log(chalk.gray(`발행일: ${arOptions.issueDate}`));
      console.log(chalk.gray(`계약 수: ${arOptions.contracts.length}건`));
      if (arOptions.lapsedContracts?.length) {
        console.log(chalk.gray(`실효계약: ${arOptions.lapsedContracts.length}건`));
      }

      const outputPath = await saveARPdf(arOptions, options.output);
      console.log(chalk.green(`\n✅ PDF 생성 완료: ${outputPath}`));
    } catch (error: any) {
      console.error(chalk.red(`\n❌ 오류: ${error.message}`));
      process.exit(1);
    }
  });

// ========== batch 명령 ==========
program
  .command('batch')
  .description('여러 AR PDF 일괄 생성')
  .option('-n, --count <number>', '생성할 AR 수', '5')
  .option('-s, --scenario <type>', '시나리오 (normal, edge, stress, mixed)', 'normal')
  .option('-o, --output <dir>', '출력 디렉토리', path.join(__dirname, '../output/batch'))
  .action(async (options) => {
    console.log(chalk.blue('\n=== AR PDF 일괄 생성 ===\n'));

    const count = parseInt(options.count);
    const scenario = options.scenario;
    const outputDir = options.output;

    // 출력 디렉토리 생성
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log(chalk.gray(`생성 수: ${count}개`));
    console.log(chalk.gray(`시나리오: ${scenario}`));
    console.log(chalk.gray(`출력: ${outputDir}`));

    try {
      const optionsList = [];

      for (let i = 0; i < count; i++) {
        let preset: ARTemplatePreset;

        switch (scenario) {
          case 'edge':
            preset = ['empty', 'single', 'all_lapsed'][i % 3] as ARTemplatePreset;
            break;
          case 'stress':
            preset = 'many';
            break;
          case 'mixed':
            preset = ['basic', 'single', 'many', 'with_lapsed', 'mixed_status'][i % 5] as ARTemplatePreset;
            break;
          default:
            preset = 'basic';
        }

        optionsList.push(generateFromPreset(preset));
      }

      const results = await batchGenerateAR(optionsList, outputDir);

      console.log(chalk.green(`\n✅ ${results.length}개 PDF 생성 완료`));
      results.forEach((r, i) => {
        console.log(chalk.gray(`  ${i + 1}. ${path.basename(r)}`));
      });
    } catch (error: any) {
      console.error(chalk.red(`\n❌ 오류: ${error.message}`));
      process.exit(1);
    }
  });

// ========== test 명령 ==========
program
  .command('test')
  .description('AR 파싱 파이프라인 자동화 테스트')
  .option('-s, --scenario <name>', '특정 시나리오만 테스트 (edge-cases, stress, shin-template)')
  .option('--api-url <url>', 'AR API URL', 'http://localhost:8004')
  .action(async (options) => {
    // 환경변수 설정
    if (options.apiUrl) {
      process.env.AR_API_URL = options.apiUrl;
    }

    try {
      let result;

      if (options.scenario) {
        result = await runScenarioTest(options.scenario);
      } else {
        result = await runAllTests();
      }

      // 테스트 결과에 따른 종료 코드
      process.exit(result.failed > 0 ? 1 : 0);
    } catch (error: any) {
      console.error(chalk.red(`\n❌ 테스트 오류: ${error.message}`));
      process.exit(1);
    }
  });

// ========== list 명령 ==========
program
  .command('list')
  .description('사용 가능한 프리셋 목록')
  .action(() => {
    console.log(chalk.blue('\n=== 사용 가능한 프리셋 ===\n'));

    const presets = [
      { name: 'basic', desc: '기본 (계약 3-5개)' },
      { name: 'single', desc: '단일 계약' },
      { name: 'many', desc: '다수 계약 (10-15개)' },
      { name: 'with_lapsed', desc: '정상 3개 + 실효 2개' },
      { name: 'all_lapsed', desc: '모두 실효' },
      { name: 'mixed_status', desc: '다양한 상태 혼합' },
      { name: 'empty', desc: '계약 없음 (엣지케이스)' },
    ];

    presets.forEach((p) => {
      console.log(chalk.yellow(`  ${p.name.padEnd(15)}`), chalk.gray(p.desc));
    });

    console.log(chalk.blue('\n=== 특수 옵션 ===\n'));
    console.log(chalk.yellow('  --shin'), chalk.gray('신상철 고객 실제 데이터 템플릿'));
  });

// ========== interactive 명령 (대화형) ==========
program
  .command('interactive')
  .alias('i')
  .description('대화형 AR 생성')
  .action(async () => {
    console.log(chalk.blue('\n=== 대화형 AR 생성 ==='));
    console.log(chalk.gray('(이 기능은 추후 구현 예정입니다)\n'));

    // readline을 사용한 대화형 인터페이스 추후 구현
    console.log('현재는 CLI 옵션을 사용해주세요:');
    console.log(chalk.cyan('  npm run generate -- --preset basic --customer "홍길동"'));
  });

// 파싱 실행
program.parse();

// 명령어 없이 실행된 경우 도움말 표시
if (!process.argv.slice(2).length) {
  console.log(chalk.blue(`
╔════════════════════════════════════════════════════════╗
║         AR Generator - AIMS 테스트 도구               ║
╚════════════════════════════════════════════════════════╝
`));
  program.outputHelp();
}

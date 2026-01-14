/**
 * AR Generator Web Server
 * GUI를 통한 AR PDF 생성 및 테스트
 */

import express from 'express';
import cors from 'cors';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

import { generateARPdf, saveARPdf } from './generator.js';
import { generateFromPreset, generateCustomAR, HONG_GIL_DONG_TEMPLATE } from './templates.js';
import type { ARGenerateOptions, Contract, ARTemplatePreset } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3099;

// 미들웨어
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// 출력 디렉토리
const OUTPUT_DIR = path.join(__dirname, '../output');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// ========== API 엔드포인트 ==========

/** 헬스체크 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', service: 'ar-generator' });
});

/** 프리셋 목록 */
app.get('/api/presets', (req, res) => {
  const presets = [
    { id: 'basic', name: '기본', description: '계약 3-5개' },
    { id: 'single', name: '단일 계약', description: '계약 1개' },
    { id: 'many', name: '다수 계약', description: '계약 10-15개' },
    { id: 'with_lapsed', name: '실효 포함', description: '정상 3개 + 실효 2개' },
    { id: 'all_lapsed', name: '모두 실효', description: '모든 계약 실효' },
    { id: 'mixed_status', name: '혼합 상태', description: '다양한 상태 혼합' },
    { id: 'empty', name: '계약 없음', description: '엣지케이스 테스트' },
    { id: 'hong', name: '홍길동 템플릿', description: '다수 계약 샘플' },
  ];
  res.json({ success: true, presets });
});

/** 프리셋으로 옵션 생성 (미리보기용) */
app.get('/api/preset/:id', (req, res) => {
  try {
    const presetId = req.params.id;

    if (presetId === 'hong') {
      res.json({ success: true, data: HONG_GIL_DONG_TEMPLATE });
      return;
    }

    const options = generateFromPreset(presetId as ARTemplatePreset);
    res.json({ success: true, data: options });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/** PDF 생성 (바이트 반환) */
app.post('/api/generate', async (req, res) => {
  try {
    const options: ARGenerateOptions = req.body;

    // 유효성 검사
    if (!options.customerName) {
      throw new Error('고객명은 필수입니다');
    }
    if (!options.issueDate) {
      throw new Error('발행일은 필수입니다');
    }
    if (!options.contracts || options.contracts.length === 0) {
      // 빈 계약도 허용 (empty preset)
      options.contracts = [];
    }

    const pdfBytes = await generateARPdf(options);

    // Base64로 인코딩하여 반환
    const base64 = Buffer.from(pdfBytes).toString('base64');

    res.json({
      success: true,
      data: {
        base64,
        filename: `AR_${options.customerName}_${options.issueDate.replace(/-/g, '')}.pdf`,
        size: pdfBytes.length,
      },
    });
  } catch (error: any) {
    console.error('PDF 생성 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/** PDF 생성 및 파일로 저장 */
app.post('/api/generate-and-save', async (req, res) => {
  try {
    const options: ARGenerateOptions = req.body;

    if (!options.customerName || !options.issueDate) {
      throw new Error('고객명과 발행일은 필수입니다');
    }

    const filename = `AR_${options.customerName}_${options.issueDate.replace(/-/g, '')}_${Date.now()}.pdf`;
    const outputPath = path.join(OUTPUT_DIR, filename);

    await saveARPdf(options, outputPath);

    res.json({
      success: true,
      data: {
        filename,
        path: outputPath,
        downloadUrl: `/api/download/${filename}`,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/** 파일 다운로드 */
app.get('/api/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(OUTPUT_DIR, filename);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ success: false, error: '파일을 찾을 수 없습니다' });
    return;
  }

  res.download(filePath);
});

/** 생성된 파일 목록 */
app.get('/api/files', (req, res) => {
  try {
    const files = fs.readdirSync(OUTPUT_DIR)
      .filter(f => f.endsWith('.pdf'))
      .map(f => {
        const stat = fs.statSync(path.join(OUTPUT_DIR, f));
        return {
          name: f,
          size: stat.size,
          created: stat.mtime,
          downloadUrl: `/api/download/${f}`,
        };
      })
      .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());

    res.json({ success: true, files });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/** 파일 삭제 */
app.delete('/api/files/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(OUTPUT_DIR, filename);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.json({ success: true, message: '삭제 완료' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/** AR Check API 프록시 (테스트용) */
app.post('/api/test-ar-check', async (req, res) => {
  try {
    const { base64 } = req.body;
    const AR_API_URL = process.env.AR_API_URL || 'http://localhost:8004';

    // Base64를 Buffer로 변환
    const pdfBuffer = Buffer.from(base64, 'base64');

    // FormData 생성
    const formData = new FormData();
    const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
    formData.append('file', blob, 'test.pdf');

    const response = await fetch(`${AR_API_URL}/annual-report/check`, {
      method: 'POST',
      body: formData,
      headers: {
        'x-user-id': 'ar-generator-test',
      },
    });

    const result = await response.json();
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/** 샘플 계약 생성 */
app.get('/api/sample-contract', (req, res) => {
  const sampleContract: Contract = {
    순번: 1,
    증권번호: `001${Math.floor(Math.random() * 9000000) + 1000000}`,
    보험상품: '무배당 종신보험',
    계약자: '',
    피보험자: '',
    계약일: new Date().toISOString().split('T')[0],
    계약상태: '정상',
    '가입금액(만원)': 5000,
    보험기간: '종신',
    납입기간: '20년',
    '보험료(원)': 150000,
  };

  res.json({ success: true, data: sampleContract });
});

// ========== 서버 시작 ==========
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║         AR Generator GUI Server                        ║
╚════════════════════════════════════════════════════════╝

  🌐 GUI: http://localhost:${PORT}
  📡 API: http://localhost:${PORT}/api

  사용 가능한 API:
    GET  /api/health          - 헬스체크
    GET  /api/presets         - 프리셋 목록
    GET  /api/preset/:id      - 프리셋 옵션 조회
    POST /api/generate        - PDF 생성 (Base64)
    POST /api/generate-and-save - PDF 생성 및 저장
    GET  /api/files           - 생성된 파일 목록
    GET  /api/download/:name  - 파일 다운로드
    POST /api/test-ar-check   - AR Check API 테스트

  종료: Ctrl+C
`);
});

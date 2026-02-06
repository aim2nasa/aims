/**
 * PDF 변환 및 텍스트 추출 회귀 테스트
 *
 * @since 2025-12-23
 * @issue HWP 등 변환 가능 파일이 OCR 대신 PDF 변환 후 텍스트 추출되어야 함
 *
 * 이 테스트는 다음을 검증합니다:
 * 1. PDF Converter 서버 포트 설정이 일관성 있게 8005인지 확인
 * 2. HWP 파일이 변환 대상으로 올바르게 분류되는지 확인
 * 3. 변환 가능 파일이 OCR 대신 텍스트 추출 경로를 사용하는지 확인
 */

const fs = require('fs');
const path = require('path');

describe('[회귀] PDF 변환 포트 설정 일관성', () => {
  const expectedPort = 8005;

  test('pdfConversionService.js의 기본 포트가 8005여야 함', () => {
    const filePath = path.join(__dirname, '../lib/pdfConversionService.js');
    const content = fs.readFileSync(filePath, 'utf8');

    // PDF_CONVERTER_PORT 기본값 확인
    const portMatch = content.match(/PDF_CONVERTER_PORT\s*=\s*process\.env\.PDF_CONVERTER_PORT\s*\|\|\s*(\d+)/);
    expect(portMatch).not.toBeNull();
    expect(parseInt(portMatch[1])).toBe(expectedPort);
  });

  test('documents-routes.js의 기본 포트가 8005여야 함', () => {
    const filePath = path.join(__dirname, '../routes/documents-routes.js');
    const content = fs.readFileSync(filePath, 'utf8');

    // PDF_CONVERTER_PORT 기본값 확인
    const portMatch = content.match(/PDF_CONVERTER_PORT\s*=\s*process\.env\.PDF_CONVERTER_PORT\s*\|\|\s*(\d+)/);
    expect(portMatch).not.toBeNull();
    expect(parseInt(portMatch[1])).toBe(expectedPort);
  });

  test('enhanced_file_analyzer.js의 기본 포트가 8005여야 함', () => {
    const filePath = path.join(__dirname, '../../../../tools/mime_type_analyzer/enhanced_file_analyzer.js');
    const content = fs.readFileSync(filePath, 'utf8');

    // PDF_CONVERTER_PORT 기본값 확인
    const portMatch = content.match(/PDF_CONVERTER_PORT\s*=\s*process\.env\.PDF_CONVERTER_PORT\s*\|\|\s*(\d+)/);
    expect(portMatch).not.toBeNull();
    expect(parseInt(portMatch[1])).toBe(expectedPort);
  });

  test('tools/convert/server.js의 포트가 8005여야 함', () => {
    const filePath = path.join(__dirname, '../../../../tools/convert/server.js');
    const content = fs.readFileSync(filePath, 'utf8');

    // const PORT = 8005; 형태 확인
    const portMatch = content.match(/const\s+PORT\s*=\s*(\d+)/);
    expect(portMatch).not.toBeNull();
    expect(parseInt(portMatch[1])).toBe(expectedPort);
  });
});

describe('[회귀] HWP 파일 변환 대상 분류', () => {
  const pdfConversionService = require('../lib/pdfConversionService');

  test('HWP 파일이 변환 가능 대상으로 분류되어야 함', () => {
    expect(pdfConversionService.isConvertible('document.hwp')).toBe(true);
    expect(pdfConversionService.isConvertible('정관_캐치업코리아.hwp')).toBe(true);
  });

  test('PPTX 파일이 변환 가능 대상으로 분류되어야 함', () => {
    expect(pdfConversionService.isConvertible('presentation.pptx')).toBe(true);
    expect(pdfConversionService.isConvertible('마장사은품.pptx')).toBe(true);
  });

  test('XLSX 파일이 변환 가능 대상으로 분류되어야 함', () => {
    expect(pdfConversionService.isConvertible('spreadsheet.xlsx')).toBe(true);
    expect(pdfConversionService.isConvertible('유아영.xlsx')).toBe(true);
  });

  test('DOCX 파일이 변환 가능 대상으로 분류되어야 함', () => {
    expect(pdfConversionService.isConvertible('document.docx')).toBe(true);
  });

  test('PDF 파일은 변환 불필요 (native preview)', () => {
    expect(pdfConversionService.isConvertible('document.pdf')).toBe(false);
    expect(pdfConversionService.isPreviewNative('document.pdf')).toBe(true);
  });

  test('이미지 파일은 변환 불필요 (native preview)', () => {
    expect(pdfConversionService.isConvertible('image.jpg')).toBe(false);
    expect(pdfConversionService.isPreviewNative('image.jpg')).toBe(true);
    expect(pdfConversionService.isPreviewNative('image.png')).toBe(true);
  });
});

describe('[회귀] 변환 가능 확장자 목록', () => {
  const pdfConversionService = require('../lib/pdfConversionService');

  test('CONVERTIBLE_EXTENSIONS에 HWP가 포함되어야 함', () => {
    expect(pdfConversionService.CONVERTIBLE_EXTENSIONS).toContain('.hwp');
  });

  test('CONVERTIBLE_EXTENSIONS에 Office 형식이 모두 포함되어야 함', () => {
    const requiredExtensions = ['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'];
    requiredExtensions.forEach(ext => {
      expect(pdfConversionService.CONVERTIBLE_EXTENSIONS).toContain(ext);
    });
  });

  test('PREVIEW_NATIVE에 PDF와 이미지 형식이 포함되어야 함', () => {
    const requiredNative = ['.pdf', '.jpg', '.jpeg', '.png', '.gif'];
    requiredNative.forEach(ext => {
      expect(pdfConversionService.PREVIEW_NATIVE).toContain(ext);
    });
  });
});

describe('[회귀] 변환 요구사항 분류', () => {
  const pdfConversionService = require('../lib/pdfConversionService');

  test('HWP는 convertible로 분류되어야 함 (OCR 아님)', () => {
    expect(pdfConversionService.getConversionRequirement('test.hwp')).toBe('convertible');
  });

  test('PDF는 native로 분류되어야 함', () => {
    expect(pdfConversionService.getConversionRequirement('test.pdf')).toBe('native');
  });

  test('JPG는 native로 분류되어야 함', () => {
    expect(pdfConversionService.getConversionRequirement('test.jpg')).toBe('native');
  });

  test('ZIP은 unsupported로 분류되어야 함', () => {
    expect(pdfConversionService.getConversionRequirement('archive.zip')).toBe('unsupported');
  });
});

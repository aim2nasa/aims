/**
 * pdfConversionService.js
 * PDF 변환 서비스
 *
 * Office 문서(DOCX, XLSX, PPTX, HWP 등)를 PDF로 변환하는 서비스
 * - LibreOffice headless 기반 변환
 * - HWP는 pyhwp를 통한 2단계 파이프라인 (HWP → ODT → PDF)
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const FormData = require('form-data');

// PDF 변환 서버 설정
const PDF_CONVERTER_HOST = process.env.PDF_CONVERTER_HOST || 'localhost';
const PDF_CONVERTER_PORT = process.env.PDF_CONVERTER_PORT || 3011;

// ========================
// 확장자 목록
// ========================

/**
 * PDF로 변환 가능한 확장자 목록
 * - LibreOffice로 직접 변환 가능한 형식
 * - HWP는 pyhwp를 통해 변환 (2단계 파이프라인)
 */
const CONVERTIBLE_EXTENSIONS = [
  '.doc', '.docx',     // Word
  '.xls', '.xlsx',     // Excel
  '.ppt', '.pptx',     // PowerPoint
  '.odt', '.ods', '.odp',  // OpenDocument
  '.rtf',              // Rich Text
  '.txt',              // Plain Text
  '.csv',              // CSV
  '.html', '.htm',     // HTML
  '.hwp'               // 한글 (베타)
];

/**
 * 이미 프리뷰 가능한 형식 (변환 불필요)
 * - PDF: react-pdf로 직접 렌더링
 * - 이미지: img 태그로 직접 표시
 */
const PREVIEW_NATIVE = [
  '.pdf',
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp',
  '.svg', '.ico', '.tif', '.tiff'
];

// ========================
// 유틸리티 함수
// ========================

/**
 * 파일 경로에서 확장자 추출 (소문자)
 * @param {string} filePath - 파일 경로 또는 파일명
 * @returns {string} 소문자 확장자 (예: '.docx')
 */
function getExtension(filePath) {
  if (!filePath) return '';
  return path.extname(filePath).toLowerCase();
}

/**
 * 파일이 PDF로 변환 가능한지 확인
 * @param {string} filePath - 파일 경로 또는 파일명
 * @returns {boolean} 변환 가능 여부
 */
function isConvertible(filePath) {
  const ext = getExtension(filePath);
  return CONVERTIBLE_EXTENSIONS.includes(ext);
}

/**
 * 파일이 이미 프리뷰 가능한 형식인지 확인
 * @param {string} filePath - 파일 경로 또는 파일명
 * @returns {boolean} 프리뷰 가능 여부
 */
function isPreviewNative(filePath) {
  const ext = getExtension(filePath);
  return PREVIEW_NATIVE.includes(ext);
}

/**
 * 파일의 변환 필요 상태 결정
 * @param {string} filePath - 파일 경로 또는 파일명
 * @returns {'convertible' | 'native' | 'unsupported'} 상태
 */
function getConversionRequirement(filePath) {
  if (isPreviewNative(filePath)) {
    return 'native';  // 변환 불필요 (이미 프리뷰 가능)
  }
  if (isConvertible(filePath)) {
    return 'convertible';  // 변환 필요
  }
  return 'unsupported';  // 지원하지 않는 형식
}

// ========================
// 변환 함수
// ========================

/**
 * 문서를 PDF로 변환 (HTTP API 호출 방식)
 * @param {string} inputPath - 원본 파일 경로 (서버 로컬 경로)
 * @param {string} outputDir - PDF 출력 디렉토리 (기본: 원본과 같은 폴더)
 * @returns {Promise<string>} 변환된 PDF 파일 경로
 * @throws {Error} 변환 실패 시
 */
async function convertDocument(inputPath, outputDir = null) {
  // 출력 디렉토리가 지정되지 않으면 원본 파일과 같은 디렉토리 사용
  const effectiveOutputDir = outputDir || path.dirname(inputPath);

  // 변환 가능 여부 확인
  if (!isConvertible(inputPath)) {
    throw new Error(`변환 불가능한 파일 형식입니다: ${getExtension(inputPath)}`);
  }

  // 파일 존재 확인
  if (!fs.existsSync(inputPath)) {
    throw new Error(`파일이 존재하지 않습니다: ${inputPath}`);
  }

  console.log(`[pdfConversionService] 변환 시작: ${inputPath}`);
  console.log(`[pdfConversionService] PDF 변환 서버: ${PDF_CONVERTER_HOST}:${PDF_CONVERTER_PORT}`);

  return new Promise((resolve, reject) => {
    // multipart/form-data 생성
    const form = new FormData();
    form.append('file', fs.createReadStream(inputPath));

    const options = {
      hostname: PDF_CONVERTER_HOST,
      port: PDF_CONVERTER_PORT,
      path: '/convert',
      method: 'POST',
      headers: form.getHeaders(),
      timeout: 120000  // 2분 타임아웃
    };

    const req = http.request(options, (res) => {
      if (res.statusCode !== 200) {
        let errorBody = '';
        res.on('data', chunk => errorBody += chunk);
        res.on('end', () => {
          try {
            const errorJson = JSON.parse(errorBody);
            reject(new Error(errorJson.error || `변환 실패 (HTTP ${res.statusCode})`));
          } catch {
            reject(new Error(`변환 실패 (HTTP ${res.statusCode}): ${errorBody}`));
          }
        });
        return;
      }

      // PDF 파일 저장
      const baseName = path.basename(inputPath, path.extname(inputPath));
      const pdfPath = path.join(effectiveOutputDir, baseName + '.pdf');
      const writeStream = fs.createWriteStream(pdfPath);

      res.pipe(writeStream);

      writeStream.on('finish', () => {
        console.log(`[pdfConversionService] 변환 완료: ${pdfPath}`);
        resolve(pdfPath);
      });

      writeStream.on('error', (err) => {
        console.error(`[pdfConversionService] 파일 저장 실패: ${err.message}`);
        reject(err);
      });
    });

    req.on('error', (err) => {
      console.error(`[pdfConversionService] HTTP 요청 실패: ${err.message}`);
      reject(new Error(`PDF 변환 서버 연결 실패: ${err.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('PDF 변환 타임아웃 (120초 초과)'));
    });

    // form 데이터 전송
    form.pipe(req);
  });
}

/**
 * 변환된 PDF 경로 생성 (실제 변환 없이 경로만 계산)
 * @param {string} originalPath - 원본 파일 경로
 * @returns {string} 예상되는 PDF 경로
 */
function getExpectedPdfPath(originalPath) {
  const dir = path.dirname(originalPath);
  const baseName = path.basename(originalPath, path.extname(originalPath));
  return path.join(dir, baseName + '.pdf');
}

// ========================
// 모듈 내보내기
// ========================

module.exports = {
  // 확장자 목록
  CONVERTIBLE_EXTENSIONS,
  PREVIEW_NATIVE,

  // 체크 함수
  isConvertible,
  isPreviewNative,
  getConversionRequirement,
  getExtension,

  // 변환 함수
  convertDocument,
  getExpectedPdfPath
};

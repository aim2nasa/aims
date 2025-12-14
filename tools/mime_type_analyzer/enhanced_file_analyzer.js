#!/usr/bin/env node

/**
 * enhanced_file_analyzer.js
 * 
 * 파일 메타데이터 분석 + 텍스트 추출 기능
 * Usage: node enhanced_file_analyzer.js <filePath> [--no-extract-text]
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mime = require('mime-types');
const pdfParse = require('pdf-parse');
const exif = require('exif-parser');

// pdfjs Warning 완전 억제
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
pdfjsLib.GlobalWorkerOptions.verbosity = pdfjsLib.VerbosityLevel.ERRORS;

const originalStdoutWrite = process.stdout.write.bind(process.stdout);
const originalStderrWrite = process.stderr.write.bind(process.stderr);
const originalConsoleWarn = console.warn.bind(console);

// stdout 필터링
process.stdout.write = function(chunk, encoding, callback) {
  const str = chunk.toString();
  const lines = str.split('\n');
  const filtered = lines.filter(line => !line.trim().startsWith('Warning:')).join('\n');
  if (filtered !== str) {
    if (filtered.trim()) return originalStdoutWrite(filtered, encoding, callback);
    if (typeof callback === 'function') callback();
    return true;
  }
  return originalStdoutWrite(chunk, encoding, callback);
};

// stderr 필터링
process.stderr.write = function(chunk, encoding, callback) {
  const str = chunk.toString();
  const lines = str.split('\n');
  const filtered = lines.filter(line => !line.trim().startsWith('Warning:')).join('\n');
  if (filtered !== str) {
    if (filtered.trim()) return originalStderrWrite(filtered, encoding, callback);
    if (typeof callback === 'function') callback();
    return true;
  }
  return originalStderrWrite(chunk, encoding, callback);
};

// console.warn 필터링
console.warn = function(...args) {
  const msg = args.join(' ');
  if (msg.trim().startsWith('Warning:')) return;
  return originalConsoleWarn(...args);
};

const { getDocument } = pdfjsLib;

// 오피스 문서 처리를 위한 라이브러리들
const mammoth = require('mammoth'); // DOCX
const WordExtractor = require('word-extractor'); // DOC (구형 Word 97-2003)
const XLSX = require('xlsx'); // Excel
const yauzl = require('yauzl'); // ZIP 파일 처리 (PPTX용)
const xml2js = require('xml2js'); // XML 파싱

// HWP 확장자 매핑
const EXTENSION_MIME_MAP = {
    ".hwp": "application/x-hwp",
    ".hwpx": "application/x-hwp"
};

const DEFAULT_MAX_PAGES = 30;
let ALL_PAGES = false;
let VERBOSE = false;

/**
 * 파일의 SHA-256 해시 계산
 * @param {string} filePath - 해시를 계산할 파일 경로
 * @returns {string|null} 64자 hex string (SHA-256), 오류 시 null
 */
function calculateFileHash(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    const hash = crypto.createHash('sha256');
    hash.update(buffer);
    return hash.digest('hex');
  } catch (error) {
    console.error(`[file_hash] 해시 계산 실패: ${filePath}, 오류: ${error.message}`);
    return null;
  }
}

/**
 * PDF 텍스트 비율 분석
 */
async function analyzePdfTextRatio(pdfPath, minTextLengthPerPage = 50) {
  if (!fs.existsSync(pdfPath)) {
    return { total_pages: 0, text_pages: 0, text_ratio: 0.0 };
  }

  try {
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const pdf = await getDocument({ data, verbosity: pdfjsLib.VerbosityLevel.ERRORS }).promise;

    const totalPages = pdf.numPages;

    let textPages = 0;

    for (let i = 1; i <= totalPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const extractedText = textContent.items.map(item => item.str).join(" ").trim();
      if (extractedText.length >= minTextLengthPerPage) {
        textPages++;
      }
    }

    const ratio = totalPages > 0 ? parseFloat(((textPages / totalPages) * 100).toFixed(2)) : 0.0;

    return {
      total_pages: totalPages,
      text_pages: textPages,
      text_ratio: ratio
    };
  } catch (err) {
    return { total_pages: 0, text_pages: 0, text_ratio: 0.0 };
  }
}

/**
 * PDF에서 전체 텍스트 추출
 *
 * ✅ 수정: pdf-parse를 기본 라이브러리로 사용 (한글 텍스트 추출 정확도 개선)
 * - 기존: pdfjs-dist 사용 시 한글 텍스트에 불필요한 공백 삽입 ("마크다운" → "마 크 다 운")
 * - 개선: pdf-parse 사용으로 정확한 한글 텍스트 추출
 *
 * 관련 문서: docs/20251113_keyword_search_failure_analysis.md
 */
async function extractPdfText(filePath) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(dataBuffer);
    const cleaned = pdfData.text.trim();

    if (!cleaned.length) return null;

    // 전체 출력 모드: 모든 페이지 텍스트 반환
    if (ALL_PAGES) {
      return pdfData.text;
    }

    // 제한 모드: 페이지 수 제한 (대략 2000자/페이지 기준)
    const maxChars = DEFAULT_MAX_PAGES * 2000;
    if (pdfData.text.length > maxChars) {
      return pdfData.text.substring(0, maxChars) + `\n...[TRUNCATED to ~${DEFAULT_MAX_PAGES} pages]`;
    }

    return pdfData.text;
  } catch (error) {
    throw new Error(`PDF 텍스트 추출 오류: ${error.message}`);
  }
}

/**
 * DOCX에서 텍스트 추출
 */
async function extractDocxText(filePath) {
  try {
    const result = await mammoth.extractRawText({path: filePath});
    return result.value;
  } catch (error) {
    throw new Error(`DOCX 텍스트 추출 오류: ${error.message}`);
  }
}

/**
 * DOC에서 텍스트 추출 (구형 Word 97-2003 포맷)
 */
async function extractDocText(filePath) {
  try {
    const extractor = new WordExtractor();
    const extracted = await extractor.extract(filePath);
    return extracted.getBody();
  } catch (error) {
    throw new Error(`DOC 텍스트 추출 오류: ${error.message}`);
  }
}

/**
 * Excel에서 텍스트 추출
 */
function extractXlsxText(filePath) {
  try {
    const workbook = XLSX.readFile(filePath);
    let allText = "";
    
    workbook.SheetNames.forEach(sheetName => {
      allText += `\n--- 시트: ${sheetName} ---\n`;
      const worksheet = workbook.Sheets[sheetName];
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');
      
      for (let row = range.s.r; row <= range.e.r; row++) {
        let rowText = "";
        for (let col = range.s.c; col <= range.e.c; col++) {
          const cellAddress = XLSX.utils.encode_cell({r: row, c: col});
          const cell = worksheet[cellAddress];
          if (cell && cell.v !== undefined) {
            rowText += cell.v + "\t";
          }
        }
        if (rowText.trim()) {
          allText += rowText + "\n";
        }
      }
    });
    
    // 의미 있는 텍스트가 있는지 확인 (시트 헤더만 있고 실제 내용이 없는 경우 null 반환)
    const cleanedText = allText.replace(/\n--- 시트: .+ ---\n/g, '').trim();
    if (cleanedText.length === 0) {
      return null;
    }
    
    return allText;
  } catch (error) {
    throw new Error(`Excel 텍스트 추출 오류: ${error.message}`);
  }
}

/**
 * 슬라이드 XML에서 텍스트 추출
 */
function extractTextFromSlideXml(xmlObj) {
  let text = "";
  
  function findTextNodes(obj) {
    if (typeof obj === 'object' && obj !== null) {
      // <a:t> 태그의 내용이 실제 텍스트
      if (obj['a:t'] && Array.isArray(obj['a:t'])) {
        obj['a:t'].forEach(textNode => {
          if (typeof textNode === 'string') {
            text += textNode + " ";
          } else if (textNode._) {
            text += textNode._ + " ";
          }
        });
      }
      
      // 재귀적으로 모든 하위 객체 검색
      Object.keys(obj).forEach(key => {
        if (Array.isArray(obj[key])) {
          obj[key].forEach(item => findTextNodes(item));
        } else {
          findTextNodes(obj[key]);
        }
      });
    }
  }
  
  findTextNodes(xmlObj);
  return text.trim();
}

/**
 * PPTX에서 텍스트 추출
 */
async function extractPptxText(filePath) {
  return new Promise((resolve, reject) => {
    let allText = "";
    let slideCount = 0;
    
    yauzl.open(filePath, {lazyEntries: true}, (err, zipfile) => {
      if (err) {
        reject(new Error(`PPTX 파일 열기 오류: ${err.message}`));
        return;
      }

      const slideContents = {};
      let processedSlides = 0;
      let totalSlides = 0;

      zipfile.readEntry();
      
      zipfile.on("entry", (entry) => {
        // 슬라이드 XML 파일들만 처리
        if (entry.fileName.match(/^ppt\/slides\/slide\d+\.xml$/)) {
          const slideNumber = entry.fileName.match(/slide(\d+)\.xml$/)[1];
          totalSlides++;
          
          zipfile.openReadStream(entry, (err, readStream) => {
            if (err) {
              processedSlides++;
              checkComplete();
              return;
            }

            let xmlData = '';
            readStream.on('data', (chunk) => {
              xmlData += chunk;
            });

            readStream.on('end', () => {
              // XML 파싱해서 텍스트 추출
              xml2js.parseString(xmlData, (err, result) => {
                if (!err && result) {
                  const slideText = extractTextFromSlideXml(result);
                  slideContents[slideNumber] = slideText;
                }
                processedSlides++;
                checkComplete();
              });
            });
          });
        } else {
          zipfile.readEntry();
        }
      });

      zipfile.on("end", () => {
        checkComplete();
      });

      function checkComplete() {
        if (processedSlides >= totalSlides && totalSlides > 0) {
          // 슬라이드 번호 순으로 정렬해서 텍스트 결합
          const sortedSlides = Object.keys(slideContents)
            .sort((a, b) => parseInt(a) - parseInt(b));
          
          sortedSlides.forEach(slideNum => {
            allText += `\n--- 슬라이드 ${slideNum} ---\n`;
            allText += slideContents[slideNum];
            allText += "\n";
          });

          // 의미 있는 텍스트가 있는지 확인 (슬라이드 헤더만 있고 실제 내용이 없는 경우 null 반환)
          const cleanedText = allText.replace(/\n--- 슬라이드 \d+ ---\n/g, '').trim();
          if (cleanedText.length === 0) {
            resolve(null);
          } else {
            resolve(allText);
          }
        } else if (totalSlides === 0) {
          resolve(null);
        }
      }
    });
  });
}

/**
 * HWP에서 텍스트 추출 (향후 확장 가능)
 */
function extractHwpText(filePath) {
  const stat = fs.statSync(filePath);
  const fileSize = (stat.size / 1024).toFixed(2);
  
  throw new Error(`HWP 파일 정보:
- 파일 크기: ${fileSize} KB
- HWP 텍스트 추출은 현재 개발 중입니다.

추천 방법:
1. 한글 프로그램에서 TXT로 내보내기
2. 온라인 HWP 변환 도구 사용
3. hwp2txt 같은 외부 도구 활용

향후 업데이트에서 지원 예정입니다.`);
}

/**
 * 파일 형식에 따른 텍스트 추출
 */
async function extractTextFromFile(filePath, mimeType) {
  const ext = path.extname(filePath).toLowerCase();
  
  switch (mimeType) {
    case 'application/pdf':
      return await extractPdfText(filePath);
      
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return await extractDocxText(filePath);

    case 'application/msword':
      return await extractDocText(filePath);

    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    case 'application/vnd.ms-excel':
      return extractXlsxText(filePath);
      
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      return await extractPptxText(filePath);
      
    case 'application/x-hwp':
      return extractHwpText(filePath);
      
    case 'text/plain':
      try {
        return fs.readFileSync(filePath, 'utf8');
      } catch (error) {
        throw new Error(`텍스트 파일 읽기 오류: ${error.message}`);
      }
      
    default:
      // 기타 텍스트 기반 파일들 시도
      if (ext === '.txt' || ext === '.md' || ext === '.json' || ext === '.csv') {
        try {
          return fs.readFileSync(filePath, 'utf8');
        } catch (error) {
          throw new Error(`파일 읽기 오류: ${error.message}`);
        }
      }
      throw new Error(`지원하지 않는 파일 형식입니다: ${mimeType}`);
  }
}

/**
 * 파일 메타데이터 및 텍스트 추출
 */
async function getFileMetadata(filePath, extractText = true) {
  const meta = {
    filename: path.basename(filePath),
    extension: path.extname(filePath),
    mime: null,
    size_bytes: 0,
    created_at: null,
    status: "not_found",
    exif: {},
    pdf_pages: null,
    extracted_text: null,
    error: null,
    file_hash: null
  };

  // 파일 존재 확인
  if (!fs.existsSync(filePath)) {
    meta.reason = "파일을 찾을 수 없습니다";
    return meta;
  }

  const stat = fs.statSync(filePath);
  meta.size_bytes = stat.size;
  meta.created_at = new Date(stat.ctimeMs).toISOString();
  meta.status = "ok";

  // 파일 해시 계산 (SHA-256)
  meta.file_hash = calculateFileHash(filePath);

  // 확장자 기반 MIME 매핑
  let mimeType = mime.lookup(filePath);
  if (!mimeType || mimeType === "unknown") {
    const ext = path.extname(filePath).toLowerCase();
    mimeType = EXTENSION_MIME_MAP[ext] || "unknown";
  }
  meta.mime = mimeType;

  // PDF 전용 처리
  if (mimeType === "application/pdf") {
    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(dataBuffer);
    meta.pdf_pages = pdfData.numpages;

    const textStats = await analyzePdfTextRatio(filePath);
    meta.pdf_text_ratio = textStats;
  }

  // JPEG EXIF 처리
  if (mimeType === 'image/jpeg') {
    try {
      const buffer = fs.readFileSync(filePath);
      const parser = exif.create(buffer);
      meta.exif = parser.parse().tags;
    } catch (error) {
      meta.exif = {};
    }
  } else {
    meta.exif = {};
  }

  // 텍스트 추출 (기본적으로 활성화)
  if (extractText) {
    try {
      meta.extracted_text = await extractTextFromFile(filePath, mimeType);
    } catch (error) {
      meta.error = error.message;
      meta.extracted_text = null;
    }
  }

  return meta;
}

// CLI 실행부
(async () => {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("사용법: node enhanced_file_analyzer.js <파일경로> [--no-extract-text]");
    console.error("예시:");
    console.error("  node enhanced_file_analyzer.js document.pdf");
    console.error("  node enhanced_file_analyzer.js document.docx");
    console.error("  node enhanced_file_analyzer.js document.xlsx --no-extract-text");
    process.exit(1);
  }

  const filePath = args[0];
  const extractText = !args.includes('--no-extract-text'); // 기본적으로 텍스트 추출
  ALL_PAGES = args.includes('--all-pages');
  VERBOSE = args.includes('--verbose');
  
  if (VERBOSE) {
    console.error(`파일 분석 중: ${filePath}`);
    if (extractText) {
      console.error("텍스트 추출 모드 활성화 (기본값)");
    } else {
      console.error("텍스트 추출 비활성화");
    }
  }

  const meta = await getFileMetadata(filePath, extractText);

  // JSON 출력
  console.log(JSON.stringify(meta, null, 2));
})();

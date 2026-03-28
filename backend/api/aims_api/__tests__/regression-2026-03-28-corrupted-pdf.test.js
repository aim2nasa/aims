/**
 * Regression Test — 2026-03-28 손상 PDF 처리 개선
 *
 * 문제:
 * 1. 손상 PDF가 pdfplumber Exception 무시 → OCR 호출 → 크레딧 낭비
 * 2. 손상 PDF가 "보관 완료(completed)"로 처리되어 사용자가 에러 인지 불가
 *
 * 수정:
 * 1. extract.py: CorruptedPDFError 정의, _read_pdf_file()에서 raise
 * 2. doc_prep_main.py: corrupted_pdf 전용 분기 추가 (overallStatus: "error")
 *
 * @since 2026-03-28
 */

const fs = require('fs');
const path = require('path');

function readSource(relativePath) {
  return fs.readFileSync(
    path.join(__dirname, '..', '..', '..', '..', relativePath),
    'utf-8'
  );
}

// =============================================================================
// 1. extract.py — CorruptedPDFError 정의 및 _read_pdf_file 수정
// =============================================================================
describe('FIX-1: extract.py — 손상 PDF 감지', () => {
  const source = readSource('backend/api/document_pipeline/xpipe/stages/extract.py');

  test('CorruptedPDFError 클래스가 정의되어 있어야 함', () => {
    expect(source).toContain('class CorruptedPDFError(Exception)');
  });

  test('_read_pdf_file에서 pdfplumber.open() 실패 시 CorruptedPDFError를 raise해야 함', () => {
    const fnStart = source.indexOf('def _read_pdf_file');
    const fnEnd = source.indexOf('def _convert_and_extract');
    const fnBody = source.substring(fnStart, fnEnd);
    expect(fnBody).toContain('raise CorruptedPDFError');
  });

  test('_read_pdf_file에서 페이지 단위 예외는 스킵해야 함 (부분 손상 대응)', () => {
    const fnStart = source.indexOf('def _read_pdf_file');
    const fnEnd = source.indexOf('def _convert_and_extract');
    const fnBody = source.substring(fnStart, fnEnd);
    expect(fnBody).toContain('page.extract_text()');
    // 페이지 레벨 try/except 존재 확인
    expect(fnBody).toMatch(/except Exception as page_exc/);
  });

  test('_read_pdf_file에서 except Exception: return "" 패턴이 없어야 함', () => {
    const fnStart = source.indexOf('def _read_pdf_file');
    const fnEnd = source.indexOf('def _convert_and_extract');
    const fnBody = source.substring(fnStart, fnEnd);
    // 기존 무시 패턴이 제거되었는지 확인
    expect(fnBody).not.toMatch(/except Exception:\s*\n\s*return ""/);
  });
});

// =============================================================================
// 2. extract.py — PDF 분기에서 CorruptedPDFError catch
// =============================================================================
describe('FIX-2: extract.py — PDF 분기 CorruptedPDFError 처리', () => {
  const source = readSource('backend/api/document_pipeline/xpipe/stages/extract.py');

  test('is_pdf 분기에서 CorruptedPDFError를 catch해야 함', () => {
    const pdfBranch = source.indexOf('elif is_pdf:');
    const nextBranch = source.indexOf('elif is_convertible:', pdfBranch);
    const block = source.substring(pdfBranch, nextBranch);
    expect(block).toContain('except CorruptedPDFError');
  });

  test('CorruptedPDFError catch 시 _extraction_skip_reason을 corrupted_pdf로 설정해야 함', () => {
    const pdfBranch = source.indexOf('elif is_pdf:');
    const nextBranch = source.indexOf('elif is_convertible:', pdfBranch);
    const block = source.substring(pdfBranch, nextBranch);
    expect(block).toContain('"corrupted_pdf"');
  });

  test('CorruptedPDFError catch 시 사용자 친화적 에러 메시지를 설정해야 함', () => {
    const pdfBranch = source.indexOf('elif is_pdf:');
    const nextBranch = source.indexOf('elif is_convertible:', pdfBranch);
    const block = source.substring(pdfBranch, nextBranch);
    expect(block).toContain('_user_error_message');
    expect(block).toContain('손상');
  });

  test('암호화 PDF를 구분해야 함', () => {
    const pdfBranch = source.indexOf('elif is_pdf:');
    const nextBranch = source.indexOf('elif is_convertible:', pdfBranch);
    const block = source.substring(pdfBranch, nextBranch);
    expect(block).toContain('encrypt');
    expect(block).toContain('password');
    expect(block).toContain('비밀번호');
  });
});

// =============================================================================
// 3. extract.py — _convert_and_extract 동일 패턴 수정
// =============================================================================
describe('FIX-3: extract.py — _convert_and_extract 손상 감지', () => {
  const source = readSource('backend/api/document_pipeline/xpipe/stages/extract.py');

  test('_convert_and_extract에서도 pdfplumber 실패 시 CorruptedPDFError를 raise해야 함', () => {
    const fnStart = source.indexOf('def _convert_and_extract');
    const fnEnd = source.indexOf('async def _try_ocr') > -1
      ? source.indexOf('async def _try_ocr')
      : source.indexOf('async def execute', fnStart);
    const fnBody = source.substring(fnStart, fnEnd);
    expect(fnBody).toContain('raise CorruptedPDFError');
  });
});

// =============================================================================
// 3-1. extract.py — is_convertible 분기에서 CorruptedPDFError 처리
// =============================================================================
describe('FIX-3-1: extract.py — is_convertible 분기 CorruptedPDFError 처리', () => {
  const source = readSource('backend/api/document_pipeline/xpipe/stages/extract.py');

  test('is_convertible 분기에서 CorruptedPDFError를 catch해야 함', () => {
    const convBranch = source.indexOf('elif is_convertible:');
    const nextBranch = source.indexOf('else:', convBranch + 10);
    // else: 가 여러 개 있을 수 있으므로 알 수 없는 형식 주석으로 찾기
    const unknownBranch = source.indexOf('# 알 수 없는 형식', convBranch);
    const block = source.substring(convBranch, unknownBranch > -1 ? unknownBranch : convBranch + 2000);
    expect(block).toContain('except CorruptedPDFError');
  });

  test('is_convertible 분기에서 CorruptedPDFError 시 _extraction_skip_reason을 설정해야 함', () => {
    const convBranch = source.indexOf('elif is_convertible:');
    const unknownBranch = source.indexOf('# 알 수 없는 형식', convBranch);
    const block = source.substring(convBranch, unknownBranch > -1 ? unknownBranch : convBranch + 2000);
    expect(block).toContain('"corrupted_pdf"');
    expect(block).toContain('_user_error_message');
  });

  test('CorruptedPDFError 감지 후 OCR fallback에 진입하지 않아야 함', () => {
    const convBranch = source.indexOf('elif is_convertible:');
    const unknownBranch = source.indexOf('# 알 수 없는 형식', convBranch);
    const block = source.substring(convBranch, unknownBranch > -1 ? unknownBranch : convBranch + 2000);
    expect(block).toContain('text_extraction_failed');
  });
});

// =============================================================================
// 4. doc_prep_main.py — corrupted_pdf 전용 분기
// =============================================================================
describe('FIX-4: doc_prep_main.py — 손상 PDF 에러 처리 분기', () => {
  const source = readSource('backend/api/document_pipeline/routers/doc_prep_main.py');

  test('text_extraction_failed 핸들러에 corrupted_pdf 분기가 있어야 함', () => {
    const handler = source.indexOf('text_extraction_failed');
    const block = source.substring(handler, handler + 3000);
    expect(block).toContain('"corrupted_pdf"');
  });

  test('corrupted_pdf 분기에서 overallStatus를 "error"로 설정해야 함', () => {
    const cpIdx = source.indexOf('skip_reason == "corrupted_pdf"');
    expect(cpIdx).toBeGreaterThan(-1);
    const block = source.substring(cpIdx, cpIdx + 1500);
    expect(block).toContain('"overallStatus": "error"');
  });

  test('corrupted_pdf 분기에서 사용자 친화적 메시지를 DB에 저장해야 함', () => {
    const cpIdx = source.indexOf('skip_reason == "corrupted_pdf"');
    const block = source.substring(cpIdx, cpIdx + 1500);
    expect(block).toContain('_user_error_message');
    expect(block).toContain('error.statusMessage');
  });

  test('corrupted_pdf 분기가 is_convertible_mime 분기보다 앞에 있어야 함', () => {
    // text_extraction_failed 블록 내에서의 순서 확인
    const handlerIdx = source.indexOf('text_extraction_failed');
    const block = source.substring(handlerIdx, handlerIdx + 5000);
    const cpIdx = block.indexOf('skip_reason == "corrupted_pdf"');
    const convertIdx = block.indexOf('is_convertible_mime(detected_mime)');
    expect(cpIdx).toBeGreaterThan(-1);
    expect(convertIdx).toBeGreaterThan(-1);
    expect(cpIdx).toBeLessThan(convertIdx);
  });

  test('error.statusMessage에 서버 내부 경로가 포함되지 않아야 함 (user_message 사용)', () => {
    const cpIdx = source.indexOf('skip_reason == "corrupted_pdf"');
    const block = source.substring(cpIdx, cpIdx + 1500);
    // str(e)가 아닌 user_message를 사용하는지 확인
    expect(block).not.toMatch(/"error\.statusMessage":\s*str\(e\)/);
    expect(block).toMatch(/"error\.statusMessage":\s*user_message/);
  });
});

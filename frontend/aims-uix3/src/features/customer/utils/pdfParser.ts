/**
 * PDF 파싱 유틸리티
 * 프론트엔드에서 PDF 첫 페이지 텍스트 추출 및 Annual Report 판단
 */

import * as pdfjsLib from 'pdfjs-dist';

// PDF.js worker 설정 (Vite 환경)
// @ts-ignore
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

export interface CheckAnnualReportResult {
  is_annual_report: boolean;
  confidence: number;
  metadata: {
    customer_name: string;
    report_title?: string;
    issue_date?: string;
  } | null;
}

/**
 * PDF 첫 페이지 텍스트 추출
 */
async function extractFirstPageText(file: File): Promise<string> {
  try {
    if (import.meta.env.DEV) {
      console.log('[pdfParser] 📄 PDF 텍스트 추출 시작:', file.name);
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);
    const textContent = await page.getTextContent();
    const text = textContent.items.map((item: any) => item.str).join(' ');

    if (import.meta.env.DEV) {
      console.log('[pdfParser] ✅ 텍스트 추출 완료, 길이:', text.length);
      console.log('[pdfParser] 📄 추출된 텍스트 (첫 500자):', text.substring(0, 500));
    }

    return text;
  } catch (error) {
    console.error('[pdfParser] PDF 텍스트 추출 실패:', error);
    throw new Error('PDF 텍스트 추출에 실패했습니다.');
  }
}

/**
 * 메타데이터 추출
 */
function extractMetadata(text: string) {
  const metadata: { customer_name: string; report_title?: string; issue_date?: string } = {
    customer_name: ''
  };

  // 고객명 추출: "안영미 고객님을 위한"
  const customerPattern1 = /([가-힣]{2,4})\s*고객님을\s*위한/;
  const customerMatch1 = text.match(customerPattern1);
  if (customerMatch1 && customerMatch1[1]) {
    metadata.customer_name = customerMatch1[1].trim();
  }

  // 보고서 제목 추출
  if (text.includes('Annual Review Report')) {
    metadata.report_title = 'Annual Review Report';
  }

  // 날짜 추출: "2025년 8월 27일" 형식
  const datePattern = /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/;
  const dateMatch = text.match(datePattern);
  if (dateMatch && dateMatch[1] && dateMatch[2] && dateMatch[3]) {
    const year = dateMatch[1];
    const month = dateMatch[2].padStart(2, '0');
    const day = dateMatch[3].padStart(2, '0');
    metadata.issue_date = `${year}-${month}-${day}`;
  }

  return metadata;
}

/**
 * Annual Report 여부 체크 (프론트엔드)
 */
export async function checkAnnualReportFromPDF(
  file: File
): Promise<CheckAnnualReportResult> {
  if (import.meta.env.DEV) {
    console.log('[pdfParser] 🔍 Annual Report 체크 시작:', file.name);
  }

  try {
    // 1. 첫 페이지 텍스트 추출
    const text = await extractFirstPageText(file);

    // 2. 키워드 매칭
    const requiredKeywords = ['Annual Review Report'];
    const optionalKeywords = ['보유계약 현황', 'MetLife', '고객님을 위한', '메트라이프생명'];

    const matchedRequired = requiredKeywords.filter((kw) => text.includes(kw));
    const matchedOptional = optionalKeywords.filter((kw) => text.includes(kw));

    if (import.meta.env.DEV) {
      console.log('[pdfParser] 매칭된 필수 키워드:', matchedRequired);
      console.log('[pdfParser] 매칭된 선택 키워드:', matchedOptional);
    }

    // 3. 신뢰도 계산 (필수 키워드가 있고, 선택 키워드 중 1개 이상 있으면 OK)
    const isAnnualReport = matchedRequired.length > 0 && matchedOptional.length > 0;
    const confidence = matchedRequired.length > 0 ? 1.0 : 0;

    if (!isAnnualReport) {
      if (import.meta.env.DEV) {
        console.log('[pdfParser] ❌ Annual Report 아님, confidence:', confidence);
      }
      return { is_annual_report: false, confidence, metadata: null };
    }

    // 4. 메타데이터 추출
    const metadata = extractMetadata(text);

    if (import.meta.env.DEV) {
      console.log('[pdfParser] ✅ Annual Report 판단: true, metadata:', metadata);
    }

    return {
      is_annual_report: true,
      confidence,
      metadata
    };
  } catch (error) {
    console.error('[pdfParser] ❌ Annual Report 체크 실패:', error);
    // 에러 발생 시 일반 문서로 처리
    return { is_annual_report: false, confidence: 0, metadata: null };
  }
}

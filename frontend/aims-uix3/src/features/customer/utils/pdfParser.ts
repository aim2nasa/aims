/**
 * PDF 파싱 유틸리티
 * 프론트엔드에서 PDF 첫 페이지 텍스트 추출 및 Annual Report 판단
 */

import * as pdfjsLib from 'pdfjs-dist';
import { errorReporter } from '@/shared/lib/errorReporter';

// PDF.js worker 설정 (Vite 환경)
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

export interface CheckAnnualReportResult {
  is_annual_report: boolean;
  confidence: number;
  metadata: {
    report_title?: string;
    issue_date?: string;
    customer_name?: string;
  } | null;
}

export interface CheckCustomerReviewResult {
  is_customer_review: boolean;
  confidence: number;
  metadata: {
    product_name?: string;
    issue_date?: string;
    contractor_name?: string;
    insured_name?: string;
    fsr_name?: string;
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
    const text = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');

    if (import.meta.env.DEV) {
      console.log('[pdfParser] ✅ 텍스트 추출 완료, 길이:', text.length);
      console.log('[pdfParser] 📄 추출된 텍스트 (첫 500자):', text.substring(0, 500));
    }

    return text;
  } catch (error) {
    console.error('[pdfParser] PDF 텍스트 추출 실패:', error);
    errorReporter.reportApiError(error as Error, { component: 'pdfParser.extractFirstPageText', payload: { fileName: file.name } });
    throw new Error('PDF 텍스트 추출에 실패했습니다.');
  }
}

/**
 * 메타데이터 추출 (AR 감지용)
 */
function extractMetadata(text: string) {
  const metadata: { report_title?: string; issue_date?: string; customer_name?: string } = {};

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

  // 고객명 추출: "XXX 고객님을 위한" 패턴
  const customerNamePattern = /([가-힣]{2,10})\s*고객님을\s*위한/;
  const customerNameMatch = text.match(customerNamePattern);
  if (customerNameMatch && customerNameMatch[1]) {
    metadata.customer_name = customerNameMatch[1].trim();
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
    errorReporter.reportApiError(error as Error, { component: 'pdfParser.checkAnnualReportFromPDF', payload: { fileName: file.name } });
    // 에러 발생 시 일반 문서로 처리
    return { is_annual_report: false, confidence: 0, metadata: null };
  }
}

/**
 * Customer Review 메타데이터 추출
 */
function extractCRMetadata(text: string) {
  const metadata: {
    product_name?: string;
    issue_date?: string;
    contractor_name?: string;
    insured_name?: string;
    fsr_name?: string;
  } = {};

  // 1. 상품명 추출: "무) 실버플랜 변액유니버셜V보험(월납) 종신, 전기납" 패턴
  // 납입기간: 숫자+년납 (10년납) 또는 한글+납 (전기납, 단기납)
  const productPattern = /([무유]\)\s*.+?(?:종신|년납|만기)(?:[,\s]*(?:\d+년?납?|[가-힣]+납))?)/;
  const productMatch = text.match(productPattern);
  if (productMatch) {
    let productName = productMatch[1].trim();
    // 발행일 이후 텍스트 제거
    if (productName.includes('발행')) {
      productName = productName.split('발행')[0].trim();
    }
    metadata.product_name = productName;
  } else {
    // 대체 패턴: 변액 보험 상품명
    const altProductPattern = /([가-힣]+\s*변액[가-힣]+보험[^\s발계피사]*)/;
    const altMatch = text.match(altProductPattern);
    if (altMatch) {
      metadata.product_name = altMatch[1].trim();
    }
  }

  // 2. 발행일 추출: "발행(기준)일: 2025년 9월 9일"
  const datePattern = /발행\s*(?:\(기준\))?\s*일[:\s]*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/;
  const dateMatch = text.match(datePattern);
  if (dateMatch && dateMatch[1] && dateMatch[2] && dateMatch[3]) {
    const year = dateMatch[1];
    const month = dateMatch[2].padStart(2, '0');
    const day = dateMatch[3].padStart(2, '0');
    metadata.issue_date = `${year}-${month}-${day}`;
  } else {
    // 대체 패턴: 일반 날짜
    const altDatePattern = /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/;
    const altDateMatch = text.match(altDatePattern);
    if (altDateMatch && altDateMatch[1] && altDateMatch[2] && altDateMatch[3]) {
      const year = altDateMatch[1];
      const month = altDateMatch[2].padStart(2, '0');
      const day = altDateMatch[3].padStart(2, '0');
      metadata.issue_date = `${year}-${month}-${day}`;
    }
  }

  // 3. 계약자 추출: "계약자 : 홍길동"
  const contractorPattern = /계약자\s*[:\s]+([가-힣]{2,4})/;
  const contractorMatch = text.match(contractorPattern);
  if (contractorMatch) {
    metadata.contractor_name = contractorMatch[1].trim();
  }

  // 4. 피보험자 추출: "피보험자 : 홍길동"
  const insuredPattern = /피보험자\s*[:\s]+([가-힣]{2,4})/;
  const insuredMatch = text.match(insuredPattern);
  if (insuredMatch) {
    metadata.insured_name = insuredMatch[1].trim();
  }

  // 5. FSR 이름 추출: "송유미FSR"
  const fsrPattern = /([가-힣]{2,4})\s*FSR/;
  const fsrMatch = text.match(fsrPattern);
  if (fsrMatch) {
    metadata.fsr_name = fsrMatch[1].replace(/\s/g, '').trim();
  }

  return metadata;
}

/**
 * Customer Review Service 여부 체크 (프론트엔드)
 */
export async function checkCustomerReviewFromPDF(
  file: File
): Promise<CheckCustomerReviewResult> {
  if (import.meta.env.DEV) {
    console.log('[pdfParser] 🔍 Customer Review 체크 시작:', file.name);
  }

  try {
    // 1. 첫 페이지 텍스트 추출
    const text = await extractFirstPageText(file);

    // 2. 키워드 매칭
    // 필수 키워드: "Customer Review Service" 또는 "Customer\nReview Service" (줄바꿈 포함)
    const requiredKeywords = ['Customer Review Service', 'Customer  Review Service'];
    const optionalKeywords = ['메트라이프', '변액', '적립금', '투자수익률', '펀드', '해지환급금', '계약자', '피보험자'];

    // 줄바꿈/공백 정규화하여 체크
    const normalizedText = text.replace(/\s+/g, ' ');
    const hasCustomerReview = requiredKeywords.some(kw =>
      normalizedText.includes(kw.replace(/\s+/g, ' '))
    ) || normalizedText.includes('Customer Review Service');

    const matchedOptional = optionalKeywords.filter((kw) => text.includes(kw));

    if (import.meta.env.DEV) {
      console.log('[pdfParser] Customer Review 키워드 발견:', hasCustomerReview);
      console.log('[pdfParser] 매칭된 선택 키워드:', matchedOptional);
    }

    // 3. 신뢰도 계산 ("Customer Review Service" 필수 + 선택 키워드 1개 이상)
    const isCustomerReview = hasCustomerReview && matchedOptional.length >= 1;
    const confidence = hasCustomerReview ? 1.0 : 0;

    if (!isCustomerReview) {
      if (import.meta.env.DEV) {
        console.log('[pdfParser] ❌ Customer Review 아님');
      }
      return { is_customer_review: false, confidence, metadata: null };
    }

    // 4. 메타데이터 추출
    const metadata = extractCRMetadata(text);

    if (import.meta.env.DEV) {
      console.log('[pdfParser] ✅ Customer Review 판단: true, metadata:', metadata);
    }

    return {
      is_customer_review: true,
      confidence,
      metadata
    };
  } catch (error) {
    console.error('[pdfParser] ❌ Customer Review 체크 실패:', error);
    errorReporter.reportApiError(error as Error, { component: 'pdfParser.checkCustomerReviewFromPDF', payload: { fileName: file.name } });
    // 에러 발생 시 일반 문서로 처리
    return { is_customer_review: false, confidence: 0, metadata: null };
  }
}

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
    policy_number?: string;
  } | null;
}

/**
 * PDF 텍스트 추출 (지정 페이지 수만큼)
 * @param file - PDF 파일
 * @param maxPages - 추출할 최대 페이지 수 (기본 1)
 */
async function extractPdfText(file: File, maxPages = 1): Promise<string> {
  let pdf: pdfjsLib.PDFDocumentProxy | null = null;
  try {
    if (import.meta.env.DEV) {
      console.log('[pdfParser] 📄 PDF 텍스트 추출 시작:', file.name, `(${maxPages}페이지)`);
    }

    const arrayBuffer = await file.arrayBuffer();
    pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pageCount = Math.min(maxPages, pdf.numPages);
    const texts: string[] = [];

    for (let i = 1; i <= pageCount; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ');
      texts.push(pageText);
    }

    const text = texts.join('\n');

    if (import.meta.env.DEV) {
      console.log('[pdfParser] ✅ 텍스트 추출 완료, 길이:', text.length);
      console.log('[pdfParser] 📄 추출된 텍스트 (첫 500자):', text.substring(0, 500));
    }

    return text;
  } catch (error) {
    console.error('[pdfParser] PDF 텍스트 추출 실패:', error);
    errorReporter.reportApiError(error as Error, { component: 'pdfParser.extractPdfText', payload: { fileName: file.name } });
    throw new Error('PDF 텍스트 추출에 실패했습니다.');
  } finally {
    if (pdf) {
      pdf.destroy();
    }
  }
}

/** @deprecated extractPdfText(file, 1)로 대체 */
async function extractFirstPageText(file: File): Promise<string> {
  return extractPdfText(file, 1);
}

/**
 * 메타데이터 추출 (AR 감지용)
 * @param text - 원본 텍스트
 * @param normalizedText - 공백 정규화된 텍스트 (선택적)
 */
function extractMetadata(text: string, normalizedText?: string) {
  const metadata: { report_title?: string; issue_date?: string; customer_name?: string } = {};
  const searchText = normalizedText || text.replace(/\s+/g, ' ');

  // 보고서 제목 추출
  if (searchText.includes('Annual Review Report')) {
    metadata.report_title = 'Annual Review Report';
  }

  // 날짜 추출: "2025년 8월 27일" 형식
  const datePattern = /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/;
  const dateMatch = searchText.match(datePattern);
  if (dateMatch && dateMatch[1] && dateMatch[2] && dateMatch[3]) {
    const year = dateMatch[1];
    const month = dateMatch[2].padStart(2, '0');
    const day = dateMatch[3].padStart(2, '0');
    metadata.issue_date = `${year}-${month}-${day}`;
  }

  // 고객명 추출: "고객님을 위한" 패턴 우선, " 고객" 반복 탐색 fallback
  // "고객님을 위한"이 가장 정확 (고객센터, 고객님들 등 오매칭 방지)
  // 영문/한글 무관 지원 (indexOf 기반)
  const primaryMarker = '고객님을 위한'
  const primaryIdx = searchText.indexOf(primaryMarker)
  if (primaryIdx > 0) {
    const before = searchText.substring(0, primaryIdx).trim()
    const lastSpace = before.lastIndexOf(' ')
    let name = lastSpace >= 0 ? before.substring(lastSpace + 1) : before
    const parenIdx = name.indexOf('(')
    if (parenIdx > 0) {
      name = name.substring(0, parenIdx).trim()
    }
    if (name.length >= 2) {
      metadata.customer_name = name
    }
  }
  // fallback: " 고객" 위치 기반 반복 탐색 (유효한 이름을 찾을 때까지)
  if (!metadata.customer_name) {
    let searchStart = 0
    let gogaekIdx: number
    while ((gogaekIdx = searchText.indexOf(' 고객', searchStart)) > 0) {
      const before = searchText.substring(0, gogaekIdx).trim()
      const lastSpace = before.lastIndexOf(' ')
      let name = lastSpace >= 0 ? before.substring(lastSpace + 1) : before
      const parenIdx = name.indexOf('(')
      if (parenIdx > 0) {
        name = name.substring(0, parenIdx).trim()
      }
      if (name.length >= 2 && /^[가-힣a-zA-Z]/.test(name)) {
        metadata.customer_name = name
        break
      }
      searchStart = gogaekIdx + 1
    }
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

    // 2. 키워드 매칭 (공백 정규화 적용)
    // PDF에서 추출된 텍스트는 여러 공백이 들어갈 수 있으므로 정규화 필요
    const normalizedText = text.replace(/\s+/g, ' ');

    const requiredKeywords = ['Annual Review Report'];
    const optionalKeywords = ['보유계약 현황', 'MetLife', '고객님을 위한', '메트라이프생명'];

    const matchedRequired = requiredKeywords.filter((kw) => normalizedText.includes(kw));
    const matchedOptional = optionalKeywords.filter((kw) => normalizedText.includes(kw));

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

    // 4. 메타데이터 추출 (정규화된 텍스트 전달)
    const metadata = extractMetadata(text, normalizedText);

    // 5. 파일명 = Source of Truth: PDF 텍스트 추출 결과를 파일명으로 덮어씀
    // 영문 고객명(JUNGCLAIREBOKYUNG 등)은 PDF에서 "자료는" 등으로 오매칭됨
    // 파일명은 업로드 전 이미 정제된 데이터이므로 항상 신뢰 가능
    const fnMatch = file.name.match(/^(.+?)_AR_(\d{4}-\d{2}-\d{2})\.pdf$/i);
    if (fnMatch) {
      metadata.customer_name = fnMatch[1];
      if (!metadata.issue_date) {
        metadata.issue_date = fnMatch[2];
      }
    }

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
    policy_number?: string;
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

  // 3. 계약자(고객명) 추출 - 위치 기반 (영문/한글/혼합 이름 지원)
  // Reference: tools/pdf_sorter/pdf_classifier.py extract_customer_name()
  const nameCandidates: string[] = []
  const normalizedForFields = text.replace(/\s+/g, ' ')

  // 방법 1: " 고객" 위치 기반 (join(' ')된 평면 텍스트에서 추출)
  // "LEEJOOHYUN 고객님을 위한" → "LEEJOOHYUN"
  // "홍길동 고객님을 위한" → "홍길동"
  const gogaekIdx = normalizedForFields.indexOf(' 고객')
  if (gogaekIdx > 0) {
    const before = normalizedForFields.substring(0, gogaekIdx).trim()
    const lastSpace = before.lastIndexOf(' ')
    let name = lastSpace >= 0 ? before.substring(lastSpace + 1) : before
    // 괄호 제거: "NAME(한글명)" → "NAME"
    const parenIdx = name.indexOf('(')
    if (parenIdx > 0) {
      name = name.substring(0, parenIdx).trim()
    }
    if (name.length >= 2) {
      nameCandidates.push(name)
    }
  }

  // 방법 2: "계약자" 필드 + 다음 필드 마커까지 (영문/한글 무관)
  // Reference: pdf_classifier.py:167-180
  const contractorIdx = normalizedForFields.indexOf('계약자')
  if (contractorIdx >= 0) {
    let after = normalizedForFields.substring(contractorIdx + 3).replace(/^[\s:：]+/, '')
    const fieldMarkers = ['피보험자', '사망', '증권번호', '보험기간', '보험료']
    let end = after.length
    for (const marker of fieldMarkers) {
      const pos = after.indexOf(marker)
      if (pos > 0 && pos < end) {
        end = pos
      }
    }
    const name = after.substring(0, end).trim()
    if (name.length >= 2) {
      nameCandidates.push(name)
    }
  }

  // 가장 긴 이름 반환 (잘림 방지, Reference: pdf_classifier.py:183)
  if (nameCandidates.length > 0) {
    metadata.contractor_name = nameCandidates.sort((a, b) => b.length - a.length)[0]
  }

  // 4. 피보험자 추출 (영문/한글 무관 - 필드 마커 기반)
  const insuredIdx = normalizedForFields.indexOf('피보험자')
  if (insuredIdx >= 0) {
    let after = normalizedForFields.substring(insuredIdx + 4).replace(/^[\s:：]+/, '')
    const insuredMarkers = ['사망', '증권번호', '보험기간', '보험료', 'FSR']
    let end = after.length
    for (const marker of insuredMarkers) {
      const pos = after.indexOf(marker)
      if (pos > 0 && pos < end) {
        end = pos
      }
    }
    const name = after.substring(0, end).trim()
    if (name.length >= 2) {
      metadata.insured_name = name
    }
  }

  // 5. FSR 이름 추출: "송유미FSR"
  const fsrPattern = /([가-힣]{2,4})\s*FSR/;
  const fsrMatch = text.match(fsrPattern);
  if (fsrMatch) {
    metadata.fsr_name = fsrMatch[1].replace(/\s/g, '').trim();
  }

  // 6. 증권번호 추출
  // pdf.js는 PDF 스트림 순서로 텍스트를 추출하므로
  // "증권번호"와 실제 번호가 인접하지 않을 수 있음 → 위치 기반 탐색
  const policyIdx = text.indexOf('증권번호');
  if (policyIdx >= 0) {
    // "증권번호" 이후 500자 내에서 첫 8~15자리 숫자 시퀀스 찾기
    const afterPolicy = text.substring(policyIdx + 4, policyIdx + 504);
    const digitMatch = afterPolicy.match(/(\d{8,15})/);
    if (import.meta.env.DEV) {
      console.log('[pdfParser] 증권번호 탐색:', { policyIdx, afterPolicy: afterPolicy.substring(0, 100), matched: digitMatch?.[1] ?? 'NONE' });
    }
    if (digitMatch) {
      metadata.policy_number = digitMatch[1];
    }
  } else if (import.meta.env.DEV) {
    console.log('[pdfParser] ⚠️ 증권번호 텍스트 없음 (전체 텍스트 길이:', text.length, ')');
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
    // 1. 1~2페이지 텍스트 추출 (증권번호는 2페이지에 존재)
    const text = await extractPdfText(file, 2);

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

    // 4. 메타데이터 추출 (PDF 파싱 = Source of Truth)
    const metadata = extractCRMetadata(text);

    // 5. 파일명 = Fallback: PDF 파싱에서 빈 필드만 파일명으로 보충
    // CRS 파일명 형식: {고객명}_CRS_{상품명}_{증권번호}_{YYYY-MM-DD}.pdf
    const baseName = file.name.replace(/\.pdf$/i, '');
    const fnDateMatch = baseName.match(/_(\d{4}-\d{2}-\d{2})$/);
    if (fnDateMatch) {
      if (!metadata.issue_date) {
        metadata.issue_date = fnDateMatch[1];
      }
      const withoutDate = baseName.slice(0, fnDateMatch.index);
      const fnPolicyMatch = withoutDate.match(/_(\d{8,15})$/);
      if (fnPolicyMatch) {
        if (!metadata.policy_number) {
          metadata.policy_number = fnPolicyMatch[1];
        }
        const withoutPolicy = withoutDate.slice(0, fnPolicyMatch.index);
        const crsIdx = withoutPolicy.indexOf('_CRS_');
        if (crsIdx !== -1 && !metadata.contractor_name) {
          metadata.contractor_name = withoutPolicy.slice(0, crsIdx);
        }
      } else {
        if (!metadata.contractor_name) {
          const crsFnMatch = baseName.match(/^(.+?)_CRS_/i);
          if (crsFnMatch) {
            metadata.contractor_name = crsFnMatch[1];
          }
        }
      }
    } else {
      if (!metadata.contractor_name) {
        const crsFnMatch = baseName.match(/^(.+?)_CRS_/i);
        if (crsFnMatch) {
          metadata.contractor_name = crsFnMatch[1];
        }
      }
    }

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

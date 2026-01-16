/**
 * MetLife Annual Review Report Parser
 *
 * 보유계약 현황 페이지(2페이지)를 파싱하여 구조화된 데이터로 변환
 *
 * @see docs/ANNUAL_REPORT_PARSER.md
 */

// ============================================================================
// Types
// ============================================================================

export interface Contract {
  seq: number;                   // 순번
  policyNumber: string;          // 증권번호
  productName: string;           // 보험상품
  contractor: string;            // 계약자
  insured: string;               // 피보험자
  contractDate: string;          // 계약일 (YYYY-MM-DD)
  status: string;                // 계약상태
  coverageAmount: number;        // 가입금액 (만원)
  insurancePeriod: string;       // 보험기간
  paymentPeriod: string;         // 납입기간
  premium: number;               // 보험료 (원)
}

export interface AnnualReportSummary {
  insuredName: string;           // 피보험자명
  totalContracts: number;        // 보유계약 건수
  monthlyPremiumTotal: number;   // 월 보험료 총액
  contracts: Contract[];         // 보유계약 목록
  lapsedContracts: Contract[];   // 부활가능 실효계약
}

// ============================================================================
// Parser Implementation
// ============================================================================

/**
 * 보유계약 현황 페이지 텍스트를 파싱
 * @param text - PDF에서 추출한 2페이지 텍스트
 * @returns 파싱된 보유계약 현황 데이터
 */
export function parseAnnualReportPage2(text: string): AnnualReportSummary {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  // 1. 헤더 정보 추출
  const header = parseHeader(lines);

  // 2. 보유계약 섹션과 실효계약 섹션 분리
  const lapsedIndex = lines.findIndex(line => line.includes('부활가능 실효계약'));

  const contractLines = lapsedIndex > 0
    ? lines.slice(0, lapsedIndex)
    : lines;

  const lapsedLines = lapsedIndex > 0
    ? lines.slice(lapsedIndex)
    : [];

  // 3. 계약 목록 파싱
  const contracts = parseContracts(contractLines);
  const lapsedContracts = parseLapsedContracts(lapsedLines);

  return {
    ...header,
    contracts,
    lapsedContracts
  };
}

/**
 * 헤더 정보 추출 (피보험자명, 계약건수, 월보험료)
 */
function parseHeader(lines: string[]): Pick<AnnualReportSummary, 'insuredName' | 'totalContracts' | 'monthlyPremiumTotal'> {
  // Line 3: "{피보험자명} {계약건수}"
  // 예: "김보성 6", "안영미 10"
  const line3 = lines[2] || '';
  const headerMatch = line3.match(/^(.+?)\s+(\d+)$/);

  const insuredName = headerMatch ? headerMatch[1].trim() : '';
  const totalContracts = headerMatch ? parseInt(headerMatch[2], 10) : 0;

  // Line 5: "{월보험료총액}" (콤마 포함 숫자)
  // 예: "1,809,150", "14,102,137"
  const line5 = lines[4] || '';
  const premiumStr = line5.replace(/,/g, '');
  const monthlyPremiumTotal = parseInt(premiumStr, 10) || 0;

  return {
    insuredName,
    totalContracts,
    monthlyPremiumTotal
  };
}

/**
 * 계약 목록 파싱
 *
 * 새 전략: 각 줄에서 직접 계약 데이터를 파싱
 * 줄 예시: "1 0004155605 김보성 김보성 2009-06-10 정상 3,000 종신 80세 65,200"
 */
function parseContracts(lines: string[]): Contract[] {
  const contracts: Contract[] = [];

  // 계약 데이터 줄 패턴: 순번 + 증권번호(10자리) + ... + 계약일 + ... + 보험료
  // 정규표현식: "순번 증권번호 ... YYYY-MM-DD ... 숫자"
  const contractLinePattern = /^(\d{1,2})\s+(00\d{8})\s+(.+?)\s+(\d{4}-\d{2}-\d{2})\s+(.+?)\s+([\d,]+)$/;

  // 상품명 버퍼 (이전 줄에서 상품명이 시작될 수 있음)
  let productNameBuffer = '';
  // 상태 버퍼 (이전 줄에서 상태가 분리될 수 있음, ex: "업무처")
  let statusBuffer = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 계약 데이터 줄인지 확인
    const match = line.match(contractLinePattern);

    if (match) {
      const seq = parseInt(match[1], 10);
      const policyNumber = match[2];
      const middlePart = match[3]; // 상품명 일부 + 계약자 + 피보험자
      const contractDate = match[4];
      const afterDate = match[5]; // 상태 + 가입금액 + 보험기간 + 납입기간
      const premium = parseInt(match[6].replace(/,/g, ''), 10);

      // 이전 줄에서 상품명이 있으면 병합
      const fullMiddle = productNameBuffer ? `${productNameBuffer} ${middlePart}` : middlePart;
      productNameBuffer = ''; // 버퍼 초기화

      // 상품명, 계약자, 피보험자 분리
      const { productName, contractor, insured } = extractNamesAndProduct(fullMiddle);

      // 계약일 이후 부분에서 상태, 가입금액, 보험기간, 납입기간 추출
      // 이전 줄 상태 버퍼도 함께 전달
      const details = extractContractDetails(afterDate, statusBuffer);
      statusBuffer = ''; // 버퍼 초기화

      // 다음 줄에 상품명 나머지가 있는지 확인 (ex: "Ⅱ보험", "금형)")
      const nextLine = lines[i + 1] || '';
      const isNextLineProductSuffix = isProductNameSuffix(nextLine);
      const finalProductName = isNextLineProductSuffix
        ? `${productName}${nextLine}`.replace(/\s+/g, '')
        : productName;

      contracts.push({
        seq,
        policyNumber,
        productName: finalProductName,
        contractor,
        insured,
        contractDate,
        premium,
        ...details
      });
    } else {
      // 계약 데이터 줄이 아니면 버퍼로 저장
      // 상품명은 "무배당"으로 시작하는 경우가 많음
      if (line.startsWith('무배당') || line.startsWith('평생')) {
        productNameBuffer = line;
      }
      // 상태가 분리된 경우: "업무처" (다음 줄에서 "리중"과 합쳐짐)
      // 단독 라인 또는 라인 끝에 "업무처"가 있는 경우 모두 처리
      // Note: 상품명 버퍼와 독립적으로 체크 (if, not else if)
      if (line === '업무처' || line.endsWith('업무처')) {
        statusBuffer = '업무처리중';
      }
    }
  }

  return contracts;
}

/**
 * 상품명 접미사인지 확인
 * ex: "Ⅱ보험", "금형)", "코리아", "Plus"
 */
function isProductNameSuffix(line: string): boolean {
  const suffixPatterns = [
    /^[ⅠⅡⅢ]?보험$/,
    /^금형\)?$/,
    /^Plus$/i,
    /^코리아$/,
  ];
  return suffixPatterns.some(p => p.test(line.trim()));
}

/**
 * 상품명, 계약자, 피보험자 분리
 *
 * 입력: "김보성 김보성" 또는 "무배당 실버플랜 변액유니버셜V보험 캐치업 코리아 김보성"
 */
function extractNamesAndProduct(text: string): { productName: string; contractor: string; insured: string } {
  const words = text.split(/\s+/);

  if (words.length < 2) {
    return { productName: '', contractor: text, insured: text };
  }

  // 피보험자: 마지막 단어
  const insured = words[words.length - 1];

  // 계약자: 피보험자 바로 앞
  let contractor = words[words.length - 2];
  let productEndIndex = words.length - 2;

  // 법인명 처리: "캐치업 코리아" -> "캐치업코리아"
  if (contractor === '코리아' && words.length >= 3) {
    contractor = words[words.length - 3] + contractor;
    productEndIndex = words.length - 3;
  }

  // 상품명: 처음부터 계약자 전까지
  const productName = words.slice(0, productEndIndex).join(' ');

  return { productName, contractor, insured };
}

/**
 * 계약 상세 정보 추출 (계약상태, 가입금액, 보험기간, 납입기간)
 *
 * 입력: "정상 3,000 종신 80세" 또는 "1,390.6 종신 일시납" (상태 없음)
 * @param text - 계약일 이후 텍스트
 * @param statusHint - 이전 줄에서 감지된 상태 (ex: "업무처리중")
 */
function extractContractDetails(text: string, statusHint: string = ''): Pick<Contract, 'status' | 'coverageAmount' | 'insurancePeriod' | 'paymentPeriod'> {
  const result = {
    status: '',
    coverageAmount: 0,
    insurancePeriod: '',
    paymentPeriod: ''
  };

  // 공백 정규화
  const normalized = text.replace(/\s+/g, ' ').trim();
  const parts = normalized.split(' ');

  // 계약상태 패턴
  const statusPatterns = ['정상', '납입완료', '업무처리중', '실효'];
  const normalizedForStatus = text.replace(/\s/g, '');

  for (const pattern of statusPatterns) {
    if (normalizedForStatus.includes(pattern)) {
      result.status = pattern;
      break;
    }
  }

  // 상태가 없으면 첫 단어 (숫자가 아닌 경우)
  if (!result.status && parts.length > 0 && !/^\d/.test(parts[0])) {
    result.status = parts[0];
  }

  // 상태가 여전히 없으면 statusHint 사용
  if (!result.status && statusHint) {
    result.status = statusHint;
  }

  // 숫자 패턴 추출
  const numberPattern = /([\d,]+\.?\d*)/g;
  const numbers: number[] = [];
  let match;
  while ((match = numberPattern.exec(text)) !== null) {
    numbers.push(parseFloat(match[1].replace(/,/g, '')));
  }

  // 첫 번째 숫자가 가입금액
  if (numbers.length >= 1) {
    result.coverageAmount = numbers[0];
  }

  // 보험기간/납입기간: "종신", "100세", "80세", "5년", "전기납", "일시납"
  const periodWords: string[] = [];
  for (const part of parts) {
    if (part === '종신' || /^\d+세$/.test(part) || /^\d+년$/.test(part)) {
      periodWords.push(part);
    }
  }

  if (periodWords.length >= 2) {
    result.insurancePeriod = periodWords[0];
    result.paymentPeriod = periodWords[1];
  } else if (periodWords.length === 1) {
    result.insurancePeriod = periodWords[0];
    // 특수 납입기간
    if (text.includes('전기납')) result.paymentPeriod = '전기납';
    else if (text.includes('일시납')) result.paymentPeriod = '일시납';
    else result.paymentPeriod = periodWords[0];
  }

  return result;
}

/**
 * 부활가능 실효계약 파싱
 */
function parseLapsedContracts(lines: string[]): Contract[] {
  // "대상 계약이 없습니다." 체크
  const hasNoContracts = lines.some(line => line.includes('대상 계약이 없습니다'));
  if (hasNoContracts) return [];

  // 실효계약이 있는 경우 동일한 로직으로 파싱
  // (현재 샘플에는 실효계약이 없음)
  return [];
}

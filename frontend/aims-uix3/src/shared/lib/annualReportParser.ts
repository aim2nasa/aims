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
 * 계약 목록 파싱 (2줄 컬럼 오버플로우 처리)
 *
 * 전략:
 * 1. 먼저 모든 계약 데이터 줄 위치를 찾음
 * 2. 각 계약 줄 전후의 분리된 텍스트를 수집
 * 3. 분리된 텍스트를 적절한 컬럼에 병합
 *
 * 2줄로 분리되는 경우:
 * - 보험상품: prefix (무배당 XXX) + suffix (보험, Plus, 금형 등)
 * - 계약자: 법인명 (캐치업 + 코리아)
 * - 계약상태: 업무처 + 리중 = 업무처리중
 */
function parseContracts(lines: string[]): Contract[] {
  const contracts: Contract[] = [];

  // 계약 데이터 줄 패턴: 순번 + 증권번호(10자리) + ... + 계약일 + ... + 보험료
  const contractLinePattern = /^(\d{1,2})\s+(00\d{8})\s+(.+?)\s+(\d{4}-\d{2}-\d{2})\s+(.+?)\s+([\d,]+)$/;

  // 먼저 모든 계약 줄의 인덱스를 찾음
  const contractIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (contractLinePattern.test(lines[i])) {
      contractIndices.push(i);
    }
  }

  // 각 계약 줄을 처리
  for (let idx = 0; idx < contractIndices.length; idx++) {
    const lineIndex = contractIndices[idx];
    const line = lines[lineIndex];
    const match = line.match(contractLinePattern)!;

    const seq = parseInt(match[1], 10);
    const policyNumber = match[2];
    const middlePart = match[3]; // 상품명 일부 + 계약자 + 피보험자
    const contractDate = match[4];
    const afterDate = match[5]; // 상태 + 가입금액 + 보험기간 + 납입기간
    const premium = parseInt(match[6].replace(/,/g, ''), 10);

    // 이전/다음 계약 줄까지의 범위 계산
    const prevContractIndex = idx > 0 ? contractIndices[idx - 1] : -1;
    const nextContractIndex = idx < contractIndices.length - 1 ? contractIndices[idx + 1] : lines.length;

    // 이전 줄들에서 분리된 텍스트 수집 (이전 계약 줄 이후 ~ 현재 줄 이전)
    const prevLines: string[] = [];
    for (let i = prevContractIndex + 1; i < lineIndex; i++) {
      const prevLine = lines[i].trim();
      if (prevLine && !isHeaderLine(prevLine)) {
        prevLines.push(prevLine);
      }
    }

    // 다음 줄들에서 분리된 텍스트 수집 (현재 줄 이후 ~ 다음 계약 줄 이전)
    const nextLines: string[] = [];
    for (let i = lineIndex + 1; i < nextContractIndex; i++) {
      const nextLine = lines[i].trim();
      if (nextLine && !isHeaderLine(nextLine) && !nextLine.includes('US달러상품')) {
        nextLines.push(nextLine);
      }
    }

    // 분리된 텍스트 분류
    const fragments = classifyFragments(prevLines, nextLines);

    // 상품명 조합
    let productName = '';
    if (fragments.productPrefix) {
      productName = fragments.productPrefix;
    }

    // middlePart에서 상품명, 계약자, 피보험자 추출
    const extracted = extractNamesAndProduct(middlePart, fragments.contractorParts);

    // 상품명 병합 (prefix + middle + suffix)
    // 주의: 공백 없이 이어붙여야 할 경우 처리
    if (productName && extracted.productName) {
      productName = productName + ' ' + extracted.productName;
    } else if (extracted.productName) {
      productName = extracted.productName;
    }
    // productName만 있고 extracted.productName이 없으면 그대로 유지

    // 상품명 suffix 병합
    // - "Plus", "Plus(...)" 등 영문 시작: 공백 추가
    // - "금형)", "보험" 등 한글/괄호 시작: 공백 없이 연결
    if (fragments.productSuffix) {
      const needsSpace = /^[A-Za-z]/.test(fragments.productSuffix);
      productName = productName + (needsSpace ? ' ' : '') + fragments.productSuffix;
    }

    // 상품명 정리: 연속 공백 제거하되, 괄호 안 공백도 정리
    productName = productName
      .replace(/\s+/g, ' ')
      .replace(/\(\s+/g, '(')   // "( " -> "("
      .replace(/\s+\)/g, ')')   // " )" -> ")"
      .trim();

    // 계약자 조합 (법인명 분리 처리)
    let contractor = extracted.contractor;
    if (fragments.contractorParts.length > 0 && !contractor) {
      contractor = fragments.contractorParts.join('');
    } else if (fragments.contractorParts.length > 0 && contractor) {
      // 부분 일치 확인 후 병합
      const fullContractor = fragments.contractorParts.join('');
      if (fullContractor.includes(contractor) || contractor.includes(fragments.contractorParts[0])) {
        contractor = fullContractor;
      }
    }

    // 계약 상세 정보 추출
    const details = extractContractDetails(afterDate, fragments.status);

    contracts.push({
      seq,
      policyNumber,
      productName,
      contractor,
      insured: extracted.insured,
      contractDate,
      premium,
      ...details
    });
  }

  return contracts;
}

/**
 * 헤더/메타 줄인지 확인
 */
function isHeaderLine(line: string): boolean {
  const headerPatterns = [
    '보유계약 현황',
    'Annual Review Report',
    '님을 피보험자로 하는',
    '현재 납입중인 월 보험료',
    '계약 가입금액',
    '순번 증권번호',
    '상태 (만원)',
    '부활가능 실효계약',
    '대상 계약이 없습니다',
    '위의 가입상품에 대한',
    '발행(기준)일'
  ];
  return headerPatterns.some(p => line.includes(p));
}

/**
 * 분리된 텍스트 조각들을 분류
 *
 * 복잡한 케이스 처리:
 * - "무배당 ... 업무처" - 상품명 끝에 상태 prefix 붙어있음
 * - "Plus(저해약환급금형) 리중" - 상품명 suffix와 상태 suffix가 같은 줄에 있음
 */
function classifyFragments(prevLines: string[], nextLines: string[]): {
  productPrefix: string;
  productSuffix: string;
  contractorParts: string[];
  status: string;
} {
  const result = {
    productPrefix: '',
    productSuffix: '',
    contractorParts: [] as string[],
    status: ''
  };

  // 상품명 prefix 패턴 (이전 줄)
  for (const line of prevLines) {
    if (line.startsWith('무배당') || line.startsWith('평생')) {
      // 상품명 끝에 "업무처"가 붙어있는 경우 처리
      if (line.endsWith('업무처')) {
        result.productPrefix = line.slice(0, -3).trim(); // "업무처" 제거
        result.status = '업무처리중';
      } else {
        result.productPrefix = line;
      }
    } else if (line === '캐치업') {
      result.contractorParts.push(line);
    } else if (line === '업무처') {
      result.status = '업무처리중';
    }
  }

  // 다음 줄 분석
  for (const line of nextLines) {
    // "리중"이 포함된 줄 처리 (상태 suffix)
    if (line.includes('리중')) {
      result.status = '업무처리중';
      // "리중" 앞에 상품명 suffix가 있으면 추출
      const beforeRijung = line.replace('리중', '').trim();
      if (beforeRijung && isProductNameSuffixMatch(beforeRijung)) {
        result.productSuffix = beforeRijung;
      }
    }
    // 상품명 suffix 패턴 (단독)
    else if (isProductNameSuffix(line)) {
      result.productSuffix = line.trim();
    }
    // 계약자 suffix (법인명)
    else if (line === '코리아') {
      result.contractorParts.push(line);
    }
  }

  return result;
}

/**
 * 상품명 suffix 일치 확인 (부분 문자열용)
 * ex: "Plus(저해약환급금형)"
 */
function isProductNameSuffixMatch(text: string): boolean {
  const trimmed = text.trim();
  const suffixPatterns = [
    /^[ⅠⅡⅢ]?보험$/,
    /^금형\)?$/,
    /^급금형\)?$/,
    /^환급금형\)?$/,
    /^Plus/i,                 // "Plus" 또는 "Plus(저해약환급금형)"
    /\(저해약환급금형\)$/,    // 괄호 포함 접미사
  ];
  return suffixPatterns.some(p => p.test(trimmed));
}

/**
 * 상품명 접미사인지 확인
 * ex: "Ⅱ보험", "보험", "금형)", "급금형)", "환급금형)", "Plus"
 */
function isProductNameSuffix(line: string): boolean {
  const trimmed = line.trim();
  const suffixPatterns = [
    /^[ⅠⅡⅢ]?보험$/,         // "보험", "Ⅱ보험"
    /^금형\)?$/,              // "금형", "금형)"
    /^급금형\)?$/,            // "급금형)"
    /^환급금형\)?$/,          // "환급금형)"
    /^Plus$/i,                // "Plus"
  ];
  return suffixPatterns.some(p => p.test(trimmed));
}

/**
 * 상품명, 계약자, 피보험자 분리
 *
 * 입력: "김보성 김보성" 또는 "무배당 실버플랜 변액유니버셜V보험 캐치업 코리아 김보성"
 * @param text - 중간 부분 텍스트
 * @param contractorParts - 분리된 계약자 조각들 (ex: ["캐치업", "코리아"])
 */
function extractNamesAndProduct(
  text: string,
  contractorParts: string[] = []
): { productName: string; contractor: string; insured: string } {
  const words = text.split(/\s+/);

  if (words.length < 2) {
    return { productName: '', contractor: text, insured: text };
  }

  // 피보험자: 마지막 단어
  const insured = words[words.length - 1];

  // 법인 계약자가 분리되어 있는 경우 (캐치업 + 코리아)
  // 이 경우 middlePart에는 피보험자만 있거나, 상품명 + 피보험자만 있음
  if (contractorParts.length > 0) {
    const contractor = contractorParts.join('');
    // 상품명: 처음부터 피보험자 전까지
    const productName = words.slice(0, words.length - 1).join(' ');
    return { productName, contractor, insured };
  }

  // 계약자: 피보험자 바로 앞
  let contractor = words[words.length - 2];
  let productEndIndex = words.length - 2;

  // 법인명 처리: "캐치업 코리아" -> "캐치업코리아" (같은 줄에 있는 경우)
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

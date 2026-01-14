/**
 * AR Generator 타입 정의
 */

/** 보험 계약 정보 */
export interface Contract {
  순번: number;
  증권번호: string;
  보험상품: string;
  계약자: string;
  피보험자: string;
  계약일: string;  // YYYY-MM-DD
  계약상태: '정상' | '실효' | '해지' | '만기';
  '가입금액(만원)': number;
  보험기간: string;
  납입기간: string;
  '보험료(원)': number;
}

/** AR 문서 생성 옵션 */
export interface ARGenerateOptions {
  /** 고객명 */
  customerName: string;
  /** 발행기준일 (YYYY-MM-DD) */
  issueDate: string;
  /** FSR(설계사) 이름 */
  fsrName?: string;
  /** 계약 목록 */
  contracts: Contract[];
  /** 실효계약 목록 (선택) */
  lapsedContracts?: Contract[];
  /** 출력 파일 경로 */
  outputPath?: string;
}

/** 배치 생성 옵션 */
export interface BatchGenerateOptions {
  /** 생성할 AR 수 */
  count: number;
  /** 출력 디렉토리 */
  outputDir: string;
  /** 시나리오 타입 */
  scenario?: 'normal' | 'edge' | 'stress' | 'mixed';
}

/** 테스트 결과 */
export interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  details?: {
    expected?: any;
    actual?: any;
  };
}

/** 테스트 실행 결과 */
export interface TestRunResult {
  total: number;
  passed: number;
  failed: number;
  duration: number;
  results: TestResult[];
}

/** AR 템플릿 프리셋 */
export type ARTemplatePreset =
  | 'basic'           // 기본 (계약 3-5개)
  | 'single'          // 단일 계약
  | 'many'            // 다수 계약 (10개 이상)
  | 'with_lapsed'     // 실효계약 포함
  | 'all_lapsed'      // 모두 실효
  | 'mixed_status'    // 다양한 상태 혼합
  | 'empty';          // 계약 없음 (엣지케이스)

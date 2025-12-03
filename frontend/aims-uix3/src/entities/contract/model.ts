/**
 * AIMS UIX-3 Contract Entity Model
 * @since 2025-11-26
 * @version 1.0.0
 *
 * 계약 엔티티의 타입 정의 및 검증 스키마
 * Zod를 사용한 런타임 타입 검증
 * MongoDB contracts 컬렉션 구조와 일치
 */

import { z } from 'zod';

/**
 * 계약 메타 정보 스키마
 */
export const ContractMetaSchema = z.object({
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  created_by: z.string().nullable().optional(),
  source: z.enum(['excel_import', 'manual', 'api']).default('manual'),
});

/**
 * 계약 스키마
 */
export const ContractSchema = z.object({
  _id: z.string(),

  // === Foreign Keys ===
  agent_id: z.string(),                    // users._id (로그인한 설계사)
  customer_id: z.string().nullable(),      // customers._id (고객명으로 조회)
  insurer_id: z.string().nullable(),       // 현재 NULL (추후 보험사 연동)
  product_id: z.string().nullable(),       // insurance_products._id (상품명으로 조회)

  // === Excel 원본 데이터 (조회용 보관) ===
  customer_name: z.string(),               // 고객명
  product_name: z.string(),                // 상품명

  // === 계약 정보 ===
  contract_date: z.string().nullable(),    // 계약일
  policy_number: z.string(),               // 증권번호 (unique)
  premium: z.number().default(0),          // 보험료 (원)
  payment_day: z.string().nullable(),  // 이체일 (원본 텍스트 그대로: 0일, 말일, 15일 등)
  payment_cycle: z.string().nullable(),    // 납입주기 (월납, 연납, 일시납)
  payment_period: z.string().nullable(),   // 납입기간 (10년, 20년, 종신)
  insured_person: z.string().nullable(),   // 피보험자
  payment_status: z.string().nullable(),   // 납입상태 (정상, 연체, 완납)

  // === 메타 정보 ===
  meta: ContractMetaSchema,
});

/**
 * 계약 생성 요청 스키마
 */
export const CreateContractSchema = z.object({
  agent_id: z.string(),
  customer_id: z.string().nullable().optional(),
  insurer_id: z.string().nullable().optional(),
  product_id: z.string().nullable().optional(),
  customer_name: z.string(),
  product_name: z.string(),
  contract_date: z.string().nullable().optional(),
  policy_number: z.string(),
  premium: z.number().default(0),
  payment_day: z.string().nullable().optional(),
  payment_cycle: z.string().nullable().optional(),
  payment_period: z.string().nullable().optional(),
  insured_person: z.string().nullable().optional(),
  payment_status: z.string().nullable().optional(),
  source: z.enum(['excel_import', 'manual', 'api']).optional(),
});

/**
 * 계약 일괄 생성 요청 스키마 (Excel Import용)
 */
export const BulkCreateContractsSchema = z.object({
  agent_id: z.string(),
  contracts: z.array(z.object({
    customer_name: z.string(),
    product_name: z.string(),
    contract_date: z.string().nullable().optional(),
    policy_number: z.string(),
    premium: z.number().default(0),
    payment_day: z.string().nullable().optional(),
    payment_cycle: z.string().nullable().optional(),
    payment_period: z.string().nullable().optional(),
    insured_person: z.string().nullable().optional(),
    payment_status: z.string().nullable().optional(),
  })),
});

/**
 * 계약 업데이트 요청 스키마
 */
export const UpdateContractSchema = z.object({
  customer_id: z.string().nullable().optional(),
  insurer_id: z.string().nullable().optional(),
  product_id: z.string().nullable().optional(),
  customer_name: z.string().optional(),
  product_name: z.string().optional(),
  contract_date: z.string().nullable().optional(),
  policy_number: z.string().optional(),
  premium: z.number().optional(),
  payment_day: z.string().nullable().optional(),
  payment_cycle: z.string().nullable().optional(),
  payment_period: z.string().nullable().optional(),
  insured_person: z.string().nullable().optional(),
  payment_status: z.string().nullable().optional(),
});

/**
 * 계약 검색 쿼리 스키마
 */
export const ContractSearchQuerySchema = z.object({
  agent_id: z.string().optional(),
  customer_id: z.string().optional(),
  search: z.string().optional(),
  limit: z.number().min(1).max(10000).default(1000),
  skip: z.number().min(0).default(0),
});

/**
 * 계약 목록 응답 스키마
 */
export const ContractListResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(ContractSchema),
  total: z.number(),
  limit: z.number(),
  skip: z.number(),
});

/**
 * 계약 일괄 등록 응답 스키마
 * - 증권번호 기준 upsert: 존재하면 업데이트, 없으면 생성
 */
export const BulkCreateResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.object({
    createdCount: z.number(),
    updatedCount: z.number(),
    skippedCount: z.number(),
    errorCount: z.number(),
    created: z.array(z.object({
      customer_name: z.string(),
      product_name: z.string(),
      policy_number: z.string(),
      contract_date: z.string().nullable().optional(),
      premium: z.number().optional(),
      payment_day: z.any().optional(),
      payment_cycle: z.string().nullable().optional(),
      payment_period: z.string().nullable().optional(),
      insured_person: z.string().nullable().optional(),
      payment_status: z.string().nullable().optional(),
      _id: z.string(),
    })).optional(),
    updated: z.array(z.object({
      customer_name: z.string(),
      product_name: z.string(),
      policy_number: z.string(),
      contract_date: z.string().nullable().optional(),
      premium: z.number().optional(),
      payment_day: z.any().optional(),
      payment_cycle: z.string().nullable().optional(),
      payment_period: z.string().nullable().optional(),
      insured_person: z.string().nullable().optional(),
      payment_status: z.string().nullable().optional(),
      _id: z.string(),
      changes: z.array(z.string()),
    })).optional(),
    skipped: z.array(z.object({
      customer_name: z.string(),
      policy_number: z.string(),
      reason: z.string(),
    })).optional(),
    errors: z.array(z.object({
      customer_name: z.string(),
      policy_number: z.string(),
      reason: z.string(),
    })).optional(),
  }),
});

/**
 * TypeScript 타입 추출
 */
export type ContractMeta = z.infer<typeof ContractMetaSchema>;
export type Contract = z.infer<typeof ContractSchema>;
export type CreateContractData = z.infer<typeof CreateContractSchema>;
export type BulkCreateContractsData = z.infer<typeof BulkCreateContractsSchema>;
export type UpdateContractData = z.infer<typeof UpdateContractSchema>;
export type ContractSearchQuery = z.infer<typeof ContractSearchQuerySchema>;
export type ContractListResponse = z.infer<typeof ContractListResponseSchema>;
export type BulkCreateResponse = z.infer<typeof BulkCreateResponseSchema>;

/**
 * 계약 유틸리티
 */
export const ContractUtils = {
  /**
   * 계약 표시명 반환 (고객명 - 상품명)
   */
  getDisplayName: (contract: Contract): string => {
    return `${contract.customer_name || '미상'} - ${contract.product_name || '미상'}`;
  },

  /**
   * 보험료 포맷팅 (원 단위)
   */
  formatPremium: (premium: number): string => {
    return premium.toLocaleString('ko-KR') + '원';
  },

  /**
   * 계약일 포맷팅 (YYYY.MM.DD 형식)
   */
  formatContractDate: (date: string | null): string => {
    if (!date) return '-';
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) return date;

      // KST로 변환하여 각 부분 추출
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });

      const parts = formatter.formatToParts(d);
      const year = parts.find(p => p.type === 'year')?.value || '';
      const month = parts.find(p => p.type === 'month')?.value || '';
      const day = parts.find(p => p.type === 'day')?.value || '';

      return `${year}.${month}.${day}`;
    } catch {
      return date;
    }
  },

  /**
   * 납입상태 텍스트 반환
   */
  getPaymentStatusText: (status: string | null): string => {
    return status || '미정';
  },

  /**
   * 납입주기 텍스트 반환
   */
  getPaymentCycleText: (cycle: string | null): string => {
    return cycle || '-';
  },

  /**
   * 계약 데이터 검증
   */
  validate: (data: unknown): Contract => {
    return ContractSchema.parse(data);
  },

  /**
   * 계약 생성 데이터 검증
   */
  validateCreateData: (data: unknown): CreateContractData => {
    return CreateContractSchema.parse(data);
  },

  /**
   * 계약 업데이트 데이터 검증
   */
  validateUpdateData: (data: unknown): UpdateContractData => {
    return UpdateContractSchema.parse(data);
  },

  /**
   * 고객명으로 정렬하는 비교 함수
   */
  sortByCustomerName: (a: Contract, b: Contract): number => {
    const nameA = a.customer_name || '';
    const nameB = b.customer_name || '';
    return nameA.localeCompare(nameB, 'ko', { numeric: true });
  },

  /**
   * 계약일로 정렬하는 비교 함수 (최신순)
   */
  sortByContractDate: (a: Contract, b: Contract): number => {
    const dateA = a.contract_date || '';
    const dateB = b.contract_date || '';
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  },

  /**
   * 보험료로 정렬하는 비교 함수 (높은순)
   */
  sortByPremium: (a: Contract, b: Contract): number => {
    return (b.premium || 0) - (a.premium || 0);
  },
};

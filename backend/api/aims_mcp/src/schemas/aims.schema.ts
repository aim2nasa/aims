/**
 * AIMS 호환 스키마 정의
 *
 * 이 스키마는 aims_api와 프론트엔드가 기대하는 데이터 형식을 정의합니다.
 * MCP 도구들이 생성하는 데이터가 이 스키마와 일치해야 합니다.
 *
 * 과거 발생한 버그:
 * 1. phone vs mobile_phone 필드명 불일치
 * 2. 날짜 형식 불일치 (문자열 "YYYY.MM.DD HH:mm:ss" vs Date 객체)
 */

import { z } from 'zod';

// Date 객체 또는 ISO 문자열 검증
const DateSchema = z.union([
  z.date(),
  z.string().refine(
    (val) => !isNaN(Date.parse(val)),
    { message: '유효한 ISO 8601 날짜 문자열이어야 합니다' }
  )
]);

// 날짜가 Date 객체인지 검증 (문자열 불허)
const StrictDateSchema = z.date({
  required_error: '날짜는 필수입니다',
  invalid_type_error: '날짜는 Date 객체여야 합니다 (문자열 불가)',
});

/**
 * 고객 personal_info 스키마
 * 주의: mobile_phone 필드명 사용 (phone 아님!)
 */
export const CustomerPersonalInfoSchema = z.object({
  name: z.string().min(1, '고객명은 필수입니다'),
  mobile_phone: z.string().optional(), // phone이 아님!
  email: z.string().optional(),
  birth_date: z.string().optional(), // YYYY-MM-DD 형식
  address: z.object({
    address1: z.string().optional(),
    address2: z.string().optional(),
  }).optional(),
});

/**
 * 고객 insurance_info 스키마
 */
export const CustomerInsuranceInfoSchema = z.object({
  customer_type: z.enum(['개인', '법인']),
});

/**
 * 고객 meta 스키마
 * 주의: created_at, updated_at은 Date 객체여야 함!
 */
export const CustomerMetaSchema = z.object({
  status: z.enum(['active', 'inactive']),
  created_by: z.string(),
  created_at: StrictDateSchema, // 반드시 Date 객체
  updated_at: StrictDateSchema, // 반드시 Date 객체
});

/**
 * MCP create_customer가 생성하는 고객 문서 스키마
 */
export const MCPCustomerDocumentSchema = z.object({
  personal_info: CustomerPersonalInfoSchema,
  insurance_info: CustomerInsuranceInfoSchema,
  meta: CustomerMetaSchema,
});

/**
 * MCP update_customer가 생성하는 업데이트 필드 스키마
 */
export const MCPCustomerUpdateFieldsSchema = z.object({
  'personal_info.name': z.string().optional(),
  'personal_info.mobile_phone': z.string().optional(), // phone이 아님!
  'personal_info.email': z.string().optional(),
  'personal_info.birth_date': z.string().optional(),
  'personal_info.address.address1': z.string().optional(),
  'meta.updated_at': StrictDateSchema, // 반드시 Date 객체
}).passthrough();

/**
 * 메모 문서 스키마
 * 주의: created_at, updated_at은 Date 객체여야 함!
 */
export const MCPMemoDocumentSchema = z.object({
  customer_id: z.any(), // ObjectId
  content: z.string().min(1),
  created_by: z.string(),
  created_at: StrictDateSchema, // 반드시 Date 객체
  updated_at: StrictDateSchema, // 반드시 Date 객체
});

// 검증 헬퍼 함수들
export function validateCustomerDocument(doc: unknown) {
  return MCPCustomerDocumentSchema.safeParse(doc);
}

export function validateCustomerUpdateFields(fields: unknown) {
  return MCPCustomerUpdateFieldsSchema.safeParse(fields);
}

export function validateMemoDocument(doc: unknown) {
  return MCPMemoDocumentSchema.safeParse(doc);
}

// 타입 추론
export type MCPCustomerDocument = z.infer<typeof MCPCustomerDocumentSchema>;
export type MCPCustomerUpdateFields = z.infer<typeof MCPCustomerUpdateFieldsSchema>;
export type MCPMemoDocument = z.infer<typeof MCPMemoDocumentSchema>;

/**
 * 전화번호 포맷팅 유틸리티
 * 네이버/카카오 스타일: 숫자만 입력 → 하이픈 자동 추가
 * @since 2025-12-17
 */

/**
 * 문자열에서 숫자만 추출
 */
export const extractDigits = (value: string): string => value.replace(/\D/g, '');

/**
 * 한국 전화번호 자동 포맷팅
 * - 휴대폰: 010-XXXX-XXXX
 * - 서울: 02-XXXX-XXXX
 * - 지역번호: 0XX-XXXX-XXXX
 */
export const formatPhoneNumber = (value: string): string => {
  const digits = extractDigits(value);
  if (!digits) return '';

  // 휴대폰: 010-XXXX-XXXX (11자리)
  if (digits.startsWith('010')) {
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
  }

  // 서울: 02-XXXX-XXXX (9~10자리)
  if (digits.startsWith('02')) {
    if (digits.length <= 2) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
  }

  // 지역번호/대표번호: 0XX-XXXX-XXXX (10~11자리)
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
};

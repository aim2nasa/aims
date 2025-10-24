/**
 * 파일 해시 계산 유틸리티
 *
 * SHA-256 해시를 사용하여 파일 중복 체크
 * Web Crypto API 사용 (브라우저 네이티브)
 */

/**
 * 파일의 SHA-256 해시 계산
 *
 * @param file 해시를 계산할 파일
 * @returns SHA-256 해시 (64자 hex string)
 */
export async function calculateFileHash(file: File): Promise<string> {
  try {
    // 파일을 ArrayBuffer로 읽기
    const arrayBuffer = await file.arrayBuffer();

    // SHA-256 해시 계산
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);

    // ArrayBuffer를 hex string으로 변환
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return hashHex;
  } catch (error) {
    console.error('파일 해시 계산 실패:', error);
    throw new Error('파일 해시 계산에 실패했습니다.');
  }
}

/**
 * 파일 해시가 목록에 존재하는지 확인
 *
 * @param fileHash 확인할 파일 해시
 * @param existingHashes 기존 해시 목록
 * @returns 중복 여부
 */
export function isDuplicateHash(
  fileHash: string,
  existingHashes: (string | undefined)[]
): boolean {
  return existingHashes.some(hash => hash && hash === fileHash);
}

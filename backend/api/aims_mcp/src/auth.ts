import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-me';

interface JWTPayload {
  id: string;
  name?: string;
  role?: string;
  iat?: number;
  exp?: number;
}

// 현재 요청의 userId를 저장하는 컨텍스트
let currentUserId: string | null = null;

/**
 * 현재 요청의 userId 설정
 */
export function setCurrentUserId(userId: string): void {
  currentUserId = userId;
}

/**
 * 현재 요청의 userId 반환
 */
export function getCurrentUserId(): string {
  if (!currentUserId) {
    throw new Error('No user authenticated');
  }
  return currentUserId;
}

/**
 * Authorization 헤더 또는 환경변수에서 userId 추출
 */
export function getUserIdFromAuth(authHeader?: string, xUserId?: string): string {
  // 1. HTTP 모드: Authorization 헤더에서 JWT 추출
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
      if (!decoded.id) {
        throw new Error('Invalid token: missing user id');
      }
      return decoded.id;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Token expired');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid token');
      }
      throw error;
    }
  }

  // 2. X-User-ID 헤더 (개발/테스트용)
  if (xUserId) {
    return xUserId;
  }

  // 3. stdio 모드: 환경변수에서 userId 사용
  const envUserId = process.env.USER_ID;
  if (envUserId) {
    return envUserId;
  }

  throw new Error('No authentication provided. Set USER_ID env or provide Authorization header.');
}

/**
 * JWT 토큰 검증
 */
export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, JWT_SECRET) as JWTPayload;
}

/**
 * 개발용: JWT 토큰 생성
 */
export function generateToken(userId: string, name?: string, role?: string): string {
  return jwt.sign(
    { id: userId, name, role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

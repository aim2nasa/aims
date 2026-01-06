export interface UserStorage {
  tier: string;
  quota_bytes: number;
  used_bytes: number;
  usage_percent: number;
  ocr_quota?: number;
  ocr_used_this_month?: number;
}

export interface User {
  _id: string;
  name: string | null;
  email: string | null;
  role: 'user' | 'agent' | 'admin' | 'system';
  avatarUrl?: string | null;
  hasOcrPermission?: boolean;
  profileCompleted?: boolean;
  authProvider?: string;
  storage?: UserStorage;
  // 삭제 예약 관련 필드
  scheduledDeletionAt?: string | null;
  scheduledDeletionBy?: string | null;
  scheduledDeletionRequestedAt?: string | null;
}

export interface AuthResponse {
  success: boolean;
  user?: User;
  token?: string;
  message?: string;
}

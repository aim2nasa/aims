export interface User {
  _id: string;
  name: string | null;
  email: string | null;
  role: 'user' | 'agent' | 'admin' | 'system';
  avatarUrl?: string | null;
  hasOcrPermission?: boolean;
  profileCompleted?: boolean;
  authProvider?: string;
}

export interface AuthResponse {
  success: boolean;
  user?: User;
  token?: string;
  message?: string;
}

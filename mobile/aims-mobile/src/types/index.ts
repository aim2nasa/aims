// 사용자 타입
export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

// 인증 관련 타입
export interface AuthResponse {
  success: boolean;
  token: string;
  user: User;
  message?: string;
}

// 채팅 메시지 타입
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
  metadata?: {
    tokens?: {
      prompt: number;
      completion: number;
      total: number;
    };
    tools_used?: string[];
  };
}

// SSE 이벤트 타입
export interface ChatEvent {
  type: 'session' | 'content' | 'tool_start' | 'tool_calling' | 'tool_result' | 'done' | 'error';
  session_id?: string;
  content?: string;
  tools?: string[];
  name?: string;
  success?: boolean;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  error?: string;
}

// 채팅 세션 타입
export interface ChatSession {
  session_id: string;
  user_id: string;
  title: string;
  preview?: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

// 채팅 세션 상세 타입
export interface ChatSessionDetail {
  session_id: string;
  title: string;
  messages: ChatMessage[];
}

// API 응답 타입
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

// 고객 타입
export interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  customer_type: '개인' | '법인';
  status: 'active' | 'inactive';
  created_at: string;
}

// 계약 타입
export interface Contract {
  id: string;
  customer_id: string;
  customer_name: string;
  policy_number: string;
  product_name: string;
  premium: number;
  status: string;
  start_date: string;
  end_date: string;
}

// MCP 도구 타입
export interface MCPTool {
  name: string;
  description: string;
  category: string;
  icon: string;
  examples: string[];
}

// 기능 카테고리 타입
export interface ToolCategory {
  name: string;
  icon: string;
  tools: MCPTool[];
}

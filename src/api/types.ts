/** 与后端约定的数据结构，字段名与接口返回保持一致。 */

export interface User {
  id: number;
  username: string;
  phone: string | null;
  display_name: string;
  created_at: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_at: string;
}

export interface SendCodeResponse {
  /** 验证码有效期（秒） */
  expires_in: number;
  /** 多久之后可以再次发送（秒） */
  resend_after: number;
  /** 仅开发模式返回，方便自测；生产环境为 null */
  debug_code: string | null;
  /** 脱敏手机号，用于提示「已发送到 138****8000」 */
  masked_phone: string;
}

export interface RegisterPayload {
  phone: string;
  code: string;
  password: string;
  display_name: string;
}

export interface Todo {
  id: number;
  title: string;
  done: boolean;
  created_at: string;
  updated_at: string;
}

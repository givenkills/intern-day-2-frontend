/** 与后端约定的数据结构，字段名与接口返回保持一致。 */

export interface User {
  id: number;
  username: string;
  display_name: string;
  created_at: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_at: string;
}

export interface Todo {
  id: number;
  title: string;
  done: boolean;
  created_at: string;
  updated_at: string;
}

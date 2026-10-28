import { request } from "./client";
import type { LoginResponse, RegisterPayload, SendCodeResponse, User } from "./types";

/** 登录：账号或注册手机号 + 密码，成功后返回不透明令牌。 */
export function login(username: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>("/auth/login", {
    method: "POST",
    body: { username, password },
    auth: false,
  });
}

/** 给手机号发送注册验证码。开发模式下响应里会带 debug_code 便于自测。 */
export function sendSmsCode(phone: string): Promise<SendCodeResponse> {
  return request<SendCodeResponse>("/auth/sms/send", {
    method: "POST",
    body: { phone },
    auth: false,
  });
}

/** 用手机号 + 验证码注册新账户，成功后直接返回登录令牌。 */
export function register(payload: RegisterPayload): Promise<LoginResponse> {
  return request<LoginResponse>("/auth/register", {
    method: "POST",
    body: payload,
    auth: false,
  });
}

/** 获取当前用户：前端展示的登录状态以此接口的结果为准。 */
export function fetchCurrentUser(): Promise<User> {
  return request<User>("/auth/me");
}

/** 退出登录：后端删除会话，返回 204。 */
export function logout(): Promise<void> {
  return request<void>("/auth/logout", { method: "POST" });
}

import { request } from "./client";
import type { LoginResponse, User } from "./types";

/** 登录：后端校验账号密码，成功后返回不透明令牌。 */
export function login(username: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>("/auth/login", {
    method: "POST",
    body: { username, password },
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

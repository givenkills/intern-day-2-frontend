import { request } from "./client";
import type { Todo } from "./types";

/** 以下接口都要求登录，未登录或令牌失效时后端返回 401。 */

export function listTodos(): Promise<Todo[]> {
  return request<Todo[]>("/todos");
}

export function createTodo(title: string): Promise<Todo> {
  return request<Todo>("/todos", { method: "POST", body: { title } });
}

export function updateTodo(id: number, patch: { title?: string; done?: boolean }): Promise<Todo> {
  return request<Todo>(`/todos/${id}`, { method: "PATCH", body: patch });
}

export function deleteTodo(id: number): Promise<void> {
  return request<void>(`/todos/${id}`, { method: "DELETE" });
}

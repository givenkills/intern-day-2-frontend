import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { describeError } from "../api/client";
import { createTodo, deleteTodo, listTodos, updateTodo } from "../api/todos";
import type { Todo } from "../api/types";
import { useAuth } from "../auth/AuthContext";

export function TodosPage() {
  const { user, logout } = useAuth();

  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyIds, setBusyIds] = useState<number[]>([]);
  const [loggingOut, setLoggingOut] = useState(false);

  // 状态更新是异步的，同一瞬间的两次点击都会读到旧值。
  // 用 ref 做同步闸门，保证连点也只发出一次请求。
  const addingRef = useRef(false);
  const busyRef = useRef<Set<number>>(new Set());
  const loggingOutRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTodos(await listTodos());
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = title.trim();
    if (!value || addingRef.current) return;

    addingRef.current = true;
    setAdding(true);
    setError(null);
    try {
      const created = await createTodo(value);
      setTodos((prev) => [created, ...prev]);
      setTitle("");
    } catch (err) {
      setError(describeError(err));
    } finally {
      addingRef.current = false;
      setAdding(false);
    }
  }

  async function handleToggle(todo: Todo) {
    if (busyRef.current.has(todo.id)) return;

    busyRef.current.add(todo.id);
    setBusyIds((prev) => [...prev, todo.id]);
    setError(null);
    try {
      const updated = await updateTodo(todo.id, { done: !todo.done });
      setTodos((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      setError(describeError(err));
    } finally {
      busyRef.current.delete(todo.id);
      setBusyIds((prev) => prev.filter((id) => id !== todo.id));
    }
  }

  async function handleDelete(todo: Todo) {
    if (busyRef.current.has(todo.id)) return;

    busyRef.current.add(todo.id);
    setBusyIds((prev) => [...prev, todo.id]);
    setError(null);
    try {
      await deleteTodo(todo.id);
      setTodos((prev) => prev.filter((item) => item.id !== todo.id));
    } catch (err) {
      setError(describeError(err));
    } finally {
      busyRef.current.delete(todo.id);
      setBusyIds((prev) => prev.filter((id) => id !== todo.id));
    }
  }

  async function handleLogout() {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      loggingOutRef.current = false;
      setLoggingOut(false);
    }
  }

  const remaining = todos.filter((todo) => !todo.done).length;
  const finished = todos.length - remaining;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-inner">
          <div className="brand brand-compact">
            <span className="brand-mark" aria-hidden="true">
              ✓
            </span>
            <div>
              <h1>待办清单</h1>
              <p className="brand-sub">登录后只能看到自己的数据</p>
            </div>
          </div>

          <div className="header-user">
            <Link className="btn btn-primary btn-sm" to="/activity">
              <span className="label-lg">久坐活动助手</span>
              <span className="label-sm">活动</span>
            </Link>
            <Link className="btn btn-ghost btn-sm" to="/assistant">
              <span className="label-lg">问助手</span>
              <span className="label-sm">助手</span>
            </Link>
            <div className="user-chip" title={`账号 ${user?.username ?? ""}`}>
              <span className="avatar" aria-hidden="true">
                {(user?.display_name ?? "?").slice(0, 1)}
              </span>
              <span className="user-meta">
                <strong>{user?.display_name ?? "未知用户"}</strong>
                <small>{user?.username ?? "-"}</small>
              </span>
            </div>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => void handleLogout()}
              disabled={loggingOut}
            >
              {loggingOut ? (
                "退出中…"
              ) : (
                <>
                  <span className="label-lg">退出登录</span>
                  <span className="label-sm">退出</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="app-main">
        <section className="panel">
          <div className="panel-head">
            <h2>我的待办</h2>
            <p className="panel-sub">
              共 {todos.length} 项 · 未完成 {remaining} 项 · 已完成 {finished} 项
            </p>
          </div>

          <form className="add-form" onSubmit={handleAdd}>
            <input
              className="field-input"
              type="text"
              value={title}
              maxLength={120}
              placeholder="添加一条待办，回车即可提交"
              onChange={(event) => setTitle(event.target.value)}
              disabled={adding}
              aria-label="待办内容"
            />
            <button className="btn btn-primary" type="submit" disabled={adding || !title.trim()}>
              {adding ? "添加中…" : "添加"}
            </button>
          </form>

          {error ? (
            <div className="alert" role="alert">
              <span>{error}</span>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => void load()}>
                重试
              </button>
            </div>
          ) : null}

          {loading ? (
            <ul className="todo-list" aria-busy="true">
              {[0, 1, 2].map((key) => (
                <li className="todo-item skeleton" key={key}>
                  <span className="skeleton-box" />
                </li>
              ))}
            </ul>
          ) : todos.length === 0 ? (
            <div className="empty-state">
              <p className="empty-title">还没有待办</p>
              <p className="empty-sub">在上面的输入框里写一条，立刻会同步到后端。</p>
            </div>
          ) : (
            <ul className="todo-list">
              {todos.map((todo) => {
                const busy = busyIds.includes(todo.id);
                return (
                  <li className={todo.done ? "todo-item is-done" : "todo-item"} key={todo.id}>
                    <label className="todo-check">
                      <input
                        type="checkbox"
                        checked={todo.done}
                        disabled={busy}
                        onChange={() => void handleToggle(todo)}
                        aria-label={todo.done ? `标记「${todo.title}」为未完成` : `标记「${todo.title}」为已完成`}
                      />
                    </label>
                    <span className="todo-title">{todo.title}</span>
                    <button
                      className="todo-delete"
                      type="button"
                      onClick={() => void handleDelete(todo)}
                      disabled={busy}
                      aria-label={`删除「${todo.title}」`}
                    >
                      删除
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <p className="footnote">
          数据来自后端接口 <code>GET /todos</code>，刷新页面会重新向后端校验登录状态。
        </p>
      </main>
    </div>
  );
}

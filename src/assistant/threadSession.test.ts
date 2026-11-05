import { describe, expect, it, vi } from "vitest";

import { createThreadSession, threadStorageKey } from "./threadSession";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      data.delete(key);
    }),
    snapshot: () => Object.fromEntries(data),
  };
}

describe("threadSession", () => {
  it("旧版纯字符串 threadId 会保留并升级成带版本的格式", () => {
    const storage = memoryStorage({ [threadStorageKey(1)]: "legacy-thread-id" });
    const session = createThreadSession({ storage, createId: () => "new-id" });

    expect(session.read(1)).toBe("legacy-thread-id");

    const saved = JSON.parse(storage.snapshot()[threadStorageKey(1)]);
    expect(saved).toEqual({ v: 1, threadId: "legacy-thread-id" });
  });

  it("存储内容损坏时创建新会话，不复用不可解析的值", () => {
    const storage = memoryStorage({ [threadStorageKey(1)]: "{not-json" });
    const session = createThreadSession({ storage, createId: () => "fresh-id" });

    expect(session.read(1)).toBe("fresh-id");
    expect(JSON.parse(storage.snapshot()[threadStorageKey(1)])).toEqual({
      v: 1,
      threadId: "fresh-id",
    });
  });

  it("版本未知时创建新会话，不猜测旧格式", () => {
    const storage = memoryStorage({
      [threadStorageKey(1)]: JSON.stringify({ v: 99, threadId: "old" }),
    });
    const session = createThreadSession({ storage, createId: () => "fresh-id" });

    expect(session.read(1)).toBe("fresh-id");
  });

  it("threadId 为空或格式非法时创建新会话", () => {
    const storage = memoryStorage({
      [threadStorageKey(1)]: JSON.stringify({ v: 1, threadId: "" }),
    });
    const session = createThreadSession({ storage, createId: () => "fresh-id" });

    expect(session.read(1)).toBe("fresh-id");
  });

  it("storage 读取抛异常时不崩溃，并在本次会话内保持同一个 id", () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new DOMException("blocked", "SecurityError");
      }),
      setItem: vi.fn(() => {
        throw new DOMException("blocked", "SecurityError");
      }),
      removeItem: vi.fn(() => {
        throw new DOMException("blocked", "SecurityError");
      }),
    };
    const session = createThreadSession({ storage, createId: () => "memory-id" });

    expect(() => session.read(1)).not.toThrow();
    expect(session.read(1)).toBe("memory-id");
    expect(session.read(1)).toBe("memory-id");
  });

  it("写入失败（只读/配额不足）时返回 false，但本次会话仍能读到新 id", () => {
    const storage = memoryStorage();
    storage.setItem.mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    const session = createThreadSession({ storage, createId: () => "memory-id" });

    expect(session.read(1)).toBe("memory-id");
    expect(session.write(1, "next-id")).toBe(false);
    expect(session.read(1)).toBe("next-id");
  });

  it("不同用户的 threadId 互不影响", () => {
    const storage = memoryStorage();
    let counter = 0;
    const session = createThreadSession({ storage, createId: () => `id-${++counter}` });

    const first = session.read(1);
    const second = session.read(2);

    expect(first).toBe("id-1");
    expect(second).toBe("id-2");
    expect(session.read(1)).toBe(first);
    expect(session.read(2)).toBe(second);
  });

  it("clear 只删除指定用户，并在存储异常时不抛出", () => {
    const storage = memoryStorage({
      [threadStorageKey(1)]: "one",
      [threadStorageKey(2)]: "two",
    });
    const session = createThreadSession({ storage, createId: () => "new" });

    session.clear(1);

    expect(storage.snapshot()[threadStorageKey(1)]).toBeUndefined();
    expect(storage.snapshot()[threadStorageKey(2)]).toBe("two");

    storage.removeItem.mockImplementation(() => {
      throw new Error("readonly");
    });
    expect(() => session.clear(2)).not.toThrow();
  });
});

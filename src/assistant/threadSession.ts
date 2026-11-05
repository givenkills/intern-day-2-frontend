/**
 * 助手 threadId 的会话存储。
 *
 * sessionStorage 在隐私模式、只读策略或配额不足时会直接抛异常；
 * 这些异常不能冒到 React 的初始化/事件处理里，否则助手页会白屏或按钮失效。
 * 这里把读写失败收敛成「内存兜底 + 只记录错误类型」，不吞掉会话隔离语义。
 */

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const KEY_PREFIX = "intern-day-3.thread";
const SCHEMA_VERSION = 1;
const THREAD_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

interface Envelope {
  v: number;
  threadId: string;
}

export function threadStorageKey(userId: number | undefined): string {
  return `${KEY_PREFIX}.${userId ?? "anonymous"}`;
}

/** 生成 UUID；非安全上下文没有 randomUUID 时按 RFC 4122 拼一个。 */
export function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ].join("-");
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function resolveStorage(): StorageLike | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function errorType(error: unknown): string {
  if (error instanceof Error && error.name) return error.name;
  return "unknown";
}

function logStorageFailure(action: string, error: unknown): void {
  // 只记录错误类型和动作，不记录 threadId、对话正文或令牌。
  console.warn(`[assistant] sessionStorage ${action} 失败`, { type: errorType(error) });
}

function isValidThreadId(value: unknown): value is string {
  return typeof value === "string" && THREAD_ID_PATTERN.test(value);
}

function parseStored(raw: string): string | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const envelope = parsed as Partial<Envelope>;
      if (envelope.v !== SCHEMA_VERSION) return null;
      return isValidThreadId(envelope.threadId) ? envelope.threadId : null;
    }
    return null;
  } catch {
    // 旧版本直接存纯 threadId；保留它并升级成带版本的格式。
    return isValidThreadId(raw) ? raw : null;
  }
}

export interface ThreadSession {
  read(userId: number | undefined): string;
  write(userId: number | undefined, threadId: string): boolean;
  clear(userId: number | undefined): void;
}

interface ThreadSessionOptions {
  storage?: StorageLike | null;
  createId?: () => string;
}

export function createThreadSession(options: ThreadSessionOptions = {}): ThreadSession {
  const storage = options.storage === undefined ? resolveStorage() : options.storage;
  const makeId = options.createId ?? createId;
  const memory = new Map<string, string>();

  function persist(key: string, threadId: string): boolean {
    if (!storage) return false;
    try {
      storage.setItem(key, JSON.stringify({ v: SCHEMA_VERSION, threadId }));
      return true;
    } catch (error) {
      logStorageFailure("写入", error);
      return false;
    }
  }

  function remember(key: string, threadId: string): void {
    memory.set(key, threadId);
  }

  function createAndRemember(key: string): string {
    const threadId = makeId();
    remember(key, threadId);
    persist(key, threadId);
    return threadId;
  }

  return {
    read(userId) {
      const key = threadStorageKey(userId);
      const cached = memory.get(key);
      if (cached) return cached;

      let raw: string | null = null;
      try {
        raw = storage?.getItem(key) ?? null;
      } catch (error) {
        logStorageFailure("读取", error);
        return createAndRemember(key);
      }

      if (raw !== null) {
        const parsed = parseStored(raw);
        if (parsed) {
          remember(key, parsed);
          persist(key, parsed);
          return parsed;
        }
        logStorageFailure("解析", new Error("invalid thread session"));
      }

      return createAndRemember(key);
    },

    write(userId, threadId) {
      if (!isValidThreadId(threadId)) return false;
      const key = threadStorageKey(userId);
      remember(key, threadId);
      return persist(key, threadId);
    },

    clear(userId) {
      const key = threadStorageKey(userId);
      memory.delete(key);
      if (!storage) return;
      try {
        storage.removeItem(key);
      } catch (error) {
        logStorageFailure("清理", error);
      }
    },
  };
}

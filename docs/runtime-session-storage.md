# Runtime 会话存储：现状、失败边界与升级风险

## 1. 依赖关系

- 前端仓库里的 Node Runtime 使用 `@copilotkit/runtime@1.82.0` 的 `CopilotRuntime` 与 `InMemoryAgentRunner`。
- `InMemoryAgentRunner` 内部通过模块级单例 `ɵGLOBAL_STORE` 保存 thread 的 messages / events / state；该符号带 `ɵ` 前缀，属于内部 API，不是稳定契约。
- 本仓库没有直接 import `ɵGLOBAL_STORE`，而是在 `server/copilot-runtime.mjs` 中继承 `InMemoryAgentRunner`，补一层 `UserScopedAgentRunner` 做 thread 归属隔离。
- 会话只在 Node 进程内存中，不落盘；Runtime 重启后历史丢失，这是当前设计，不是本次新增问题。

## 2. 会影响哪些功能

只影响助手链路：

```
浏览器 /assistant → CopilotKit 客户端 → /copilotkit/* → Node Runtime → Python /agent
```

- 助手页发消息、流式回复、停止/重试；
- 多轮对话上下文与历史读取；
- 按用户隔离会话（PR #11 的 `UserScopedAgentRunner`）。

不影响登录、待办、活动安排、每日总结、周度复盘；这些接口直接访问 FastAPI。

## 3. 依赖变化时的行为

`server/copilot-runtime.mjs` 现在用命名空间导入并在模块加载时调用 `assertRuntimeDependencies()`：

| 情况 | 行为 |
| --- | --- |
| `InMemoryAgentRunner` / `CopilotRuntime` / `createCopilotExpressHandler` 缺失或改名 | Runtime 启动时抛出带包名和文档路径的错误，拒绝启动，不静默丢会话或串用会话 |
| `ɵGLOBAL_STORE` 内部改名但父类方法保持 | 子类通常仍可工作；升级时必须跑下面的回归 |
| 父类方法签名/行为变化 | 子类的归属隔离可能失效；回归测试会失败，禁止直接升级 |

当前不做“无历史 Runner 降级”：那会突破“不重写 Runner”的边界。若上线必须在该极端情况下保留在线对话，需要另立任务实现最小无历史 Runner。

## 4. 浏览器 sessionStorage 失败边界

`src/assistant/threadSession.ts` 负责 threadId 的读写：

- 存储不可用、读取/写入/清理抛异常（隐私模式、只读、配额不足）：回退到当前标签页内存，页面不崩溃；
- 内容不是合法 JSON 或 threadId 非法：创建新会话，不复用损坏值；
- 旧版纯字符串 threadId：保留并升级为 `{ "v": 1, "threadId": "..." }`；
- 版本号未知：创建新会话，不猜测格式；
- 日志只记录动作和错误类型（如 `SecurityError`），不记录 threadId、对话正文或令牌；
- 不同用户使用不同 key，A 的会话不会被 B 读取。

自动化测试：`src/assistant/threadSession.test.ts`。

## 5. 升级回归步骤

1. 把 `package.json`/lockfile 中的 `@copilotkit/runtime` 固定到目标版本，不同时升级其他大依赖。
2. `pnpm install` 后确认这三个导出仍存在：`CopilotRuntime`、`InMemoryAgentRunner`、`createCopilotExpressHandler`。
3. 跑 `pnpm test`（含 `server/copilot-runtime.test.mjs` 的依赖探测与 A/B 隔离）。
4. 启动后端、Runtime、前端，手工验证：A 发消息 → 登出 → B 登录看不到 A 的历史 → B 不能读取/清空 A 的 thread → A 重新登录仍能看到自己的 thread。
5. 检查 Runtime 日志只有方法、路径、是否带 Authorization，以及错误类型，不出现对话正文或令牌。
6. 记录升级版本、测试结果和未覆盖设备。

## 6. 长期替代方向

当前方案的问题：单进程内存、重启丢历史、依赖内部 `ɵ` 实现、多副本不共享。

已确认的后续方向（不在今天范围）：

- 后端 FastAPI + 现有 SQLite 增加会话表；
- 只保留最近 N 个会话；
- 用户可一键清除本人全部历史；
- Runtime 通过后端带用户令牌的接口读写，后端按令牌身份鉴权；
- 不记录对话正文到日志，删除后不可恢复。

这会替换或包住现有 Runner，需要单独设计、迁移和测试，不应和今天的失败边界修复混在一个 PR。

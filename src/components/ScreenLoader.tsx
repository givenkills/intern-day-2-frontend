/** 全屏加载态：用于刷新后校验登录凭证的短暂等待。 */
export function ScreenLoader({ label = "正在校验登录状态…" }: { label?: string }) {
  return (
    <div className="boot" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

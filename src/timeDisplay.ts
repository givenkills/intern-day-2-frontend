/**
 * 后端统一用 UTC 保存 scheduled_at，产品时区固定为 Asia/Shanghai（+08:00）。
 * 展示时不能依赖设备时区：模拟器默认 GMT 时，直接把 UTC 当本地时间会差 8 小时。
 */

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** 把后端的时间戳格式化成北京时间 HH:MM；非法输入显示占位符。 */
export function formatBeijingTime(iso: string): string {
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return "--:--";
  const beijing = new Date(timestamp + BEIJING_OFFSET_MS);
  return `${pad2(beijing.getUTCHours())}:${pad2(beijing.getUTCMinutes())}`;
}

/** 周度复盘的日期工具。全部按用户时区计算，不依赖设备本地时区。 */

/** 产品统一按北京时间统计和展示，不跟随设备时区。 */
export const PRODUCT_TIME_ZONE = "Asia/Shanghai";

const DAY_MS = 24 * 60 * 60 * 1000;

/** 某个时刻在指定时区的 YYYY-MM-DD。 */
export function dateKeyInTimeZone(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** 只按日历日加减，避免本地时区把日期推偏。 */
export function addDays(dateKey: string, days: number): string {
  const base = new Date(`${dateKey}T00:00:00Z`);
  return new Date(base.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** 归一化到所在周的周一。 */
export function mondayOf(dateKey: string): string {
  const day = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  return addDays(dateKey, -diff);
}

export function currentWeekStart(timeZone: string, now = new Date()): string {
  return mondayOf(dateKeyInTimeZone(now, timeZone));
}

export function lastCompleteWeekStart(timeZone: string, now = new Date()): string {
  return addDays(currentWeekStart(timeZone, now), -7);
}

export function canGoNext(weekStart: string, timeZone: string, now = new Date()): boolean {
  return addDays(weekStart, 7) <= currentWeekStart(timeZone, now);
}

export function formatRate(rate: number | null): string {
  if (rate === null) return "—";
  return `${Math.round(rate * 100)}%`;
}

export function formatWeekRange(start: string, end: string): string {
  return `${start} ~ ${end}`;
}

export function formatUpdatedAt(iso: string, timeZone: string): string {
  const moment = new Date(iso);
  if (Number.isNaN(moment.getTime())) return iso;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(moment);
}

export function weekdayLabel(dateKey: string): string {
  const labels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return labels[new Date(`${dateKey}T00:00:00Z`).getUTCDay()];
}

export function statusLabel(status: string): string {
  if (status === "completed") return "完成";
  if (status === "skipped") return "跳过";
  if (status === "postponed") return "已推迟";
  return "未完成";
}

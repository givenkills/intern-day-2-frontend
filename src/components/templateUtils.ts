/**
 * 活动模板的纯函数：日期/时间默认值、表单校验。
 *
 * 抽出来是为了能在 vitest 里直接断言，不必渲染整页；也避免这些边界逻辑
 * 散落在 JSX 里。日期一律按本地时区生成，不能用 toISOString（会跨天）。
 */

export const TEMPLATE_NAME_MAX = 40;
export const TEMPLATE_DESCRIPTION_MAX = 200;
export const TEMPLATE_DURATION_MIN = 1;
export const TEMPLATE_DURATION_MAX = 120;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function toDateInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatMinutes(minutes: number): string {
  return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
}

export interface TimeWindow {
  start: string;
  end: string;
}

export interface ScheduleDefault {
  plan_date: string;
  time: string;
}

/** 默认窗口与后端默认设置一致；设置加载失败时仍能给出一个可编辑的起点。 */
const DEFAULT_WINDOWS: TimeWindow[] = [
  { start: "10:00", end: "12:00" },
  { start: "14:00", end: "17:30" },
];

function toMinutes(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** 从活动设置里取出可活动窗口；两个窗口都没配时退回整个工作时段。 */
export function windowsFromSettings(settings: {
  work_start: string;
  work_end: string;
  morning_start: string | null;
  morning_end: string | null;
  afternoon_start: string | null;
  afternoon_end: string | null;
}): TimeWindow[] {
  const windows: TimeWindow[] = [];
  if (settings.morning_start && settings.morning_end) {
    windows.push({ start: settings.morning_start, end: settings.morning_end });
  }
  if (settings.afternoon_start && settings.afternoon_end) {
    windows.push({ start: settings.afternoon_start, end: settings.afternoon_end });
  }
  if (windows.length === 0) {
    windows.push({ start: settings.work_start, end: settings.work_end });
  }
  return windows;
}

/**
 * 打开「加入安排」时的默认值：从当前时间之后最近的 30 分钟整点开始，
 * 跳过已经结束或装不下这段时长的窗口；当天都不行就给明天第一个窗口。
 * 这样默认值不会落在午休空档里（例如 12:00 不在 10-12 / 14-17:30 窗口内）。
 */
export function defaultScheduleDateTime(
  now: Date = new Date(),
  windows: TimeWindow[] = DEFAULT_WINDOWS,
  duration: number = 5,
): ScheduleDefault {
  const parsed = windows
    .map((window) => ({
      start: toMinutes(window.start),
      end: toMinutes(window.end),
    }))
    .filter((window): window is { start: number; end: number } =>
      window.start !== null && window.end !== null && window.end > window.start,
    )
    .sort((a, b) => a.start - b.start);

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const rounded = Math.ceil((nowMinutes + 1) / 30) * 30;

  for (const window of parsed) {
    if (window.end <= nowMinutes) continue;
    const candidate = Math.max(rounded, window.start);
    if (candidate + duration <= window.end) {
      return { plan_date: toDateInputValue(now), time: formatMinutes(candidate) };
    }
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const firstTomorrow = parsed.find((window) => window.end - window.start >= duration) ?? parsed[0];
  return {
    plan_date: toDateInputValue(tomorrow),
    time: firstTomorrow ? formatMinutes(firstTomorrow.start) : "10:00",
  };
}

export function isValidDateInputValue(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function validateDuration(value: string | number): string | null {
  const minutes = Number(value);
  if (
    !Number.isInteger(minutes) ||
    minutes < TEMPLATE_DURATION_MIN ||
    minutes > TEMPLATE_DURATION_MAX
  ) {
    return `建议时长应为 ${TEMPLATE_DURATION_MIN}-${TEMPLATE_DURATION_MAX} 分钟的整数`;
  }
  return null;
}

/** 模板新建/编辑表单校验；返回 null 表示通过。 */
export function validateTemplateForm(
  name: string,
  description: string,
  duration: string | number,
): string | null {
  const trimmedName = name.trim();
  if (!trimmedName) return "请填写模板名称";
  if (trimmedName.length > TEMPLATE_NAME_MAX) return `模板名称最多 ${TEMPLATE_NAME_MAX} 个字`;

  const trimmedDescription = description.trim();
  if (!trimmedDescription) return "请填写简短描述";
  if (trimmedDescription.length > TEMPLATE_DESCRIPTION_MAX) {
    return `描述最多 ${TEMPLATE_DESCRIPTION_MAX} 个字`;
  }

  return validateDuration(duration);
}

/** 「加入安排」表单校验；返回 null 表示通过。 */
export function validateScheduleForm(
  planDate: string,
  time: string,
  duration: string | number,
  now: Date = new Date(),
): string | null {
  if (!isValidDateInputValue(planDate)) return "请选择有效日期";
  if (planDate < toDateInputValue(now)) return "不能安排到已经过去的日期";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return "请选择开始时间";
  return validateDuration(duration);
}

export function formatPlanDate(planDate: string): string {
  if (!isValidDateInputValue(planDate)) return planDate;
  const [, month, day] = planDate.split("-").map(Number);
  return `${month} 月 ${day} 日`;
}

/** 与后端约定的数据结构，字段名与接口返回保持一致。 */

export interface User {
  id: number;
  username: string;
  phone: string | null;
  display_name: string;
  created_at: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_at: string;
}

export interface SendCodeResponse {
  /** 验证码有效期（秒） */
  expires_in: number;
  /** 多久之后可以再次发送（秒） */
  resend_after: number;
  /** 仅开发模式返回，方便自测；生产环境为 null */
  debug_code: string | null;
  /** 脱敏手机号，用于提示「已发送到 138****8000」 */
  masked_phone: string;
}

export interface RegisterPayload {
  phone: string;
  code: string;
  password: string;
  display_name: string;
}

export interface Todo {
  id: number;
  title: string;
  done: boolean;
  created_at: string;
  updated_at: string;
}

export interface QuietPeriod {
  id: number;
  start_time: string;
  end_time: string;
  label: string | null;
  enabled: boolean;
}

export interface ActivitySettings {
  work_start: string;
  work_end: string;
  morning_start: string | null;
  morning_end: string | null;
  afternoon_start: string | null;
  afternoon_end: string | null;
  daily_target: number;
  reminders_enabled: boolean;
  allow_in_worktime: boolean;
  postpone_policy: string;
  timezone: string;
  quiet_periods: QuietPeriod[];
}

export interface Activity {
  id: number;
  activity_type: string;
  title: string;
  description: string;
  plan_date: string;
  scheduled_at: string;
  duration_minutes: number;
  status: "planned" | "completed" | "postponed" | "skipped";
  source: string;
  postponed_from_id: number | null;
  skipped_reason: string | null;
  completed_at: string | null;
}

export interface TodaySummary {
  total: number;
  planned: number;
  completed: number;
  postponed: number;
  skipped: number;
}

export interface TodayData {
  date: string;
  summary: TodaySummary;
  activities: Activity[];
}

export interface GenerateResult {
  requested: number;
  planned: number;
  notice: string | null;
  activities: Activity[];
}

export interface WeekDayStat {
  date: string;
  planned: number;
  completed: number;
  postponed: number;
  skipped: number;
}

export interface WeekStats {
  week_start: string;
  week_end: string;
  planned: number;
  completed: number;
  postponed: number;
  skipped: number;
  days: WeekDayStat[];
}

import { request } from "./client";
import type { DailyReport, GenerateReportResult } from "./types";

/** 读取某天的日报。未生成时返回 status = not_generated，不是 404。 */
export function getDailyReport(reportDate: string): Promise<DailyReport> {
  return request<DailyReport>(`/reports/${reportDate}`);
}

/** 手动生成/补跑：只入队，立刻返回，不等模型。 */
export function generateDailyReport(reportDate: string): Promise<GenerateReportResult> {
  return request<GenerateReportResult>(`/reports/${reportDate}/generate`, { method: "POST" });
}

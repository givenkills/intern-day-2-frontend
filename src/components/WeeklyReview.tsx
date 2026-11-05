import { useCallback, useEffect, useRef, useState } from "react";

import { getWeekStats } from "../api/activity";
import { describeError } from "../api/client";
import type { WeekStats as WeekStatsData } from "../api/types";
import {
  PRODUCT_TIME_ZONE,
  addDays,
  canGoNext,
  formatUpdatedAt,
  formatWeekRange,
  lastCompleteWeekStart,
} from "../weekReview";
import { WeekStats } from "./WeekStats";

interface Props {
  now?: Date;
  onOpenToday?: () => void;
}

/**
 * 周度复盘容器：自己管理请求和切周状态，失败不会拖垮「今日」面板。
 * requestId 用来丢弃过期响应，快速切周时旧周数据不能覆盖新周。
 */
export function WeeklyReview({ now, onOpenToday }: Props) {
  const zone = PRODUCT_TIME_ZONE;
  const [anchor] = useState(() => now ?? new Date());
  const [weekStart, setWeekStart] = useState(() => lastCompleteWeekStart(zone, anchor));
  const [stats, setStats] = useState<WeekStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    const current = requestId.current + 1;
    requestId.current = current;
    setLoading(true);
    setError(null);
    setStats(null);

    void getWeekStats(weekStart, zone)
      .then((data) => {
        if (requestId.current !== current) return;
        setStats(data);
      })
      .catch((err: unknown) => {
        if (requestId.current !== current) return;
        setError(describeError(err));
      })
      .finally(() => {
        if (requestId.current === current) setLoading(false);
      });

    return () => {
      requestId.current += 1;
    };
  }, [weekStart, zone, reloadTick]);

  const goPrevious = useCallback(() => {
    setWeekStart((value) => addDays(value, -7));
  }, []);

  const goNext = useCallback(() => {
    setWeekStart((value) => {
      if (!canGoNext(value, zone, anchor)) return value;
      return addDays(value, 7);
    });
  }, [anchor, zone]);

  const range = formatWeekRange(weekStart, addDays(weekStart, 6));
  const nextDisabled = !canGoNext(weekStart, zone, anchor);

  return (
    <div>
      <div className="week-toolbar">
        <div>
          <h3 className="week-title">
            周度复盘
            {stats?.is_current ? <span className="week-current-tag">本周进行中</span> : null}
          </h3>
          <p className="week-range">{range}</p>
          {stats ? (
            <p className="week-updated">更新于 {formatUpdatedAt(stats.generated_at, zone)}</p>
          ) : null}
        </div>
        <div className="week-switch">
          <button className="btn btn-ghost btn-sm" type="button" onClick={goPrevious}>
            上一周
          </button>
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={goNext}
            disabled={nextDisabled}
          >
            下一周
          </button>
        </div>
      </div>

      {loading ? (
        <div className="notice" role="status">
          正在加载周报…
        </div>
      ) : null}

      {error ? (
        <div className="alert" role="alert">
          <span>{error}</span>
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={() => setReloadTick((value) => value + 1)}
          >
            重试
          </button>
        </div>
      ) : null}

      {!loading && !error && stats ? <WeekStats stats={stats} onOpenToday={onOpenToday} /> : null}
    </div>
  );
}

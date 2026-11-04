import { useState } from "react";

import { describeError } from "../api/client";
import { saveSettings } from "../api/activity";
import type { ActivitySettings, QuietPeriod } from "../api/types";

interface Props {
  settings: ActivitySettings;
  onSaved: (settings: ActivitySettings) => void;
}

const EMPTY_QUIET: QuietPeriod = { id: 0, start_time: "", end_time: "", label: "", enabled: true };

export function SettingsPanel({ settings, onSaved }: Props) {
  const [draft, setDraft] = useState<ActivitySettings>(settings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedTip, setSavedTip] = useState(false);

  function set<K extends keyof ActivitySettings>(key: K, value: ActivitySettings[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setSavedTip(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const saved = await saveSettings(draft);
      onSaved(saved);
      setDraft(saved);
      setSavedTip(true);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  }

  function updateQuiet(index: number, patch: Partial<QuietPeriod>) {
    setDraft((prev) => {
      const next = prev.quiet_periods.slice();
      next[index] = { ...next[index], ...patch };
      return { ...prev, quiet_periods: next };
    });
    setSavedTip(false);
  }

  function addQuiet() {
    setDraft((prev) => ({ ...prev, quiet_periods: [...prev.quiet_periods, { ...EMPTY_QUIET }] }));
  }

  function removeQuiet(index: number) {
    setDraft((prev) => ({
      ...prev,
      quiet_periods: prev.quiet_periods.filter((_, i) => i !== index),
    }));
  }

  return (
    <div className="settings-form">
      <div className="settings-grid">
        <label className="field">
          <span className="field-label">工作开始</span>
          <input
            className="field-input"
            type="time"
            value={draft.work_start}
            onChange={(e) => set("work_start", e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">工作结束</span>
          <input
            className="field-input"
            type="time"
            value={draft.work_end}
            onChange={(e) => set("work_end", e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">上午可活动（开始）</span>
          <input
            className="field-input"
            type="time"
            value={draft.morning_start ?? ""}
            onChange={(e) => set("morning_start", e.target.value || null)}
          />
        </label>
        <label className="field">
          <span className="field-label">上午可活动（结束）</span>
          <input
            className="field-input"
            type="time"
            value={draft.morning_end ?? ""}
            onChange={(e) => set("morning_end", e.target.value || null)}
          />
        </label>
        <label className="field">
          <span className="field-label">下午可活动（开始）</span>
          <input
            className="field-input"
            type="time"
            value={draft.afternoon_start ?? ""}
            onChange={(e) => set("afternoon_start", e.target.value || null)}
          />
        </label>
        <label className="field">
          <span className="field-label">下午可活动（结束）</span>
          <input
            className="field-input"
            type="time"
            value={draft.afternoon_end ?? ""}
            onChange={(e) => set("afternoon_end", e.target.value || null)}
          />
        </label>
      </div>

      <div className="settings-row">
        <label className="field field-inline">
          <span className="field-label">每天活动次数</span>
          <input
            className="field-input"
            type="number"
            min={1}
            max={8}
            value={draft.daily_target}
            onChange={(e) => set("daily_target", Number(e.target.value))}
          />
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={draft.reminders_enabled}
            onChange={(e) => set("reminders_enabled", e.target.checked)}
          />
          <span>开启提醒</span>
        </label>
      </div>

      <div className="settings-block">
        <div className="settings-block-head">
          <span className="field-label">免打扰时段</span>
          <button className="btn btn-ghost btn-sm" type="button" onClick={addQuiet}>
            + 添加
          </button>
        </div>
        {draft.quiet_periods.length === 0 ? (
          <p className="settings-empty">暂无免打扰时段，活动可安排在任意可活动窗口内。</p>
        ) : (
          draft.quiet_periods.map((q, index) => (
            <div className="quiet-row" key={index}>
              <input
                className="field-input"
                type="time"
                value={q.start_time}
                onChange={(e) => updateQuiet(index, { start_time: e.target.value })}
                aria-label="免打扰开始"
              />
              <span className="quiet-sep">至</span>
              <input
                className="field-input"
                type="time"
                value={q.end_time}
                onChange={(e) => updateQuiet(index, { end_time: e.target.value })}
                aria-label="免打扰结束"
              />
              <input
                className="field-input quiet-label"
                type="text"
                placeholder="备注（可选）"
                value={q.label ?? ""}
                onChange={(e) => updateQuiet(index, { label: e.target.value })}
              />
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => removeQuiet(index)}>
                删除
              </button>
            </div>
          ))
        )}
      </div>

      {error ? (
        <div className="alert" role="alert">
          <span>{error}</span>
        </div>
      ) : null}
      {savedTip ? <p className="saved-tip">已保存</p> : null}

      <button className="btn btn-primary" type="button" disabled={saving} onClick={() => void handleSave()}>
        {saving ? "保存中…" : "保存设置"}
      </button>
    </div>
  );
}

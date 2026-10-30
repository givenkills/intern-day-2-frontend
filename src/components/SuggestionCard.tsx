import { useRef, useState } from "react";

import { describeError } from "../api/client";
import { request } from "../api/client";
import type { Activity } from "../api/types";

interface Slot {
  scheduled_at: string;
  activity_type: string;
  title: string;
}

interface Props {
  onSaved: () => void;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function SuggestionCard({ onSaved }: Props) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const busyRef = useRef(false);

  async function handleSuggest() {
    if (busyRef.current) return;
    busyRef.current = true;
    setLoading(true);
    setError(null);
    setNotice(null);
    setSlots([]);
    try {
      const data = await request<{ requested: number; planned: number; slots: Slot[]; notice: string | null }>(
        "/activity/agent/suggest",
        { method: "POST" },
      );
      setSlots(data.slots);
      if (data.notice) setNotice(data.notice);
    } catch (err) {
      setError(describeError(err));
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (busyRef.current || slots.length === 0) return;
    busyRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await request<{ planned: number; activities: Activity[] }>("/activity/agent/confirm", {
        method: "POST",
        body: { slots },
      });
      setSlots([]);
      setNotice("已保存助手建议的安排");
      onSaved();
    } catch (err) {
      setError(describeError(err));
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="suggestion-card">
      <div className="suggestion-head">
        <div>
          <span className="field-label">助手建议</span>
          <p className="suggestion-hint">让助手根据你的时段生成一份可确认的安排建议。</p>
        </div>
        <button className="btn btn-ghost btn-sm" type="button" disabled={loading} onClick={() => void handleSuggest()}>
          {loading ? "生成中…" : "生成建议"}
        </button>
      </div>

      {error ? (
        <div className="alert" role="alert">
          <span>{error}</span>
        </div>
      ) : null}

      {notice ? (
        <div className="notice" role="status">
          {notice}
        </div>
      ) : null}

      {slots.length > 0 ? (
        <div className="suggestion-slots">
          {slots.map((slot, index) => (
            <div className="suggestion-slot" key={index}>
              <span className="suggestion-time">{formatTime(slot.scheduled_at)}</span>
              <span className="suggestion-title">{slot.title}</span>
            </div>
          ))}
          <button className="btn btn-primary btn-sm" type="button" disabled={saving} onClick={() => void handleConfirm()}>
            {saving ? "保存中…" : "确认保存全部"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

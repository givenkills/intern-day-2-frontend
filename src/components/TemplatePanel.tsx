import { useCallback, useEffect, useState } from "react";

import {
  archiveTemplate,
  createTemplate,
  listTemplates,
  scheduleTemplate,
  updateTemplate,
} from "../api/activity";
import { describeError } from "../api/client";
import type { ActivitySettings, ActivityTemplate } from "../api/types";
import {
  TEMPLATE_DESCRIPTION_MAX,
  TEMPLATE_DURATION_MAX,
  TEMPLATE_DURATION_MIN,
  TEMPLATE_NAME_MAX,
  defaultScheduleDateTime,
  formatPlanDate,
  toBeijingDateInputValue,
  validateScheduleForm,
  validateTemplateForm,
  windowsFromSettings,
} from "./templateUtils";

interface Props {
  /** 用来计算「加入安排」的默认时间，避开午休等窗口空档。 */
  settings: ActivitySettings | null;
  /** 成功加入安排后通知父组件刷新今日/周统计；参数是展示给用户的提示语。 */
  onScheduled: (message: string) => void;
}

type EditorState = { mode: "create" } | { mode: "edit"; template: ActivityTemplate };

export function TemplatePanel({ settings, onScheduled }: Props) {
  const [templates, setTemplates] = useState<ActivityTemplate[]>([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDuration, setFormDuration] = useState("5");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [scheduling, setScheduling] = useState<ActivityTemplate | null>(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [scheduleDuration, setScheduleDuration] = useState("5");
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleSaving, setScheduleSaving] = useState(false);

  const [archiving, setArchiving] = useState<ActivityTemplate | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiveSaving, setArchiveSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTemplates(await listTemplates(includeArchived));
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, [includeArchived]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setNotice(null);
    setFormName("");
    setFormDescription("");
    setFormDuration("5");
    setFormError(null);
    setEditor({ mode: "create" });
  }

  function openEdit(template: ActivityTemplate) {
    setNotice(null);
    setFormName(template.name);
    setFormDescription(template.description);
    setFormDuration(String(template.duration_minutes));
    setFormError(null);
    setEditor({ mode: "edit", template });
  }

  function openSchedule(template: ActivityTemplate) {
    const defaults = defaultScheduleDateTime(
      new Date(),
      settings ? windowsFromSettings(settings) : undefined,
      template.duration_minutes,
    );
    setNotice(null);
    setScheduleDate(defaults.plan_date);
    setScheduleTime(defaults.time);
    setScheduleDuration(String(template.duration_minutes));
    setScheduleError(null);
    setScheduling(template);
  }

  function openArchive(template: ActivityTemplate) {
    setNotice(null);
    setArchiveError(null);
    setArchiving(template);
  }

  async function handleSave() {
    if (!editor) return;
    const message = validateTemplateForm(formName, formDescription, formDuration);
    if (message) {
      setFormError(message);
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name: formName.trim(),
        description: formDescription.trim(),
        duration_minutes: Number(formDuration),
      };
      if (editor.mode === "create") {
        await createTemplate(payload);
      } else {
        await updateTemplate(editor.template.id, payload);
      }
      setEditor(null);
      setNotice(editor.mode === "create" ? "模板已创建" : "模板已更新，已生成的活动不受影响");
      await load();
    } catch (err) {
      setFormError(describeError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleSchedule() {
    if (!scheduling) return;
    const message = validateScheduleForm(scheduleDate, scheduleTime, scheduleDuration);
    if (message) {
      setScheduleError(message);
      return;
    }

    setScheduleSaving(true);
    setScheduleError(null);
    try {
      const activity = await scheduleTemplate(scheduling.id, {
        plan_date: scheduleDate,
        time: scheduleTime,
        duration_minutes: Number(scheduleDuration),
      });
      setScheduling(null);
      onScheduled(
        `「${activity.title}」已加入 ${formatPlanDate(activity.plan_date)} ${scheduleTime} 的安排`,
      );
    } catch (err) {
      setScheduleError(describeError(err));
    } finally {
      setScheduleSaving(false);
    }
  }

  async function handleArchive() {
    if (!archiving) return;
    setArchiveSaving(true);
    setArchiveError(null);
    try {
      await archiveTemplate(archiving.id);
      setArchiving(null);
      setNotice("模板已归档；已生成的活动与统计不受影响");
      await load();
    } catch (err) {
      setArchiveError(describeError(err));
    } finally {
      setArchiveSaving(false);
    }
  }

  return (
    <div>
      <div className="panel-head">
        <div>
          <h2>我的活动模板</h2>
          <p className="panel-sub">把常用的小活动存成模板，随时加入安排</p>
        </div>
        <button className="btn btn-primary" type="button" onClick={openCreate}>
          新建模板
        </button>
      </div>

      {notice ? (
        <div className="notice" role="status">
          {notice}
        </div>
      ) : null}

      {error ? (
        <div className="alert" role="alert">
          <span>{error}</span>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => void load()}>
            重试
          </button>
        </div>
      ) : null}

      <div className="template-toolbar">
        <span className="template-count">
          {loading
            ? "正在加载模板…"
            : includeArchived
              ? `共 ${templates.length} 个模板`
              : `${templates.length} 个可用模板`}
        </span>
        <label className="template-toggle">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(event) => {
              setNotice(null);
              setIncludeArchived(event.target.checked);
            }}
          />
          显示已归档
        </label>
      </div>

      {!loading && templates.length === 0 ? (
        <div className="empty-state template-empty">
          <p className="empty-title">{includeArchived ? "还没有模板" : "还没有可用的模板"}</p>
          <p className="empty-sub">新建一个常用活动，之后就能一键加入安排。</p>
        </div>
      ) : null}

      {templates.length > 0 ? (
        <ul className="template-list">
          {templates.map((template) => (
            <li
              className={template.archived ? "template-item is-archived" : "template-item"}
              key={template.id}
            >
              <div className="template-body">
                <div className="template-title">
                  {template.name}
                  <span className={template.archived ? "template-tag is-archived" : "template-tag"}>
                    {template.archived
                      ? `已归档 · ${template.duration_minutes} 分钟`
                      : `建议 ${template.duration_minutes} 分钟`}
                  </span>
                </div>
                <div className="template-desc">{template.description}</div>
                {template.archived ? (
                  <div className="template-meta">归档后不出现在默认列表；已有活动不受影响</div>
                ) : null}
              </div>
              {!template.archived ? (
                <div className="template-actions">
                  <button
                    className="btn btn-primary btn-sm"
                    type="button"
                    onClick={() => openSchedule(template)}
                  >
                    加入安排
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    type="button"
                    onClick={() => openEdit(template)}
                  >
                    编辑
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    type="button"
                    onClick={() => openArchive(template)}
                  >
                    归档
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {editor ? (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (!saving) setEditor(null);
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="template-editor-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="modal-title" id="template-editor-title">
              {editor.mode === "create" ? "新建模板" : "编辑模板"}
            </h3>
            <p className="modal-sub">只影响之后的安排，不会改动已经生成的活动。</p>
            <div className="template-form">
              <label className="field">
                <span className="field-label">模板名称</span>
                <input
                  className="field-input"
                  type="text"
                  maxLength={TEMPLATE_NAME_MAX}
                  placeholder="例如：肩颈拉伸"
                  value={formName}
                  onChange={(event) => setFormName(event.target.value)}
                />
              </label>
              <label className="field">
                <span className="field-label">简短描述</span>
                <textarea
                  className="field-input"
                  rows={3}
                  maxLength={TEMPLATE_DESCRIPTION_MAX}
                  placeholder="例如：坐直，缓慢绕肩十次"
                  value={formDescription}
                  onChange={(event) => setFormDescription(event.target.value)}
                />
              </label>
              <label className="field">
                <span className="field-label">建议时长（分钟）</span>
                <input
                  className="field-input"
                  type="number"
                  inputMode="numeric"
                  min={TEMPLATE_DURATION_MIN}
                  max={TEMPLATE_DURATION_MAX}
                  value={formDuration}
                  onChange={(event) => setFormDuration(event.target.value)}
                />
              </label>
            </div>
            {formError ? (
              <p className="form-error" role="alert">
                {formError}
              </p>
            ) : null}
            <div className="modal-actions">
              <button
                className="btn btn-ghost"
                type="button"
                disabled={saving}
                onClick={() => setEditor(null)}
              >
                取消
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
              >
                {saving ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {scheduling ? (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (!scheduleSaving) setScheduling(null);
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="template-schedule-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="modal-title" id="template-schedule-title">
              加入安排
            </h3>
            <p className="modal-sub">
              把「{scheduling.name}」排进某一天。时间需落在工作时段与可活动时段内，并避开免打扰和已有安排。
            </p>
            <div className="template-form">
              <label className="field">
                <span className="field-label">日期</span>
                <input
                  className="field-input"
                  type="date"
                  min={toBeijingDateInputValue()}
                  value={scheduleDate}
                  onChange={(event) => setScheduleDate(event.target.value)}
                />
              </label>
              <label className="field">
                <span className="field-label">开始时间</span>
                <input
                  className="field-input"
                  type="time"
                  step={60}
                  value={scheduleTime}
                  onChange={(event) => setScheduleTime(event.target.value)}
                />
              </label>
              <label className="field">
                <span className="field-label">时长（分钟）</span>
                <input
                  className="field-input"
                  type="number"
                  inputMode="numeric"
                  min={TEMPLATE_DURATION_MIN}
                  max={TEMPLATE_DURATION_MAX}
                  value={scheduleDuration}
                  onChange={(event) => setScheduleDuration(event.target.value)}
                />
              </label>
            </div>
            {scheduleError ? (
              <p className="form-error" role="alert">
                {scheduleError}
              </p>
            ) : null}
            <div className="modal-actions">
              <button
                className="btn btn-ghost"
                type="button"
                disabled={scheduleSaving}
                onClick={() => setScheduling(null)}
              >
                取消
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={scheduleSaving}
                onClick={() => void handleSchedule()}
              >
                {scheduleSaving ? "加入中…" : "加入安排"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {archiving ? (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (!archiveSaving) setArchiving(null);
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="template-archive-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="modal-title" id="template-archive-title">
              归档模板
            </h3>
            <p className="modal-sub">
              归档「{archiving.name}」后，它不会再出现在默认列表里；已经生成的活动和历史记录不会被删除或改写。
            </p>
            {archiveError ? (
              <p className="form-error" role="alert">
                {archiveError}
              </p>
            ) : null}
            <div className="modal-actions">
              <button
                className="btn btn-ghost"
                type="button"
                disabled={archiveSaving}
                onClick={() => setArchiving(null)}
              >
                取消
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={archiveSaving}
                onClick={() => void handleArchive()}
              >
                {archiveSaving ? "归档中…" : "确认归档"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

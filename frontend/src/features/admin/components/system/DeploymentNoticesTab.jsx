import { useMemo, useState } from "react";
import {
  apiAdminListDeploymentNotices,
  apiAdminCreateDeploymentNotice,
  apiAdminCancelDeploymentNotice,
} from "../../../../lib/apiModules/adminApi";
import { useAdminQuery } from "../../hooks/useAdminQuery";
import { useAdminMutation } from "../../hooks/useAdminMutation";
import SectionCard from "../common/SectionCard";
import { formatTs, toText } from "../../utils/adminFormat";

const LOCAL_DATE_INPUT_FORMAT = "YYYY-MM-DDTHH:mm";

function toLocalDatetimeInputValue(tsSeconds) {
  if (!tsSeconds) return "";
  const date = new Date(tsSeconds * 1000);
  try {
    const pad = (n) => String(n).padStart(2, "0");
    const YYYY = date.getFullYear();
    const MM = pad(date.getMonth() + 1);
    const DD = pad(date.getDate());
    const hh = pad(date.getHours());
    const mm = pad(date.getMinutes());
    return `${YYYY}-${MM}-${DD}T${hh}:${mm}`;
  } catch {
    return "";
  }
}

function parseLocalDatetimeInputValue(value) {
  if (!value) return 0;
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return 0;
  return Math.floor(ts / 1000);
}

function NoticeRow({ notice, onCancel, busy }) {
  const active = notice.is_active !== false;
  const expired =
    active &&
    notice.display_duration_minutes > 0 &&
    Date.now() >= (notice.scheduled_at + notice.display_duration_minutes * 60) * 1000;
  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50">
      <td className="px-2 py-2 align-top">
        <div className="max-w-[260px] whitespace-pre-wrap text-xs text-slate-700">{toText(notice.message)}</div>
      </td>
      <td className="px-2 py-2 text-xs text-slate-600">{formatTs(notice.scheduled_at)}</td>
      <td className="px-2 py-2 text-xs text-slate-600">
        {notice.display_duration_minutes > 0 ? `${notice.display_duration_minutes} мин` : "∞"}
      </td>
      <td className="px-2 py-2 text-xs">
        {!active ? (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">Отменено</span>
        ) : expired ? (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">Завершено</span>
        ) : (
          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-600">Активно</span>
        )}
      </td>
      <td className="px-2 py-2 text-right">
        {active && !expired ? (
          <button
            type="button"
            className="dangerBtn"
            onClick={() => onCancel(notice.id)}
            disabled={busy}
          >
            Отменить
          </button>
        ) : null}
      </td>
    </tr>
  );
}

export default function DeploymentNoticesTab() {
  const [message, setMessage] = useState("");
  const [scheduledAtInput, setScheduledAtInput] = useState(() => toLocalDatetimeInputValue(Math.floor(Date.now() / 1000)));
  const [duration, setDuration] = useState("30");
  const [formError, setFormError] = useState("");

  const {
    data: noticesData,
    isLoading,
    error: queryError,
    refetch,
  } = useAdminQuery({
    queryKey: ["adminDeploymentNotices"],
    fetcher: apiAdminListDeploymentNotices,
  });
  const notices = noticesData?.items || [];

  const create = useAdminMutation({
    mutationFn: apiAdminCreateDeploymentNotice,
    onSuccess: () => {
      setMessage("");
      setDuration("30");
      setFormError("");
      refetch();
    },
    onError: (err) => setFormError(err?.message || "Не удалось создать уведомление"),
  });

  const cancel = useAdminMutation({
    mutationFn: apiAdminCancelDeploymentNotice,
    onSuccess: () => refetch(),
  });

  const sortedNotices = useMemo(() => {
    return [...notices].sort((a, b) => (b.scheduled_at || 0) - (a.scheduled_at || 0));
  }, [notices]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const text = String(message || "").trim();
    if (!text) {
      setFormError("Введите текст уведомления");
      return;
    }
    const scheduledAt = parseLocalDatetimeInputValue(scheduledAtInput);
    if (!scheduledAt) {
      setFormError("Выберите дату и время");
      return;
    }
    create.mutate({
      message: text,
      scheduled_at: scheduledAtInput,
      display_duration_minutes: Number(duration || 0),
    });
  };

  return (
    <div className="space-y-3">
      <SectionCard eyebrow="Deploy" title="Уведомления о развёртывании" subtitle="Создание и управление плановыми уведомлениями для всех пользователей">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Текст уведомления</label>
            <textarea
              className="input w-full"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Опишите плановые работы или изменения..."
              maxLength={4000}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Начало показа (локальное время)</label>
              <input
                type="datetime-local"
                className="input w-full"
                value={scheduledAtInput}
                onChange={(e) => setScheduledAtInput(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Длительность показа, мин (0 — бессрочно)</label>
              <input
                type="number"
                min={0}
                step={1}
                className="input w-full"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
          </div>
          {formError ? <div className="text-xs text-rose-600">{formError}</div> : null}
          <div className="flex items-center gap-2">
            <button type="submit" className="primaryBtn" disabled={create.isPending}>
              {create.isPending ? "Создаю…" : "Создать уведомление"}
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard eyebrow="Active" title="Активные и прошедшие уведомления" subtitle="Список всех уведомлений">
        {isLoading ? <div className="text-xs text-slate-500">Загрузка…</div> : null}
        {queryError ? <div className="text-xs text-rose-600">{queryError.message}</div> : null}
        <div className="overflow-auto rounded-lg border border-slate-200">
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-white text-left text-[10px] uppercase tracking-[0.14em] text-slate-400">
              <tr>
                <th className="px-2 py-1.5 font-medium">Сообщение</th>
                <th className="px-2 py-1.5 font-medium">Начало</th>
                <th className="px-2 py-1.5 font-medium">Длительность</th>
                <th className="px-2 py-1.5 font-medium">Статус</th>
                <th className="px-2 py-1.5 font-medium" />
              </tr>
            </thead>
            <tbody>
              {sortedNotices.length === 0 ? (
                <tr>
                  <td className="px-2 py-4 text-slate-500" colSpan={5}>Нет уведомлений.</td>
                </tr>
              ) : null}
              {sortedNotices.map((n) => (
                <NoticeRow key={n.id} notice={n} onCancel={(id) => cancel.mutate(id)} busy={cancel.isPending} />
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

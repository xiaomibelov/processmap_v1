import { useEffect, useRef, useState } from "react";

import { useAuth } from "./AuthProvider";

function mapAuthError(result) {
  const status = Number(result?.status || 0);
  if (status === 401) return "Неверный email или пароль";
  if (status >= 500) return "Ошибка сервера";
  if (status === 0) return "Сервер недоступен";
  return String(result?.error || "Не удалось выполнить вход");
}

export default function LoginForm({
  title = "Вход в PROCESSMAP",
  subtitle = "Используйте рабочий аккаунт, чтобы открыть рабочую область.",
  submitLabel = "Войти",
  onSuccess,
  onCancel,
  compact = false,
}) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const emailRef = useRef(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    const res = await login(email, password);
    setSubmitting(false);
    if (!res?.ok) {
      setError(mapAuthError(res));
      return;
    }
    onSuccess?.(res.user);
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <div className="space-y-1">
        <h2 className={compact ? "text-lg font-semibold text-fg" : "text-2xl font-semibold text-fg"}>{title}</h2>
        <p className="text-sm text-muted">{subtitle}</p>
      </div>

      <label className="flex flex-col gap-1.5 text-sm text-muted">
        <span className="font-medium">Email</span>
        <input
          ref={emailRef}
          type="email"
          autoComplete="email"
          className="h-11 rounded-xl border border-border bg-bgSoft px-3 text-fg"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@local"
          disabled={submitting}
          required
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm text-muted">
        <span className="font-medium">Пароль</span>
        <input
          type="password"
          autoComplete="current-password"
          className="h-11 rounded-xl border border-border bg-bgSoft px-3 text-fg"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Введите пароль"
          disabled={submitting}
          required
        />
      </label>

      {error ? (
        <div className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </div>
      ) : null}

      <div className="flex items-center gap-2 pt-1">
        <button type="submit" className="primaryBtn h-11 min-h-0 px-4 py-0 text-sm" disabled={submitting}>
          {submitting ? "Входим..." : submitLabel}
        </button>
        {onCancel ? (
          <button type="button" className="secondaryBtn h-11 min-h-0 px-4 py-0 text-sm" onClick={onCancel} disabled={submitting}>
            Отмена
          </button>
        ) : null}
      </div>
    </form>
  );
}

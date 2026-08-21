import { useEffect, useRef, useState } from "react";

import { useAuth } from "./AuthProvider";
import { ru } from "../../shared/i18n/ru";

function mapAuthError(result) {
  const status = Number(result?.status || 0);
  if (status === 401) return ru.auth.invalidCredentials;
  if (status >= 500) return ru.common.errorServer;
  if (status === 0) return ru.common.errorUnavailable;
  return String(result?.error || ru.auth.loginFailed);
}

export default function LoginForm({
  title = ru.auth.loginTitle,
  subtitle = ru.auth.loginSubtitle,
  submitLabel = ru.auth.loginSubmit,
  onSuccess,
  onCancel,
  secondaryLabel = ru.common.cancel,
  secondaryTestId = "",
  compact = false,
}) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const emailRef = useRef(null);
  const hasSubtitle = String(subtitle || "").trim().length > 0;

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
        {hasSubtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
      </div>

      <label className="flex flex-col gap-1.5 text-sm text-muted">
        <span className="font-medium">{ru.common.email}</span>
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
        <span className="font-medium">{ru.common.password}</span>
        <input
          type="password"
          autoComplete="current-password"
          className="h-11 rounded-xl border border-border bg-bgSoft px-3 text-fg"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={ru.auth.passwordPlaceholder}
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
          {submitting ? ru.auth.loginSubmitting : submitLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            className="secondaryBtn h-11 min-h-0 px-4 py-0 text-sm"
            onClick={onCancel}
            disabled={submitting}
            data-testid={secondaryTestId || undefined}
          >
            {secondaryLabel}
          </button>
        ) : null}
      </div>
    </form>
  );
}

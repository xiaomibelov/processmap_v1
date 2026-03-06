import { useEffect, useMemo, useState } from "react";

import LoginForm from "./LoginForm";
import { useAuth } from "./AuthProvider";
import { apiAuthInviteActivate, apiAuthInvitePreview } from "../../lib/api";

function asText(value) {
  return String(value || "").trim();
}

function mapInviteError(result) {
  const status = Number(result?.status || 0);
  const marker = asText(result?.error || result?.data?.error?.message).toLowerCase();
  if (marker.includes("password_mismatch")) return "Пароли не совпадают.";
  if (marker.includes("password_too_short")) return "Пароль должен содержать минимум 8 символов.";
  if (marker.includes("identity_already_active")) return "Аккаунт уже активирован. Используйте вход по логину и паролю.";
  if (status === 410 || marker.includes("invite_expired")) return "Срок действия инвайта истёк.";
  if (status === 404 || marker.includes("invite_not_found") || marker.includes("not_found")) return "Инвайт не найден или уже недоступен.";
  if (marker.includes("invite_revoked")) return "Инвайт отозван администратором.";
  if (marker.includes("invite_already_accepted")) return "Инвайт уже использован.";
  if (status === 429) return "Слишком много попыток, попробуйте позже.";
  if (status >= 500) return "Ошибка сервера при обработке инвайта.";
  return asText(result?.error || "Не удалось обработать инвайт.");
}

const MODE_LOGIN = "login";
const MODE_INVITE_ENTRY = "invite_entry";
const MODE_INVITE_ACTIVATE = "invite_activate";

export default function PublicHomePage({
  initialInviteToken = "",
  onAccessActivated,
}) {
  const { refreshMe, switchOrg } = useAuth();
  const [mode, setMode] = useState(() => (asText(initialInviteToken) ? MODE_INVITE_ENTRY : MODE_LOGIN));
  const [inviteKey, setInviteKey] = useState(asText(initialInviteToken));
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const hasInitialToken = useMemo(() => asText(initialInviteToken).length > 0, [initialInviteToken]);

  useEffect(() => {
    if (!hasInitialToken) return;
    const token = asText(initialInviteToken);
    setInviteKey(token);
    if (mode === MODE_LOGIN) setMode(MODE_INVITE_ENTRY);
    if (mode === MODE_INVITE_ENTRY) {
      void handlePreview(token);
    }
  }, [hasInitialToken, initialInviteToken, mode]);

  function resetInviteActivationState() {
    setPreview(null);
    setPassword("");
    setPasswordConfirm("");
  }

  function switchToLoginMode() {
    setBusy(false);
    setError("");
    resetInviteActivationState();
    setMode(MODE_LOGIN);
  }

  function switchToInviteMode() {
    setBusy(false);
    setError("");
    setMode(MODE_INVITE_ENTRY);
  }

  async function handlePreview(tokenRaw) {
    const token = asText(tokenRaw ?? inviteKey);
    if (!token) {
      setError("Введите инвайт-ключ.");
      return;
    }
    setBusy(true);
    setError("");
    const res = await apiAuthInvitePreview(token);
    setBusy(false);
    if (!res?.ok) {
      setPreview(null);
      setMode(MODE_INVITE_ENTRY);
      setError(mapInviteError(res));
      return;
    }
    setInviteKey(token);
    setPreview(res);
    setMode(MODE_INVITE_ACTIVATE);
  }

  async function handleActivate(event) {
    event.preventDefault();
    if (busy) return;
    if (!asText(inviteKey)) {
      setError("Инвайт-ключ отсутствует.");
      return;
    }
    if (!asText(password)) {
      setError("Введите пароль.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("Пароли не совпадают.");
      return;
    }
    setBusy(true);
    setError("");
    const activated = await apiAuthInviteActivate({
      token: inviteKey,
      password,
      password_confirm: passwordConfirm,
    });
    if (!activated?.ok) {
      setBusy(false);
      setError(mapInviteError(activated));
      return;
    }
    await refreshMe();
    const acceptedOrgId = asText(activated?.membership?.org_id || activated?.invite?.org_id);
    if (acceptedOrgId) {
      await switchOrg(acceptedOrgId, { refreshMe: false, allowMissing: true });
    }
    setBusy(false);
    onAccessActivated?.(activated);
  }

  const invite = preview?.invite || {};
  const loginReadonly = asText(preview?.identity?.email || invite?.email);

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8 md:px-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-panel p-6 shadow-panel">
        {mode === MODE_LOGIN ? (
          <LoginForm
            title="Вход в PROCESSMAP"
            subtitle=""
            submitLabel="Войти в систему"
            onSuccess={() => onAccessActivated?.({ source: "login" })}
            onCancel={switchToInviteMode}
            secondaryLabel="Доступ по инвайту"
            secondaryTestId="public-home-invite-mode-button"
          />
        ) : mode === MODE_INVITE_ENTRY ? (
          <>
            <h1 className="text-2xl font-semibold text-fg">Доступ по инвайту</h1>
            <p className="mt-1 text-sm text-muted">Введите инвайт-ключ, выданный администратором.</p>

            <label className="mt-4 flex flex-col gap-1.5 text-sm text-muted">
              <span className="font-medium text-fg">Инвайт-ключ</span>
              <input
                className="input h-11"
                value={inviteKey}
                onChange={(event) => setInviteKey(event.target.value)}
                placeholder="inv_..."
                autoFocus
              />
            </label>

            {error ? (
              <div className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="primaryBtn h-10 min-h-0 px-4 py-0 text-sm"
                onClick={() => void handlePreview(inviteKey)}
                disabled={busy}
              >
                {busy ? "Проверяем..." : "Продолжить"}
              </button>
              <button type="button" className="secondaryBtn h-10 min-h-0 px-4 py-0 text-sm" onClick={switchToLoginMode}>
                Назад ко входу
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold text-fg">Активация доступа</h1>
            <p className="mt-1 text-sm text-muted">Логин и контекст доступа заданы администратором.</p>

            <div className="mt-4 space-y-2 rounded-xl border border-border bg-panel2/40 p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <span className="text-muted">Логин / Email</span>
                <span className="text-right font-semibold text-fg">{loginReadonly || "-"}</span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="text-muted">Организация / Группа</span>
                <span className="text-right text-fg">{asText(invite?.org_name || invite?.org_id) || "-"}</span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="text-muted">Команда / Подгруппа</span>
                <span className="text-right text-fg">{asText(invite?.team_name || invite?.subgroup_name) || "-"}</span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="text-muted">Роль</span>
                <span className="text-right text-fg">{asText(invite?.role) || "viewer"}</span>
              </div>
            </div>

            <form className="mt-4 space-y-3" onSubmit={handleActivate}>
              <label className="flex flex-col gap-1.5 text-sm text-muted">
                <span className="font-medium text-fg">Пароль</span>
                <input
                  type="password"
                  className="input h-11"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Минимум 8 символов"
                  autoComplete="new-password"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm text-muted">
                <span className="font-medium text-fg">Подтвердите пароль</span>
                <input
                  type="password"
                  className="input h-11"
                  value={passwordConfirm}
                  onChange={(event) => setPasswordConfirm(event.target.value)}
                  placeholder="Повторите пароль"
                  autoComplete="new-password"
                />
              </label>

              {error ? (
                <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <button type="submit" className="primaryBtn h-10 min-h-0 px-4 py-0 text-sm" disabled={busy}>
                  {busy ? "Активируем..." : "Активировать доступ"}
                </button>
                <button
                  type="button"
                  className="secondaryBtn h-10 min-h-0 px-4 py-0 text-sm"
                  onClick={() => {
                    setError("");
                    resetInviteActivationState();
                    setMode(MODE_INVITE_ENTRY);
                  }}
                  disabled={busy}
                >
                  Назад ко входу
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

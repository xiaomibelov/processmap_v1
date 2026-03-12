import { useEffect, useMemo, useState } from "react";

import LoginForm from "./LoginForm";
import { useAuth } from "./AuthProvider";
import { apiInviteActivate, apiInviteResolve } from "../../lib/api";
import { ru } from "../../shared/i18n/ru";

function asText(value) {
  return String(value || "").trim();
}

function mapInviteError(result) {
  const status = Number(result?.status || 0);
  const marker = asText(result?.error || result?.data?.error?.message).toLowerCase();
  if (marker.includes("password_mismatch")) return ru.auth.invitePasswordMismatch;
  if (marker.includes("password_too_short")) return ru.auth.invitePasswordTooShort;
  if (marker.includes("identity_already_active")) return ru.auth.inviteAlreadyActive;
  if (status === 410 || marker.includes("invite_expired") || marker.includes("expired")) return ru.auth.inviteExpired;
  if (status === 404 || marker.includes("invite_not_found") || marker.includes("invalid_key") || marker.includes("not_found")) return ru.auth.inviteInvalidKey;
  if (marker.includes("invite_revoked") || marker.includes("revoked")) return ru.auth.inviteRevoked;
  if (marker.includes("invite_already_accepted") || marker.includes("invite_used") || marker.includes("used")) return ru.auth.inviteUsed;
  if (status === 429) return ru.auth.inviteTooManyRequests;
  if (status >= 500) return `${ru.common.errorServer} при обработке invite key.`;
  return asText(result?.error || ru.auth.inviteFailed);
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
      setError(ru.auth.inviteMissingKey);
      return;
    }
    setBusy(true);
    setError("");
    const res = await apiInviteResolve(token);
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
      setError(ru.auth.inviteMissingKey);
      return;
    }
    if (!asText(password)) {
      setError(ru.auth.invitePasswordRequired);
      return;
    }
    if (password !== passwordConfirm) {
      setError(ru.auth.invitePasswordMismatch);
      return;
    }
    setBusy(true);
    setError("");
    const activated = await apiInviteActivate({
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
  const singleOrgMode = !!preview?.single_org_mode;

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8 md:px-6">
      <div className="w-full max-w-md -translate-y-6 rounded-2xl border border-border bg-panel p-6 shadow-panel md:-translate-y-10">
        {mode === MODE_LOGIN ? (
          <LoginForm
            title={ru.auth.loginTitle}
            subtitle=""
            submitLabel={ru.auth.loginSubmit}
            onSuccess={() => onAccessActivated?.({ source: "login" })}
            onCancel={switchToInviteMode}
            secondaryLabel={ru.auth.loginSecondaryInvite}
            secondaryTestId="public-home-invite-mode-button"
          />
        ) : mode === MODE_INVITE_ENTRY ? (
          <>
            <h1 className="text-2xl font-semibold text-fg">{ru.auth.inviteEntryTitle}</h1>
            <p className="mt-1 text-sm text-muted">{ru.auth.inviteEntrySubtitle}</p>

            <label className="mt-4 flex flex-col gap-1.5 text-sm text-muted">
              <span className="font-medium text-fg">{ru.auth.inviteKeyLabel}</span>
              <input
                className="input h-11"
                value={inviteKey}
                onChange={(event) => setInviteKey(event.target.value)}
                placeholder={ru.auth.inviteKeyPlaceholder}
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
                {busy ? ru.auth.invitePreviewBusy : ru.common.continue}
              </button>
              <button type="button" className="secondaryBtn h-10 min-h-0 px-4 py-0 text-sm" onClick={switchToLoginMode}>
                {ru.auth.loginBack}
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold text-fg">{ru.auth.inviteActivateTitle}</h1>
            <p className="mt-1 text-sm text-muted">{ru.auth.inviteActivateSubtitle}</p>

            <div className="mt-4 space-y-2 rounded-xl border border-border bg-panel2/40 p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <span className="text-muted">{ru.auth.inviteReadonlyEmail}</span>
                <span className="text-right font-semibold text-fg">{loginReadonly || "-"}</span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="text-muted">{ru.auth.inviteReadonlyName}</span>
                <span className="text-right text-fg">{asText(invite?.full_name) || "-"}</span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="text-muted">{ru.auth.inviteReadonlyJobTitle}</span>
                <span className="text-right text-fg">{asText(invite?.job_title) || "-"}</span>
              </div>
              {!singleOrgMode ? (
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted">{ru.auth.inviteReadonlyOrg}</span>
                  <span className="text-right text-fg">{asText(invite?.org_name || invite?.org_id) || "-"}</span>
                </div>
              ) : null}
            </div>

            <form className="mt-4 space-y-3" onSubmit={handleActivate}>
              <label className="flex flex-col gap-1.5 text-sm text-muted">
                <span className="font-medium text-fg">{ru.common.password}</span>
                <input
                  type="password"
                  className="input h-11"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={ru.auth.invitePasswordMin}
                  autoComplete="new-password"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm text-muted">
                <span className="font-medium text-fg">{ru.auth.invitePasswordRepeat}</span>
                <input
                  type="password"
                  className="input h-11"
                  value={passwordConfirm}
                  onChange={(event) => setPasswordConfirm(event.target.value)}
                  placeholder={ru.auth.invitePasswordRepeatPlaceholder}
                  autoComplete="new-password"
                />
              </label>

              {error ? (
                <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <button type="submit" className="primaryBtn h-10 min-h-0 px-4 py-0 text-sm" disabled={busy}>
                  {busy ? ru.auth.inviteActivateBusy : ru.auth.inviteActivateSubmit}
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
                  {ru.auth.loginBack}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

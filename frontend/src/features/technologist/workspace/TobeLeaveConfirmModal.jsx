// T2: styled-модал подтверждения выхода из TO BE с несохранёнными правками.
// Построен на shared/ui/Modal по образцу ProcessStageSaveConflictModal.
// Строки — из словарей technologist/i18n (правило i18n, не хардкод).
import Modal from "../../../shared/ui/Modal";
import { t, tf } from "../i18n/index.js";

export default function TobeLeaveConfirmModal({
  open = false,
  busy = false,
  error = "",
  onSaveAndExit = null,
  onDiscardAndExit = null,
  onCancel = null,
}) {
  return (
    <Modal
      open={open === true}
      title={t("tobe.leave.title")}
      onClose={busy === true ? undefined : onCancel}
      cardClassName="max-w-[520px]"
      bodyClassName="space-y-3"
      footerClassName="flex flex-wrap gap-2"
      footer={(
        <>
          <button
            type="button"
            className="primaryBtn h-9 px-3 text-xs"
            onClick={onSaveAndExit}
            disabled={busy === true}
            data-testid="tobe-leave-save"
          >
            {busy === true ? t("tobe.leave.saving") : t("tobe.leave.save")}
          </button>
          <button
            type="button"
            className="secondaryBtn h-9 px-3 text-xs"
            onClick={onDiscardAndExit}
            disabled={busy === true}
            data-testid="tobe-leave-discard"
          >
            {t("tobe.leave.discard")}
          </button>
          <button
            type="button"
            className="secondaryBtn h-9 px-3 text-xs"
            onClick={onCancel}
            disabled={busy === true}
            data-testid="tobe-leave-cancel"
          >
            {t("tobe.leave.cancel")}
          </button>
        </>
      )}
    >
      <div data-testid="tobe-leave-modal">
        <p className="text-sm text-fg" data-testid="tobe-leave-lead">
          {t("tobe.leave.body")}
        </p>
        {error ? (
          <p className="text-sm text-danger" data-testid="tobe-leave-error">
            {tf("tobe.leave.error", { error })}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

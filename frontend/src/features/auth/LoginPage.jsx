import LoginForm from "./LoginForm";

export default function LoginPage({ onSuccess, onBack }) {
  return (
    <div className="min-h-screen overflow-auto px-4 py-8 md:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center justify-center">
        <div className="grid w-full gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)]">
          <section className="rounded-3xl border border-border bg-panel p-6 md:p-8">
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">Secure access</p>
            <h1 className="mt-3 text-3xl font-semibold text-fg">Вход в рабочую зону</h1>
            <p className="mt-2 text-sm text-muted">
              После входа откроется рабочая зона `/app`: проект, сессия, диаграмма, интервью и экспорт.
            </p>
            <button type="button" className="secondaryBtn mt-5 h-10 min-h-0 px-4 py-0 text-sm" onClick={onBack}>
              На главную
            </button>
          </section>

          <section className="rounded-3xl border border-border bg-panel p-6 md:p-8">
            <LoginForm onSuccess={onSuccess} submitLabel="Войти в систему" />
          </section>
        </div>
      </div>
    </div>
  );
}

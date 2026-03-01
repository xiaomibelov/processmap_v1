import { useState } from "react";
import logoDark from "../../assets/brand/logo_dark.png";

function scrollToSection(id) {
  if (typeof document === "undefined") return;
  const target = document.getElementById(String(id || ""));
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function IconMenu(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function IconArrow(props) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" {...props}>
      <path d="M3.5 8h9m0 0-3-3m3 3-3 3" />
    </svg>
  );
}

export default function PublicHomePage({ onOpenLogin, onOpenWorkspace, onOpenLoginPage }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const headerLinks = [
    { id: "features", label: "Возможности" },
    { id: "how-it-works", label: "Как это работает" },
    { id: "demo", label: "Демо" },
  ];

  const howItWorks = [
    {
      title: "Проект и контекст",
      text: "Создайте пространство процесса и зафиксируйте участников.",
    },
    {
      title: "AI-интервью",
      text: "Получайте уточняющие вопросы по шагам и заполняйте структуру без пропусков.",
    },
    {
      title: "Диаграмма и готовность",
      text: "Синхронизируйте Interview/Diagram/XML и проверьте DoD перед экспортом.",
    },
  ];

  const features = [
    "AI-интервью по шагам с контекстом ролей",
    "Синхронизация Interview ↔ Diagram ↔ XML",
    "Контроль DoD по каждому шагу процесса",
    "Версии BPMN и быстрое восстановление",
  ];

  function openLogin() {
    setMobileOpen(false);
    onOpenLogin?.();
  }

  function openRegister() {
    setMobileOpen(false);
    onOpenLoginPage?.();
    if (!onOpenLoginPage) onOpenLogin?.();
  }

  function goWorkspace() {
    setMobileOpen(false);
    onOpenWorkspace?.();
  }

  return (
    <div
      className="h-screen overflow-y-auto bg-bg text-fg"
      style={{
        backgroundImage:
          "radial-gradient(900px 480px at 10% -8%, rgba(126, 109, 255, 0.16), transparent 58%), radial-gradient(740px 420px at 88% 2%, rgba(72, 170, 255, 0.12), transparent 56%)",
      }}
    >
      <header className="sticky top-0 z-40 border-b border-border bg-panel/92 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-2.5 md:px-6">
          <button
            type="button"
            onClick={() => scrollToSection("hero")}
            className="flex shrink-0 items-center gap-2 rounded-xl px-1 py-1 text-left"
            aria-label="PROCESSMAP"
          >
            <img src={logoDark} alt="PROCESSMAP" className="h-8 w-auto object-contain" />
            <span className="text-sm font-semibold tracking-[0.15em] text-fg">PROCESSMAP</span>
          </button>

          <nav className="ml-auto hidden items-center gap-5 md:flex">
            {headerLinks.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => scrollToSection(item.id)}
                className="text-sm font-medium text-muted transition-colors hover:text-fg"
              >
                {item.label}
              </button>
            ))}
            <button type="button" className="secondaryBtn h-9 min-h-0 px-4 py-0" onClick={openLogin}>
              Войти
            </button>
            <button type="button" className="primaryBtn h-9 min-h-0 px-4 py-0" onClick={openRegister}>
              Регистрация
            </button>
          </nav>

          <div className="ml-auto flex items-center gap-2 md:hidden">
            <button type="button" className="primaryBtn h-9 min-h-0 px-3 py-0 text-sm" onClick={openRegister}>
              Регистрация
            </button>
            <button
              type="button"
              aria-label="Открыть меню"
              onClick={() => setMobileOpen((v) => !v)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-panel2 text-fg"
            >
              <IconMenu className="h-4 w-4" />
            </button>
          </div>
        </div>
        {mobileOpen ? (
          <div className="border-t border-border bg-panel px-4 py-3 md:hidden">
            <div className="space-y-1.5">
              {headerLinks.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    scrollToSection(item.id);
                  }}
                  className="block w-full rounded-lg px-2 py-2 text-left text-sm font-medium text-muted"
                >
                  {item.label}
                </button>
              ))}
              <button type="button" className="secondaryBtn h-9 min-h-0 w-full px-3 py-0" onClick={openLogin}>
                Войти
              </button>
            </div>
          </div>
        ) : null}
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-10 pt-6 md:px-6 md:pb-12">
        <section
          id="hero"
          className="grid gap-4 rounded-3xl border border-border bg-panel p-5 shadow-panel md:grid-cols-[1.07fr_0.93fr] md:p-7"
        >
          <div className="min-w-0">
            <span className="inline-flex rounded-full border border-accent/35 bg-accent/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.13em] text-accent">
              AI + BPMN workbench
            </span>
            <h1 className="mt-3 text-3xl font-semibold leading-[1.12] text-fg md:text-[2.55rem]">
              Проектируйте процессы через{" "}
              <span className="bg-gradient-to-r from-[#6356f8] via-[#4d72fb] to-[#38a2f5] bg-clip-text text-transparent">
                AI-интервью
              </span>{" "}
              и сразу получайте диаграмму
            </h1>
            <p className="mt-3 max-w-xl text-[15px] text-muted">
              PROCESSMAP объединяет интервью команды, BPMN-модель и критерии готовности в одном рабочем потоке.
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              <button type="button" className="primaryBtn h-11 min-h-0 px-5 py-0 text-sm" onClick={openRegister}>
                Зарегистрироваться
              </button>
              <button type="button" className="secondaryBtn h-11 min-h-0 px-5 py-0 text-sm" onClick={() => scrollToSection("demo")}>
                Смотреть демо
              </button>
            </div>
          </div>

          <div className="relative min-w-0 overflow-hidden rounded-2xl border border-border bg-panel2 p-3.5">
            <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-accent/25 blur-2xl" />
            <div className="grid gap-3 md:grid-cols-[1.06fr_0.94fr]">
              <article className="rounded-xl border border-border bg-panel p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted">AI-вопрос</div>
                <p className="mt-1 text-sm font-medium text-fg">Кто подтверждает выпуск партии после контроля?</p>
                <div className="mt-2.5 grid gap-1.5 text-xs">
                  <div className="rounded-md border border-border bg-bgSoft px-2 py-1.5 text-fg">Смена QA</div>
                  <div className="rounded-md border border-border bg-bgSoft px-2 py-1.5 text-fg">Ответственный технолог</div>
                </div>
                <div className="mt-3 text-[11px] text-muted">Готовность интервью: 68%</div>
                <div className="mt-1.5 h-1.5 rounded-full bg-bgSoft">
                  <div className="h-full w-[68%] rounded-full bg-gradient-to-r from-[#5e63f5] to-[#46a1f3]" />
                </div>
              </article>
              <article className="rounded-xl border border-border bg-panel p-3">
                <div className="mb-2 text-[11px] uppercase tracking-wide text-muted">Результат</div>
                <div className="space-y-1.5 text-xs">
                  <div className="rounded-md border border-border bg-bgSoft px-2 py-1 text-fg">Диаграмма: 12 шагов</div>
                  <div className="rounded-md border border-border bg-bgSoft px-2 py-1 text-fg">DoD: 4/5 выполнено</div>
                  <div className="rounded-md border border-border bg-bgSoft px-2 py-1 text-fg">XML: синхронизировано</div>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="space-y-2">
          <div className="flex items-end justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.13em] text-muted">Как это работает</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {howItWorks.map((item, index) => (
              <article key={item.title} className="rounded-2xl border border-border bg-panel p-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">Шаг {index + 1}</div>
                <h3 className="text-base font-semibold text-fg">{item.title}</h3>
                <p className="mt-1.5 text-sm text-muted">{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="features" className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-[0.13em] text-muted">Возможности</h2>
          <div className="grid gap-2.5 md:grid-cols-2">
            {features.map((item) => (
              <article key={item} className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-panel p-4">
                <span className="text-sm text-fg">{item}</span>
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-bgSoft text-muted">
                  <IconArrow className="h-3.5 w-3.5" />
                </span>
              </article>
            ))}
          </div>
        </section>

        <section id="demo" className="rounded-2xl border border-border bg-panel2 p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-fg">Демо за 60 секунд</h2>
              <ul className="mt-2 space-y-1 text-sm text-muted">
                <li>• Создание контекста процесса и ролей</li>
                <li>• AI-интервью по шагам и развилкам</li>
                <li>• Финальная диаграмма и готовность DoD</li>
              </ul>
            </div>
            <button type="button" className="primaryBtn h-11 min-h-0 px-5 py-0 text-sm" onClick={goWorkspace}>
              Открыть демо
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-panel p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-fg">Готовы собрать первый процесс?</h2>
              <p className="mt-1 text-sm text-muted">Запустите интервью и получите BPMN-модель без ручной рутины.</p>
            </div>
            <div className="flex gap-2">
              <button type="button" className="primaryBtn h-10 min-h-0 px-4 py-0 text-sm" onClick={openRegister}>
                Регистрация
              </button>
              <button type="button" className="secondaryBtn h-10 min-h-0 px-4 py-0 text-sm" onClick={openLogin}>
                Войти
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

import React from "react";

import { reportFrontendFatalError } from "./telemetryClient.js";

export default class FrontendErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    void reportFrontendFatalError({
      message: error?.message || "frontend_render_error",
      error,
      componentStack: info?.componentStack || "",
      context: {
        boundary: "root",
      },
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center px-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-panel p-6">
            <h1 className="text-xl font-semibold text-fg">Произошла ошибка интерфейса</h1>
            <p className="mt-2 text-sm text-muted">Состояние зафиксировано. Обновите страницу, чтобы продолжить работу.</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

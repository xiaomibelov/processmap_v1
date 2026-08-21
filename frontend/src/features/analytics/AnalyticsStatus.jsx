import React from "react";

export function AnalyticsLoading({ text = "Загрузка…" }) {
  return (
    <div className="analyticsLoading">
      <div className="analyticsLoadingSpinner" />
      <span>{text}</span>
    </div>
  );
}

export function AnalyticsError({ message, onRetry }) {
  return (
    <div className="analyticsError">
      <span>{message || "Не удалось загрузить."}</span>
      {onRetry ? (
        <button type="button" className="analyticsRetryBtn" onClick={onRetry}>
          Повторить
        </button>
      ) : null}
    </div>
  );
}

export class AnalyticsErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("Analytics panel error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="analyticsError">
          <span>Ошибка отображения панели: {String(this.state.error?.message || this.state.error || "неизвестная ошибка")}</span>
          <button
            type="button"
            className="analyticsRetryBtn"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Повторить
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

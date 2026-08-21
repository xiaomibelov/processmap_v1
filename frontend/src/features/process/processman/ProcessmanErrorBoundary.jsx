import { Component } from "react";

// HOTFIX — Error Boundary вокруг панели PROCESSMAN: сбой панели НЕ должен
// ронять канвас диаграммы (инцидент stage 2026-08-09: потерянный импорт
// processman.css сломал layout всей рабочей области).
// При ошибке панель молча скрывается (null), канвас остаётся живым.
export default class ProcessmanErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    try {
      // eslint-disable-next-line no-console
      console.error("[processman] panel crashed, canvas preserved:", error?.message, info?.componentStack);
    } catch {
      // no-op
    }
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

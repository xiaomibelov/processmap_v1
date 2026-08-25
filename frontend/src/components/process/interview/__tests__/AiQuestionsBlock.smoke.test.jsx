// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import AiQuestionsBlock from "../AiQuestionsBlock.jsx";

function setupContainer() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return { container, cleanup() { container.remove(); } };
}

const defaultProps = {
  collapsed: false,
  toggleBlock: vi.fn(),
  aiRows: [],
  patchQuestionStatus: vi.fn(),
};

describe("AiQuestionsBlock smoke", () => {
  it("renders empty state", () => {
    const html = renderToString(<AiQuestionsBlock {...defaultProps} />);
    expect(html).toContain('data-testid="ai-questions-block"');
    expect(html).toContain("Вопросов пока нет");
  });

  it("renders rows and calls status change", async () => {
    const patchQuestionStatus = vi.fn();
    const aiRows = [
      { id: "q1", seq: 1, type: "qc", stepTitle: "Проверка", text: "Как часто проверяют?", status: "уточнить", stepId: "s1" },
    ];
    const { container, cleanup } = setupContainer();
    const root = createRoot(container);

    await act(async () => {
      root.render(<AiQuestionsBlock {...defaultProps} aiRows={aiRows} patchQuestionStatus={patchQuestionStatus} />);
    });

    expect(container.textContent).toContain("Как часто проверяют?");
    const select = container.querySelector("select");
    expect(select).not.toBeNull();

    await act(async () => {
      select.value = "подтверждено";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(patchQuestionStatus).toHaveBeenCalledWith("s1", "q1", "подтверждено");

    root.unmount();
    cleanup();
  });
});

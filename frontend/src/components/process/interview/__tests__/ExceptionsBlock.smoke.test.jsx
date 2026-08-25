// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import ExceptionsBlock from "../ExceptionsBlock.jsx";

function setupContainer() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return { container, cleanup() { container.remove(); } };
}

const defaultProps = {
  collapsed: false,
  toggleBlock: vi.fn(),
  exceptions: [],
  addException: vi.fn(),
  patchException: vi.fn(),
  deleteException: vi.fn(),
};

describe("ExceptionsBlock smoke", () => {
  it("renders empty state with add CTA", () => {
    const html = renderToString(<ExceptionsBlock {...defaultProps} />);
    expect(html).toContain('data-testid="exceptions-block"');
    expect(html).toContain("Исключений пока нет");
    expect(html).toContain('data-testid="exceptions-empty-add-btn"');
  });

  it("renders table rows and calls add/delete handlers", async () => {
    const addException = vi.fn();
    const deleteException = vi.fn();
    const exceptions = [
      { id: "e1", step_seq: "1", situation: "брак", trigger: "заметили", actions: "отбраковать", add_min: "10", owner: "мастер" },
    ];
    const { container, cleanup } = setupContainer();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ExceptionsBlock
          {...defaultProps}
          exceptions={exceptions}
          addException={addException}
          deleteException={deleteException}
        />
      );
    });

    const situationInput = container.querySelector('input[value="брак"]');
    expect(situationInput).not.toBeNull();
    expect(container.querySelector("table")).not.toBeNull();

    const addBtn = container.querySelector('[data-testid="exceptions-add-btn"]');
    await act(async () => {
      addBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(addException).toHaveBeenCalledTimes(1);

    const deleteBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent.includes("удалить"));
    await act(async () => {
      deleteBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(deleteException).toHaveBeenCalledWith("e1");

    root.unmount();
    cleanup();
  });
});

import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");

test("collapsed sidebar accordion body is hidden from hit-testing and focus (F-SIDEBAR-OVERLAP)", () => {
  const styles = fs.readFileSync(path.join(root, "src/styles/tailwind.css"), "utf8");
  // Контент свёрнутого аккордеона остаётся смонтированным (grid-collapse).
  // Без visibility:hidden его laid-out контролы (напр. button.sidebarAddBtn)
  // перекрываются следующими accordion head'ами и остаются фокусируемыми.
  assert.match(
    styles,
    /\.sidebarAccordion:not\(\.isOpen\)\s+\.sidebarAccordionBody\s*\{[^}]*visibility:\s*hidden/s,
  );
});

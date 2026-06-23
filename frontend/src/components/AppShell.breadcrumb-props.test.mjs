import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import parser from "@babel/parser";

const source = fs.readFileSync(new URL("./AppShell.jsx", import.meta.url), "utf8");
const ast = parser.parse(source, { sourceType: "module", plugins: ["jsx"] });

function getAppShellFunction() {
  for (const node of ast.program.body) {
    if (node.type === "ExportDefaultDeclaration" && node.declaration?.type === "FunctionDeclaration") {
      return node.declaration;
    }
  }
  return null;
}

function getObjectParamProps(fn) {
  const params = fn?.params || [];
  const first = params[0];
  if (!first || first.type !== "ObjectPattern") return [];
  return first.properties.map((p) => {
    if (p.type === "ObjectProperty") {
      const key = p.key?.name;
      const value = p.value;
      if (value?.type === "AssignmentPattern") {
        return { key, local: value.left?.name, hasDefault: true, defaultType: value.right?.type };
      }
      return { key, local: value?.name, hasDefault: false };
    }
    return null;
  }).filter(Boolean);
}

function findJsxElements(node, name, results = []) {
  if (!node || typeof node !== "object") return results;
  if (node.type === "JSXElement" && node.openingElement?.name?.name === name) {
    results.push(node);
  }
  for (const key of Object.keys(node)) {
    if (key === "leadingComments" || key === "trailingComments") continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const c of child) findJsxElements(c, name, results);
    } else {
      findJsxElements(child, name, results);
    }
  }
  return results;
}

test("AppShell destructures subprocess breadcrumb props with safe defaults", () => {
  const fn = getAppShellFunction();
  assert.notEqual(fn, null, "AppShell default export should be a function");
  const props = new Map(getObjectParamProps(fn).map((p) => [p.key, p]));

  const breadcrumbs = props.get("subprocessBreadcrumbs");
  assert.equal(breadcrumbs?.hasDefault, true);
  assert.equal(breadcrumbs?.defaultType, "ArrayExpression");

  const onNavigate = props.get("onBreadcrumbNavigate");
  assert.equal(onNavigate?.hasDefault, true);
  assert.equal(onNavigate?.defaultType, "NullLiteral");

  const onReturn = props.get("onReturnToParent");
  assert.equal(onReturn?.hasDefault, true);
  assert.equal(onReturn?.defaultType, "NullLiteral");
});

test("AppShell forwards subprocess breadcrumb props into ProcessStage without ReferenceError", () => {
  const fn = getAppShellFunction();
  const processStages = findJsxElements(fn, "ProcessStage");
  assert.ok(processStages.length > 0, "AppShell should render ProcessStage");

  const stage = processStages[0];
  const attrs = new Map();
  for (const attr of stage.openingElement.attributes) {
    if (attr.type === "JSXAttribute") {
      const attrName = attr.name?.name;
      const value = attr.value;
      if (value?.type === "JSXExpressionContainer" && value.expression?.type === "Identifier") {
        attrs.set(attrName, value.expression.name);
      }
    }
  }

  assert.equal(attrs.get("subprocessBreadcrumbs"), "subprocessBreadcrumbs");
  assert.equal(attrs.get("onBreadcrumbNavigate"), "onBreadcrumbNavigate");
  assert.equal(attrs.get("onReturnToParent"), "onReturnToParent");
});

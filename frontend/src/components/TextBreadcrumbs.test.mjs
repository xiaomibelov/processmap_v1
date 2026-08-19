import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const componentSource = readFileSync(new URL("./TextBreadcrumbs.jsx", import.meta.url), "utf8");

const { collapseBreadcrumbTrail } = await import("./textBreadcrumbs.js");

function makeCrumbs(n) {
  return Array.from({ length: n }, (_, i) => ({ key: `c${i}`, label: `Crumb ${i}` }));
}

test("collapseBreadcrumbTrail: короткий трейл не сворачивается", () => {
  for (const n of [0, 1, 2, 3, 4]) {
    const model = collapseBreadcrumbTrail(makeCrumbs(n));
    assert.equal(model.collapsed, false);
    assert.equal(model.items.length, n);
    assert.ok(model.items.every((item) => item.type === "crumb"));
  }
});

test("collapseBreadcrumbTrail: длинный трейл — … / текущий", () => {
  const model = collapseBreadcrumbTrail(makeCrumbs(6));
  assert.equal(model.collapsed, true);
  assert.equal(model.items.length, 2);
  assert.equal(model.items[0].type, "ellipsis");
  assert.deepEqual(model.items[0].hidden.map((c) => c.label), ["Crumb 0", "Crumb 1", "Crumb 2", "Crumb 3", "Crumb 4"]);
  assert.equal(model.items[1].crumb.label, "Crumb 5");
});

test("TextBreadcrumbs: текстовый стиль 12–13px, без чипов и подложек", () => {
  assert.match(componentSource, /text-\[13px\]/);
  assert.doesNotMatch(componentSource, /rounded-full|rounded-lg|border\s|bg-panel|bg-accent/);
});

test("TextBreadcrumbs: текущий сегмент — текст без ссылки, родители — hover:underline", () => {
  assert.match(componentSource, /hover:underline/);
  assert.match(componentSource, /data-current=\{isCurrent \? "true" : undefined\}/);
});

test("TextBreadcrumbs: «…» разворачивает путь по клику", () => {
  assert.match(componentSource, /onClick=\{\(\) => setExpanded\(true\)\}/);
  assert.match(componentSource, /-ellipsis`\}/);
});


test("TextBreadcrumbs: текущий сегмент с aria-current=page, интерактивные элементы с видимым фокусом", () => {
  // ui-ux-pro-max review (Navigation/Breadcrumbs + Accessibility/Focus States):
  // текущий пункт крошек объявляется скринридеру, кнопки имеют focus-visible ring
  // по конвенции кодовой базы (focus-visible:ring-2 ring-accent/60).
  assert.match(componentSource, /aria-current=\{isCurrent \? "page" : undefined\}/);
  const focusRing = /focus:outline-none focus-visible:ring-2 focus-visible:ring-accent\/60/;
  assert.ok(focusRing.test(componentSource), "focus-visible ring присутствует");
  // оба интерактивных элемента (крошка-ссылка и «…») — кнопки с focus ring
  const buttonTags = componentSource.match(/<button[\s\S]*?>/g) || [];
  assert.equal(buttonTags.length, 2);
  buttonTags.forEach((tag) => assert.match(tag, focusRing));
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  filterExplorerAssignableUsers,
  formatExplorerUserDisplay,
  getExplorerAssigneeActionLabel,
  getExplorerAssigneeDialogTitle,
  getExplorerAssigneeId,
  getExplorerAssigneeKind,
  getExplorerAssigneeLabel,
  getExplorerBusinessAssignee,
  getExplorerBusinessAssigneeKind,
  getExplorerBusinessAssigneeLabel,
} from "./explorerAssigneeModel.js";

test("folder and section rows use responsible user display", () => {
  const section = {
    type: "folder",
    responsible_user_id: "u1",
    responsible_user: { user_id: "u1", display_name: "Ирина Ответственная" },
  };

  assert.equal(getExplorerAssigneeKind(section), "responsible");
  assert.equal(getExplorerBusinessAssigneeKind(section), "responsible");
  assert.equal(getExplorerAssigneeId(section), "u1");
  assert.equal(getExplorerAssigneeLabel(section), "Ирина Ответственная");
  assert.equal(getExplorerBusinessAssigneeLabel(section), "Ирина Ответственная");
  assert.deepEqual(getExplorerBusinessAssignee(section), section.responsible_user);
  assert.equal(getExplorerAssigneeActionLabel(section), "Изменить ответственного");
  assert.equal(getExplorerAssigneeDialogTitle(section, { folderLabel: "Раздел" }), "Ответственный за раздел");
});

test("project rows use executor user display and never fall back to owner", () => {
  const project = {
    type: "project",
    owner: { id: "owner1", name: "Технический Owner" },
    executor_user_id: "",
    executor_user: null,
  };

  assert.equal(getExplorerAssigneeKind(project), "executor");
  assert.equal(getExplorerBusinessAssigneeKind(project), "executor");
  assert.equal(getExplorerAssigneeLabel(project), "—");
  assert.equal(getExplorerBusinessAssigneeLabel(project), "—");
  assert.equal(getExplorerBusinessAssignee(project), null);
  assert.equal(getExplorerAssigneeActionLabel(project), "Назначить исполнителя");
  assert.equal(getExplorerAssigneeDialogTitle(project), "Исполнитель проекта");
});

test("project rows support backend executor alias", () => {
  const project = {
    type: "project",
    executor_user_id: "u2",
    executor: { user_id: "u2", full_name: "Павел Исполнитель" },
  };

  assert.equal(getExplorerAssigneeLabel(project), "Павел Исполнитель");
  assert.equal(getExplorerAssigneeActionLabel(project), "Изменить исполнителя");
});

test("empty assignee displays dash", () => {
  assert.equal(getExplorerAssigneeLabel({ type: "folder" }), "—");
  assert.equal(getExplorerAssigneeLabel({ type: "project" }), "—");
  assert.equal(getExplorerAssigneeKind({ type: "session" }), "none");
});

test("user display and filtering use name email and job title", () => {
  const users = [
    { user_id: "u1", full_name: "Анна Иванова", email: "anna@example.test", job_title: "Аналитик" },
    { user_id: "u2", full_name: "Борис Петров", email: "boris@example.test", job_title: "Технолог" },
  ];

  assert.equal(formatExplorerUserDisplay(users[0]), "Анна Иванова");
  assert.deepEqual(filterExplorerAssignableUsers(users, "тех").map((user) => user.user_id), ["u2"]);
  assert.deepEqual(filterExplorerAssignableUsers(users, "anna").map((user) => user.user_id), ["u1"]);
});

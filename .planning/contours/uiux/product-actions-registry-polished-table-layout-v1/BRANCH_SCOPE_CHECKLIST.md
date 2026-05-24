# BRANCH_SCOPE_CHECKLIST

## Worker 2 branch guard

- [ ] Work starts from clean branch/worktree based on `origin/main`.
- [ ] If not, `BRANCH_HYGIENE_REPORT.md` explains why current checkout is safe.
- [ ] No unrelated dirty files are included.
- [ ] No broad refactor.
- [ ] No package install.
- [ ] No TypeScript migration.
- [ ] No shadcn/ui.
- [ ] No backend/schema/BPMN/RAG changes.
- [ ] No Product Actions durable truth changes.
- [ ] No fake data.
- [ ] No merge/PR/deploy.

## Allowed likely frontend areas

These are examples, not permission to edit blindly:

- Product Actions Registry page/panel components.
- Registry-specific subcomponents if present.
- Registry-specific CSS/Tailwind classes.
- Existing version/build marker file if project pattern requires version update.
- Focused tests for touched registry UI behavior.

## Required proof

- [ ] Source map lists every changed file and why it belongs to contour.
- [ ] Validation results list exact commands and outcomes.
- [ ] If checkbox column or row expansion is skipped, report why.
- [ ] If quick action `Показать только неполные` is skipped, report why.
- [ ] If sticky header is skipped, report why.

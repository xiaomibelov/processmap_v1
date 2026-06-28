# Block 2: Compact Redesign of NotesMvpPanel — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans.

**Goal:** Make `NotesMvpPanel` compact, flat, and admin-style without changing data/API logic.

**Architecture:** Keep state management and API wrappers in `NotesMvpPanel.jsx`. Extract three presentational helpers in the same file to reduce JSX nesting, and add a dedicated compact stylesheet.

**Tech Stack:** React, Tailwind utility classes, custom CSS.

---

## Task 1: Extract presentational helpers inside NotesMvpPanel.jsx

**Files:**
- Modify: `frontend/src/components/NotesMvpPanel.jsx`

- [ ] **Step 1: Add `AuthorAvatar` helper**

```jsx
function AuthorAvatar({ label, className = "" }) {
  return (
    <div
      className={`grid shrink-0 place-items-center rounded-full border border-border/60 bg-bg/30 text-[10px] font-semibold text-muted ${className}`}
      aria-hidden="true"
    >
      {authorInitials(label)}
    </div>
  );
}
```

- [ ] **Step 2: Add `DiscussionThreadListItem` helper**

Move the thread-row JSX (lines ~2630–2692) into a helper component that receives `thread`, `active`, `authorLabelsById`, `viewerUserId`, `onSelect`, etc. Preserve all existing `data-testid` attributes.

- [ ] **Step 3: Add `DiscussionComment` helper**

Move the comment/reply JSX (lines ~2222–2328) into a helper component. Preserve `data-note-comment-id`, `data-testid` attributes, edit/reply handlers, and mention rendering.

- [ ] **Step 4: Add `DiscussionComposer` helper**

Move the reply composer JSX (lines ~2376–2427) into a helper component. Preserve `commentDraftRef`, mention suggestions, and submit handler.

---

## Task 2: Compact CSS

**Files:**
- Create: `frontend/src/styles/app/05/05-03-discussion-panel-compact.css`
- Modify: `frontend/src/styles/app/05/05-02-bpmn-text-contrast.css` import chain (or import the new file in `frontend/src/styles/app/index.css` if there is one)

- [ ] **Step 1: Create stylesheet**

Key overrides:

```css
/* Panel chrome */
.discussionPanelCompact {
  border-radius: 8px;
  box-shadow: none;
}
.discussionPanelCompact .notes-panel-header {
  padding: 10px 12px;
}
.discussionPanelCompact .notes-panel-title {
  font-size: 14px;
  font-weight: 700;
}
.discussionPanelCompact .notes-panel-summary {
  font-size: 11px;
}

/* Thread list rows */
.discussionThreadRow--compact {
  padding: 12px;
  border-radius: 8px;
  gap: 8px;
  box-shadow: none;
}
.discussionThreadRow--compact .thread-title {
  font-size: 13px;
  line-height: 1.25;
}
.discussionThreadRow--compact .thread-preview {
  font-size: 11px;
  line-height: 1.35;
}
.discussionThreadRow--compact .thread-meta {
  font-size: 10px;
  gap: 6px;
}

/* Thread detail */
.discussionThreadDetail--compact .thread-detail-header {
  padding: 10px 12px;
}
.discussionThreadDetail--compact .thread-detail-meta {
  font-size: 10px;
}

/* Comments */
.discussionComment--compact {
  padding: 8px 10px;
  border-radius: 8px;
}
.discussionComment--compact .comment-avatar {
  width: 16px;
  height: 16px;
  font-size: 8px;
}
.discussionComment--compact .comment-author {
  font-size: 12px;
}
.discussionComment--compact .comment-date {
  font-size: 10px;
}
.discussionComment--compact .comment-body {
  font-size: 12px;
  line-height: 1.4;
}
.discussionComment--compact .comment-actions button {
  font-size: 10px;
  padding: 2px 6px;
}
.discussionComment--compact.is-reply {
  margin-left: 12px;
}

/* Composer */
.discussionComposer--compact textarea {
  min-height: 44px;
  font-size: 12px;
  padding: 8px 10px;
}
.discussionComposer--compact .composer-submit {
  font-size: 11px;
  padding: 5px 10px;
  height: auto;
}
```

- [ ] **Step 2: Wire stylesheet into build**

Add `@import './05/05-03-discussion-panel-compact.css';` (or equivalent) so Vite picks it up.

---

## Task 3: Apply compact classes in NotesMvpPanel.jsx

**Files:**
- Modify: `frontend/src/components/NotesMvpPanel.jsx`

- [ ] **Step 1: Update panel container class**

Add `discussionPanelCompact` to the main panel `div`.

- [ ] **Step 2: Update `discussionThreadRowClass`**

Return a base class that includes `discussionThreadRow--compact`.

- [ ] **Step 3: Update thread row JSX**

Render `AuthorAvatar` left of title, show author + date on one line, preview text-xs truncated.

- [ ] **Step 4: Update thread detail header**

Reduce font sizes and padding.

- [ ] **Step 5: Update comments**

Wrap replies (`replyToId` present) with `discussionComment--compact is-reply`. Use `AuthorAvatar` 16px. Compact action buttons.

- [ ] **Step 6: Update composer**

Apply `discussionComposer--compact`, reduce textarea height, compact submit button.

---

## Task 4: Verify and commit

- [ ] **Step 1: Run frontend build**

```bash
cd /opt/processmap-test/.worktrees/refactor-property-save-decomposition/frontend
npm run build
```

Expected: success.

- [ ] **Step 2: Run relevant tests**

```bash
node --test src/components/NotesMvpPanel.discussions-surface-polish.test.mjs
node --test src/lib/api.noteThreads.test.mjs
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
cd /opt/processmap-test/.worktrees/refactor-property-save-decomposition
git add frontend/src/components/NotesMvpPanel.jsx \
        frontend/src/styles/app/05/05-03-discussion-panel-compact.css \
        frontend/src/styles/app/index.css \
        docs/superpowers/plans/2026-06-28-block2-notes-panel-redesign.md
git commit -m "feat(notes): compact redesign of MVP-1 discussion panel (Block 2)

- Extract AuthorAvatar, DiscussionThreadListItem, DiscussionComment,
  DiscussionComposer helpers inside NotesMvpPanel.jsx.
- Add compact stylesheet: 8px radius, 12px padding, text-xs, no shadows.
- Dense thread rows with avatar + author + date.
- Compact comments with reply indentation.
- Inline compact composer.

Refs block2/notes-redesign"
```

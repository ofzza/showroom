# _`P12`_ The code sidebar

approved 2026-11-14 (option chosen: "Approve and commit (Rec.)"), without a zero-context review; choices _`D478`_–_`D480`_ settled 2026-11-14

## Goals

The code sidebar (_`D474`_–_`D477`_ (SPEC-S10-presentation.md)): text linked files, and linked showcases shown inline with their tabs, open in a modal panel from the right instead of FluentUI's `Dialog`; the code pane's full state is replaced by opening its tabs in the same code sidebar.

No child segments: one module replaced, one changed, and their callers.

## Decisions

Settled 2026-11-14 in one dialog, Q1–Q3.

- _`D478`_ (`live`; Q1, option chosen: "Rename to code-sidebar/ (Rec.)"): **`src/app/file-modal/` moves to `src/app/code-sidebar/`**, named after the Glossary term; its shared helpers keep their names (`fetchLinkedFile()`, `useLinkedFileContent()`, `getFetchedTabUrl()`, `getShownTabText()`, `LinkedFileView`, `ShownTabView`, `ShownTabList`, `getTabId()`, `NewTabLink`, the messages); never a folder named `files` (`AGENTS.md` › linked files). Rejected: keeping `file-modal/`.
- _`D479`_ (`live`; Q2, option chosen: "The pane's selected tab (Rec.)"): **The code sidebar opened from a code pane starts at the code pane's selected tab.** Rejected: always the first tab.
- _`D480`_ (`live`; Q3, option chosen: ""Show the code in a sidebar", panel icon (Rec.)"): **The cycling button at half** is labelled "Show the code in a sidebar", with FluentUI's `PanelRight16Regular` (a panel on the right; `PanelRightExpand` has no 16 px size, and the block's icons are 16 px); hidden keeps "Show the code" and the code icon. Rejected: keeping `ArrowMaximize16Regular`.
- _`D481`_ (`live`; the design, from the outline the user approved 2026-11-14): **The component**: `getSidebarView(file, tabs, selected)` replaces `getDialogView()`: a linked file alone (no tabs, or fewer than two from a linked showcase) gets its base name as the title, and its URL to fetch and to open; with tabs (a linked showcase shown inline with included files, or a code pane, whose tabs are always shown), the selected tab, no title (the tab list is the title), and the "Open in a new tab" URL for a `file` tab only. `CodeSidebar({ file?, tabs?, documentation, initialTab?, onClose })` replaces `LinkedFileDialog`: FluentUI's `OverlayDrawer` (as `src/app/layout/`'s navigation), `position="end"`, modal, closing through `onOpenChange` (ESC, the backdrop) and the × button (`Dismiss24Regular`, labelled "Close"); its content rendered only while open, so each opening fetches anew; the header and body an exported component of their own (`CodeSidebarView`), which the tests render on the server, as `OverlayDrawer` renders nothing there (its portal). The width is `clamp(min(400px, 100vw), 66vw, min(1200px, 100vw))` from constants (_`D476`_ (SPEC-S10-presentation.md)).
- _`D482`_ (`live`; the design, as _`D481`_): **The code pane**: `CodePaneState` is `'hidden' | 'half' | 'sidebar'`, `getNextCodePaneState()` cycles hidden → half → sidebar → hidden; in `sidebar`, the block lays out as hidden, without the cycling button, and `CodeSidebar` is open with the showcase's tabs from the selected tab (_`D479`_), closing to hidden (_`D477`_ (SPEC-S10-presentation.md)); the full state's styles and the showcase frame's `inert` go. Half, side by side or stacked, is unchanged.

## Steps

1. **The code sidebar**: move `src/app/file-modal/` to `src/app/code-sidebar/` (`git mv`, _`D478`_); replace the modal with `getSidebarView()`, `CodeSidebarView` and `CodeSidebar` (_`D481`_); `src/app/markdown/` opens it.
2. **The code pane**: the `sidebar` state (_`D482`_, _`D480`_).
3. **Tests**: `src/app/code-sidebar/index.test.tsx` (moved; `getSidebarView()`, `CodeSidebarView`'s header and body on the server: the cut title with its path as a tooltip, the tab list in its place, the link and the × button; the content tests kept); `src/app/code-pane/index.test.tsx` (the cycle, the labels, no cycling button and the pane hidden in `sidebar`; the full state's assertions removed with it, listed at the checkpoint); `src/app/markdown/`, `src/vite/` and `src/cli/serve/` tests naming the modal or loading `file-modal/index.js`.
4. **Documentation**: `README.md` (the code pane's states, linked files opening in the code sidebar, the syntax cheat-sheet's "modal"); `AGENTS.md` (Layout, Testing's code pane and linked files paragraphs, the gotchas naming the modal); `CONTRIBUTE.md` (the Glossary: Code sidebar added; Linked showcase, Included file and Code pane reworded (_`D474`_); the project structure); Markdown formatted as the workflow says.
5. **Verification**: `npm run ci` green; the dogfood `serve` restarted after the build, for the user's browser check: a linked file opening the code sidebar at 66% (clamped on a wide and a narrow window, the full width on a phone-sized one), a long name cut with "…", ESC, × and a backdrop click each closing it, "Open in a new tab" in the header, long content scrolling, an inline linked showcase's tabs in the header, and a code pane cycling hidden → half → sidebar, its button gone while the code sidebar is open, closing to hidden.

## Open points

- None yet.

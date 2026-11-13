# _`P10.4`_ The code pane

draft

## Goals

_`D352`_–_`D356`_, _`D362`_, _`D372`_, _`D373`_ and _`D376`_ (SPEC-S10-presentation.md): the code pane beside code block showcases and linked showcases shown as blocks, with its three states, side by side or stacked, its tabs; blocks replacing their fence or paragraph; the modal's tabs for a linked showcase shown inline; what the shown host information gains for them (_`O62`_, _`D394`_ (PLAN-P10.3-keys.md)); then `README.md`'s sections on `block` and `include=` (_`D398`_ (PLAN-P10.3-keys.md)), the cheat-sheet (_`D370`_) and this repository's own documentation following the new presentation (_`D381`_). Takes _`O62`_, _`O63`_, _`O64`_ (the modal's tabs), _`O65`_, _`O67`_ (PLAN-P10-presentation.md), _`K17`_ and _`K18`_ (SPEC-pitfalls.md).

Its steps and remaining choices are not planned yet: only the spike's conclusions are recorded so far.

## Decisions

- _`D403`_ (`live`; resolves _`K17`_ and _`K18`_ (SPEC-pitfalls.md) for the layout; _`D385`_'s spike (PLAN-P10-presentation.md), the user: "Works, use it"): **The code pane's layout is CSS alone, around an iframe that never moves**: the block is a CSS container (`container-type: inline-size`) holding a grid with the showcase frame and the code pane; the three states only change the grid's template (half: two columns; hidden: the frame alone, the code pane not displayed; full: the code pane in the frame's cell, over it, the frame `inert`), so the iframe is never moved in the React tree, and never reloads; a container query (`@container (max-width: …)`) stacks the code pane below the frame when the documentation column is narrow, with no script reading a width (`AGENTS.md` › the narrow layout is switched by CSS alone). The frame keeps its own height (`align-self: start`: never stretched to the row); side by side the code pane never sizes the row (`contain: size`), filling the row the frame or the minimum sets, and scrolling; stacked, and at full, it takes its content's height between the minimum and the maximum.
  - Evidence: Spike 2026-11-13 (`./.workflow/.temp/spike-code-pane/`, a static page and a frame page reporting its height as the frame script does, with its growth guard), checked by the user in a browser and measured with Playwright (Chromium): through every state change and column width the frame loaded once, and its own state (a click counter) was kept; side by side, a 150 px frame sat in a row of the minimum (8 lines), unstretched; full capped the code at the maximum (24 lines), scrolling; below a 640 px column the code pane stacked under the frame; a frame sized to its viewport (`100vh`) grew a few steps until the existing guard (`MAX_REPEATED_GROWTHS`) stopped it, unstretched by the code pane, which followed its height side by side. The numbers (8 and 24 lines, 640 px) were the spike's, not yet decided (_`O63`_). Griffel's support of `@container` and `contain` in `makeStyles` is still to confirm in the showroom (_`K17`_'s note: `@griffel/core` 1.21.4 handles `@container` rules).

## Open points

- [ ] _`O62`_ (SPEC-S10-presentation.md) What the shown host information gains for the code pane (_`D394`_ (PLAN-P10.3-keys.md)).
- [ ] _`O63`_ (SPEC-S10-presentation.md) The code pane's minimum and maximum number of lines, and the column width at which it stacks.
- [ ] _`O64`_ (SPEC-S10-presentation.md) The modal's tabs (the link knowing its showcase, by its offset; a tabbed `LinkedFileDialog`).
- [ ] _`O65`_ (SPEC-S10-presentation.md) The tests and documentation of this segment.
- [ ] _`O67`_ (PLAN-P10-presentation.md) A changed included file that no showcase frame uses leaves a tab stale in `serve`.

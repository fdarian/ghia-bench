# Mailbox app spec

Contract that all five apps (Electron, Ghia, raw GPUI, SwiftUI, MyGo) implement. Apps contain no benchmark code; all measurement is external.

Light theme only. System UI font (SF Pro) everywhere: CSS `system-ui`, gpui `.SystemUIFont`, Ghia default.

## Window

Content area 1280x800 pt (excluding a standard macOS title bar), top-left of the window frame at screen (100, 100) on the main display, title "Mailbox", resizable, opaque. The app activates and takes focus on launch. The search input is focused on launch.

## Data

At startup the app reads `messages.json` from its bundle Resources and parses it (Electron: renderer `fetch('./messages.json')` relative to index.html; Ghia: read + `JSON.parse`; GPUI: `serde_json`). 10,000 messages, newest first. Each message has:

- `id`
- `fromName`
- `fromEmail`
- `subject`
- `snippet`: first ~140 chars of the body
- `body`: array of paragraphs
- `time`: preformatted short, e.g. "14:22" or "Nov 3"
- `dateLong`: preformatted, e.g. "Thursday, November 5, 2026 at 14:22"
- `unread`: bool
- `labels`: 0-2 of 8 label ids

At load, build per message a lowercase haystack = `fromName + " " + subject + " " + snippet`.

Generator (`data/generate.ts`): seed 42, mulberry32; vocabulary of ~300 English words that includes "quarterly" and "report" such that the query "quarterly report" typed char by char narrows from thousands to a few dozen results; 30% unread; 3-8 paragraphs of 2-5 sentences; 200 distinct senders; dates descending from 2026-11-05.

## Layout

Content coordinates, origin top-left, all sizes pt.

### Sidebar: x 0-220, full height

Bg #F4F4F5, 1px right border #E4E4E7.

- "Mailbox" 15px semibold #18181B, row y 0-48, padding-left 16, vertically centered.
- Folders from y 56: Inbox, Starred, Sent, Drafts, Archive, Spam, Trash. Each row 32 tall, inset 8px each side (so 204 wide), radius 6, padding-x 8; name 13px #27272A left; count 12px #71717A right (Inbox = unread count of all messages; others fixed: 24, 128, 3, 2048, 12, 0 shown as empty).
  - Every number shown in the UI uses a thousands separator, folder counts included (Archive shows "2,048").
  - Inbox selected: bg #E4E4E7.
  - Hover on others: bg #EBEBED.
- 16px gap, "LABELS" 11px semibold #A1A1AA, letter-spacing 0.5, row height 24, padding-left 16.
- 8 labels, rows 28 tall, inset 8, padding-x 8: 8px circle in label colour, 8px gap, name 13px #3F3F46. Static (no click behaviour needed).

  | Label | Colour |
  | --- | --- |
  | Work | #2563EB |
  | Personal | #16A34A |
  | Finance | #CA8A04 |
  | Travel | #9333EA |
  | Family | #DB2777 |
  | Receipts | #EA580C |
  | Newsletters | #0891B2 |
  | Projects | #4F46E5 |

### List column: x 220-640 (420 wide)

Bg #FFFFFF, 1px right border #E4E4E7.

- Search area y 0-56: input at (12, 12) size 396x32, radius 8, bg #F4F4F5, 1px border #E4E4E7, padding-x 10, text 13px #18181B, placeholder "Search mail" #A1A1AA. Focused border #2563EB.
  - Caret: 1px wide, #18181B, the full line height. Only while the input is focused. Solid during edits and caret moves; after 500 ms without either it blinks 500 ms off / 500 ms on, indefinitely.
- Count line y 56-84: "{n} conversations" (n formatted with thousands separator), 12px #71717A, padding-left 16.
- List y 84-800 (716 tall), vertical scroll, virtualized, rows exactly 72 tall:
  - Bottom 1px separator #F4F4F5 inside the 72.
  - Unread: 8px circle #2563EB centred at row (8, 21).
  - Avatar: 36px circle at (16, 12), bg = AVATAR[hash(fromName) % 8], initials (first letter of first two words) 13px semibold #FFFFFF centred.
    - AVATAR = #F87171 #FB923C #FBBF24 #34D399 #22D3EE #60A5FA #A78BFA #F472B6.
    - hash = sum of UTF-16 code units of fromName (simple, identical in all five).
  - Text column from x 64 to row width - 16:
    - line 1 y 12-30: fromName 13px, semibold #18181B if unread else medium #3F3F46; time 12px #71717A right-aligned.
    - line 2 y 30-48: subject 13px #27272A, one line, ellipsis.
    - line 3 y 48-64: snippet 12px #71717A, one line, ellipsis.
  - Hover bg #F4F4F5; selected bg #DBEAFE (selected wins over hover).
  - Click selects the row.
  - Scrollbar: see "Scrollbars" below.

### Detail pane: x 640-1280 (640 wide)

Bg #FFFFFF, vertical scroll, padding 32 all sides.

- Subject 22px semibold #18181B, line-height 28, wraps.
- 16px gap; sender row 40 tall: 40px avatar (same colour/initials rule, initials 15px), 12px gap, column: fromName 14px semibold #18181B, fromEmail 13px #71717A; dateLong 12px #71717A right-aligned, top.
- 24px gap; body paragraphs 14px #27272A line-height 22, 14px between paragraphs, wrap at 576 width.
- No selection (empty filter result): "No message selected" 14px #A1A1AA centred in the pane.

### Scrollbars

Both scroll areas (the list and the detail pane) show an overlay scrollbar on their right edge while scrolling and for about 1 s after the last scroll, then hide it. Use the framework's own scrollbar where it has one (Chromium, Ghia, SwiftUI, MyGo). Raw GPUI has none built in, so the app draws one the way Zed does: a 6px-wide rounded thumb, #000000 at 35% opacity, inset 2px from the right edge, height proportional to viewport/content (at least 25px, as in Zed), shown on scroll and hidden by a timer 1 s after the last scroll.

## Behaviour

- Filter: on every input change, query = value.trim().toLowerCase(); empty -> all messages; else the messages whose haystack contains query (substring). Synchronous, no debounce.
- On filter change: selection = first result (or none), list scrolled to top, detail scrolled to top.
- ArrowDown / ArrowUp (while search input focused): move selection +-1 (clamped), scroll the list so the selected row is fully visible (minimal scroll), detail scrolled to top. Must not move the text caret.
- Escape: clear the search.
- Selected on launch: first message (detail shows it on the first frame).

## Parity notes

- Scrollbars: on macOS the frameworks with native scrollbars (Chromium, SwiftUI) follow System Settings > Appearance > "Show scroll bars" (`AppleShowScrollBars`; the harness records it in env.json and report.md). With "Automatic" and no mouse attached they are overlays shown while scrolling; with a mouse attached (or "Always") they show classic always-visible bars.
- MyGo: its scroll containers and lists show their thumb (6 DIP, black 32%) only while the pointer is over the container or a thumb is dragged (`Scrollbars`/`KeepScrollbars` default; the app leaves them at the default), not after a scroll, so keyboard-driven scrolling with the pointer elsewhere shows no bar and the bar does not linger for 1 s.
- Electron: `fetch('./messages.json')` is async, so `ready-to-show` can fire before the list and detail are filled (a few ms later); the sidebar, search input and empty list column are painted first. `app.focus({ steal: true })` is requested per the spec, but macOS may still decline activation when the process is spawned from a background process (observed: another app stayed frontmost).
- Ghia: `letter-spacing: 0.5` on "LABELS" is not applied: `letterSpacing` is not in Ghia's `StyleDesc` for HTML text (only SVG text has it), so the heading is drawn without tracking (a few px narrower).
- Ghia: `<virtual-list>` runs in `itemCount` mode (documented windowing): 60 rows are mounted around `onVisibleRange.startIndex` (native builds viewport + 512 px overdraw, about 24 rows). `scrollToItem` top-aligns a row, so selection-into-view uses `scrollTo` against the fixed 72 px rows to get the SPEC's minimal scroll.
- GPUI: `letter-spacing: 0.5` on "LABELS" is not applied: gpui's `TextStyle` has no letter spacing, so the heading is drawn without tracking.
- GPUI: SPEC gives no line heights for the sender column, so the app uses 18 (13px lines), 16 (12px lines), 20/20 (sender name 14px / email 13px, column centred in the 40px row), and 16 (`dateLong`, top-aligned). Other apps should match these where they differ from their defaults.
- MyGo: native UI (package `ui`, `ui.List` virtualized, `ui.TextInputBase`, `ListState.ScrollTo`/`ScrollIntoView`). The input's caret is MyGo's own: 1 DIP wide, blinks 530 ms on / 530 ms off (not 500/500), and is visible from every edit or caret move but starts blinking 530 ms later (no separate 500 ms solid hold); its colour is the theme accent, set to #18181B. The window theme is forced light.
- MyGo: `letter-spacing: 0.5` on "LABELS" is applied (`LetterSpacing`). Line heights follow the GPUI note (`FixedLineHeight`).
- MyGo: message rows use `KeepFocus`, so a click selects the row and the search input keeps the keyboard focus (Electron blurs the input on a row click).
- MyGo: the .app is made by `go tool mygo build` (ad-hoc signed, default icon-less bundle, `messages.json` copied from `data/` through the `resources` config); the window is opened with `UseContentSize` 1280x800 at (100, 100).
- SwiftUI: the list is `List` (`.plain`, NSTableView-backed, recycled rows) with zero row insets and custom row backgrounds; it needs `listRowInsets` of -8 on both sides because macOS 26's plain `List` otherwise insets rows 8 pt from the column edges. `ScrollViewReader.scrollTo(id)` without an anchor gives the minimal selection-into-view scroll (checked: 30 ArrowDown from the top leaves the viewport scrolled 1516 = 31 x 72 - 716).
- SwiftUI: SwiftUI gives its window a full-size content view, so the frame is 1280x828 and the SwiftUI layout area (below the 28 pt title bar) is 1280x800, matching the spec's content area; the app sizes the window until `contentLayoutRect` is 1280x800.
- SwiftUI: line heights (`lineHeight(_:size:)`) are the natural font line height topped up with `lineSpacing` plus half of it above the first line, since SwiftUI has no exact line height before macOS 26; glyph positions can differ from CSS by up to 1 pt (subject 1.3 pt higher than Electron, body 0.6 pt).
- SwiftUI: the caret is the native NSTextField insertion point (1 pt wide, system blink); its period was not measured and its tint is set to #18181B with `.tint`.
- SwiftUI: the search text starts 1 pt further right (`padding(.leading, 11)`) to land where the other apps put it, because with symmetric 10 pt padding a plain `TextField` text landed 1 pt left of the Electron reference.
- SwiftUI: the type-phase cost is about 85% Swift's `String.contains` (grapheme-aware, Foundation-backed) in the filter, not SwiftUI rendering; the other apps' standard substring searches are byte-level. The app keeps the idiomatic call.

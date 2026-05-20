# Writer OS Design System — Locked Interface

**Status:** locked at PR-merge time for issue #42.

**Version:** 0.1

**Source artifacts:** [`writer-os-minimal-design-system-style-guide.md`](ui%20style%20guide/writer-os-minimal-design-system-style-guide.md) and [`writer-os-ui-minimal.html`](ui%20style%20guide/writer-os-ui-minimal.html).

## Responsibility

The design system is the code-mappable contract for Writer OS visual structure. Screens compose
tokens and primitives from this interface instead of introducing ad-hoc colors, fonts, spacing,
state treatments, or navigation controls.

This interface locks the foundation only. It does not reskin existing screens.

## Cross-Language Naming

Token names are defined here in compact form (`ink2`, `pageMuted`, `hairline2`). Implementations use language-idiomatic casing:

| Surface | Form | Example |
|---|---|---|
| This spec | compact / camelCase | `pageMuted` |
| Swift (`apps/ios/WriterOS/DesignSystem/`) | identical to spec | `Tokens.pageMuted` |
| CSS (`apps/web/css/tokens.css`) | kebab-case | `--page-muted` |

Names are **semantically identical** across surfaces — the divergence is purely casing convention. When adding a token, extend this table and both implementations in a paired PR.

## Color Tokens

Color is semantic. Use it sparingly and only to clarify state.

### Light Tone

| Token | Value | Responsibility |
|---|---:|---|
| `ground` | `#fbfaf6` | App background outside the page surface. |
| `page` | `#fffffb` | Primary page surface. |
| `pageMuted` | `#f4f1e8` | Muted selected fills and quiet surface emphasis. |
| `ink` | `#171512` | Primary text and major conceptual rules. |
| `ink2` | `#49443b` | Body/supporting text. |
| `ink3` | `#858072` | Quiet metadata, inactive navigation, inactive state. |
| `hairline` | `#d9d3c5` | Normal separators. |
| `hairline2` | `#ece7db` | Subtle rail/nav/background separators. |
| `active` | `#7d3b25` | Current work / primary focus. |
| `ready` | `#50684e` | Settled / reviewed / safe to proceed. |
| `source` | `#3c6672` | Source / reference material. |
| `open` | `#9a741c` | Unresolved question / tension. |
| `shadow` | `rgba(42, 34, 22, 0.08)` | Device/prototype shadow only. |

### Night Tone

| Token | Value | Responsibility |
|---|---:|---|
| `ground` | `#11110f` | App background outside the page surface. |
| `page` | `#191916` | Primary page surface. |
| `pageMuted` | `#202018` | Muted selected fills and quiet surface emphasis. |
| `ink` | `#f3ecdc` | Primary text and major conceptual rules. |
| `ink2` | `#cfc4ac` | Body/supporting text. |
| `ink3` | `#8f856f` | Quiet metadata, inactive navigation, inactive state. |
| `hairline` | `#454131` | Normal separators. |
| `hairline2` | `#2d2b22` | Subtle rail/nav/background separators. |
| `active` | `#cc8063` | Current work / primary focus. |
| `ready` | `#aab894` | Settled / reviewed / safe to proceed. |
| `source` | `#9bbbc2` | Source / reference material. |
| `open` | `#d0ab4a` | Unresolved question / tension. |
| `shadow` | `rgba(0, 0, 0, 0.24)` | Device/prototype shadow only. |

## Typography Tokens

Typography is the main design material.

| Role | Size | Line Height | Weight | Typeface | Constraints |
|---|---:|---:|---:|---|---|
| Page title | `43-48px` | `0.92` | `500` | Serif | Screen-level concepts only. |
| Section heading | `28px` | `1.03` | `500` | Serif | Article/source section headings. |
| Row title | `19px` | `1.12` | `500` | Serif | Quiet list items. |
| Primary question | `25-26px` | `1.17` | `400` | Serif | One per Today page. |
| Body | `16px` | `1.45` | `400` | Serif | Main reading text. |
| Supporting body | `14.5px` | `1.35-1.45` | `400` | Serif | Row descriptions. |
| Metadata | `9-10px` | `1.0-1.55` | `700-800` | Mono | Uppercase and tracked. |

### Font Roles

| Token | Stack |
|---|---|
| `serif` | `"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif` |
| `mono` | `"SF Mono", "IBM Plex Mono", "JetBrains Mono", Menlo, monospace` |

### Typography Rules

- Do not use negative letter spacing.
- Do not scale font size fluidly with viewport width inside the mobile app surface.
- Keep metadata uppercase and tracked, but short.
- Avoid overusing bold; hierarchy comes from scale, rule weight, and placement.
- Treat large type as expensive.

## Spacing And Layout Tokens

### Mobile Shell

| Token | Value | Responsibility |
|---|---:|---|
| `leftRail` | `54-70px` | Narrow left rail. Prototype content padding uses `70px`. |
| `rightPadding` | `26px` | Mobile page right padding. |
| `topPadding` | `20px` | Mobile page top padding below chrome. |
| `bottomPadding` | `26px` | Page padding above bottom-nav safe area. |
| `contentMeasure` | `290px` | Primary reading measure. |
| `bottomNavHeight` | `72px` | Minimum navigation height. |
| `topChromeHeight` | `42px` | Prototype top chrome height. |
| `modeSwitchHeight` | `42px` | Minimum Walk/Desk button height. |

### Spacing Scale

| Token | Value | Use |
|---|---:|---|
| `space1` | `5px` | Tight label/title relationships. |
| `space2` | `10px` | Metadata group spacing. |
| `space3` | `15-16px` | Row padding. |
| `space4` | `18-20px` | Section rhythm. |
| `space5` | `26-28px` | Primary blocks. |
| `space6` | `32-38px` | Major screen separation. |
| `space7` | `44px+` | Desktop board sections. |

## Rule Weights

All locked rule weights are `1px`.

| Rule | Color Token | Use |
|---|---|---|
| `ink` | `ink` | Major conceptual boundaries. |
| `hairline` | `hairline` | Normal separation. |
| `hairline2` | `hairline2` | Subtle nav and background rail lines. |

## State Grammar

Writer OS state is annotated, not badged.

```ts
type WriterState = "active" | "ready" | "source" | "open" | "inactive";
```

| State | Color Token | Meaning |
|---|---|---|
| `active` | `active` | Current work / primary focus. |
| `ready` | `ready` | Settled / reviewed / safe to proceed. |
| `source` | `source` | Source / reference material. |
| `open` | `open` | Unresolved question / tension. |
| `inactive` | `ink3` | Quiet metadata, inactive navigation, inactive state. |

State color is never the only indicator. Pair it with a short text label.

## Motion

The only locked motion is a view-settle transition:

- opacity fade: `220ms ease`
- vertical settle: `translateY(8px)` to `0`

iOS implementations must respect reduced motion with `UIAccessibility.isReduceMotionEnabled`.
Reduced-motion mode removes the vertical settle and disables the animation duration.

Motion beyond this fade is out of scope for this interface.

## Primitive Specs

### `PageShell`

Full-screen page container.

Required inputs:

- `pageMark: String?`
- `content`
- optional bottom safe-area content, normally `BottomNav`

Visual constraints:

- page background uses `page`
- content padding is `20px` top, `26px` right, `26px` bottom, `70px` left
- primary content measure is `290px`
- includes the narrow left rail and optional vertical page mark
- reserves the bottom navigation safe area when bottom content is supplied

### `PageRail`

Narrow left margin rail with optional vertical page mark.

Required inputs:

- `mark: String?`

Visual constraints:

- rail width is `70px`
- subtle vertical divider uses `hairline2`
- mark uses mono uppercase metadata styling, `9px`, tracked

### `Hairline`

One-pixel rule.

Required inputs:

- `weight: WriterRuleWeight`
- `axis: horizontal | vertical`

Visual constraints:

- `ink` uses `ink`
- `hairline` uses `hairline`
- `hairline2` uses `hairline2`
- no other stroke weights are part of this interface

### `StateDot`

Small state marker for lists.

Required inputs:

- `state: WriterState`

Visual constraints:

- size is `6px` by `6px`
- shape is circular
- color comes from `WriterState`

### `StateLabel`

Short mono state label.

Required inputs:

- `text: String`
- `state: WriterState`

Visual constraints:

- mono uppercase
- `9px`
- weight `800`
- letter spacing `0.12em`
- text must be short

### `QuietRow`

Measured signal row for active signals, blockers, next work, and article/source state.

Required inputs:

- `state: WriterState`
- `label: String`
- `title: String`
- `body: String`

Visual constraints:

- left state dot sits outside the content column by `17px`
- row padding is `15px` top and bottom
- separator uses `hairline`
- row title uses serif `19px` / `1.12`
- body uses supporting serif `14.5px`
- body is one sentence

### `PrimaryQuestion`

The one live thought that should carry a walk.

Required inputs:

- `question: String`

Visual constraints:

- one per screen
- serif `25-26px` / `1.17`
- bounded by top and bottom `ink` rules
- padding is `26px` top and `28px` bottom
- no icon and no assistant attribution

### `WorkIndex`

Ordered reading index for Desk mode.

Required inputs:

- ordered items with `number`, `title`, and `state`

Visual constraints:

- index is a reading order, not a task list
- top boundary uses `ink`
- each row has number, sentence-length item, and short state mark
- row grid follows `38px 1fr auto`
- row padding is `16px` top and bottom

### `DocumentWeather`

Terse article/source condition strip.

Required inputs:

- cells with `label`, `value`, and `state`

Visual constraints:

- four cells in the canonical article pattern
- top/bottom boundary uses `hairline`
- labels use mono uppercase `9px`
- values are `1-2` words
- cell minimum height is `58px`

### `SourceNote`

Source excerpt or raw-material marginalia.

Required inputs:

- `sourceLabel: String`
- `state: WriterState`
- `quote: String`
- `context: String`

Visual constraints:

- top boundary uses `hairline`, or `ink` for the first note in a sequence
- source label uses `StateLabel`
- quote uses serif `21px` / `1.24`
- context uses supporting text, one sentence

### `BottomNav`

Bottom text rail.

Required inputs:

- exactly the current tab labels: `Today`, `Walk`, `Close`, `Article`, `Source`, `System`
- active tab
- selection action

Visual constraints:

- six items maximum
- equal-width tabs
- height is at least `72px`
- mono uppercase `9px`, weight `800`
- active tab uses `pageMuted` fill and `ink` text
- inactive tabs use `ink3`
- no icons unless usability testing proves text-only is failing

### `ModeSwitch`

Walk/Desk toggle.

Required inputs:

- selected mode: `walk | desk`
- selection action

Visual constraints:

- two equal-width buttons
- minimum height is `42px`
- mono uppercase `9px`, weight `800`
- active mode uses `pageMuted` fill and `ink` text
- inactive mode uses `ink3`

## What This Interface Hides

- iOS-specific color plumbing, including `UITraitCollection.userInterfaceStyle`.
- Typeface availability checks and platform fallback selection.
- Snapshot-rendering mechanics for primitive tests.
- Primitive layout implementation details that do not alter the locked visual constraints.

## What This Interface Does Not Do

- It does not reskin existing screens.
- It does not introduce a web component implementation.
- It does not add icons, asset-catalog symbols, gradients, or decorative frames.
- It does not define motion beyond the single view-settle fade.

## Acceptance Checklist

Before shipping a screen, verify:

- The screen can be understood in under five seconds.
- The page has one dominant thought.
- The UI does not look like chat.
- The UI does not look like a dashboard.
- Color is only used for state.
- Body copy remains readable in light and night modes.
- State is communicated by text plus color, not color alone.
- The writer is not asked to manage more than the current surface needs.
- The screen still works if all decorative cues are removed.

## Deferred

- Reskinning existing views.
- Web tokens/components.
- Motion beyond the specified `220ms` fade.
- Asset catalog support for future symbol replacements.

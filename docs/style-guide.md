# Style Guide

Canonical reference for design tokens — colors, typography, radii, borders, spacing, elevation. Values mirror the client CSS / Figma. Where the two differ, see **Task 6** in [TODO.md](./TODO.md).

## Colors

Colours live as a Figma **variable collection (`Colours`) with Light and Dark modes**. Every fill and stroke in the file is bound to a token — no raw hex. Switching a section's mode is what produces dark mode; there is no separate palette to maintain.

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `background/page` | `#F0F0F0` | `#000000` | App canvas behind every page |
| `background/surface` | `#FFFFFF` | `#161616` | Header, cards, inputs, popups |
| `text/primary` | `#4B4B4B` | `#F0F0F0` | Primary UI text, nav labels, icon strokes |
| `text/secondary` | `#8E8E8E` | `#A8A8A8` | Counts, comment metadata, follower lines |
| `text/muted` | `#B5B5B5` | `#6E6E6E` | Placeholder text, input borders |
| `border/card` | `#DBDBDB` | `#2A2A2A` | 1px border on cards sitting on the page |
| `border/divider` | `#C0C0C0` | `#333333` | Header bottom border, profile divider |
| `border/inset` | `#E4E4E4` | `#2A2A2A` | Dividers inside cards |
| `brand/red` | `#F64D4D` | `#F64D4D` | Identity and interactive accents — unchanged in dark |
| `feedback/error` | `#C62828` | `#FF6B6B` | Validation messages and the border of an input in error |
| `static/white` | `#FFFFFF` | `#FFFFFF` | Content **on** a colour or photo — button labels, tile hover counts |
| `avatar/placeholder-disc` | `#E8E8E8` | `#2A2A2A` | No-profile-picture disc |
| `avatar/placeholder-figure` | `#9A9A9A` | `#5A5A5A` | No-profile-picture silhouette |

**Rule:** brand red is reserved for identity and interactive/active accents — never body text.

**Why errors get their own red.** `brand/red` measures 3.45:1 on `#FFFFFF` and 3.03:1 on `#F0F0F0` — large-text only, below AA for a 15px message. `feedback/error` light is 5.62:1 on surface and 4.93:1 on page; dark is 6.52:1 on `#161616`. Not yet added to the Figma `Colours` collection.

**`static/white` matters.** White does two jobs: the surface of a card, and the colour of content sitting on a photo or the red button. Only the first should darken. Binding both to `background/surface` turns button labels and hover counts near-black in dark mode.

**Story viewer chrome is deliberately untokenised** — progress bars, poster name and close icon are fixed white because they always sit over a photograph and shouldn't change with the mode.

### Contrast

Measured against `background/page`:

| | Light | Dark |
|---|---|---|
| `text/primary` | ≈ **7.7:1** — AA and AAA | very high |
| `text/secondary` | ≈ **2.9:1** — below AA | ≈ **8:1** |
| `text/muted` | ≈ **1.8:1** | low |

`text/secondary` fails AA in light mode, so use it only for small incidental counts, never body text. Dark mode is the more accessible of the two. `text/muted` is for placeholders and borders only, never content.

## Typography

- **Pacifico** (Regular) — logo wordmark only. 26px header, 22px mobile header.
- **Mada** — all UI text. Regular for body, inputs and headings; Bold for nav labels, usernames, counts.

| Role | Size | Weight |
|------|------|--------|
| Card / popup heading | 26 | Regular |
| Profile username (desktop, tablet) | 20 | Bold |
| Profile username (mobile) | 16 | Bold |
| Auth nav links (Log in / Sign up) | 18 | Bold |
| Body, comments, captions, stats | 15 | Regular |
| Usernames, counts, Post action | 15 | Bold |
| Input placeholder, add-a-comment | 16 | Regular |
| Search placeholder | 14–15 | Regular |
| Reply body | 14 | Regular |
| Comment metadata | 13 | Bold |
| Nav icon label, reply metadata | 12 | Bold |

Replies sit one step below comments (15→14 body, 13→12 metadata); colour stays `#8E8E8E` for both, so size alone carries the nesting.

## Corner Radii

- Inputs, cards, popups, image chooser: 12px
- Buttons: pill (20px radius on 40px height)
- Search box: pill (17px radius on 34px height)
- Bottom sheets (mobile): 16px top corners only

## Borders & Dividers

- Card border: 1px `#DBDBDB` — cards sitting on the page
- Modal border: **none** — the 50% black scrim provides the separation
- Input border: 1px `#B5B5B5`
- Header bottom border: 1px `#C0C0C0`
- Profile header divider: 1px `#C0C0C0`, 32px above / 24px below, flush with the grid
- Inset dividers inside cards: 1px `#E4E4E4`
- Active nav underline: 2px `#F64D4D`, flush to the bar's bottom edge

## Spacing

**Header (optical gaps, measured label edge to label edge):**

| | Within a group | Between groups | Right margin |
|---|---|---|---|
| Desktop | 36 | 56 | 40 |
| Tablet | 22 (nav) / 24 (auth) | 40 | 40 |

Raw `itemSpacing` differs from these where items carry internal padding — always measure optically.

**Content widths:** desktop grids 900 · desktop feed column 500 · tablet grids 720 · mobile grids full-bleed.

**Post grids:** 292px square tiles with 12px gaps (desktop) · 232/12 (tablet) · 128.67/2 full-bleed (mobile).

**Figma canvas:** 200px between frames in a column · 400px between sections · 80px section padding.

## Elevation / Shadows

- Cards use a 1px border, not a shadow.
- Anchored overlays (account menu, search dropdown): white, 12px radius, 1px `#B5B5B5`, drop shadow `0 4 12` at 12% black. Both sit flush under the header and align to the control that opens them.
- Modal scrim: black at 50%.

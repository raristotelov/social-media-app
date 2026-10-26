# App Icon

Status: Complete

Favicon and home-screen icon (#45). Tokens: [style-guide.md](../style-guide.md).

## Design

- White filled camera (`static/white`, red lens) on a `brand/red` square. No letters or name, since the app name isn't settled.
- Two shapes:
  - Rounded: 28/128 corner radius, for the browser tab.
  - Full-bleed: square corners, for home screens. The OS applies its own mask, and the camera sits inside the 80% safe zone.

## Files (`client/public/`)

| File | Shape | Sizes | Used by |
| --- | --- | --- | --- |
| `favicon.ico` | Rounded | 16, 32, 48 | `<link rel="icon">` |
| `logo192.png` | Full-bleed | 192 | `<link rel="apple-touch-icon">`, manifest |
| `logo512.png` | Full-bleed | 512 | manifest |

- `manifest.json` `icons` lists all three with their sizes and types. The two PNGs are `"purpose": "any maskable"`.
- Every file linked from `index.html` and the manifest loads without a 404.
- Legible on light and dark browser tab bars.

## Figma frames

Base: `https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=<id>` (`:` → `-`).

| Frame | Node |
| --- | --- |
| `App Icon` set (Components page) | [689:3203](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=689-3203) |
| Shape=Rounded / Shape=Full-bleed | [687:3250](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=687-3250) / [689:3198](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=689-3198) |
| Tab bar previews, light / dark | [687:3256](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=687-3256) / [687:3269](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=687-3269) |

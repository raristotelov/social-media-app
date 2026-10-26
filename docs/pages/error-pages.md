# Error Pages

Status: In Development

404 and "Something went wrong" pages (#29). Look based on the full-page load error ([error-handling.md](../error-handling.md)). Tokens: [style-guide.md](../style-guide.md). File layout and breakpoints: [design-system.md](../design-system.md).

## 404 — Page not found

- Shown for any URL that matches no route, and on `/user/:userId` (and `/user/:userId/posts`) when the id is unknown or malformed (`USER_NOT_FOUND`).
- The URL stays as typed; no redirect.
- Inside the normal chrome: header on desktop / tablet, top bar (Search) and tab bar on mobile. Guests and members get their own chrome.
- Centred in the space under the header: heading "Page not found", line "This link may be broken, or the page may have been removed.", primary button "Go home".
- The line wraps and stays centred on narrow screens.

## Something went wrong

- Shown when a render error reaches the app's error boundary.
- Full screen, no header or tab bar: the logo alone, at the header's logo position for each breakpoint.
- Centred: 56px alert icon in `feedback/error`, heading "Something went wrong", line "Try reloading the page.", primary "Reload" and secondary "Go home" side by side, 16px apart.
- Reload reloads the current page. Go home loads `/` fresh.

## Both

- "Go home" goes to `/`, which sends members to the feed and guests to Popular.
- Heading 26px, line 15px, both `text/primary`, as the load error.

## Figma frames

Base: `https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=<id>` (`:` → `-`). Each cell: light / dark.

| Frame | Desktop | Tablet | Mobile |
| --- | --- | --- | --- |
| Error View – 404 | [696:6875](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=696-6875) / [698:6898](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=698-6898) | [699:7045](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=699-7045) / [699:7090](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=699-7090) | [699:11219](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=699-11219) / [699:11262](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=699-11262) |
| Error View – Something Went Wrong | [696:6904](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=696-6904) / [698:6905](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=698-6905) | [699:7073](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=699-7073) / [699:7097](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=699-7097) | [699:11245](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=699-11245) / [699:11270](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=699-11270) |

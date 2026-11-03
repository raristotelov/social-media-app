# Demo Entry

Status: In Development

The "Try the demo" strip for guests (#17). Demo account behaviour: [demo-content/overview.md](../demo-content/overview.md#demo-accounts-17). Tokens: [style-guide.md](../style-guide.md). File layout and breakpoints: [design-system.md](../design-system.md).

## Strip

- Full-width bar above the header (desktop, tablet) or top bar (mobile), on every guest page. Scrolls away with the header.
- Copy: "Explore the app without signing up" (desktop, tablet), "Explore without signing up" (mobile), then a "Try the demo" button.
- Desktop and tablet: 48 high, content centred. Mobile: 44 high, content left-aligned with 16 padding.
- Below about 340px wide the mobile copy is hidden, leaving the button and ✕, down to the 300px floor.
- Colours: bar `text/primary`, copy and ✕ `background/surface`, button `brand/red` with `static/white` label. The bar is dark in light mode and light in dark mode.
- ✕ (20px, the toast close icon) 24 from the right (16 on mobile) hides the strip. It stays hidden for the rest of the browser tab's session (session storage), including reloads, and shows again in a new tab or visit.
- "Try the demo" creates the demo account and logs in straight away. While it works the button reads "Starting..." and is disabled, as Login does with "Submitting...".

## Demo account notice

- Logged-in demo visitors get the same strip in place of the guest one, on every page, with no button: "**You're using a demo account.** It and everything you post will be deleted within 24 hours." (desktop, tablet), "**Demo account** · deleted within 24 hours" (mobile).
- Same ✕ and session-storage behaviour as the guest strip.

## Figma frames

Base: `https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=<id>` (`:` → `-`). Each cell: light / dark.

| Frame | Desktop | Tablet | Mobile |
| --- | --- | --- | --- |
| Popular View – Guest – Demo Strip | [718:7141](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=718-7141) / [724:7006](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=724-7006) | [723:7135](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=723-7135) / [724:11188](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=724-11188) | [723:7172](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=723-7172) / [724:11225](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=724-11225) |
| Feed View – Demo Notice | [726:7018](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=726-7018) / [728:7283](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=728-7283) | [728:11741](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=728-11741) / [728:11879](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=728-11879) | [728:12015](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=728-12015) / [728:12153](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=728-12153) |

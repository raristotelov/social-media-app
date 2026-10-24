# Follow Suggestions

Status: Complete

Ticket #14. Suggestions of people to follow on the feed (`/user-feed`). Tokens: [style-guide.md](../style-guide.md). File layout and breakpoints: [design-system.md](../design-system.md).

## Scope

- No "See all" and no people-discovery screen.
- Also in #14: the app name comes from one client constant, `APP_NAME` (`client/src/constants/app.js`, "SocialMediaApp" for now). Files that can't import it (`index.html`, `manifest.json`) carry the name by hand.

## Where suggestions appear

| Placement | Breakpoint | Count |
| --- | --- | --- |
| Sidebar beside the feed | Desktop | 5 |
| Carousel inserted into the feed, side-scrolling | Tablet, mobile | 10 |
| List under the empty-feed message | All | 8 |

- Desktop sidebar: sits at the top beside the feed and scrolls away with the page (not sticky).

## Ranking

- Never yourself or anyone you already follow.
- Three groups:
  - **Mutual:** followed by people you follow, most mutual connections first.
  - **Most-followed:** most followers first.
  - **New:** joined in the last 30 days and has posted at least once.
- Mix per placement: sidebar 2 mutual / 2 most-followed / 1 new (new always last); carousel 4 / 4 / 2; empty feed 0 / 5 / 3 (no mutuals yet).
- If a group runs short, the next group fills its places.

## Reason line (under the username)

- Mutual: "Followed by X", or "Followed by X + N more". X is the most-followed of the people you follow who follow them.
- Most-followed: "Popular on {APP_NAME}".
- New: "New to {APP_NAME}".
- Carousel card: at most 2 lines, then "…".

## Following

- Follow takes effect immediately; the user leaves the list and the next suggestion fills the gap, so the list keeps its size.
- Following from the sidebar or carousel doesn't reload the feed; their posts show from the next visit.
- Follow fails: toast "Couldn't follow this user. Try again.", the button goes back to Follow. Unfollow (empty feed) fails: toast "Couldn't unfollow this user. Try again.". The profile's Follow / Unfollow button uses the same toasts.
- The photo and username open the user's profile.

## Loading and errors

- Sidebar and carousel are hidden until loaded, and stay hidden if loading fails — no error shown.
- Empty feed: if the list fails to load, only the message shows.

## Carousel (tablet / mobile)

- Shown once, after the 5th post; with fewer than 5 posts, after the last post.
- Hidden when there are no suggestions.
- ✕ beside the "Suggested for you" heading dismisses the carousel for 7 days, stored on the server against the account (all devices).
- If saving the dismissal fails, the carousel still hides, with no error, and returns on the next visit.

## Empty feed

- Shown whenever the feed has no posts — following nobody, or only people who haven't posted.
- Message, the stories tray (only "Your story" when you follow nobody), and the list of 8. No sidebar or carousel on the empty feed (design).
- Following from the list keeps the list for that visit: the button turns into Unfollow (same style as the profile's Unfollow), tapping it again unfollows, and the followed user's posts appear below the list. The next visit shows the normal feed.

## Figma frames

Base: `https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=<id>` (`:` → `-`). Each cell: light / dark.

| Frame | Desktop | Tablet | Mobile |
| --- | --- | --- | --- |
| Feed View (sidebar / carousel) | [5:8](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=5-8) / [350:978](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=350-978) | [270:478](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=270-478) / [354:2909](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=354-2909) | [219:464](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=219-464) / [355:2510](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=355-2510) |
| Feed View – Empty | [324:833](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=324-833) / [350:1052](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=350-1052) | [335:1763](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=335-1763) / [354:2972](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=354-2972) | [334:1536](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=334-1536) / [355:2555](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=355-2555) |

Components: [Suggestions / Desktop](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=321-906), [Suggestions / 768](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=330-1211), [Suggestions / Mobile](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=330-1183), [Suggestions / Empty Feed](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=326-1141), [Suggestion Card](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=329-1161), [Suggested User](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=325-1084).

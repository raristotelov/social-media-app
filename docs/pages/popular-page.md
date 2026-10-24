# Popular Page

Status: In Development

Ticket #3. Popular posts (`/popular-posts`), open to guests and logged-in users. Tokens: [style-guide.md](../style-guide.md). File layout and breakpoints: [design-system.md](../design-system.md).

## Page

- Guests get the guest header (Log In / Sign up); logged-in users get the member header. The page is otherwise the same.
- Grid of 3 square tiles: a centred column on desktop and tablet, full-bleed on mobile (2px gutters). Design.
- Desktop / tablet: hovering a tile shows its likes and comments counts. Design.

## Ranking

- Score: `(likes + 2 × comments) / (hours since posting + 2)^1.5`, highest first (Hacker News style; weight 2 and exponent 1.5 are tunable).
- Logged in: your own posts and posts from people you follow are left out. Guests see every post.

## Loading

- 30 posts at a time; the next 30 load when scrolling near the bottom, in the grid and in the posts view.
- Loaded posts never move; the page changes only on reload.
- Each next batch sends the ids already shown (POST body) and gets the top 30 of the rest, ranked with the time the page opened as "now". Nothing repeats or is skipped; a post whose likes rose shows at the top of the next batch.

## Empty

- Message in place of the grid: "Nothing new to discover". Same look and position as the empty feed's title (no frame).

## Errors

- Grid fails to load: full-page error like the feed's, "Couldn't load popular posts / Check your connection and try again. / Retry".
- Next batch fails: inline under the last post, styled like the comments' inline error, "Couldn't load more posts · Try again"; loaded posts stay.
- Failed actions on a post (like, comment, follow): the feed's existing toasts.
- Copy recorded in [error-messages.md](../error-messages.md).

## Posts view

- Clicking a post opens the feed layout, like the profile posts view ([feed-page.md](./feed-page.md#profile-posts-view)): scrolled to the clicked post, the posts ranked above it above, those ranked below it below.
- Posts only: no stories tray, suggestions sidebar or carousel.
- Bar: back chevron, "Posts", "Popular" beneath.
- Following someone here changes nothing on the page; their posts leave popular on the next visit or refresh.
- Route: `/popular-posts/posts#<postId>`; the hash follows the scroll as on the profile.
- Refresh or shared link: opens on that post with a fresh ranking below it, nothing above. Back goes to the grid, which keeps the loaded posts (opened post first) rather than reloading.
- Shared link to a deleted post: opens the grid with the toast "This post no longer exists".

## Guests

- Same post cards as members. Like and comment send the guest to Log in, then back to the post.
- Member posts view: the guest frames with the member header and tab bar (no frame).

## Figma frames

Base: `https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=<id>` (`:` → `-`). Each cell: light / dark.

| Frame | Desktop | Tablet | Mobile |
| --- | --- | --- | --- |
| Popular View – Posts – Guest | [667:6561](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=667-6561) / [667:6608](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=667-6608) | [668:6731](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=668-6731) / [668:6778](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=668-6778) | [668:10857](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=668-10857) / [668:10934](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=668-10934) |
| Popular View – Guest | [121:154](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=121-154) / [350:1229](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=350-1229) | [269:478](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=269-478) / [354:2827](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=354-2827) | [207:464](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=207-464) / [355:2438](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=355-2438) |
| Popular View (member) | [165:416](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=165-416) / [350:1253](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=350-1253) | [275:615](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=275-615) / [354:2857](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=354-2857) | [217:463](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=217-463) / [355:2460](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=355-2460) |
| Popular View – Guest – Hover | [161:505](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=161-505) / [350:1241](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=350-1241) | [275:576](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=275-576) / [354:2842](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=354-2842) | — |

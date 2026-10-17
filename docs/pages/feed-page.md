# Feed Page

Status: In Development

Routes `/user-feed` and `/user/:userId/posts` (`client/src/Router.jsx`). Tokens: [style-guide.md](../style-guide.md). File layout and breakpoints: [design-system.md](../design-system.md).

## Scope

- Out of scope for #11, not built: stories (#13) and user suggestions (separate ticket).
- The Popular page's "open a post in the feed layout" is deferred to the Popular ticket.
- No Follow button on the post card (the design's PostCard has none); follow lives on the profile page.
- No guest frames in Figma: the guest view has no significant visual difference.

## Feed (`/user-feed`)

- Logged-in users only. Guests get no link to it.
- A guest who opens `/user-feed` by URL is redirected to `/log-in` and returned to `/user-feed` after logging in.
- Shows posts from the people the user follows, newest first.
- `FeedView` fetches its own posts from `GET /user-posts/followed-users-posts`, sorted newest first on the server. It no longer reads `followedUsersPosts` from the logged-in user.
- `followedUsersPosts` is removed from the profile response (it is currently built for every profile request).
- Known bug to fix: the feed is not sorted by date today (the server groups by followed user; the client re-sort after a like subtracts date strings).
- Empty state: only the "Your feed is empty / Follow people to see their posts here" message, positioned as designed. The space where stories and suggestions sit stays blank until their tickets.
- Populated feed: same — posts and column positioned as designed, stories and suggestions space blank until #13 / #14.

## Post card

- Caption: cut at 2 lines at the card's width; "… more" shows only when it overflows. Clicking "more" expands the full caption on the card, which grows taller.
- Captions are limited to 1000 characters, enforced on the server like the bio.
- Two top-level comments preview under the caption. Replies never preview; they show only in the comments popup.
- Comment order, in the preview and the popup: most likes first, then newest first. Replies under a comment: oldest first.
- Post (comment and reply): disabled at 50% opacity while the box is empty or only spaces; the client sends no empty comment.

## Profile posts view

Feed layout opened from a profile. Shows that user's posts, not the user's feed.

- Route: `/user/:userId/posts#<postId>`.
- Nested routes: a parent route for `/user/:userId` loads the profile once. Children: the grid (`/user/:userId`) and the posts view (`/user/:userId/posts`), sharing the data through the outlet context.
- Switching between grid and posts view does not refetch; edits show in both.
- A shared link or refresh on `/posts` loads through the parent.
- Reuses the profile endpoint's data: posts with comment counts, plus the user's username and picture for card headers. No new endpoint.
- Opens scrolled to the clicked post. Order newest first: newer posts above it, older below.
- The hash follows the scroll, updated with replace (no history entry per post), so Back returns to the grid and a copied URL shares the post on screen.
- The current post changes only once the next post is fully in view; while two are partly visible the previous one stays. A post taller than the visible area counts as current once it fills the visible area.
- Posts bar above the list: back chevron, "Posts", the username beneath. Hides on scroll down, reappears on scroll up. Desktop / tablet: sticky 20px below the header. Mobile: replaces the top bar.
- Back chevron goes back in history; when the posts view is the first entry (shared link), it goes to the profile grid.
- Own profile: each post shows the three-dots post actions in its header (`PostCard`, `Owner=Yes`), opening the same Edit / Delete menu and popups as the grid.
- Deleting the last post returns to the profile grid, which shows its empty state.
- Opening `/posts` by link on a profile with no posts shows the Posts bar over an empty list.
- Profile grid order changes to newest first (today oldest first, because new posts are appended to the user's `posts` array).

## Guests

On any feed-layout view they can reach, i.e. the profile posts view.

- Posts are readable.
- Like and comment controls are shown, not hidden. Using them redirects to `/log-in`; the guest returns to the same URL after login.
- Guests can open the comments popup and read every comment. Clicking into the comment box redirects to `/log-in` (on click, not focus, so keyboard Tab isn't hijacked).
- Reply and the comment heart also redirect a guest to `/log-in`.
- While comments fail to load, the comment box is disabled for guests too; they use "Try again" first.
- Clicking an avatar or username — on a post or a comment — opens that person's profile (same for everyone).

## Errors

Apply the #30 error system: behaviour per [error-handling.md](../error-handling.md); copy per [error-messages.md](../error-messages.md).

- Feed fails to load: full-page load error with Retry, using the profile load-error layout — "Couldn't load your feed / Check your connection and try again. / Retry".
- Posts view fails to load: the profile's load error, via the parent route.
- Comments fail to load: inline "Couldn't load comments · Try again" (`Feed View – Comments – Load Error` frames).
- Comment or reply saved but the list fails to reload: keep the current list, add the new comment locally, keep the form usable, show no error.
- New codes: `COMMENT_TEXT_REQUIRED` (400, empty comment or reply) — "Comment can't be empty"; `COMMENT_NOT_FOUND` (404, like or reply on a deleted or malformed comment) — "This comment no longer exists".
- New code: `CAPTION_TOO_LONG` (400, field `caption`, post upload and caption edit) — "Caption must be at most 1000 characters".
- `POST_NOT_FOUND` also covers like, unlike, add comment and load comments on a missing or malformed post.
- Like / unlike a post or a comment: toast, fallback "Couldn't update your like. Try again."
- Add comment: form message under the box, fallback "Couldn't post your comment. Try again."
- Reply: form message, fallback "Couldn't post your reply. Try again."
- `UNAUTHENTICATED` on any of these: session ends, redirect to `/log-in`.

## Server fixes

- `GET /comments/post/:userPostId` requires a login today; it becomes public so guests can read comments.
- Liking a post uses `$push`, so a double click records two likes; switch to `$addToSet`.
- Like / unlike on a missing post returns 200 with `null`, and commenting on one saves an orphaned comment; a malformed id returns 500. Both become `POST_NOT_FOUND` 404.
- The empty-comment 400 carries no code; it becomes `COMMENT_TEXT_REQUIRED`.
- A reply's parent is not checked. It must be a top-level comment (`parentCommentId: null`) on the same post; otherwise `COMMENT_NOT_FOUND`.
- The feed route returns 500 when the token's user no longer exists; it becomes `UNAUTHENTICATED`.

## Figma frames

Base: `https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=<id>` (`:` → `-`). Each cell: light / dark.

| Frame | Desktop | Tablet | Mobile |
| --- | --- | --- | --- |
| Feed View | [5:8](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=5-8) / [350:978](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=350-978) | [270:478](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=270-478) / [354:2909](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=354-2909) | [219:464](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=219-464) / [355:2510](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=355-2510) |
| Comments | [46:46](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=46-46) / [350:985](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=350-985) | [276:670](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=276-670) / [354:2915](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=354-2915) | [235:463](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=235-463) / [355:2517](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=355-2517) |
| Account Menu | [125:154](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=125-154) / [350:1011](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=350-1011) | [276:693](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=276-693) / [354:2940](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=354-2940) | — |
| Empty | [324:833](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=324-833) / [350:1052](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=350-1052) | [335:1763](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=335-1763) / [354:2972](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=354-2972) | [334:1536](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=334-1536) / [355:2555](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=355-2555) |
| Scrolled | — | [337:1853](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=337-1853) / [354:2980](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=354-2980) | [267:692](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=267-692) / [355:2534](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=355-2534) |
| Comments – Load Error | [564:6780](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=564-6780) / [564:6928](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=564-6928) | [568:4333](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=568-4333) / [568:4513](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=568-4513) | [568:7483](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=568-7483) / [568:7654](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=568-7654) |
| Profile View – Posts | [598:4815](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=598-4815) / [599:4879](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=599-4879) | [599:7711](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=599-7711) / [599:7787](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=599-7787) | [599:7863](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=599-7863) / [599:7935](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=599-7935) |

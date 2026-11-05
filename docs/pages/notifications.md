# Notifications

Status: Complete

Notifications for follows, likes, comments and replies (#53). Tokens: [style-guide.md](../style-guide.md). File layout and breakpoints: [design-system.md](../design-system.md).

## Types

- Follow: "**user** started following you."
- Post like: "**user** liked your post."
- Comment like: "**user** liked your comment: <excerpt>"
- Comment on your post: "**user** commented: <excerpt>"
- Reply to your comment: "**user** replied to your comment: <excerpt>"
- Reply on your post, to someone else's comment: "**user** replied to a comment on your post: <excerpt>"
- A reply to your own comment on your own post creates only "replied to your comment".
- Never created for your own actions.

## Who gets them

- Only `user` and `demo` accounts receive notifications; personas never do.
- A demo visitor's actions notify nobody.
- Persona reactions to a visitor's or a user's uploads notify as normal.
- Visible only to the recipient.

## Lifecycle

- Undo deletes the notification: unlike, unfollow, delete comment or reply.
- Deleting a post, comment or account deletes the notifications pointing to it.
- So at most one like notification per person per post or comment.
- Kept with no expiry.

## Unread indicator

- Red dot on your avatar in the header (desktop, tablet). On mobile, on your profile photo in the tab bar, and on the burger on your own profile.
- Unread count badge on the "Notifications" row of the account menu, under Profile.
- Count fetched on app load and every 60 seconds while the tab is visible.
- Opening the list marks everything read: the dot and badge clear, and rows that were unread keep a `background/unread` highlight until it closes.

## List

- Desktop, tablet: popup, 480 wide, up to 560 tall (capped by the window), no row dividers. Mobile: full-screen like the follow lists.
- Newest first, 20 at a time, infinite scroll.
- Loaded fresh each time it opens.
- Row: avatar, message, time ago in `text/muted`, post thumbnail on the right for likes, comments and replies.
- Clicking the avatar or name opens their profile.
- Clicking the row: a follow opens their profile; a post like opens your posts view (`/user/:userId/posts`) scrolled to that post; comment, reply and comment-like rows open the post with its comments.
- Any click closes the list.
- Empty: "No notifications yet", then "When people follow you, like or comment on your posts, you'll see it here."
- Fails to load: the list popup's inline "Couldn't load this list · Try again" ([likes.md](./likes.md#likes-list-5)).

## Figma frames

Base: `https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=<id>` (`:` → `-`). Each cell: light / dark.

| Frame | Desktop | Tablet | Mobile |
| --- | --- | --- | --- |
| Notifications list | [740:7875](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=740-7875) / [741:7970](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=741-7970) | [743:7955](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=743-7955) / [743:8150](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=743-8150) | [743:8713](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=743-8713) / [743:9107](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=743-9107) |
| Account menu with count | [125:154](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=125-154) / [350:1011](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=350-1011) | [276:693](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=276-693) / [354:2940](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=354-2940) | [252:467](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=252-467) / [355:2728](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=355-2728) |
| Unread dot (feed) | [741:8163](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=741-8163) / [741:8259](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=741-8259) | [743:8014](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=743-8014) / [743:8209](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=743-8209) | [743:8892](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=743-8892) / [743:9123](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=743-9123) |
| Unread dot (own profile) | — | — | [743:8649](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=743-8649) / [743:9062](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=743-9062) |

Components: `Notification Row` (740:7747), `Popup / Notifications` (740:7752). `Unread` property on `Header / Member`, `Header / Member – 768`, `Tab Bar / Member` and `Top Bar / Mobile`.

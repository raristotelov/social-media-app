# Likes

Status: In Development

Liking posts and comments (#11) and the likes list (#5). Tokens: [style-guide.md](../style-guide.md). File layout and breakpoints: [design-system.md](../design-system.md).

## Liking

- Guests see the hearts; using one redirects to `/log-in` ([feed-page.md](./feed-page.md#guests)).
- Like / unlike a post or a comment fails: toast, fallback "Couldn't update your like. Try again."
- Comment like saved but the list fails to reload: keep the current list, apply the like locally, show no error.
- Server: liking a post uses `$addToSet` (it used `$push`, so a double click recorded two likes).

## Likes list (#5)

- "N likes" on a post and on a comment opens a popup listing the accounts that liked it. At 0 likes the count is plain text, not clickable.
- Reuses the followers / following popup, titled "Likes". No new frames.
- All list popups get a smaller title, a line under the header and lines between rows (Figma `Popup / Followers` 591:8246, mobile 580:8101 / 580:8183, viewers sheet 632:9907 / 632:10284; details in [profile-page.md](./profile-page.md#followers--following-popup--built-28)).
- Newest like first.
- Open to guests.
- A comment's list opens over the comments popup; closing it returns to the comments where they were.
- Clicking an account opens that profile and closes the popup (and the comments popup under it).
- Mobile bottom sheets get a handle and swipe-to-close ([design-system.md](../design-system.md#patterns)).
- Fails to load: the popup's inline "Couldn't load this list · Try again" ([error-messages.md](../error-messages.md)).

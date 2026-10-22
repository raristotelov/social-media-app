# Stories

Status: In Development

Ticket #13. Tray above the feed (`/user-feed`), full-screen viewer, story creation. Tokens: [style-guide.md](../style-guide.md). File layout and breakpoints: [design-system.md](../design-system.md).

## Scope

- Out of scope: seeded or generated demo stories (separate ticket).
- Also in #13: Followers and Following lists show only photo and username (follower count dropped).

## Creation

- One shared popup, `Popup / Create`, with **Post | Story** tabs; replaces Upload Picture.
- Opens on Post from the profile's upload tile, on Story from the "Your story" circle. Either tab can be switched to.
- Post: as before (picture + caption).
- Story: picture only, no caption; the picker is the tall story shape (9:16) and the preview shows the picture as the viewer will (whole photo over its blurred copy).
- Button: **Share** on both tabs.
- Switching tabs keeps the chosen picture; the caption is kept for Post.
- Desktop/tablet: centred popup. Mobile: full-screen view, tabs in the top bar.

## Tray

- Shows only users with an active story, plus your own circle first.
- "Your story": with no active story, tapping the circle opens Create on Story. With one, the picture opens your story in the viewer and the plus opens Create.
- Red ring until you've watched all of a user's active stories, grey after.
- Order after your own: unwatched users, then watched; newest story first within each group.
- Your own circle always has the grey ring (design).
- The tray also shows on the empty feed (design), so a user who follows nobody can still post a story.
- Loading: an empty tray card of the same height. Load failure: stays empty, no error.

## Errors

- Opening a user's stories fails: close the viewer, error toast "Couldn't load stories. Try again."
- Deleting a story fails: close the confirmation, resume, error toast "Couldn't delete your story. Try again."
- Recording a view fails: silent.

## Viewer

- Opens on the user's first unwatched story (their first story if all are watched). Moving on to the next user uses the same rule.
- A story whose photo fails to load is skipped straight away.
- A story counts as watched once its photo has loaded on screen, even if you tap past it before 5 seconds. A story whose photo never loaded does not count.
- Each story shows for 5 seconds from when its photo has loaded; its progress segment fills, then it advances. The unwatched part of a segment is white at 35%.
- After a user's last story it continues to the next user in the tray; after the last user it closes.
- Tap left goes back, tap right goes forward; hold pauses. Back from a user's first story goes to the previous user's last story; on the very first story it does nothing. Desktop also has the side arrows (design).
- Time label next to the poster: "Nm" under an hour (minimum "1m"), then "Nh".
- Stories are public to any logged-in user; the tray shows only followed users.
- No reply input.
- Photos within 0.02 of 9:16 fill the frame (cover). Other photos show whole, centred, over a blurred, zoomed copy of the same photo filling the rest of the frame. No cropping.
- Content over the photo (segments, poster, close, Seen by) is fixed white, not tokenised.

## Seen by (own stories only)

- Bottom-left of your own story: eye icon + "Seen by N".
- Tapping it pauses the story and opens the Viewers list; closing it resumes from the same point.
- Viewers list: photo and username only; you are not listed.
- Desktop/tablet: the Followers popup titled "Viewers". Mobile: bottom sheet over the story.

## Delete (own stories only)

- Trash icon at the bottom-right of your own story, across from Seen by.
- Tapping it pauses the story and opens "Delete story" (Delete / Cancel). Cancel resumes.
- Delete removes the story, its Cloudinary image and its view records.
- Desktop/tablet: the Delete Post popup, retitled. Mobile: bottom sheet.

## Expiry (server)

- A story is active for 24 hours from creation.
- Every story query filters out stories older than 24 hours, so expiry is exact.
- An hourly server job deletes expired stories with their Cloudinary images and view records.

## Figma frames

Base: `https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=<id>` (`:` → `-`). Each cell: light / dark.

| Frame | Desktop | Tablet | Mobile |
| --- | --- | --- | --- |
| Tray (in Feed View) | [5:8](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=5-8) / [350:978](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=350-978) | [270:478](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=270-478) / [354:2909](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=354-2909) | [219:464](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=219-464) / [355:2510](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=355-2510) |
| Story Viewer | [311:594](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=311-594) / [350:1023](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=350-1023) | [313:1186](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=313-1186) / [354:2951](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=354-2951) | [310:1054](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=310-1054) / [355:2539](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=355-2539) |
| Story Viewer – Own | [630:5937](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=630-5937) / [632:6011](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=632-6011) | [632:9591](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=632-9591) / [632:9972](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=632-9972) | [632:9885](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=632-9885) / [632:10262](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=632-10262) |
| Story Viewer – Viewers | [630:6067](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=630-6067) / [632:6046](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=632-6046) | [632:9713](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=632-9713) / [632:9999](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=632-9999) | [632:9907](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=632-9907) / [632:10284](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=632-10284) |
| Story Viewer – Delete | [634:6477](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=634-6477) / [634:6525](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=634-6525) | [634:10353](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=634-10353) / [634:10393](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=634-10393) | [634:10631](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=634-10631) / [634:10665](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=634-10665) |
| Create – Post / Story | Component [Popup / Create](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=628-8975) | Same component | Post [241:463](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=241-463) / [355:2710](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=355-2710); Story [628:9096](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=628-9096) / [628:9134](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=628-9134) |

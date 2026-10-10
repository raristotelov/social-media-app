# Profile Page

Status: In Development

Route `/user/:userId` (`client/src/Router.jsx`). Tokens: [style-guide.md](../style-guide.md). File layout and breakpoints: [design-system.md](../design-system.md).

- **Components:** `ProfileView` → `ProfileHeader`, `UserProfilePost`, `Popup`, `AddImagePostForm`, `EditProfileForm`, `ImageInput`, `ProfilePicture`.
- **Breakpoints:** mobile below 600, tablet 600–1279, desktop 1280+. Canvases 390 / 768 / 1440, light and dark.
- Header, top bar and tab bar are global chrome, not part of this page. The only profile-specific chrome: on your own profile the mobile top bar shows the account-menu trigger.

## Viewers

| Viewer | Differences | Status |
| --- | --- | --- |
| Own profile (`isLoggedInUserProfile`) | Edit Profile button; Upload Picture tile first in grid | Built |
| Own profile | Post actions (three dots) on each tile | Built |
| Own profile, mobile | Top bar account-menu icon opens bottom sheet: Profile, Dark mode, Log out | Built |
| Another user (logged in) | Follow / Unfollow button instead of Edit Profile (Unfollow if already following); no Upload tile; no post actions | Built |
| Guest | Same layout as another user; readable without an account. Follow sends guest to `/log-in`, returns to the profile after login | Built |
| Anyone, unknown or malformed user id | The 404 page (today the page stays blank) | To build (#29) |

### Follow / Unfollow

- Optimistic: clicking switches the button and updates the follower count immediately; the request runs in the background.
- If the request fails, no error is shown; the real state appears on the next refresh.
- Today the button and count update only once the server responds and the profile is refetched. — Optimistic update to build (#28 item 7)

## Header — Built

- Profile picture: photo, or SVG placeholder avatar when none.
- Username; counts "N posts", "N followers", "N following".
- Bio: optional, max 150 characters (enforced at model level), long bio wraps, no bio element when empty.
- Desktop/tablet: avatar left; username + action button on one row; stats row; bio; divider; post grid.
- Mobile: avatar with stats beside it; then username, bio, full-width action button.

## Post grid — Built

- Square tiles, centre-cropped.
- Desktop: 900 column, 292 tiles, 12 gap. Tablet: 720 column, 232 tiles, 12 gap. Mobile: full-bleed, 3 columns, 2px gaps.
- Tiles are not clickable yet; opening a post from a profile is covered by #11.
- **Open decision (#28 item 5):** whether tiles show like/comment counts on hover. A hovered tile with counts appears only in the Post Actions frames.

## Followers / following popup — Design pending (#28 item 6)

- Clicking the "followers" or "following" count opens one shared popup listing those users.
- Row: profile photo + username; row links to that user's profile.
- If the logged-in user is in the list, they appear at the top.

## Upload Picture popup (own profile)

- Opened from the Upload Picture tile. Image chooser + caption input; Submit / Cancel.
- Cancel closes it. Submitting with no picture shows "Please choose a picture". — Built
- Error message in the popup on upload/save failure. — To build (#15)
- Submit disabled while the request is in flight. — To build (#15)
- Validation before upload: JPEG, PNG and WebP only (`accept` on the file input; the Cloudinary upload preset allows the same formats as a backstop). Other files show a message and nothing is sent. — To build (#15)
- The image is resized in the browser to a 2048px long edge at high JPEG quality before upload. — To build (#15)
- No orphaned Cloudinary image when the server save fails. — To build (#15)
- Mobile: full-screen view with close icon + title. — Built

## Edit Profile popup (own profile)

- Opened from Edit Profile. Fields: email, username, bio (textarea, max 150), profile picture. — Built
- Email and username required. Untouched submit just closes; only changed values are sent. — Built
- Password cannot be changed here (server rejects it); change password is #24.
- Submit button label is "Save" (code says "Submit"). — To build (#28 item 3)
- Mobile: full-screen view with close icon + title. — Built

### Profile picture input

- No picture: empty round input with add-profile-picture icon; click opens the file picker. — Built
- Same validation and 2048px resize as the Upload Picture popup (shared `ImageInput`). — To build (#15)
- Has picture: hover "Change" overlay. — Built
- Has picture: clicking the picture opens the file picker on every device. — Built
- Has picture: small × button (24px, top-right of the picture, always visible) removes it. — Built
- Removal only takes effect on Save; Cancel leaves the picture untouched; no separate confirmation. After removal the form shows the empty input. — Built
- Removing the picture also destroys its Cloudinary asset; the placeholder avatar then shows everywhere the picture appears. — Built

## Post actions (own profile) — Built

- Three-dots button on each tile opens a menu with Edit and Delete. Anchored menu on desktop/tablet; bottom sheet on mobile.
- **Delete:** confirmation with Delete / Cancel (centred popup on desktop/tablet, bottom sheet on mobile). Delete removes the post, its comments and its Cloudinary image.
- **Edit ("Edit Picture" frames):** caption only; the image cannot be replaced. Save / Cancel. Popup on desktop/tablet, full-screen on mobile.

## Authorization

- A user can only edit/delete their own posts and edit their own profile and follows. Server ownership checks — To build (#28 item 1).
- Emails are not exposed to anyone but the owner — To build (#28 item 2).

## Errors — To build (#30)

Behaviour per [error-handling.md](../error-handling.md); copy per [error-messages.md](../error-messages.md).

- Profile fails to load: full-page load error with Retry, chrome stays.
- `USER_NOT_FOUND`: blank page area until #29.
- Delete post: `POST_NOT_FOUND`, `POST_FORBIDDEN`, fallback — toast.
- Edit caption: `CAPTION_INVALID`, `POST_NOT_FOUND`, `POST_FORBIDDEN`, fallback — form.
- Edit Profile: `EMAIL_REQUIRED`, `EMAIL_INVALID`, `EMAIL_TAKEN`, `USERNAME_REQUIRED`, `USERNAME_TAKEN`, `BIO_TOO_LONG`, `PASSWORD_NOT_EDITABLE`, fallback — form.
- Upload Picture: fallback — form.
- `UNAUTHENTICATED` on any of these: session ends, redirect to `/log-in`.

## Acceptance criteria

### Viewers

- **Given** I am logged in on my own profile, **When** the page loads, **Then** I see Edit Profile and the Upload Picture tile first in the grid, and no Follow button.
- **Given** I am logged in on another user's profile, **When** the page loads, **Then** I see Follow (or Unfollow if I follow them), no Upload tile, no post actions.
- **Given** I am a guest, **When** I click Follow, **Then** I am sent to `/log-in` and returned to the profile after login.

### Header

- **Given** a user with no picture, **When** their profile loads, **Then** the SVG placeholder avatar shows.
- **Given** a user with no bio, **When** their profile loads, **Then** no bio element renders.
- **Given** a long bio, **When** the profile loads, **Then** it wraps.

### Upload Picture

- **Given** the Upload popup is open, **When** I submit with no picture, **Then** "Please choose a picture" shows.
- **Given** the Upload popup is open, **When** I click Cancel, **Then** it closes.
- **Given** an upload or save fails, **When** the response returns, **Then** an error message shows in the popup. (#15)
- **Given** a request is in flight, **When** the popup is open, **Then** Submit is disabled. (#15)
- **Given** the server save fails after upload, **When** the failure is handled, **Then** no orphaned image remains in Cloudinary. (#15)

### Edit Profile

- **Given** the Edit Profile popup is open, **When** I submit without changes, **Then** it closes and nothing is sent.
- **Given** I changed only the bio, **When** I save, **Then** only the bio is sent.
- **Given** I have a picture, **When** I click it, **Then** the file picker opens on any device. (#27)
- **Given** I have a picture, **When** I click ×, **Then** the form shows the empty input and nothing is saved yet. (#27)
- **Given** I removed the picture, **When** I click Save, **Then** the picture and its Cloudinary asset are removed and the placeholder avatar shows everywhere. (#27)
- **Given** I removed the picture, **When** I click Cancel, **Then** the picture is unchanged. (#27)

### Post actions

- **Given** I am on my own profile, **When** I click a tile's three dots, **Then** a menu with Edit and Delete opens. (#27)
- **Given** the Delete confirmation is open, **When** I click Delete, **Then** the post, its comments and its Cloudinary image are removed. (#27)
- **Given** the Delete confirmation is open, **When** I click Cancel, **Then** the post is untouched. (#27)
- **Given** the Edit popup is open, **When** I change the caption and Save, **Then** the caption updates and the image is unchanged. (#27)

## Figma frames

Base: `https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=<id>` (`:` → `-`). Each cell: light / dark.

| Frame | Desktop | Tablet | Mobile |
| --- | --- | --- | --- |
| Profile View | [100:147](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=100-147) / [350:1082](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=350-1082) | [271:478](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=271-478) / [354:2987](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=354-2987) | [222:463](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=222-463) / [355:2590](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=355-2590) |
| No Picture | [171:436](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=171-436) / [350:1105](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=350-1105) | [277:846](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=277-846) / [354:3010](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=354-3010) | [231:463](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=231-463) / [355:2624](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=355-2624) |
| Other User | [111:153](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=111-153) / [350:1128](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=350-1128) | [277:891](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=277-891) / [354:3033](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=354-3033) | [231:503](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=231-503) / [355:2658](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=355-2658) |
| Edit Profile | [105:147](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=105-147) / [350:1148](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=350-1148) | [277:935](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=277-935) / [354:3052](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=354-3052) | [240:463](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=240-463) / [355:2690](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=355-2690) |
| Edit Profile – No Picture | [534:2199](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=534-2199) / [534:2291](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=534-2291) | [534:4690](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=534-4690) / [534:4782](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=534-4782) | [534:6470](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=534-6470) / [534:6498](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=534-6498) |
| Upload Picture | [105:189](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=105-189) / [350:1189](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=350-1189) | [277:976](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=277-976) / [354:3093](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=354-3093) | [241:463](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=241-463) / [355:2710](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=355-2710) |
| Account Menu | — | — | [252:467](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=252-467) / [355:2728](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=355-2728) |
| Post Actions | [492:1829](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=492-1829) / [504:2071](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=504-2071) | [498:4128](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=498-4128) / [505:4372](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=505-4372) | [499:3450](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=499-3450) / [505:6191](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=505-6191) |
| Delete Post | [495:1875](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=495-1875) / [504:2104](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=504-2104) | [498:4207](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=498-4207) / [505:4405](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=505-4405) | [503:3503](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=503-3503) / [505:6244](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=505-6244) |
| Error Toast | [556:4062](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=556-4062) / [556:4092](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=556-4092) | [560:6493](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=560-6493) / [560:6530](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=560-6530) | [560:6639](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=560-6639) / [560:6693](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=560-6693) |
| Load Error | [564:4266](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=564-4266) / [564:4320](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=564-4320) | [568:4272](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=568-4272) / [568:4326](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=568-4326) | [568:7407](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=568-7407) / [568:7475](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=568-7475) |
| Edit Picture | [496:1913](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=496-1913) / [504:2141](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=504-2141) | [498:4290](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=498-4290) / [505:4442](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=505-4442) | [499:3503](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=499-3503) / [505:6297](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=505-6297) |

Followers / following popup: no frames yet (Design pending).

Shared components:

- [Remove Picture Button](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=526-2412) (526:2412)
- [Post Actions Button](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=491-2052) (491:2052)
- [Profile Picture](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=169-441) (169:441, Type=Photo/Placeholder)

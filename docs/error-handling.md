# Error Handling

Status: In Development (#30)

One system for every failure, server and client. Rolled out page by page: #30 covers the auth pages and the profile page, and the routes they call (auth, user, user-post). Other pages adopt it when they are redesigned.

## Server contract

- Every error response is JSON: `{ code, message }`, plus `fields` for form errors.
- `code` — machine-readable, `UPPER_SNAKE_CASE`, from the list below. The client keys all behaviour and copy off it.
- `message` — for developers only. Never shown to users.
- `fields` — `{ <field>: <CODE> }`, one code per invalid field.
- Expected errors keep their real status (400 / 401 / 403 / 404 / 409).
- Every error is logged in full with its stack and cause.
- Anything unexpected (database, Cloudinary, bugs) is always answered with `500 { code: 'INTERNAL_ERROR', message: 'Something went wrong' }`. No internal text (Cloudinary ids, Mongoose messages) reaches the client.
- A malformed id is a 404 with the resource's not-found code, never a 500.

## Codes and copy

Every code, its status and the copy the client shows: [error-messages.md](./error-messages.md).

## How each failure is shown

| Failure | Shown as |
| --- | --- |
| An action the user took (delete post…) | Toast with the code's copy or the action's fallback |
| A page's main data (profile) | Full-page load error: heading, line, Retry |
| One part of a loaded page (comments…) | Inline line with Try again; related inputs disabled (50% opacity) |
| A form submit | `fields` codes under their fields; anything else as the form's own message |
| `UNAUTHENTICATED` | Session cleared, redirect to `/log-in` — keyed on the code, not on 401, so `WRONG_CREDENTIALS` stays a form error |
| `USER_NOT_FOUND`, crash, unknown route | Blank page area under the chrome until #29 designs the 404 and "Something went wrong" pages |

- Follow / unfollow failures stay silent (see [profile-page.md](./pages/profile-page.md)).
- Messages use `text/primary`, never `text/secondary` (fails AA in light mode).

## Toast

- Component `Toast` ([556:1892](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=556-1892)): `text/primary` fill, 12px radius, 12/16 padding; alert icon in `feedback/error-inverse`; message 15px `background/surface`; close ×.
- Desktop / tablet: bottom centre. Mobile: full width with 16px margins, 8px above the tab bar.
- Dismissed by the × or automatically after 5 seconds; the timer pauses while hovered or focused.
- An action raised from a popup (delete confirmation) closes the popup, then shows the toast.
- A new toast replaces the one showing; they never stack.

## Figma frames

Base: `https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=<id>` (`:` → `-`). Each cell: light / dark.

| Frame | Desktop | Tablet | Mobile |
| --- | --- | --- | --- |
| Profile View – Error Toast | 556:4062 / 556:4092 | 560:6493 / 560:6530 | 560:6639 / 560:6693 |
| Profile View – Load Error | 564:4266 / 564:4320 | 568:4272 / 568:4326 | 568:7407 / 568:7475 |
| Feed View – Comments – Load Error | 564:6780 / 564:6928 | 568:4333 / 568:4513 | 568:7483 / 568:7654 |

The comments frames are the reference for inline errors; the feed adopts them when it is redesigned.

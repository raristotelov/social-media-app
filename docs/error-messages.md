# Error Messages

Status: Complete (#30)

Every error code the server sends and the copy the client shows for it. The client's code map is the only place this copy lives in code. Contract and where each message appears: [error-handling.md](./error-handling.md).

## Codes

| Code | Status | Where | Copy |
| --- | --- | --- | --- |
| `UNAUTHENTICATED` | 401 | Any authenticated route, missing / invalid / expired token; also the feed route when the token's user no longer exists (#11) | — (session ends) |
| `WRONG_CREDENTIALS` | 401 | Log in | Wrong email or password |
| `EMAIL_REQUIRED` | 400 | field `email` | Email is required |
| `EMAIL_INVALID` | 400 | field `email` | Please provide a valid email address |
| `EMAIL_TAKEN` | 409 | field `email` | This email is already registered |
| `USERNAME_REQUIRED` | 400 | field `username` | Username is required |
| `USERNAME_TAKEN` | 409 | field `username` | This username is taken |
| `PASSWORD_REQUIRED` | 400 | field `password` | Password is required |
| `PASSWORD_TOO_SHORT` | 400 | field `password` | Password must be at least 8 characters |
| `PASSWORD_TOO_LONG` | 400 | field `password` | Password must be at most 72 bytes |
| `PASSWORD_NOT_EDITABLE` | 400 | field `password`, profile update | Password cannot be changed from the profile form |
| `BIO_TOO_LONG` | 400 | field `bio` | Bio must be at most 150 characters |
| `CAPTION_INVALID` | 400 | field `caption` | Caption must be text |
| `CAPTION_TOO_LONG` | 400 | field `caption`, post upload and caption edit (#11) | Caption must be at most 1000 characters |
| `IMAGE_TYPE_INVALID` | 400 | image field, post upload and profile update (#15) | Choose a JPEG, PNG or WebP image |
| `IMAGE_TOO_LARGE` | 413 | image field, upload over 10 MB (#15) | This image is over 10 MB |
| `USER_NOT_FOUND` | 404 | Profile load, profile update, follow / unfollow, unknown or malformed user id | — (blank page until #29) |
| `POST_NOT_FOUND` | 404 | Post edit / delete; like, unlike, add comment and load comments on a missing or malformed post (#11) | This post no longer exists |
| `POST_FORBIDDEN` | 403 | Post edit / delete on someone else's post | You can only change your own posts |
| `COMMENT_TEXT_REQUIRED` | 400 | Add comment and reply, empty text (#11) | Comment can't be empty |
| `COMMENT_NOT_FOUND` | 404 | Like, unlike or reply on a deleted or malformed comment; reply to a comment that is on another post or is itself a reply (#11) | This comment no longer exists |
| `PROFILE_FORBIDDEN` | 403 | Profile update, follow / unfollow for someone else's account | You can only change your own profile |
| `BAD_REQUEST` | 400 | Malformed request body; 4xx errors not yet given their own code | The action's fallback (below) |
| `INTERNAL_ERROR` | 500 | Anywhere | The action's fallback (below) |

Any code the client doesn't know is treated as `INTERNAL_ERROR`.

## Client-only validation

Checked before any request; no server code.

| Where | Copy |
| --- | --- |
| Sign up, repeat password empty | Please repeat your password |
| Sign up, passwords differ (form message) | Passwords do not match |
| Upload Picture, no picture chosen | Please choose a picture |

## Action fallbacks

Shown for `INTERNAL_ERROR`, unknown codes and network failures.

| Action | Shown in | Copy |
| --- | --- | --- |
| Log in | Form message | Couldn't log in. Try again. |
| Sign up | Form message | Couldn't sign up. Try again. |
| Save profile | Form message | Couldn't save your profile. Try again. |
| Edit caption | Form message | Couldn't save the caption. Try again. |
| Upload picture | Form message | Couldn't upload the picture. Try again. |
| Delete post | Toast | Couldn't delete the post. Try again. |
| Like / unlike a post or a comment (#11) | Toast | Couldn't update your like. Try again. |
| Add comment (#11) | Form message | Couldn't post your comment. Try again. |
| Reply (#11) | Form message | Couldn't post your reply. Try again. |

## Load errors

| Where | Copy |
| --- | --- |
| Profile (full page) | Couldn't load this profile / Check your connection and try again. / Retry |
| Feed (full page) (#11) | Couldn't load your feed / Check your connection and try again. / Retry |
| Comments (inline) | Couldn't load comments · Try again |
| Followers / following popup (inline) | Couldn't load this list · Try again |

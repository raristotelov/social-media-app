# Error Messages

Status: In Development (#30)

Every error code the server sends and the copy the client shows for it. The client's code map is the only place this copy lives in code. Contract and where each message appears: [error-handling.md](./error-handling.md).

## Codes

| Code | Status | Where | Copy |
| --- | --- | --- | --- |
| `UNAUTHENTICATED` | 401 | Any authenticated route, missing / invalid / expired token | — (session ends) |
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
| `USER_NOT_FOUND` | 404 | Profile load, unknown or malformed user id | — (blank page until #29) |
| `POST_NOT_FOUND` | 404 | Post edit / delete | This post no longer exists |
| `POST_FORBIDDEN` | 403 | Post edit / delete on someone else's post | You can only change your own posts |
| `INTERNAL_ERROR` | 500 | Anywhere | The action's fallback (below) |

Any code the client doesn't know is treated as `INTERNAL_ERROR`.

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

## Load errors

| Where | Copy |
| --- | --- |
| Profile (full page) | Couldn't load this profile / Check your connection and try again. / Retry |
| Comments (inline) | Couldn't load comments · Try again |

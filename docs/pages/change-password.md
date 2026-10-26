# Change Password

Status: In Development

Changing your password from the account menu (#24). Tokens: [style-guide.md](../style-guide.md). File layout and breakpoints: [design-system.md](../design-system.md).

## Entry

- Account menu row "Change password", between Dark mode and Log out. Desktop and tablet dropdown, and the mobile bottom sheet. Logged-in users only.
- The dropdown sizes to its widest row; the new label stays on one line.

## Form

- Desktop / tablet: popup titled "Change Password". Mobile: full-screen view with close and title, like Edit Profile.
- Three password inputs: Current password, New password, Confirm new password. Save and Cancel.
- Cancel, close, Escape and the scrim close it without saving.

## Validation

- Field errors, beside the input:
  - Current password empty: "Password is required".
  - New password empty, too short or too long: the sign-up messages ("Password is required", "Password must be at least 8 characters", "Password must be at most 72 bytes").
  - Current password wrong: "Current password is incorrect".
  - New password the same as the current one: "New password must be different from the current one".
- Form message (auth convention):
  - Confirm empty: "Please repeat your password".
  - New and confirm differ: "Passwords do not match".
- Request fails: form message "Couldn't change your password. Try again."
- Any error changes nothing.

## Success

- Popup closes, success toast "Password changed" (Figma `Toast` Type=Success 682:3196: check icon in `feedback/success-inverse`), you stay logged in.
- The old password stops working; the new one works.

## Server

- Authenticated endpoint; the user comes from the token, never from the body.
- Checks the current password with `bcrypt.compare`, validates the new one against `MIN_PASSWORD_LENGTH` / `MAX_PASSWORD_BYTES`, stores `bcrypt.hash(…, SALT_ROUNDS)`, as `signUp` does.
- Response never contains the password or its hash.
- Profile update keeps rejecting `password` (`PASSWORD_NOT_EDITABLE`); a password is never stored unhashed on any path.

## Figma frames

Base: `https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=<id>` (`:` → `-`). Each cell: light / dark.

| Frame | Desktop | Tablet | Mobile |
| --- | --- | --- | --- |
| Change Password | Component [Popup / Change Password](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=680-10995); instances [680:11019](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=680-11019) / [680:11034](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=680-11034) | [680:11053](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=680-11053) / [680:11068](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=680-11068) | [680:11087](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=680-11087) / [680:11108](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=680-11108) |
| Account Menu | [125:223](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=125-223) / [350:1018](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=350-1018) | [276:697](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=276-697) / [354:2946](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=354-2946) | [252:508](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=252-508) / [355:2763](https://www.figma.com/design/bDyuGKpRh2vP1DlElilDaw/Social-Media-App-Design?node-id=355-2763) |

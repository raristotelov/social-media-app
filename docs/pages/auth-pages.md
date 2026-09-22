# Auth Pages — Login & Sign Up

The two entry pages for unauthenticated users. Both render the guest header (logo + Log in / Sign up links) with the form centered on the `#F0F0F0` canvas.

## Login (`/log-in`)

- **Component:** `LoginView` → `LoginForm`.
- **Fields:** Email, Password.
- **Actions:** Submit (filled red pill) calls `loginHandler`; "Don't have an account? Sign up" links to `/sign-up`.
- On success the user is authenticated (JWT stored) and sent to the feed.

## Sign Up (`/sign-up`)

- **Component:** `SignUpView` → `SignUpForm`.
- **Fields:** Email, Username, Password, Repeat password.
- **Actions:** Submit calls `signUpHandler`; "Already have an account? Login" links to `/log-in`.

## How they work

- Both forms use the shared `useForm` hook to track input values and fire the submit handler.
- Shared UI: `Logo`, `Input` styling, and the `Button` component (filled brand-red pill, color-reverse on hover).
- Field styling comes from `LoginForm.css` / `SignUpForm.css`; see [design-system.md](./design-system.md) for tokens and conventions.

## Styling notes

- White card, 2px `#B5B5B5` border, logo above a top-divider form.
- Inputs: 44px tall, 12px radius, 12px text padding, muted `#B5B5B5` border/placeholder.
- Text: headings/body `#4B4B4B`; the link's action word in brand red `#F64D4D` with underline + `opacity: 0.7` on hover.

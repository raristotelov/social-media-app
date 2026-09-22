# Tech Stack

Overview of the technologies used across the social media app. Versions reflect the current `package.json` files.

## Frontend (`client/`)

- **Language:** JavaScript (JSX).
- **Framework:** React 19, bootstrapped with Create React App (`react-scripts` 5).
- **Routing:** `react-router-dom` 6.
- **State:** React Context (`LoggedInUserContext`) + hooks; JWT persisted in `localStorage`.
- **API calls:** native `fetch` wrapped in a custom `requester` service.
- **Auth (client):** `jwt-decode` to read the logged-in user from the JWT.
- **Styling:** plain CSS, one `.css` file per component; custom fonts (Pacifico, Mada, Vollkorn).
- **Utilities:** `uuid` for unique image identifiers.

## Backend (`server/`)

- **Runtime:** Node.js.
- **Framework:** Express 5.
- **Auth:** `jsonwebtoken` (JWT signing/verification), `bcrypt` (password hashing).
- **Config/middleware:** `cors`, `dotenv`.
- **Structure:** router → controllers → services → Mongoose models.

## Database

- **MongoDB** via **Mongoose** 8 (ODM). Runs locally (`mongodb-community`) or via MongoDB Atlas; connection string in `MONGODB_URI`.

## Image Storage

- **Cloudinary** — image uploads and on-the-fly optimization/resizing, uploaded unsigned from the client.
- Firebase is gone: the unused `firebase.js` module and the `firebase` dependency were removed, and the Firebase project deleted.

## Auth Model

- JWT-based. Server signs a token on login; client stores it in `localStorage` and sends it as the `X-Authorization` header. Protected routes verify it via `verifyJwtToken` middleware.

## Tooling

- **Client:** Prettier, ESLint (`react-app` config), Testing Library + Jest via `react-scripts`, Cypress for end-to-end.
- **Server:** Prettier, ESLint, Jest, `nodemon` for dev reload.

### Commands

Run from `client/` or `server/`:

- `npm run lint` · `npm run format` · `npm run format:check`
- `npm test` — unit tests. The client runs in watch mode; use `CI=true npm test -- --watchAll=false` for a single pass.
- `npm run cypress:open` / `npm run cypress:run` — end-to-end, client only. **The client and the server must both already be running.**

End-to-end specs run against the local dev database with its real data. A spec creates the records it needs and deletes only those; it never clears the database.

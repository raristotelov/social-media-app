# Tech Stack

Overview of the technologies used across the social media app. Versions reflect the current `package.json` files.

## Frontend (`client/`)

- **Language:** JavaScript (JSX).
- **Framework:** React 19, built with Vite 8 and `@vitejs/plugin-react`. Output goes to `dist`.
- **Routing:** `react-router` 8.
- **State:** React Context (`LoggedInUserContext`) + hooks; the session is restored on load from `GET /users/me`.
- **API calls:** native `fetch` wrapped in a custom `requester` service, sent with `credentials: 'include'`.
- **Styling:** plain CSS, one `.css` file per component; custom fonts (Pacifico, Mada, Vollkorn).
- **Env:** `VITE_API_URL` — server base URL (falls back to `http://localhost:5000` when unset).
- **Node:** `^22.22.2 || ^24.15.0 || >=26.0.0` (`engines` in `client/package.json`).

## Backend (`server/`)

- **Runtime:** Node.js `^22.22.2 || ^24.15.0 || >=26.0.0` (`engines` in `server/package.json`).
- **Framework:** Express 5.
- **Auth:** `jsonwebtoken` (JWT signing/verification), `bcrypt` (password hashing).
- **Config/middleware:** `cors` (explicit `CLIENT_ORIGIN`, `credentials: true`), `cookie-parser`, `dotenv`.
- **Structure:** router → controllers → services → Mongoose models.

## Database

- **MongoDB** via **Mongoose** 9 (ODM). Runs locally (`mongodb-community`) or via MongoDB Atlas; connection string in `MONGODB_URI`.

## Migrations

- `migrate-mongo` (server devDependency). Config: `server/migrate-mongo-config.js` (reads `MONGODB_URI`). Files: `server/src/migrations/`. Applied ones are tracked in the `changelog` collection.
- Run from `server/`: `npm run migrate:up` · `migrate:down` · `migrate:status`. Run `migrate:up` against the target database before deploying.

## Image Storage

- **Cloudinary** — image uploads and on-the-fly optimization/resizing, uploaded unsigned from the client.
- Firebase is gone: the unused `firebase.js` module and the `firebase` dependency were removed, and the Firebase project deleted.

## Auth Model

- JWT in an `httpOnly` cookie (`sessionToken`): `sameSite: 'lax'`, `secure` in production, expires with the token. JavaScript can't read it.
- Set on sign-up, login and demo login; response bodies carry the user, never the token.
- `GET /users/me` returns the current user, or `null` for a guest. `POST /users/logout` clears the cookie.
- Protected routes verify it via `verifyJwtToken`; a rejected cookie is cleared.
- CSRF: no tokens. `sameSite: 'lax'` covers it while client and server share the site (see Hosting).

## Hosting

- **Client:** Vercel. `client/vercel.json` rewrites every path to `/index.html` so nested routes survive a refresh.
- **Server:** Render.
- **Database:** MongoDB Atlas.
- **Domain:** client on `sharesnap.app` (`www` redirects to it), server on `api.sharesnap.app`. Same site, so the session cookie works with `sameSite: 'lax'`.

## Tooling

- **Client:** Prettier, ESLint 9 (flat config), Vitest 5 with jsdom, Testing Library, Cypress for end-to-end.
- **Server:** Prettier, ESLint, Jest (run with `--experimental-vm-modules`, because the MongoDB driver loads `os` through a dynamic `import()`), `node --watch` for dev reload.

### Commands

Run from `client/` or `server/`:

- `npm run lint` · `npm run format` · `npm run format:check`
- `npm test` — unit tests, single run.
- Client only: `npm run test:watch` · `npm run test:coverage` · `npm run build` · `npm run preview`.
- `npm run cypress:open` / `npm run cypress:run` — end-to-end, client only. **The client and the server must both already be running.**

End-to-end specs run against the local dev database with its real data. A spec creates the records it needs and deletes only those; it never clears the database.

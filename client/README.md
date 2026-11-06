# Client

React 19 app built with Vite. Requires Node `^22.22.2 || ^24.15.0 || >=26.0.0`.

## Scripts

- `npm start` — dev server on http://localhost:3000
- `npm run build` — production build to `dist`
- `npm run preview` — serve the production build
- `npm test` — unit tests, single run
- `npm run test:watch` — unit tests in watch mode
- `npm run test:coverage` — unit tests with coverage
- `npm run lint` · `npm run format` · `npm run format:check`
- `npm run cypress:open` / `npm run cypress:run` — end-to-end (client and server must be running)

## Environment

- `VITE_API_URL` — server base URL. Defaults to `http://localhost:5000` when unset.

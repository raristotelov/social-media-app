# Demo Content — Seed Scripts

How the demo data is built, script by script. Decisions and research: [overview.md](overview.md). What happens after the seed: [activity-job.md](activity-job.md).

## Order and prerequisites

Run in `server/`, in this order. The photo folder is `~/Downloads/SocialMediaApp Demo User Photos`.

1. `npm run seed:assign -- "<photo folder>"` — local files only.
2. `npm run seed:upload -- "<photo folder>"` — needs the `CLOUDINARY_*` variables in `server/.env`.
3. `npm run seed:demo` — needs the `CLOUDINARY_*` variables and `MONGODB_URI`. Seeds whichever database `MONGODB_URI` names; check it before running.

Re-run 1 after any change to the photo folders, `users.json`, `creatorSwaps.json`, `avatarChoices.json` or `avatarExclusions.json`. Re-run 2 after re-running 1 only if photos were added. Re-run 3 to reset all demo content.

## 1. `seed:assign` — `server/src/seed/assignPhotos.js`

Decides once which account gets which photo.

- **Reads:** `creator-posts/<folder>`, `regular-user-posts/<subject>` and `creator-avatars/` in the photo folder; `users.json`, `creatorSwaps.json`, `avatarChoices.json`, `avatarExclusions.json`.
- **Random seed 16, fixed.** The same files always give the same result. Adding or removing any photo reshuffles which posts go to which account; avatars stay put because they are pinned.
- **Steps, in order:**
  1. Lists each folder's photos (`.jpg`, `.jpeg`, `.png`, `.webp`), sorted by name, then shuffled.
  2. Plans the 350 lurkers:
     - Backlog sizes: 70 lurkers each at 1, 2, 3, 4 and 5 posts, at random. Stops if 350 can't split evenly.
     - 117 random lurkers become occasional posters and get 3 later photos.
     - Lurkers with an avatar: those pinned in `avatarChoices.json` (175), topped up at random to 175 if fewer are pinned. Stops if more than 175 are pinned.
  3. Avatars for the 100 casual posters and 175 lurkers:
     - Pinned holders get their pinned photo. Stops if a pinned photo is missing or its user isn't an avatar holder.
     - Any unpinned holder gets a photo from one of 35 avatar-friendly subjects (`AVATAR_SUBJECTS` in the script), subject weighted by photos left, skipping photos in `avatarExclusions.json`.
     - Avatar photos leave the pool, so they are never posted.
  4. Creators, in random order: each creator listed in `creatorSwaps.json` → `related` receives 8 photos:
     - 1–2 from its listed animal folders (if it has any), the rest from its related folders.
     - Each photo comes from whichever of those folders has the most photos left.
     - Every creator keeps the rest of its own folder. The 8 single-topic creators receive none.
  5. Casual posters: 8 photos each — 6–7 from different subjects (each subject picked weighted by photos left), then 1–2 more from subjects already used.
  6. Lurkers: the backlog from different subjects; occasional lurkers then get 3 later photos from further different subjects.
  7. Checks, and stops on failure: no photo assigned twice (avatars included); every creator avatar file exists; `regular-user-avatars/` holds no crops outside this assignment.
  8. Crops each regular-user avatar to 512×512 (sharp `attention` crop, JPEG quality 85) into `regular-user-avatars/<username>.jpg`.
  9. Writes `server/src/seed/data/assignments.json` and prints how many photos were assigned and how many everyday photos are unused.
- **Does not detect byte-identical duplicates** across folders. Remove them first: the upload skips the second copy, and the seed then stops on an assigned photo that isn't in `photos.json`.
- **Current result (2026-11-02):** 4,792 photos assigned; 122 everyday photos unused.

## 2. `seed:upload` — `server/src/seed/uploadPhotos.js`

Uploads every photo to Cloudinary once.

- **Reads** six folders in this order: `creator-posts`, `regular-user-posts`, `visitor-posts` (one folder per subject), `creator-avatars`, `regular-user-avatars`, `visitor-avatars` (files directly).
- **Per photo:**
  - Hashes the original file (SHA-256). A file identical to one already seen in this run is skipped and logged.
  - Skips it if its id is already in `photos.json` (so a re-run only uploads what's new).
  - Resizes to fit 1080×1080 (never enlarged), applies EXIF rotation, re-encodes as JPEG quality 85.
  - Uploads with id `demo-users/<pool>/<folder>/<file name without extension>` (avatar pools: `demo-users/<pool>/<file name without extension>`), Media Library folder set to the id's path, never overwriting.
  - Appends `{ source, imageIdentifier, imageUrl, imageWidth, imageHeight }` to `server/src/seed/data/photos.json` under its pool and folder, and saves the file straight away.
- **Stops** if the Cloudinary variables aren't set.
- **Current result (2026-11-02):** 5,290 photos uploaded; 28 duplicates skipped (since removed from the photo folder).

## 3. `seed:demo` — `server/src/seed/seedDemo.js`

Resets the demo content in the database.

- **Builds everything in memory first** (`buildDemoData.js`, random seed 17, dated back from the moment it runs), then connects to the database.
- **Clears existing demo content** (`clearDemoContent.js`):
  - Deletes all job state: `demoactivityruns`, `demoscheduledevents`, `demoaccountstates`.
  - Finds demo accounts by `accountType: 'persona'` (visitors are `demo` and never match).
  - Deletes their stories and each story's Cloudinary image, story views of those stories and by those accounts.
  - Deletes comments on their posts and comments they wrote, plus replies to any of those; lowers `commentsCount` on real users' posts to match.
  - Removes their likes from all posts and comments, clears mentions of them, deletes their posts.
  - Removes them from everyone's followers and following, then deletes the accounts.
  - Real users' own posts, comments and accounts are never deleted.
- **Accounts (500):** `accountType: 'persona'`; email `<username>@demo.invalid`; password a bcrypt hash of 32 random bytes, so nobody can log in; bio from `users.json`; avatar from `photos.json` for the 50 creators and 275 regular-user avatar holders, none for the other 175 lurkers.
- **Posts:**
  - Creators post 20–25 of their photos, casual posters 5–7; the rest are queued for the hourly job.
  - Lurkers post their whole backlog, marked permanent (the rolling window never removes it); their later photos are queued.
  - Each post gets a random whole-day offset back from today (0 to 88 days; lurkers 0 to 363), at a random time 08:00–22:59 in the timezone of the machine running the seed, moved back one day if that lands in the future.
  - Captions as in [activity-job.md → Captions](activity-job.md#captions).
- **Follows:**
  - Each account, in random order, follows a random number of accounts in its tier's range (creators 60–150, casual posters 40–100, lurkers 30–80).
  - Every account has a random follower target (creators 200–400, casual posters 30–120, lurkers 0–60). Candidates are weighted by how many followers they still need; lurkers weight creators 6×. Once every target is met, picks are uniform. Final follower counts land close to the targets, not exactly on them.
- **Likes and comments:** planned exactly as for new posts ([activity-job.md → Engagement](activity-job.md#engagement-planned-per-post)), but applied straight away:
  - Every planned like is on the post at seed time, including likes planned for later.
  - Comments planned for a time still in the future get a random time between the post (or the parent comment) and now.
  - Comment likes are all applied. No scheduled events are created.
- **Stories (30):** 18 creators, 9 casual posters and 3 occasional lurkers, each a different account, each a random one of the account's own photos, at a random time in the past 24 hours. Each is a Cloudinary copy in `demo-users/story-copies`.
- **Job state:**
  - One `demoaccountstates` document per account: tier, own photos, queue (photos not yet posted), posted photos with captions.
  - One `demoactivityruns` document with `lastCompletedHour` set to the start of the previous hour, so the first job run picks up from the current hour.
- **Prints** the counts. Production, 2026-10-31: 500 accounts, 2,758 posts, 13,467 comments, 30 stories.

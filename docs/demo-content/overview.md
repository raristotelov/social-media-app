# Demo Content

Status: Draft

Making the app look live for a portfolio visitor: a seed with history, plus ongoing simulated activity (#16). Demo visitor accounts are [#17](https://github.com/raristotelov/social-media-app/issues/17).

How it works in detail: [seed.md](seed.md) (the three seed scripts) and [activity-job.md](activity-job.md) (the hourly job).

## Decisions

- **Personas are themed, not faces.** Each creator has a main subject (hiking trails, mountains, a pet, and so on). No AI-generated people anywhere in the app.
- **Most creators post a mix.** About 80% main theme, about 20% photos handed over from other creators' folders that fit the person (the hiker gets a lake, the home cook a cocktail). Each photo belongs to one account only; every creator gives and receives about 8, so pools keep their size. At most 1–2 animal photos per account, captioned as a friend's or neighbour's pet. Off-theme posts are spread through the timeline; captions match ("Dad's new latte machine"). Each creator's related folders are listed in `server/src/seed/data/creatorSwaps.json`; the assign script takes 8 photos per creator from them (1–2 from a listed animal folder, if any).
- **8 creators stay single-topic** and receive no swaps, as business or showcase accounts: the dog walker, the cat sitter, latte art, brutalism, the florist, pottery, the riding stable, night sky. Their photos can still be swapped into other accounts.
- **Casual posters and lurkers are not themed.** Their photos are random subjects from the everyday pool.
- **All images are real photographs.** No AI-generated images.
- **No real people as personas.** Photos of identifiable people are not used to stand in for fake accounts.
- **No faces, including avatars.** No recognisable person appears anywhere in demo content.
- **No licence or ethical line is crossed.** If a source's terms don't clearly allow the use, the source isn't used.
- **Creator photos: Unsplash, downloaded by hand.** The licence allows manual downloads with no credit. No API (its guidelines don't clearly allow this use) and no scripted downloading (Terms §8 bans scripts and scrapers outside the API).
- **Casual poster and lurker photos: Wikimedia Commons, CC0 / public domain only**, no credit, fetched by a slow overnight script through its API (descriptive User-Agent, one request at a time). Its uneven quality suits everyday snapshots.
- Excluded: recognisable faces, Unsplash+ photos. Signs, text, logos and brands are fine.
- **Animal personas have a story for why the animals differ** (a dog walker, a cat sitter, a riding stable), since stock photos can't show one animal consistently.
- **Rolling window.** The seed creates ~3 months of history, timestamped back from today. An hourly job adds new posts, stories, likes, comments and follows, and deletes posts that fall outside the window together with their likes and comments. The image file stays stored and goes back to the end of the persona's pool, to be posted again months later with a fresh caption and engagement. Pool size decides how long before a photo returns.

## Captions and comments

- Pre-written once into the repo's JSON files and reviewed; no API calls at run time.
- A caption bank per folder; some posts get no caption, some just an emoji. A large comment pool per folder, plus replies.
- Creator folders have two caption lists: owner (the creator's voice) and guest (reads naturally from any account, used when another creator posts a swapped photo). Everyday folders have only the guest list.
- Re-posted photos (rolling window) get a different caption from the bank.
- Comments are picked by the photo's source folder (creator theme or everyday subject), not the poster's theme, so swapped photos still get fitting comments.

## Scheduling

- An hourly GitHub Actions workflow (free in this public repo) calls a token-protected endpoint on the server, which runs the activity job. The job, its state and all secrets live on the server; GitHub holds only the token.
- The server also catches up on missed hours when it starts, so a dropped or disabled workflow doesn't leave gaps.
- The rolling window never takes an account below its tier's minimum, so a long outage can't empty profiles.
- Exact timing, steps and numbers: [activity-job.md](activity-job.md).

## Accounts

- 500 demo accounts, in three tiers. Likes and follows come from these accounts, so the count sets the ceiling on engagement.
  - 50 creators: themed personas posting often, each with a full photo pool.
  - 100 casual posters: a handful of photos each, posting now and then.
  - 350 lurkers: mostly like, comment and follow. Each gets a permanent backlog from the seed, dated across the past year and never removed by the rolling window: 70 lurkers each at 1, 2, 3, 4 and 5 posts. 117 lurkers also post occasionally (once every 60 days on average), from 3 extra photos each; the rest never post again. Generic everyday subjects. 175 keep the default avatar.
- Every account has at least one post.
- Usernames: about half with underscores, a quarter with dots, a quarter plain (some with digits). Creators are handle-style, everyone else name-ish.
- Bios: every creator; 180 of the 450 others (60 casual posters, 120 lurkers); the rest have none.
- Avatars are faceless (the persona's subject, gear, a silhouette) or the default placeholder.
  - 325 avatars: 50 creators, 100 casual posters, 175 lurkers.
  - Creators: Wikimedia CC0 / public domain photos, cropped square; in `~/Downloads/SocialMediaApp Demo User Photos/creator-avatars`.
  - Casual posters and lurkers: a separate everyday-pool photo, cropped square, never used as a post. Each was reviewed and is pinned in `server/src/seed/data/avatarChoices.json`, and the lurkers pinned there are the ones that get an avatar; rejected photos are listed in `avatarExclusions.json`.

## Daily activity

- On average about 27 posts, 32.5 stories, 15 follows and 2 unfollows a day, mostly from and towards creators; every new post brings its own likes and comments over the following week.
- Every day has at least 10 posts, 15 stories and 5 follows, even when the random draw comes out quiet.
- Stories reuse the account's own photos as fresh Cloudinary copies, so story expiry never deletes a post's image.
- Exact rules: [activity-job.md](activity-job.md).

## Demo accounts (#17)

- Created the moment a visitor clicks "Try the demo", one per visitor, and logged in straight away. No shared accounts.
- `accountType` on the user: `user` (default, real sign-ups), `persona` (seeded accounts), `demo` (visitors). Every demo rule keys off it, never off email; it can't be set through sign-up or edit-profile. The seed's clean-up removes only `persona`, so it never touches visitors. Visitors keep a placeholder email `<username>@visitor.demo.invalid`.
- `POST /users/demo-login` is limited to 5 requests per IP per hour (429 `TOO_MANY_REQUESTS`).
- Username: a random common first name, `_demo_`, and a number 1–99 (`john_demo_2`), retried if taken. Changeable in Edit Profile like any user's.
- Arrives ready-made: follows 40 personas, mostly creators (so the feed is full); 15–30 personas follow back; 2–3 posts dated over the past weeks, from the 31 `visitor-posts` photos (a source library: each post gets its own Cloudinary copy), each already with 5–10 likes and 0–1 comments.
- First 10 minutes after creation: 1–5 more likes and 0–2 comments across the starter posts, and 1–3 new followers, spaced out one at a time, so there's live activity (and notifications, once they exist) without spamming.
- Starts with an avatar picked at random from a pool of 20 faceless photos (`demo-users/visitor-avatars/`); visitors may share one.
- Removed after 24h with everything they created (#17): posts, comments, likes, follows, stories and their Cloudinary images. The hourly activity job does it, so a visitor can last up to an hour longer, or more while the server sleeps. The visitor is told this in a dismissible strip above the header on every page ([pages/demo-entry.md](../pages/demo-entry.md)). Otherwise the account behaves like any normal user's.
- Invisible to every other person (real users and other visitors): never in search, Popular or suggestions, and left out of other accounts' follower and following lists. A direct link to a visitor's profile or post shows anyone else the normal 404 page. Personas can still follow, like and comment on a visitor; that only shows on the visitor's side.
- Counts follow the same rule: each viewer sees follower / following counts without other visitors but including themselves, so a visitor following a persona sees its count go up while everyone else's stays the same. The same goes for a visitor's post likes, comments (and their replies and comment likes), likes lists, comment counts and story viewers on other accounts' content.
- Reason: visitors need no account, so anyone could post anything; hiding keeps it from every other viewer. Real sign-ups stay visible like any user; new sign-ups and their posts are checked by hand in the database.
- No site-wide "simulated content" note. The README explains how the demo content works (wording to be discussed with the wider README rewrite, #52).

## Re-running the seed

- Deletes only demo content (personas, their posts, stories, comments, likes, follows and job state) and rebuilds it. Real sign-ups and their data are never touched.

## Reactions to visitors (#17)

- Applies to demo visitors and to people who sign up normally.
- Personas follow normal sign-ups too: 1–3 in the first 10 minutes after sign-up, then about 1 a day for their first week (hourly job), so a new user reaches 5–10 followers.
- When they post, 25–35% of their current followers (at least 3) like it and 1–3 personas comment within the first 10 minutes, mostly from their followers. After that, 1–5 more likes and 0–2 comments over the next 2 days, stored as scheduled events and applied by the hourly job (so they arrive in hourly batches).
- Comments on visitors' posts come from a generic comment bank, since the photo's content is unknown.
- Triggered by the server when the post is created (the server is awake while the visitor is active), with delayed reactions in-process. A restart drops pending reactions; acceptable.

## History and pool size

- The seed creates 3 months of history (the rolling window); lurker backlogs reach back about a year.
- Starting numbers (seed):

  | | Creators | Casual posters | Lurkers |
  |---|---|---|---|
  | Posts in the window | 20–25 | 5–7 | backlog only |
  | Followers | 200–400 | 30–120 | 0–60 |
  | Following | 60–150 | 40–100 | 30–80, mostly creators |
  | Likes per post | 30–120 | 5–30 | 0–10 |
  | Comments per post | 3–12, some with replies | 0–4, occasionally with replies | 0–2 |

- The seed also creates 30 stories over the past 24 hours, so the tray isn't empty. Full seed behaviour: [seed.md](seed.md).
- Photos on hand (counted 2026-11-02, after removing 28 byte-identical duplicates): 2,316 creator (34–50 per folder; everything that passed review is kept), 2,598 everyday, 31 demo-visitor, 50 creator avatars. 4,995 in total.
- Everyday pool use: casual posters 800 (8 each), lurker backlogs 1,050, occasional lurker posts 351 (117 × 3), avatars 275 (100 casual posters + 175 lurkers). 2,476 used, 122 spare.

## Photo collection

- The user downloads about 50 photos per creator into one inbox folder in `~/Downloads`, searching the persona's theme; Claude sorts them into one folder per persona.
- Photos stay outside the repo (size, and the public repo would redistribute them); the repo holds only Cloudinary ids and captions.
- Local copies live in `~/Downloads/SocialMediaApp Demo User Photos/`, with the same folder names as Cloudinary (`creator-posts`, `regular-user-posts`, `creator-avatars`, `regular-user-avatars`, `visitor-posts`, `visitor-avatars`).
- Claude reviews each folder from small preview copies and moves faces, misfits and weak shots into a `to be deleted` subfolder; the user deletes them later.
- Casual posters and lurkers: the Wikimedia script searches each everyday-pool subject, keeps CC0 / public domain photos only, and saves about 22 per subject (now in `regular-user-posts/<subject>`); Claude reviews them the same way.

## Scripts

`seed:assign`, `seed:upload`, `seed:demo`, run in that order in `server/`: [seed.md](seed.md).

## Storage

- Photos: resized and uploaded up front to Cloudinary, under `demo-users/`: `creator-posts/<folder>`, `regular-user-posts/<subject>` (casual posters and lurkers), `creator-avatars`, `regular-user-avatars`, `visitor-posts/<subject>` and `visitor-avatars` (#17 demo visitors).
- JSON files in the repo, under `server/src/seed/data/`:
  - `users.json` — usernames, bios and tiers.
  - `creatorSwaps.json` — single-topic creators and each creator's related folders.
  - `assignments.json` — generated: each account's photos and avatar.
  - `avatarChoices.json` / `avatarExclusions.json` — reviewed regular-user avatars and rejected photos.
  - `photos.json` — generated by the upload: each photo's Cloudinary id, URL and size.
  - One caption file per folder (owner captions, guest captions, comments) plus a shared `replies.json`.
- Running state, in MongoDB: `demoaccountstates`, `demoscheduledevents` and `demoactivityruns` ([activity-job.md](activity-job.md#state-in-mongodb)).

## Free-tier fit (checked 2026-10-26)

- **Cloudinary free:** 25 credits; 1 credit = 1 GB stored, 1 GB bandwidth or 1,000 transformations, shared. Storage is the running total, bandwidth a rolling 30 days. Photos must be resized before upload (Unsplash originals are several MB each).
- **MongoDB Atlas free:** 0.5 GB data + indexes, 100 ops/s, paused after 30 days with zero connections. The rolling window keeps demo data bounded.
- **Render free:** web service sleeps after 15 min idle; cron jobs are not free ($1/month minimum per cron job).
- **GitHub Actions:** free in public repos (this repo is public); 5-minute minimum interval, runs can be delayed or dropped at the top of the hour; scheduled workflows in a public repo are disabled after 60 days with no repository activity.

## Licence findings (2026-10-26, not legal advice)

- Unsplash Terms §5: the licence excludes "People's images if they are recognizable in the Images".
- Pexels ToS: no use "in a misleading or deceptive way", nor "by giving the impression that Content was created by you, or a person other than the intellectual property rights holder"; consent may be needed for commercial use of recognisable people.
- Unsplash API: attribution (photographer + link) every time an image is shown, hotlinked URLs only, download events must be reported.
- Pexels API: attribution requested; bulk or systematic copying needs permission.
- Consequence: recognisable faces are out as avatars. Presenting stock photos as posts by fictional users conflicts with Pexels' "impression that Content was created by" someone else unless each photo is credited.

## Photo source research (2026-10-27, not legal advice)

- **Most free stock sites forbid passing photos off as someone else's work:** Pixabay ("giving the impression that Content was created by you"), Burst, ISO Republic, Gratisography, Pexels. Uncredited fictional-user posts conflict with these. Pixabay's API also bans "systematic mass downloads".
- **Unsplash:** plain licence fits, but only for manual downloads; automated access means the API, which requires credits.
- **Wikimedia Commons, CC0 / public domain only:** no credit required, downloading full files allowed, no bulk ban found; API asks for a descriptive User-Agent and serial requests. Files must be filtered to CC0 / PD (Commons also has CC BY), and people screened out. Quality for lifestyle shots is uneven.
- **Flickr CC0 / PDM:** ~24M photos, licence filter in the API, but the API terms limit caching / storing photos, require a "uses the Flickr API" notice, and restrict commercial use.
- **Openverse, Smithsonian, StockSnap, Kaboompics, Picjumbo, Shutterstock, Dreamstime:** pages blocked automated reading; unverified.
- **Paid (Adobe Stock, Depositphotos, 123RF, iStock):** ~€27,000–$36,000 for 4,000 images on one-time credits, and all forbid letting others download or access the file (a public image URL); Depositphotos forbids "Impersonate another person using the Files"; iStock needs an extended licence to store on a server. Not viable.

## Unsplash API guidelines (2026-10-27, not legal advice)

- Rate limits: demo 50 requests/hour ("perfect for demo apps"), production 1,000/hour after review; image loads don't count. Seeding ~3,000 photos is ~100 list requests.
- Required: credit next to every displayed photo, photographer and Unsplash links with `?utm_source=<app>&utm_medium=referral`; use the image URLs the API returns (keep `ixid`), only supported resize params; trigger `download_location` when a photo is put into a post; keys server-side; privacy policy if users use the app.
- **Risk:** guideline "The API is to be used for non-automated, high-quality, and authentic experiences", and API terms forbid use that "is deceptive, unethical, false or misleading". A script auto-picking photos for fictional accounts doesn't clearly fit. Needs written confirmation from api@unsplash.com before relying on it.

## Open

- Whether captions still credit the photographer, with labelled caption links.

## Creator personas

Folder name — Unsplash search — what the account is. Ticked when the folder has passed review. Downloads go in `~/Downloads/Unsplash/<folder>`.

- [x] `c01-alpine-hiker` — alpine hiking trail — a hiker's mountain trips
- [x] `c02-golden-retriever` — golden retriever — a dog walker who mostly looks after goldens
- [x] `c03-tabby-cat` — orange tabby cat — a cat sitter
- [x] `c04-latte-art` — latte art — a barista
- [x] `c05-sourdough` — sourdough bread — a home baker
- [x] `c06-houseplants` — houseplants — an indoor plant collector
- [x] `c07-surf-coast` — ocean waves — a surfer's coastline
- [x] `c08-road-bike` — road bike — a road cyclist
- [x] `c09-brutalism` — brutalist architecture — an architecture fan
- [x] `c10-tokyo-nights` — tokyo night street — a Tokyo street photographer
- [x] `c11-vintage-cars` — vintage car — a classic car fan
- [x] `c12-vinyl` — vinyl records — a record collector
- [x] `c13-desert-roads` — desert road — a road-tripper
- [x] `c14-iceland` — iceland landscape — an Iceland traveller
- [x] `c15-misty-forest` — misty forest — a forest walker
- [x] `c16-tropical-beach` — tropical beach — a beach traveller
- [x] `c17-ramen` — ramen — a ramen hunter
- [x] `c18-pasta` — homemade pasta — a home cook
- [x] `c19-cocktails` — cocktail — a home bartender
- [x] `c20-vineyards` — vineyard — a wine lover
- [x] `c21-bouquets` — flower bouquet — a florist
- [x] `c22-cactus` — cactus — a cactus grower
- [x] `c23-pottery` — handmade pottery — a potter
- [x] `c24-books` — bookshelf — a reader
- [x] `c25-scandi-interior` — scandinavian interior — an interior design fan
- [x] `c26-camping` — camping tent — a camper
- [x] `c27-sailing` — sailboat — a sailor
- [x] `c28-birds` — birds wildlife — a birdwatcher
- [x] `c29-horses` — horse — a riding stable
- [x] `c30-ski-slopes` — ski slope snow — a skier
- [x] `c31-mountain-lakes` — mountain lake — a lake chaser
- [x] `c32-paris` — paris street — a Paris local
- [x] `c33-new-york` — new york city — a New Yorker
- [x] `c34-london` — london architecture — a Londoner
- [x] `c35-street-food` — street food — a street food traveller
- [x] `c36-pastry` — pastry — a pastry baker
- [x] `c37-farmers-market` — farmers market — a market regular
- [x] `c38-autumn` — autumn leaves — a seasons photographer
- [x] `c39-street-art` — street art mural — a street art hunter
- [x] `c40-motorcycles` — motorcycle — a motorcyclist
- [x] `c41-lighthouses` — lighthouse coast — a lighthouse collector
- [x] `c42-veg-garden` — vegetable garden — a vegetable gardener
- [x] `c43-rainy-city` — rainy window — a rainy-day photographer
- [x] `c44-sunsets` — sunset sky — a sunset chaser
- [x] `c45-night-sky` — milky way night sky — an astrophotographer
- [x] `c46-coral-reef` — coral reef — a diver
- [x] `c47-trains` — train station — a rail traveller
- [x] `c48-japanese-garden` — japanese garden — a Japan garden visitor
- [x] `c49-brunch` — brunch — a brunch regular
- [x] `c50-cabins` — mountain cabin — a cabin stays traveller

## Everyday pool

Draft. Wikimedia searches for casual posters and lurkers.

- Casual posters: 8 random subjects each; one or two may repeat so the account feels like one person.
- Lurkers: 1–5 random subjects each, one photo per subject, plus a few more for the third who post occasionally.

coffee, breakfast, sunset, clouds, street, park, tree, flowers, beach, lake, river, mountain, snow, rain, city, bridge, building, train, car, bicycle, cat, dog, bird, cake, fruit, vegetables, pizza, bread, tea, moon, forest, field, garden, house, window, door, road, harbour, boat, church, castle, market, shop front, lamp, chair, books, candle, potted plant, mug, sea, autumn leaves, spring blossom, sandwich, pasta, dessert, wine, playground, bench, fence, statue, snowy street, tram, bus, canal, windmill, cathedral, fountain, waterfall, meadow, sunflowers, tulips, roses, orchard, pebble beach, sand dunes, sea cliffs, pumpkins, christmas tree, snowman, ice cream, pancakes, waffles, soup, salad, burger, sushi, cheese, cupcakes, chocolate cake, barbecue, picnic, strawberries, beer, typewriter, clock, chess, guitar, piano, knitting, vintage camera, kite, kayak, rowing boat, tennis court, football pitch, swimming pool, campervan, hammock, fireplace, balcony, staircase, hot air balloon, steam locomotive, skyline, rooftop view, carousel, tractor, sheep, cows, ducks

## Demo pool

One photo each, shared by all demo accounts. Fetched from Wikimedia (same filters as the everyday pool, no photo reused from it) into `~/Downloads/demo-pool/<subject>`; reviewed.

coffee, sunset, city street, park, beach, flowers, plate of food, cake, boats, lake, bridge, bicycle, train, tree, clouds, snow, garden, harbour, books, potted plant, dessert, bread, window view, forest path, river, building, fruit, tea, candle, sky, lego

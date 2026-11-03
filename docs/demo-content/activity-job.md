# Demo Content — Hourly Activity Job

What keeps the demo looking live after the seed ([seed.md](seed.md)): when it runs, what each run does, and with which numbers. Code: `server/src/demo/` (`demoActivity.js`, `contentPlanning.js`, `demoConfig.js`); all numbers below come from `demoConfig.js`.

## When it runs

- **GitHub Actions**, `.github/workflows/demo-activity.yml`:
  - Every hour at :17 UTC (`17 * * * *`), plus a manual "Run workflow" button.
  - Sends `POST <DEMO_ACTIVITY_URL>/internal/demo-activity` with `Authorization: Bearer <DEMO_ACTIVITY_TOKEN>` (both repository secrets).
  - Retries up to 6 times, 20 seconds apart, each attempt allowed 90 seconds, so it rides out Render's wake-up of about a minute. The workflow gives up after 10 minutes.
  - GitHub may run it late or drop it when busy, and disables it after 60 days with no activity in the repo.
- **Server start-up:** `server.js` starts a run as soon as the database connects, so every wake or deploy catches up on missed hours.
- **Endpoint** (`POST /internal/demo-activity`):
  - 404 when the server has no `DEMO_ACTIVITY_TOKEN`; 401 when the header is missing or wrong (constant-time comparison).
  - Otherwise starts a run in the background and answers 202 straight away.
- **One run at a time** per server process; a trigger during a run is ignored. A failed run is logged (`Could not run demo activity`) and picked up by the next trigger.

## What a run does

1. Reads `demoactivityruns`. If there's none (seed never ran), stops.
2. Works out the hours to process: every full UTC hour after `lastCompletedHour`, up to the hour that ended last, but at most the latest 72. Older missed hours are skipped for good.
3. If there's no full hour to process: applies due scheduled events and stops (no rolling window).
4. Loads the data files from `server/src/seed/data/`, every account's state, and the demo accounts' follows.
5. Processes each hour in order (below), saving `lastCompletedHour` after each one, so a crash resumes where it stopped.
6. Applies every scheduled event that's due.
7. Applies the rolling window.

Everything a run creates for a past hour is dated inside that hour (a random minute), so catch-up after sleep backfills the timeline instead of dumping it on the present.

## Each hour

Posting hours are 08:00–22:00 UTC (15 hours, the 22:00 hour included).

### Posts (posting hours only)

- Every account with photos queued gets one roll per hour:

  | Tier                            | Average          | Chance per posting hour | Expected per day |
  | ------------------------------- | ---------------- | ----------------------- | ---------------- |
  | Creators (50)                   | 2.5 posts a week | 2.38%                   | 17.9             |
  | Casual posters (100)            | 0.5 a week       | 0.48%                   | 7.1              |
  | Lurkers (117 with later photos) | 1 every 60 days  | 0.11%                   | 2.0              |

- About 27 posts a day in total. These are averages from independent rolls, not schedules: an account can post twice in a day or not for weeks.
- A post uses the first photo in the account's queue. Accounts with an empty queue don't post until the rolling window returns a photo.
- The post gets a caption ([Captions](#captions)) and its likes and comments are planned straight away ([Engagement](#engagement-planned-per-post)).

### Stories (posting hours that started within the last 24 hours)

- 32.5 a day on average: 2 per hour, or 3 with a 16.7% chance.
- Each story picks a tier first — creators 60%, casual posters 30%, lurkers 10% — then a random account in it.
  - Eligible: every creator and casual poster, and lurkers that have queued photos or posts made by the job.
- The photo is a random one of the account's own photos (creators and casual posters: any photo assigned to them, posted or not; lurkers: their backlog).
- Stored as a fresh Cloudinary copy in `demo-users/story-copies`. The app's expired-stories job (at start-up and hourly while awake) deletes the story and its copy after 24 hours; the post's photo is never touched.
- Catch-up never creates stories for hours that started more than 24 hours ago; they would already be expired.

### Follows (every hour, all 24)

- **Follows:** 15 a day on average — 1 per hour with a 62.5% chance, otherwise none.
  - Follower: any demo account, uniformly.
  - Followed: a tier picked first — creators 60%, casual posters 25%, lurkers 15% — then a random account in it that the follower doesn't follow yet.
- **Unfollows:** 2 a day on average — 1 per hour with an 8.3% chance. A random demo account drops one of the demo accounts it follows.
- The job never unfollows real users. It only follows `user` accounts through the sign-up follows below.

### Sign-up follows (every hour)

- Each `user` account (not `persona` or `demo`) created in its first 7 days gets a persona follower with a 1-in-24 chance per hour (about 1 a day). The persona is picked by tier (`FOLLOW_TIER_WEIGHTS`) among those not following yet. Catch-up hours apply it to users that existed in that hour.
- The first 1–3 follows (first 10 minutes after sign-up) are in-process timers set at sign-up, not the job.

### Daily minimums (the 22:00 UTC hour)

Counts what demo accounts created since 00:00 UTC that day and tops up:

- Posts to 10, from random accounts with queued photos (not weighted by tier).
- Stories to 15, picked as above, if the hour is within the last 24 hours.
- Follows to 5, picked as above, using the day's follow count stored in `demoactivityruns`.

## Engagement, planned per post

Planned once, when the post is created, and stored as scheduled events in `demoscheduledevents`. Nothing new is planned for a post after that, so a post gets no new activity after 7 days.

|                            | Creators | Casual posters | Lurkers |
| -------------------------- | -------- | -------------- | ------- |
| Likes                      | 30–120   | 5–30           | 0–10    |
| Comments                   | 3–12     | 0–4            | 0–2     |
| Owner replies to a comment | 30%      | 10%            | never   |

- **Likes:**
  - Likers are the owner's followers first (random order), then other demo accounts; never the owner.
  - 1–3 of them land between 48 hours and 7 days after the post.
  - The rest land within the first 48 hours, bunched towards the start: half within 12 hours, about 70% within 24 hours.
- **Comments:**
  - Texts are different comments from the bank of the photo's source folder (its creator theme or everyday subject), so a swapped photo still gets fitting comments. The count is capped at the bank's size.
  - Commenters are the post's likers first if there are enough of them, otherwise the owner's followers first, then other demo accounts.
  - Each comment lands within 48 hours (75%) or between 48 hours and 7 days (25%).
- **Comment likes:** 30% of comments get 1–3 likes from the owner and the post's likers (never the commenter), each within 24 hours of the comment.
- **Replies:** the post owner replies `@<commenter> <reply>`, the reply picked from `replies.json`, within 24 hours of the comment.

## Captions

- 20% of posts have no caption.
- Otherwise the caption comes from the bank of the photo's source folder: the owner list when the photo is from the account's own creator folder, the guest list otherwise.
- Within one seed or one job run, each account works through a shuffled list, so its captions don't repeat until the list is used up. Each run starts fresh lists, so separate runs can repeat a caption.
- A re-posted photo never gets the caption it had last time.

## Reactions to uploads

- Every post uploaded by a `user` or `demo` account (any age; never `persona`) plans reactions from persona accounts, mostly from their persona followers, with texts from `genericComments.json`.
- First 10 minutes: likes from 25–35% of persona followers (at least 3) and 1–3 comments, as in-process timers (lost on restart).
- Next 48 hours: 1–5 likes and 0–2 comments, stored as scheduled events and applied by the job.

## Demo visitor clean-up

- Every run starts by removing `demo` accounts older than 24 hours (by `_id` time), even when the seed never ran.
- Per visitor: posts and their Cloudinary copies, profile picture upload, stories and copies, story views, comments and replies, likes, follows, mentions and scheduled events. The shared `visitor-avatars` images are never deleted.
- A visitor that fails to delete (e.g. Cloudinary error) is logged and retried next run.

## Scheduled events

- Three types: post like, comment (replies included), comment like.
- Each run applies every event due by now, oldest first, 1,000 at a time, and deletes them once applied.
- A like is never added twice. A comment is skipped if its post or parent comment was deleted, or if it already exists. A comment raises the post's `commentsCount`.

## Rolling window

After processing the hours, for every account:

- Takes its posts that aren't permanent (everything except the lurkers' seeded backlog), newest first.
- Always keeps the newest 20 (creators) or 5 (casual posters); lurkers keep none of the job's posts.
- Deletes any of the rest older than 90 days: the post, its comments and their replies, and its pending scheduled events.
- Puts the photo at the back of the account's queue and remembers its caption, so it returns months later with a different caption and fresh engagement.

## State in MongoDB

- `demoactivityruns` — one document: `lastCompletedHour`, and the current UTC day's follow count (`followDay`, `followCount`).
- `demoaccountstates` — one per demo account: user id, username, tier, creator folder, own photos, queue, posted photos (post id, photo, caption, permanent) and previous captions of photos waiting to be re-posted.
- `demoscheduledevents` — pending likes, comments and comment likes, each with the time it's due.

## First production runs (2026-11-02)

- The deploy's start-up run caught up from the seed: 52 posts, 155 comments, 2 stories, 1,082 events scheduled.
- The scheduled run at 16:17 UTC is the first one triggered by GitHub.

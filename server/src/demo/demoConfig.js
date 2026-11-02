const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

module.exports = {
	HOUR_MS,
	DAY_MS,
	DEMO_EMAIL_DOMAIN: 'demo.invalid',
	STORY_COPY_FOLDER: 'demo-users/story-copies',

	WINDOW_DAYS: 90,
	BACKLOG_DAYS: 365,
	FIRST_POSTING_HOUR: 8,
	LAST_POSTING_HOUR: 22,
	NO_CAPTION_SHARE: 0.2,

	EARLY_ENGAGEMENT_SHARE: 0.75,
	EARLY_ENGAGEMENT_HOURS: 48,
	LATE_ENGAGEMENT_HOURS: 168,
	LATE_LIKES: [1, 3],
	MAX_REPLY_DELAY_HOURS: 24,
	MAX_COMMENT_LIKE_DELAY_HOURS: 24,
	COMMENT_LIKE_CHANCE: 0.3,
	MAX_COMMENT_LIKES: 3,

	TIERS: {
		creator: {
			posts: [20, 25],
			postsPerWeek: 2.5,
			followers: [200, 400],
			following: [60, 150],
			likes: [30, 120],
			comments: [3, 12],
			replyChance: 0.3,
		},
		casualPoster: {
			posts: [5, 7],
			postsPerWeek: 0.5,
			followers: [30, 120],
			following: [40, 100],
			likes: [5, 30],
			comments: [0, 4],
			replyChance: 0.1,
		},
		lurker: {
			postsPerWeek: 7 / 60,
			followers: [0, 60],
			following: [30, 80],
			likes: [0, 10],
			comments: [0, 2],
			replyChance: 0,
		},
	},

	STORIES_PER_DAY: [25, 40],
	STORY_TIER_WEIGHTS: { creator: 6, casualPoster: 3, lurker: 1 },
	FOLLOW_TIER_WEIGHTS: { creator: 6, casualPoster: 2.5, lurker: 1.5 },
	MIN_POSTS_PER_DAY: 10,
	MIN_STORIES_PER_DAY: 15,
	MIN_FOLLOWS_PER_DAY: 5,
	FOLLOWS_PER_DAY: 15,
	UNFOLLOWS_PER_DAY: 2,
	MAX_CATCH_UP_HOURS: 72,
};

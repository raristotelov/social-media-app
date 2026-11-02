const fs = require('node:fs');
const path = require('node:path');

const { buildDemoData, DEMO_EMAIL_DOMAIN } = require('./buildDemoData');

const DATA_DIRECTORY = path.join(__dirname, 'data');
const NON_BANK_FILES = [
	'users.json',
	'creatorSwaps.json',
	'assignments.json',
	'avatarChoices.json',
	'avatarExclusions.json',
	'photos.json',
	'replies.json',
];
const NOW = new Date('2026-10-29T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const TIER_RANGES = {
	creator: { posts: [20, 25], likes: [30, 120], comments: [3, 12], following: [60, 150] },
	casualPoster: { posts: [5, 7], likes: [5, 30], comments: [0, 4], following: [40, 100] },
	lurker: { posts: [1, 5], likes: [0, 10], comments: [0, 2], following: [30, 80] },
};

const readJson = (fileName) => JSON.parse(fs.readFileSync(path.join(DATA_DIRECTORY, fileName), 'utf8'));

const collectSources = (value) => {
	if (typeof value === 'string') {
		return [value];
	}

	if (Array.isArray(value)) {
		return value.flatMap(collectSources);
	}

	if (value && typeof value === 'object') {
		return Object.entries(value)
			.filter(([key]) => key !== 'username' && key !== 'avatarSource')
			.flatMap(([, child]) => collectSources(child));
	}

	return [];
};

const buildFakePhotosManifest = (assignments) => {
	const manifest = { photos: {} };

	for (const source of new Set(collectSources(assignments))) {
		const [pool, group] = source.split('/');
		const groupKey = `${pool}/${group}`;

		manifest.photos[groupKey] = manifest.photos[groupKey] || [];
		manifest.photos[groupKey].push({
			source,
			imageIdentifier: `demo-users/${source}`,
			imageUrl: `https://cdn.example.com/demo-users/${source}`,
			imageWidth: 800,
			imageHeight: 600,
		});
	}

	return manifest;
};

const readCaptionBanks = () => {
	const fileNames = fs.readdirSync(DATA_DIRECTORY).filter((fileName) => fileName.endsWith('.json') && !NON_BANK_FILES.includes(fileName));

	return new Map(fileNames.map((fileName) => [path.parse(fileName).name, readJson(fileName)]));
};

const inRange = (value, [min, max]) => value >= min && value <= max;

describe('buildDemoData', () => {
	const users = readJson('users.json');
	const assignments = readJson('assignments.json');
	const replies = readJson('replies.json').replies;
	const captionBanks = readCaptionBanks();
	const photosManifest = buildFakePhotosManifest(assignments);
	const tierByUsername = new Map([
		...users.creators.map((user) => [user.username, 'creator']),
		...users.casualPosters.map((user) => [user.username, 'casualPoster']),
		...users.lurkers.map((user) => [user.username, 'lurker']),
	]);
	const assignmentByUsername = new Map(
		[...assignments.creators, ...assignments.casualPosters, ...assignments.lurkers].map((assignment) => [assignment.username, assignment]),
	);

	let data;
	let usersById;
	let postsById;
	let postsByUserId;
	let commentsByPostId;
	let topLevelCommentsByPostId;

	const tierOfUser = (user) => tierByUsername.get(user.username);
	const tierOfPost = (post) => tierOfUser(usersById.get(String(post.userId)));

	beforeAll(() => {
		data = buildDemoData({ users, assignments, photosManifest, captionBanks, replies, now: NOW });

		usersById = new Map(data.users.map((user) => [String(user._id), user]));
		postsById = new Map(data.posts.map((post) => [String(post._id), post]));
		postsByUserId = new Map(data.users.map((user) => [String(user._id), []]));
		commentsByPostId = new Map(data.posts.map((post) => [String(post._id), []]));
		topLevelCommentsByPostId = new Map(data.posts.map((post) => [String(post._id), []]));

		for (const post of data.posts) {
			postsByUserId.get(String(post.userId)).push(post);
		}

		for (const comment of data.comments) {
			commentsByPostId.get(String(comment.userPostId)).push(comment);

			if (!comment.parentCommentId) {
				topLevelCommentsByPostId.get(String(comment.userPostId)).push(comment);
			}
		}
	});

	describe('accounts', () => {
		it('should build 500 demo accounts', () => {
			expect(data.users).toHaveLength(500);
		});

		it('should build 50 creators, 100 casual posters and 350 lurkers', () => {
			const counts = { creator: 0, casualPoster: 0, lurker: 0 };

			data.users.forEach((user) => {
				counts[tierOfUser(user)] += 1;
			});

			expect(counts).toEqual({ creator: 50, casualPoster: 100, lurker: 350 });
		});

		it('should give every account an @demo.invalid email equal to its username', () => {
			const mismatches = data.users.filter(
				(user) => user.email !== `${user.username}@${DEMO_EMAIL_DOMAIN}` || !user.email.endsWith('@demo.invalid'),
			);

			expect(mismatches).toEqual([]);
		});

		it('should give every account a unique username', () => {
			expect(new Set(data.users.map((user) => user.username)).size).toBe(500);
		});

		it('should give every account at least one post', () => {
			const withoutPosts = data.users.filter((user) => !postsByUserId.get(String(user._id)).length);

			expect(withoutPosts).toEqual([]);
		});

		it('should set a profile picture only for accounts that have an avatar assignment', () => {
			const mismatches = data.users.filter((user) => Boolean(user.profilePicture) !== Boolean(assignmentByUsername.get(user.username).avatar));

			expect(mismatches).toEqual([]);
		});

		it('should list exactly the account own post ids in user.posts', () => {
			const mismatches = data.users.filter((user) => {
				const ownPostIds = postsByUserId
					.get(String(user._id))
					.map((post) => String(post._id))
					.sort();

				return JSON.stringify(user.posts.map(String).sort()) !== JSON.stringify(ownPostIds);
			});

			expect(mismatches).toEqual([]);
		});

		it('should list user.posts oldest first', () => {
			const unsorted = data.users.filter((user) => {
				const times = user.posts.map((postId) => postsById.get(String(postId)).createdAt.getTime());

				return times.some((time, index) => index > 0 && time < times[index - 1]);
			});

			expect(unsorted).toEqual([]);
		});
	});

	describe('posts per tier', () => {
		it.each(['creator', 'casualPoster'])('should give each %s a post count within the tier range', (tier) => {
			const outOfRange = data.users
				.filter((user) => tierOfUser(user) === tier)
				.filter((user) => !inRange(postsByUserId.get(String(user._id)).length, TIER_RANGES[tier].posts));

			expect(outOfRange).toEqual([]);
		});

		it('should post the whole backlog for every lurker, between 1 and 5 posts', () => {
			const mismatches = data.users
				.filter((user) => tierOfUser(user) === 'lurker')
				.filter((user) => {
					const count = postsByUserId.get(String(user._id)).length;

					return count !== assignmentByUsername.get(user.username).backlog.length || !inRange(count, TIER_RANGES.lurker.posts);
				});

			expect(mismatches).toEqual([]);
		});

		it('should spread lurkers evenly across 1 to 5 posts, 70 each', () => {
			const counts = new Map();

			data.users
				.filter((user) => tierOfUser(user) === 'lurker')
				.forEach((user) => {
					const count = postsByUserId.get(String(user._id)).length;
					counts.set(count, (counts.get(count) || 0) + 1);
				});

			expect([...counts.entries()].sort()).toEqual([
				[1, 70],
				[2, 70],
				[3, 70],
				[4, 70],
				[5, 70],
			]);
		});
	});

	describe('post photos', () => {
		it('should use a unique imageIdentifier on every post', () => {
			expect(new Set(data.posts.map((post) => post.imageIdentifier)).size).toBe(data.posts.length);
		});

		it('should use a unique imageUrl on every post', () => {
			expect(new Set(data.posts.map((post) => post.imageUrl)).size).toBe(data.posts.length);
		});

		it('should post each photo source at most once', () => {
			const postedSources = data.posts.map((post) => post.imageIdentifier.replace('demo-users/', ''));

			expect(new Set(postedSources).size).toBe(postedSources.length);
		});

		it('should only post photos from the account own assignment', () => {
			const foreign = data.posts.filter((post) => {
				const username = usersById.get(String(post.userId)).username;
				const assignment = assignmentByUsername.get(username);
				const allowed = new Set([...(assignment.photos || []), ...(assignment.backlog || [])]);

				return !allowed.has(post.imageIdentifier.replace('demo-users/', ''));
			});

			expect(foreign).toEqual([]);
		});

		it('should copy the manifest dimensions and url onto the post', () => {
			const [post] = data.posts;

			expect(post).toEqual(
				expect.objectContaining({ imageUrl: `https://cdn.example.com/${post.imageIdentifier}`, imageWidth: 800, imageHeight: 600 }),
			);
		});
	});

	describe('likes', () => {
		it.each(['creator', 'casualPoster', 'lurker'])('should keep likes per %s post within the tier range', (tier) => {
			const outOfRange = data.posts
				.filter((post) => tierOfPost(post) === tier)
				.filter((post) => !inRange(post.likes.length, TIER_RANGES[tier].likes));

			expect(outOfRange).toEqual([]);
		});

		it('should not let anyone like their own post', () => {
			expect(data.posts.filter((post) => post.likes.map(String).includes(String(post.userId)))).toEqual([]);
		});

		it('should not like a post twice from the same account', () => {
			expect(data.posts.filter((post) => new Set(post.likes.map(String)).size !== post.likes.length)).toEqual([]);
		});

		it('should only be liked by demo accounts', () => {
			const strangers = data.posts.filter((post) => post.likes.some((likerId) => !usersById.has(String(likerId))));

			expect(strangers).toEqual([]);
		});

		it('should not let anyone like their own comment', () => {
			expect(data.comments.filter((comment) => comment.likes.map(String).includes(String(comment.userId)))).toEqual([]);
		});
	});

	describe('comments', () => {
		it.each(['creator', 'casualPoster', 'lurker'])('should keep top-level comments per %s post within the tier range', (tier) => {
			const outOfRange = data.posts
				.filter((post) => tierOfPost(post) === tier)
				.filter((post) => !inRange(topLevelCommentsByPostId.get(String(post._id)).length, TIER_RANGES[tier].comments));

			expect(outOfRange).toEqual([]);
		});

		it('should give each post a commentsCount equal to its comments including replies', () => {
			const mismatches = data.posts.filter((post) => post.commentsCount !== commentsByPostId.get(String(post._id)).length);

			expect(mismatches).toEqual([]);
		});

		it('should not let a post owner comment top-level on their own post', () => {
			const selfComments = data.comments.filter(
				(comment) => !comment.parentCommentId && String(comment.userId) === String(postsById.get(String(comment.userPostId)).userId),
			);

			expect(selfComments).toEqual([]);
		});

		it('should only attach comments to posts that exist', () => {
			expect(data.comments.filter((comment) => !postsById.has(String(comment.userPostId)))).toEqual([]);
		});

		it('should never leave lurker posts with replies', () => {
			const lurkerReplies = data.comments.filter(
				(comment) => comment.parentCommentId && tierOfPost(postsById.get(String(comment.userPostId))) === 'lurker',
			);

			expect(lurkerReplies).toEqual([]);
		});
	});

	describe('replies', () => {
		const repliesOf = () => data.comments.filter((comment) => comment.parentCommentId);

		it('should create some replies', () => {
			expect(repliesOf().length).toBeGreaterThan(0);
		});

		it('should attach every reply to a top-level comment on the same post', () => {
			const commentsById = new Map(data.comments.map((comment) => [String(comment._id), comment]));
			const invalid = repliesOf().filter((reply) => {
				const parent = commentsById.get(String(reply.parentCommentId));

				return !parent || parent.parentCommentId !== null || String(parent.userPostId) !== String(reply.userPostId);
			});

			expect(invalid).toEqual([]);
		});

		it('should author every reply as the post owner', () => {
			const invalid = repliesOf().filter((reply) => String(reply.userId) !== String(postsById.get(String(reply.userPostId)).userId));

			expect(invalid).toEqual([]);
		});

		it('should start every reply with @ and the parent commenter username followed by a space', () => {
			const commentsById = new Map(data.comments.map((comment) => [String(comment._id), comment]));
			const invalid = repliesOf().filter((reply) => {
				const parent = commentsById.get(String(reply.parentCommentId));

				return !reply.text.startsWith(`@${usersById.get(String(parent.userId)).username} `);
			});

			expect(invalid).toEqual([]);
		});

		it('should mention the parent commenter in every reply', () => {
			const commentsById = new Map(data.comments.map((comment) => [String(comment._id), comment]));
			const invalid = repliesOf().filter(
				(reply) => String(reply.mentionedUserId) !== String(commentsById.get(String(reply.parentCommentId)).userId),
			);

			expect(invalid).toEqual([]);
		});

		it('should leave top-level comments without a mention', () => {
			expect(data.comments.filter((comment) => !comment.parentCommentId && comment.mentionedUserId !== null)).toEqual([]);
		});

		it('should follow the mention with text from the replies bank', () => {
			const invalid = repliesOf().filter((reply) => !replies.includes(reply.text.replace(/^@\S+ /, '')));

			expect(invalid).toEqual([]);
		});
	});

	describe('follow graph', () => {
		it.each(['creator', 'casualPoster', 'lurker'])('should keep following counts for %s within the tier range', (tier) => {
			const outOfRange = data.users
				.filter((user) => tierOfUser(user) === tier)
				.filter((user) => !inRange(user.following.length, TIER_RANGES[tier].following));

			expect(outOfRange).toEqual([]);
		});

		it('should list a follower in the followed account followers and the reverse', () => {
			const asymmetric = data.users.filter(
				(user) =>
					user.following.some((followedId) => !usersById.get(String(followedId)).followers.map(String).includes(String(user._id))) ||
					user.followers.some((followerId) => !usersById.get(String(followerId)).following.map(String).includes(String(user._id))),
			);

			expect(asymmetric).toEqual([]);
		});

		it('should not let anyone follow themselves', () => {
			const selfFollowers = data.users.filter(
				(user) => user.following.map(String).includes(String(user._id)) || user.followers.map(String).includes(String(user._id)),
			);

			expect(selfFollowers).toEqual([]);
		});

		it('should not follow the same account twice', () => {
			expect(data.users.filter((user) => new Set(user.following.map(String)).size !== user.following.length)).toEqual([]);
		});
	});

	describe('dates', () => {
		it('should not date any post after now', () => {
			expect(data.posts.filter((post) => post.createdAt > NOW)).toEqual([]);
		});

		it('should not date any comment after now', () => {
			expect(data.comments.filter((comment) => comment.createdAt > NOW)).toEqual([]);
		});

		it('should not date a comment before its post', () => {
			const early = data.comments.filter((comment) => comment.createdAt < postsById.get(String(comment.userPostId)).createdAt);

			expect(early).toEqual([]);
		});

		it('should not date a reply before the comment it answers', () => {
			const commentsById = new Map(data.comments.map((comment) => [String(comment._id), comment]));
			const early = data.comments.filter(
				(comment) => comment.parentCommentId && comment.createdAt < commentsById.get(String(comment.parentCommentId)).createdAt,
			);

			expect(early).toEqual([]);
		});

		it.each(['creator', 'casualPoster'])('should date %s posts within the last 90 days', (tier) => {
			const outside = data.posts
				.filter((post) => tierOfPost(post) === tier)
				.filter((post) => post.createdAt < new Date(NOW.getTime() - 90 * DAY_MS));

			expect(outside).toEqual([]);
		});

		it('should date lurker posts within the last 365 days', () => {
			const outside = data.posts
				.filter((post) => tierOfPost(post) === 'lurker')
				.filter((post) => post.createdAt < new Date(NOW.getTime() - 365 * DAY_MS));

			expect(outside).toEqual([]);
		});

		it('should set updatedAt equal to createdAt on every post', () => {
			expect(data.posts.filter((post) => post.updatedAt.getTime() !== post.createdAt.getTime())).toEqual([]);
		});
	});

	describe('story plans', () => {
		const planTiers = () => data.storyPlans.map((plan) => tierOfUser(usersById.get(String(plan.userId))));

		it('should plan 30 stories', () => {
			expect(data.storyPlans).toHaveLength(30);
		});

		it('should plan 18 stories from creators, 9 from casual posters and 3 from lurkers', () => {
			const tiers = planTiers();

			expect(tiers.filter((tier) => tier === 'creator')).toHaveLength(18);
			expect(tiers.filter((tier) => tier === 'casualPoster')).toHaveLength(9);
			expect(tiers.filter((tier) => tier === 'lurker')).toHaveLength(3);
		});

		it('should only plan lurker stories for lurkers who still post', () => {
			const lurkerPlans = data.storyPlans.filter((plan) => tierOfUser(usersById.get(String(plan.userId))) === 'lurker');
			const withoutLaterPhotos = lurkerPlans.filter(
				(plan) => !assignmentByUsername.get(usersById.get(String(plan.userId)).username).laterPhotos?.length,
			);

			expect(withoutLaterPhotos).toEqual([]);
		});

		it('should plan at most one story per account', () => {
			expect(new Set(data.storyPlans.map((plan) => String(plan.userId))).size).toBe(30);
		});

		it('should reuse one of the account own photos for each story', () => {
			const foreign = data.storyPlans.filter((plan) => {
				const user = usersById.get(String(plan.userId));
				const assignment = assignmentByUsername.get(user.username);
				const ownPhotos = tierOfUser(user) === 'lurker' ? assignment.backlog : assignment.photos;

				return !ownPhotos.includes(plan.source);
			});

			expect(foreign).toEqual([]);
		});

		it('should attach the manifest photo for the planned source', () => {
			expect(data.storyPlans.filter((plan) => plan.photo.source !== plan.source)).toEqual([]);
		});

		it('should date every story within the last 24 hours', () => {
			const outside = data.storyPlans.filter((plan) => plan.createdAt > NOW || plan.createdAt < new Date(NOW.getTime() - DAY_MS));

			expect(outside).toEqual([]);
		});
	});

	describe('account states', () => {
		const sourceOfPost = (post) => post.imageIdentifier.replace('demo-users/', '');
		const folderByUsername = new Map([...users.creators, ...users.casualPosters, ...users.lurkers].map((user) => [user.username, user.folder]));
		let statesByUserId;

		const stateOf = (user) => statesByUserId.get(String(user._id));
		const statesOfTier = (...tiers) => data.accountStates.filter((state) => tiers.includes(state.tier));

		beforeAll(() => {
			statesByUserId = new Map(data.accountStates.map((state) => [String(state.userId), state]));
		});

		it('should build one state for each account', () => {
			expect(data.accountStates).toHaveLength(500);
			expect(new Set(data.accountStates.map((state) => String(state.userId)))).toEqual(new Set(data.users.map((user) => String(user._id))));
		});

		it('should copy the username of the account', () => {
			expect(data.users.filter((user) => stateOf(user).username !== user.username)).toEqual([]);
		});

		it('should set the tier of the account', () => {
			expect(data.users.filter((user) => stateOf(user).tier !== tierOfUser(user))).toEqual([]);
		});

		it('should set the folder of a creator and no folder for anyone else', () => {
			expect(data.users.filter((user) => stateOf(user).folder !== folderByUsername.get(user.username))).toEqual([]);
		});

		it('should list the assigned photos as ownPhotos for creators and casual posters', () => {
			const mismatches = statesOfTier('creator', 'casualPoster').filter(
				(state) => JSON.stringify(state.ownPhotos) !== JSON.stringify(assignmentByUsername.get(state.username).photos),
			);

			expect(mismatches).toEqual([]);
		});

		it('should list the backlog as ownPhotos for lurkers', () => {
			const mismatches = statesOfTier('lurker').filter(
				(state) => JSON.stringify(state.ownPhotos) !== JSON.stringify(assignmentByUsername.get(state.username).backlog),
			);

			expect(mismatches).toEqual([]);
		});

		describe('queue', () => {
			it('should queue exactly the own photos not yet posted for creators and casual posters', () => {
				const mismatches = statesOfTier('creator', 'casualPoster').filter((state) => {
					const posted = new Set(state.posted.map((entry) => entry.source));
					const expected = state.ownPhotos.filter((source) => !posted.has(source));

					return JSON.stringify(state.queue) !== JSON.stringify(expected);
				});

				expect(mismatches).toEqual([]);
			});

			it('should queue the photos after the posted ones, in assignment order, for creators and casual posters', () => {
				const mismatches = statesOfTier('creator', 'casualPoster').filter(
					(state) =>
						JSON.stringify(state.queue) !== JSON.stringify(assignmentByUsername.get(state.username).photos.slice(state.posted.length)),
				);

				expect(mismatches).toEqual([]);
			});

			it('should leave every creator and casual poster with photos still queued', () => {
				expect(statesOfTier('creator', 'casualPoster').filter((state) => state.queue.length === 0)).toEqual([]);
			});

			it('should queue the later photos of a lurker, in order', () => {
				const mismatches = statesOfTier('lurker').filter(
					(state) => JSON.stringify(state.queue) !== JSON.stringify(assignmentByUsername.get(state.username).laterPhotos || []),
				);

				expect(mismatches).toEqual([]);
			});

			it('should leave an empty queue for lurkers who never post again', () => {
				const neverPostAgain = statesOfTier('lurker').filter((state) => !assignmentByUsername.get(state.username).laterPhotos?.length);

				expect(neverPostAgain.length).toBeGreaterThan(0);
				expect(neverPostAgain.filter((state) => state.queue.length > 0)).toEqual([]);
			});

			it('should queue photos for the 117 lurkers who still post', () => {
				expect(statesOfTier('lurker').filter((state) => state.queue.length > 0)).toHaveLength(117);
			});

			it('should never queue a photo that is already posted', () => {
				const overlapping = data.accountStates.filter((state) =>
					state.queue.some((source) => state.posted.some((entry) => entry.source === source)),
				);

				expect(overlapping).toEqual([]);
			});

			it('should never queue the same photo twice', () => {
				expect(data.accountStates.filter((state) => new Set(state.queue).size !== state.queue.length)).toEqual([]);
			});

			it('should queue the lurker later photos separately from the backlog used as ownPhotos', () => {
				const overlapping = statesOfTier('lurker').filter((state) => state.queue.some((source) => state.ownPhotos.includes(source)));

				expect(overlapping).toEqual([]);
			});
		});

		describe('posted', () => {
			it('should have one entry for each post of the account', () => {
				const mismatches = data.users.filter((user) => stateOf(user).posted.length !== postsByUserId.get(String(user._id)).length);

				expect(mismatches).toEqual([]);
			});

			it('should record the postId of each post', () => {
				const mismatches = data.users.filter(
					(user) =>
						JSON.stringify(
							stateOf(user)
								.posted.map((entry) => String(entry.postId))
								.sort(),
						) !==
						JSON.stringify(
							postsByUserId
								.get(String(user._id))
								.map((post) => String(post._id))
								.sort(),
						),
				);

				expect(mismatches).toEqual([]);
			});

			it('should record the source photo of each post', () => {
				const mismatches = data.posts.filter((post) => {
					const entry = stateOf({ _id: post.userId }).posted.find((candidate) => String(candidate.postId) === String(post._id));

					return !entry || entry.source !== sourceOfPost(post);
				});

				expect(mismatches).toEqual([]);
			});

			it('should record the caption each post was given', () => {
				const mismatches = data.posts.filter((post) => {
					const entry = stateOf({ _id: post.userId }).posted.find((candidate) => String(candidate.postId) === String(post._id));

					return entry.caption !== post.caption;
				});

				expect(mismatches).toEqual([]);
			});

			it('should mark lurker backlog posts as permanent', () => {
				const lurkerEntries = statesOfTier('lurker').flatMap((state) => state.posted);

				expect(lurkerEntries.length).toBeGreaterThan(0);
				expect(lurkerEntries.filter((entry) => entry.permanent !== true)).toEqual([]);
			});

			it('should not mark creator and casual poster posts as permanent', () => {
				const entries = statesOfTier('creator', 'casualPoster').flatMap((state) => state.posted);

				expect(entries.filter((entry) => entry.permanent !== false)).toEqual([]);
			});

			it('should cover the whole backlog of every lurker', () => {
				const mismatches = statesOfTier('lurker').filter(
					(state) => state.posted.length !== assignmentByUsername.get(state.username).backlog.length,
				);

				expect(mismatches).toEqual([]);
			});

			it('should only record photos from the own photos of the account', () => {
				const foreign = data.accountStates.filter((state) => state.posted.some((entry) => !state.ownPhotos.includes(entry.source)));

				expect(foreign).toEqual([]);
			});

			it('should record how many posts the tier range allows for creators and casual posters', () => {
				const outOfRange = statesOfTier('creator', 'casualPoster').filter(
					(state) => !inRange(state.posted.length, TIER_RANGES[state.tier].posts),
				);

				expect(outOfRange).toEqual([]);
			});
		});
	});

	describe('input errors', () => {
		it('should throw when a posted photo is missing from the manifest', () => {
			const [{ photos }] = assignments.creators;
			const missing = photos[0];
			const manifestWithoutPhoto = Object.fromEntries(
				Object.entries(photosManifest.photos).map(([group, entries]) => [group, entries.filter((entry) => entry.source !== missing)]),
			);

			expect(() =>
				buildDemoData({ users, assignments, photosManifest: { photos: manifestWithoutPhoto }, captionBanks, replies, now: NOW }),
			).toThrow(`${missing} is not in photos.json`);
		});

		it('should throw when an account has no photo assignment', () => {
			const trimmed = { ...assignments, creators: assignments.creators.slice(1) };

			expect(() => buildDemoData({ users, assignments: trimmed, photosManifest, captionBanks, replies, now: NOW })).toThrow(
				`${users.creators[0].username} has no photo assignment`,
			);
		});

		it('should throw when a photo folder has no caption bank', () => {
			const banks = new Map(captionBanks);
			banks.delete('c01-alpine-hiker');

			expect(() => buildDemoData({ users, assignments, photosManifest, captionBanks: banks, replies, now: NOW })).toThrow(
				'No caption bank for c01-alpine-hiker',
			);
		});
	});
});

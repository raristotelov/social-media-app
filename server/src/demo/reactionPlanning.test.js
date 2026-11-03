const mongoose = require('mongoose');

const { createRandom } = require('./random');
const { planUploadReactions, planSignUpFollows, planStarterReactions } = require('./reactionPlanning');

const NOW = new Date('2026-11-03T12:00:00.000Z');
const SEEDS = Array.from({ length: 40 }, (value, index) => index + 1);
const TEN_MINUTES_MS = 10 * 60 * 1000;
const FIFTEEN_SECONDS_MS = 15 * 1000;
const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
const GENERIC_COMMENTS = Array.from({ length: 20 }, (value, index) => `Generic comment ${index + 1}`);

const buildIds = (count) => Array.from({ length: count }, () => new mongoose.Types.ObjectId());

const ofType = (events, type) => events.filter((event) => event.type === type);

const unique = (ids) => new Set(ids.map(String));

describe('planUploadReactions', () => {
	const ownerId = new mongoose.Types.ObjectId();
	const postId = new mongoose.Types.ObjectId();
	const personaIds = buildIds(80);

	const plan = ({ followerCount = 40, random = createRandom(1), ...overrides } = {}) =>
		planUploadReactions({
			postId,
			ownerId,
			now: NOW,
			followerIds: personaIds.slice(0, followerCount),
			personaIds,
			genericComments: GENERIC_COMMENTS,
			random,
			...overrides,
		});

	describe('the likes within the first 10 minutes', () => {
		it('should come from 25 to 35 percent of the followers', () => {
			SEEDS.forEach((seed) => {
				const likes = ofType(plan({ followerCount: 40, random: createRandom(seed) }).immediate, 'postLike');

				expect(likes.length).toBeGreaterThanOrEqual(10);
				expect(likes.length).toBeLessThanOrEqual(14);
			});
		});

		it('should scale with the number of followers', () => {
			const likes = ofType(plan({ followerCount: 80 }).immediate, 'postLike');

			expect(likes.length).toBeGreaterThanOrEqual(20);
			expect(likes.length).toBeLessThanOrEqual(28);
		});

		it('should be at least 3 for an account with few followers', () => {
			SEEDS.forEach((seed) => {
				expect(ofType(plan({ followerCount: 4, random: createRandom(seed) }).immediate, 'postLike').length).toBeGreaterThanOrEqual(3);
			});
		});

		it('should be at least 3 for an account with no followers', () => {
			expect(ofType(plan({ followerCount: 0 }).immediate, 'postLike')).toHaveLength(3);
		});

		it('should come from personas that do not follow when the followers are not enough', () => {
			const likerIds = ofType(plan({ followerCount: 0 }).immediate, 'postLike').map((event) => event.userId);

			expect(likerIds.every((id) => personaIds.map(String).includes(String(id)))).toBe(true);
		});

		it('should prefer the followers over other personas', () => {
			const followers = new Set(personaIds.slice(0, 40).map(String));
			const likes = ofType(plan({ followerCount: 40 }).immediate, 'postLike');

			expect(likes.every((event) => followers.has(String(event.userId)))).toBe(true);
		});

		it('should target the new post', () => {
			ofType(plan().immediate, 'postLike').forEach((event) => expect(String(event.userPostId)).toBe(String(postId)));
		});
	});

	describe('the comments within the first 10 minutes', () => {
		it('should number 1 to 3', () => {
			const counts = new Set();

			SEEDS.forEach((seed) => {
				const comments = ofType(plan({ random: createRandom(seed) }).immediate, 'comment');

				expect(comments.length).toBeGreaterThanOrEqual(1);
				expect(comments.length).toBeLessThanOrEqual(3);
				counts.add(comments.length);
			});

			expect(counts).toEqual(new Set([1, 2, 3]));
		});

		it('should use the generic comment bank', () => {
			ofType(plan().immediate, 'comment').forEach((event) => expect(GENERIC_COMMENTS).toContain(event.text));
		});

		it('should carry a new comment id', () => {
			ofType(plan().immediate, 'comment').forEach((event) => expect(event.commentId).toBeInstanceOf(mongoose.Types.ObjectId));
		});

		it('should come from different accounts', () => {
			SEEDS.forEach((seed) => {
				const comments = ofType(plan({ random: createRandom(seed) }).immediate, 'comment');

				expect(unique(comments.map((event) => event.userId)).size).toBe(comments.length);
			});
		});

		it('should be top-level comments, not replies', () => {
			ofType(plan().immediate, 'comment').forEach((event) => expect(event.parentCommentId).toBeUndefined());
		});
	});

	describe('the timing of the first reactions', () => {
		it('should fall between 15 seconds and 10 minutes after the upload', () => {
			SEEDS.forEach((seed) => {
				plan({ random: createRandom(seed) }).immediate.forEach((event) => {
					expect(event.dueAt.getTime()).toBeGreaterThanOrEqual(NOW.getTime() + FIFTEEN_SECONDS_MS);
					expect(event.dueAt.getTime()).toBeLessThanOrEqual(NOW.getTime() + TEN_MINUTES_MS);
				});
			});
		});

		it('should not all arrive at the same moment', () => {
			const times = plan().immediate.map((event) => event.dueAt.getTime());

			expect(new Set(times).size).toBeGreaterThan(times.length / 2);
		});
	});

	describe('the reactions over the next 2 days', () => {
		it('should add 1 to 5 more likes', () => {
			SEEDS.forEach((seed) => {
				const likes = ofType(plan({ random: createRandom(seed) }).later, 'postLike');

				expect(likes.length).toBeGreaterThanOrEqual(1);
				expect(likes.length).toBeLessThanOrEqual(5);
			});
		});

		it('should add 0 to 2 more comments', () => {
			const counts = new Set();

			SEEDS.forEach((seed) => {
				const comments = ofType(plan({ random: createRandom(seed) }).later, 'comment');

				expect(comments.length).toBeLessThanOrEqual(2);
				counts.add(comments.length);
			});

			expect(counts).toEqual(new Set([0, 1, 2]));
		});

		it('should be due after the first 10 minutes and within 48 hours', () => {
			SEEDS.forEach((seed) => {
				plan({ random: createRandom(seed) }).later.forEach((event) => {
					expect(event.dueAt.getTime()).toBeGreaterThanOrEqual(NOW.getTime() + TEN_MINUTES_MS);
					expect(event.dueAt.getTime()).toBeLessThanOrEqual(NOW.getTime() + FORTY_EIGHT_HOURS_MS);
				});
			});
		});
	});

	describe('across the whole plan', () => {
		it('should never let the owner react to their own upload', () => {
			const { immediate, later } = plan({ personaIds: [ownerId, ...personaIds], followerIds: personaIds.slice(0, 20) });

			[...immediate, ...later].forEach((event) => expect(String(event.userId)).not.toBe(String(ownerId)));
		});

		it('should like once per account', () => {
			SEEDS.forEach((seed) => {
				const { immediate, later } = plan({ random: createRandom(seed) });
				const likerIds = ofType([...immediate, ...later], 'postLike').map((event) => event.userId);

				expect(unique(likerIds).size).toBe(likerIds.length);
			});
		});

		it('should plan fewer likes when there are not enough personas to like', () => {
			const twoPersonas = buildIds(2);
			const { immediate, later } = plan({ personaIds: twoPersonas, followerIds: twoPersonas });

			expect(ofType([...immediate, ...later], 'postLike').length).toBeLessThanOrEqual(2);
		});

		it('should plan nothing when there are no personas', () => {
			expect(plan({ personaIds: [], followerIds: [] })).toEqual({ immediate: [], later: [] });
		});
	});
});

describe('planSignUpFollows', () => {
	const userId = new mongoose.Types.ObjectId();
	const personas = [
		...buildIds(40).map((id) => ({ userId: id, tier: 'creator' })),
		...buildIds(40).map((id) => ({ userId: id, tier: 'casualPoster' })),
		...buildIds(40).map((id) => ({ userId: id, tier: 'lurker' })),
	];

	const plan = ({ random = createRandom(1), followerIds = [], ...overrides } = {}) =>
		planSignUpFollows({ userId, now: NOW, followerIds, personas, random, ...overrides });

	it('should plan 1 to 3 personas to follow', () => {
		const counts = new Set();

		SEEDS.forEach((seed) => {
			const events = plan({ random: createRandom(seed) });

			expect(events.length).toBeGreaterThanOrEqual(1);
			expect(events.length).toBeLessThanOrEqual(3);
			counts.add(events.length);
		});

		expect(counts).toEqual(new Set([1, 2, 3]));
	});

	it('should make each persona follow the new account', () => {
		plan().forEach((event) => {
			expect(event.type).toBe('follow');
			expect(String(event.targetUserId)).toBe(String(userId));
			expect(personas.map((persona) => String(persona.userId))).toContain(String(event.userId));
		});
	});

	it('should pick every persona once', () => {
		SEEDS.forEach((seed) => {
			const events = plan({ random: createRandom(seed) });

			expect(unique(events.map((event) => event.userId)).size).toBe(events.length);
		});
	});

	it('should fall between 15 seconds and 10 minutes after the sign-up', () => {
		SEEDS.forEach((seed) => {
			plan({ random: createRandom(seed) }).forEach((event) => {
				expect(event.dueAt.getTime()).toBeGreaterThanOrEqual(NOW.getTime() + FIFTEEN_SECONDS_MS);
				expect(event.dueAt.getTime()).toBeLessThanOrEqual(NOW.getTime() + TEN_MINUTES_MS);
			});
		});
	});

	it('should space the follows out one at a time', () => {
		const withSeveral = SEEDS.map((seed) => plan({ random: createRandom(seed) })).find((events) => events.length === 3);
		const times = withSeveral.map((event) => event.dueAt.getTime());

		expect(new Set(times).size).toBe(3);
		expect(times).toEqual([...times].sort((a, b) => a - b));
	});

	it('should skip personas that already follow the account', () => {
		const alreadyFollowing = personas.slice(0, 118).map((persona) => persona.userId);
		const remaining = personas.slice(118).map((persona) => String(persona.userId));

		SEEDS.forEach((seed) => {
			plan({ random: createRandom(seed), followerIds: alreadyFollowing }).forEach((event) => expect(remaining).toContain(String(event.userId)));
		});
	});

	it('should plan fewer follows when few personas are left', () => {
		const alreadyFollowing = personas.slice(1).map((persona) => persona.userId);

		expect(plan({ followerIds: alreadyFollowing })).toHaveLength(1);
	});

	it('should plan nothing when every persona already follows', () => {
		expect(plan({ followerIds: personas.map((persona) => persona.userId) })).toEqual([]);
	});

	it('should plan nothing when there are no personas', () => {
		expect(plan({ personas: [] })).toEqual([]);
	});

	it('should pick creators more often than lurkers', () => {
		const tierOf = new Map(personas.map((persona) => [String(persona.userId), persona.tier]));
		const counts = { creator: 0, casualPoster: 0, lurker: 0 };

		Array.from({ length: 300 }, (value, index) => index + 1).forEach((seed) => {
			plan({ random: createRandom(seed) }).forEach((event) => {
				counts[tierOf.get(String(event.userId))] += 1;
			});
		});

		expect(counts.creator).toBeGreaterThan(counts.lurker);
	});
});

describe('planStarterReactions', () => {
	const ownerId = new mongoose.Types.ObjectId();
	const personaIds = buildIds(60);
	const followBackIds = personaIds.slice(0, 20);

	const buildPosts = () => [
		{ _id: new mongoose.Types.ObjectId(), likes: personaIds.slice(0, 6), commenterIds: [] },
		{ _id: new mongoose.Types.ObjectId(), likes: personaIds.slice(2, 9), commenterIds: [personaIds[3]] },
	];

	const plan = ({ random = createRandom(1), posts = buildPosts(), ...overrides } = {}) =>
		planStarterReactions({
			ownerId,
			now: NOW,
			posts,
			followerIds: followBackIds,
			personaIds,
			genericComments: GENERIC_COMMENTS,
			random,
			...overrides,
		});

	it('should add 1 to 5 likes', () => {
		SEEDS.forEach((seed) => {
			const likes = ofType(plan({ random: createRandom(seed) }), 'postLike');

			expect(likes.length).toBeGreaterThanOrEqual(1);
			expect(likes.length).toBeLessThanOrEqual(5);
		});
	});

	it('should add 0 to 2 comments', () => {
		const counts = new Set();

		SEEDS.forEach((seed) => {
			const comments = ofType(plan({ random: createRandom(seed) }), 'comment');

			expect(comments.length).toBeLessThanOrEqual(2);
			counts.add(comments.length);
		});

		expect(counts).toEqual(new Set([0, 1, 2]));
	});

	it('should add 1 to 3 followers', () => {
		const counts = new Set();

		SEEDS.forEach((seed) => {
			const followers = ofType(plan({ random: createRandom(seed) }), 'follow');

			expect(followers.length).toBeGreaterThanOrEqual(1);
			expect(followers.length).toBeLessThanOrEqual(3);
			counts.add(followers.length);
		});

		expect(counts).toEqual(new Set([1, 2, 3]));
	});

	it('should make the new followers follow the visitor', () => {
		ofType(plan(), 'follow').forEach((event) => expect(String(event.targetUserId)).toBe(String(ownerId)));
	});

	it('should pick new followers from personas that do not follow the visitor yet', () => {
		SEEDS.forEach((seed) => {
			const alreadyFollowing = new Set(followBackIds.map(String));

			ofType(plan({ random: createRandom(seed) }), 'follow').forEach((event) => expect(alreadyFollowing.has(String(event.userId))).toBe(false));
		});
	});

	it('should not like a post twice for the same account or by an account that already liked it', () => {
		SEEDS.forEach((seed) => {
			const posts = buildPosts();
			const likes = ofType(plan({ random: createRandom(seed), posts }), 'postLike');
			const alreadyLikedBy = new Map(posts.map((post) => [String(post._id), post.likes.map(String)]));

			likes.forEach((event) => expect(alreadyLikedBy.get(String(event.userPostId))).not.toContain(String(event.userId)));

			const keys = likes.map((event) => `${event.userPostId}:${event.userId}`);

			expect(new Set(keys).size).toBe(keys.length);
		});
	});

	it('should not comment twice on a post by the same account or by an account that already commented', () => {
		SEEDS.forEach((seed) => {
			const posts = buildPosts();
			const comments = ofType(plan({ random: createRandom(seed), posts }), 'comment');
			const alreadyCommentedBy = new Map(posts.map((post) => [String(post._id), post.commenterIds.map(String)]));

			comments.forEach((event) => expect(alreadyCommentedBy.get(String(event.userPostId))).not.toContain(String(event.userId)));

			const keys = comments.map((event) => `${event.userPostId}:${event.userId}`);

			expect(new Set(keys).size).toBe(keys.length);
		});
	});

	it('should only react to the starter posts', () => {
		const posts = buildPosts();
		const postIds = posts.map((post) => String(post._id));

		[...ofType(plan({ posts }), 'postLike'), ...ofType(plan({ posts }), 'comment')].forEach((event) =>
			expect(postIds).toContain(String(event.userPostId)),
		);
	});

	it('should never let the visitor react to their own post', () => {
		const events = plan({ personaIds: [ownerId, ...personaIds] });

		events.forEach((event) => expect(String(event.userId)).not.toBe(String(ownerId)));
	});

	it('should use the generic comment bank', () => {
		SEEDS.forEach((seed) => {
			ofType(plan({ random: createRandom(seed) }), 'comment').forEach((event) => expect(GENERIC_COMMENTS).toContain(event.text));
		});
	});

	it('should fall between 15 seconds and 10 minutes after the visitor is created', () => {
		SEEDS.forEach((seed) => {
			plan({ random: createRandom(seed) }).forEach((event) => {
				expect(event.dueAt.getTime()).toBeGreaterThanOrEqual(NOW.getTime() + FIFTEEN_SECONDS_MS);
				expect(event.dueAt.getTime()).toBeLessThanOrEqual(NOW.getTime() + TEN_MINUTES_MS);
			});
		});
	});

	it('should not arrive all at once', () => {
		const events = plan();
		const times = events.map((event) => event.dueAt.getTime());

		expect(events.length).toBeGreaterThan(2);
		expect(new Set(times).size).toBe(times.length);
	});

	it('should add no likes or comments when the visitor has no posts, but still add followers', () => {
		const events = plan({ posts: [] });

		expect(ofType(events, 'postLike')).toEqual([]);
		expect(ofType(events, 'comment')).toEqual([]);
		expect(ofType(events, 'follow').length).toBeGreaterThan(0);
	});

	it('should plan nothing when there are no personas', () => {
		expect(plan({ personaIds: [], followerIds: [] })).toEqual([]);
	});
});

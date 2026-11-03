const mongoose = require('mongoose');

const config = require('./demoConfig');
const { createRandom } = require('./random');
const { createUsernameCandidate, pickPersonasToFollow, pickFollowBacks, planStarterPosts, planStarterEngagement } = require('./visitorPlanning');

const NOW = new Date('2026-11-03T12:00:00.000Z');
const SEEDS = Array.from({ length: 40 }, (value, index) => index + 1);

const buildPersonas = ({ creators, casualPosters, lurkers }) => {
	const toPersonas = (tier, count) => Array.from({ length: count }, () => ({ userId: new mongoose.Types.ObjectId(), tier }));

	return [...toPersonas('creator', creators), ...toPersonas('casualPoster', casualPosters), ...toPersonas('lurker', lurkers)];
};

const idsOfTier = (personas, ids, tier) => {
	const tierIds = new Set(personas.filter((persona) => persona.tier === tier).map((persona) => String(persona.userId)));

	return ids.filter((id) => tierIds.has(String(id)));
};

const buildIds = (count) => Array.from({ length: count }, () => new mongoose.Types.ObjectId());

describe('createUsernameCandidate', () => {
	it('should combine a first name, _demo_ and a number', () => {
		const candidate = createUsernameCandidate(createRandom(1));

		expect(candidate).toMatch(/^[a-z]+_demo_\d{1,2}$/);
	});

	it('should use a first name from the configured list', () => {
		SEEDS.forEach((seed) => {
			const [firstName] = createUsernameCandidate(createRandom(seed)).split('_demo_');

			expect(config.VISITOR_FIRST_NAMES).toContain(firstName);
		});
	});

	it('should use a number from 1 to 99', () => {
		SEEDS.forEach((seed) => {
			const number = Number(createUsernameCandidate(createRandom(seed)).split('_demo_')[1]);

			expect(number).toBeGreaterThanOrEqual(1);
			expect(number).toBeLessThanOrEqual(99);
		});
	});

	it('should reach the lowest name and number when the random draw is lowest', () => {
		expect(createUsernameCandidate(() => 0)).toBe(`${config.VISITOR_FIRST_NAMES[0]}_demo_1`);
	});

	it('should reach the highest name and number when the random draw is highest', () => {
		expect(createUsernameCandidate(() => 0.999999)).toBe(`${config.VISITOR_FIRST_NAMES.at(-1)}_demo_99`);
	});

	it('should produce a variety of usernames', () => {
		const candidates = new Set(SEEDS.map((seed) => createUsernameCandidate(createRandom(seed))));

		expect(candidates.size).toBeGreaterThan(20);
	});
});

describe('pickPersonasToFollow', () => {
	const personas = buildPersonas({ creators: 100, casualPosters: 100, lurkers: 100 });

	it('should pick 40 personas', () => {
		SEEDS.forEach((seed) => {
			expect(pickPersonasToFollow(personas, createRandom(seed))).toHaveLength(40);
		});
	});

	it('should pick 30 creators, 6 casual posters and 4 lurkers when every tier has enough', () => {
		const picked = pickPersonasToFollow(personas, createRandom(1));

		expect(idsOfTier(personas, picked, 'creator')).toHaveLength(30);
		expect(idsOfTier(personas, picked, 'casualPoster')).toHaveLength(6);
		expect(idsOfTier(personas, picked, 'lurker')).toHaveLength(4);
	});

	it('should follow mostly creators', () => {
		const picked = pickPersonasToFollow(personas, createRandom(2));

		expect(idsOfTier(personas, picked, 'creator').length).toBeGreaterThan(picked.length / 2);
	});

	it('should pick every persona at most once', () => {
		const picked = pickPersonasToFollow(personas, createRandom(3));

		expect(new Set(picked.map(String)).size).toBe(picked.length);
	});

	it('should return user ids of the given personas', () => {
		const picked = pickPersonasToFollow(personas, createRandom(4));
		const personaIds = new Set(personas.map((persona) => String(persona.userId)));

		expect(picked.every((id) => personaIds.has(String(id)))).toBe(true);
	});

	it('should pick different personas for different draws', () => {
		const first = pickPersonasToFollow(personas, createRandom(5)).map(String).sort();
		const second = pickPersonasToFollow(personas, createRandom(6)).map(String).sort();

		expect(first).not.toEqual(second);
	});

	it('should fill the missing slots from the other tiers when a tier has too few personas', () => {
		const fewCreators = buildPersonas({ creators: 10, casualPosters: 50, lurkers: 50 });
		const picked = pickPersonasToFollow(fewCreators, createRandom(7));

		expect(picked).toHaveLength(40);
		expect(idsOfTier(fewCreators, picked, 'creator')).toHaveLength(10);
		expect(new Set(picked.map(String)).size).toBe(40);
	});

	it('should follow every persona when there are fewer than 40', () => {
		const fewPersonas = buildPersonas({ creators: 5, casualPosters: 3, lurkers: 2 });

		expect(pickPersonasToFollow(fewPersonas, createRandom(8))).toHaveLength(10);
	});

	it('should pick nobody when there are no personas', () => {
		expect(pickPersonasToFollow([], createRandom(9))).toEqual([]);
	});

	it('should not change the personas it was given', () => {
		const copy = personas.map((persona) => ({ ...persona }));

		pickPersonasToFollow(personas, createRandom(10));

		expect(personas).toEqual(copy);
	});
});

describe('pickFollowBacks', () => {
	const followedIds = buildIds(40);

	it('should pick between 15 and 30 of the followed personas', () => {
		SEEDS.forEach((seed) => {
			const picked = pickFollowBacks(followedIds, createRandom(seed));

			expect(picked.length).toBeGreaterThanOrEqual(15);
			expect(picked.length).toBeLessThanOrEqual(30);
		});
	});

	it('should reach 15 when the random draw is lowest', () => {
		expect(pickFollowBacks(followedIds, () => 0)).toHaveLength(15);
	});

	it('should reach 30 when the random draw is highest', () => {
		expect(pickFollowBacks(followedIds, () => 0.999999)).toHaveLength(30);
	});

	it('should only pick personas the visitor follows', () => {
		const followed = new Set(followedIds.map(String));
		const picked = pickFollowBacks(followedIds, createRandom(3));

		expect(picked.every((id) => followed.has(String(id)))).toBe(true);
	});

	it('should pick every persona at most once', () => {
		const picked = pickFollowBacks(followedIds, createRandom(4));

		expect(new Set(picked.map(String)).size).toBe(picked.length);
	});

	it('should pick all of them when fewer than 15 are followed', () => {
		const fewFollowed = buildIds(6);

		expect(pickFollowBacks(fewFollowed, createRandom(5))).toHaveLength(6);
	});

	it('should pick nobody when nobody is followed', () => {
		expect(pickFollowBacks([], createRandom(6))).toEqual([]);
	});
});

describe('planStarterPosts', () => {
	it('should plan 2 or 3 posts', () => {
		SEEDS.forEach((seed) => {
			const plans = planStarterPosts({ now: NOW, random: createRandom(seed) });

			expect(plans.length).toBeGreaterThanOrEqual(2);
			expect(plans.length).toBeLessThanOrEqual(3);
		});
	});

	it('should reach both 2 and 3 posts across draws', () => {
		const counts = new Set(SEEDS.map((seed) => planStarterPosts({ now: NOW, random: createRandom(seed) }).length));

		expect(counts).toEqual(new Set([2, 3]));
	});

	it('should date every post between 7 and 35 days before now', () => {
		SEEDS.forEach((seed) => {
			planStarterPosts({ now: NOW, random: createRandom(seed) }).forEach((plan) => {
				const ageDays = (NOW.getTime() - plan.createdAt.getTime()) / config.DAY_MS;

				expect(ageDays).toBeGreaterThanOrEqual(7);
				expect(ageDays).toBeLessThanOrEqual(35);
			});
		});
	});

	it('should order the posts from oldest to newest', () => {
		const plans = planStarterPosts({ now: NOW, random: createRandom(3) });
		const times = plans.map((plan) => plan.createdAt.getTime());

		expect(times).toEqual([...times].sort((a, b) => a - b));
	});

	it('should plan 5 to 10 likes for every post', () => {
		SEEDS.forEach((seed) => {
			planStarterPosts({ now: NOW, random: createRandom(seed) }).forEach((plan) => {
				expect(plan.likeCount).toBeGreaterThanOrEqual(5);
				expect(plan.likeCount).toBeLessThanOrEqual(10);
			});
		});
	});

	it('should plan 0 or 1 comments for every post', () => {
		const counts = new Set();

		SEEDS.forEach((seed) => {
			planStarterPosts({ now: NOW, random: createRandom(seed) }).forEach((plan) => counts.add(plan.commentCount));
		});

		expect(counts).toEqual(new Set([0, 1]));
	});
});

describe('planStarterEngagement', () => {
	const ownerId = new mongoose.Types.ObjectId();
	const postId = new mongoose.Types.ObjectId();
	const createdAt = new Date(NOW.getTime() - 10 * config.DAY_MS);
	const personaIds = buildIds(60);
	const followerIds = personaIds.slice(0, 20);
	const genericComments = ['Love this', 'So good', 'Nice one', 'Great shot'];

	const plan = (overrides = {}) =>
		planStarterEngagement({
			postId,
			createdAt,
			likeCount: 8,
			commentCount: 1,
			ownerId,
			now: NOW,
			followerIds,
			personaIds,
			genericComments,
			random: createRandom(1),
			...overrides,
		});

	it('should give the post as many likes as planned', () => {
		expect(plan({ likeCount: 8 }).likeUserIds).toHaveLength(8);
	});

	it('should like each post once per account', () => {
		const { likeUserIds } = plan({ likeCount: 10 });

		expect(new Set(likeUserIds.map(String)).size).toBe(10);
	});

	it('should never let the owner like their own post', () => {
		const { likeUserIds } = plan({ personaIds: [ownerId, ...personaIds], followerIds: [ownerId, ...followerIds], likeCount: 10 });

		expect(likeUserIds.map(String)).not.toContain(String(ownerId));
	});

	it('should prefer the personas that follow the visitor as likers', () => {
		const { likeUserIds } = plan({ likeCount: 10 });
		const followers = new Set(followerIds.map(String));

		expect(likeUserIds.every((id) => followers.has(String(id)))).toBe(true);
	});

	it('should take likers from all personas when the followers are not enough', () => {
		const { likeUserIds } = plan({ likeCount: 10, followerIds: followerIds.slice(0, 3) });

		expect(likeUserIds).toHaveLength(10);
	});

	it('should plan one comment with the generic text when one is planned', () => {
		const { comments } = plan({ commentCount: 1 });

		expect(comments).toHaveLength(1);
		expect(genericComments).toContain(comments[0].text);
	});

	it('should plan no comment when none is planned', () => {
		expect(plan({ commentCount: 0 }).comments).toEqual([]);
	});

	it('should attach the comment to the post and to a persona', () => {
		const { comments } = plan({ commentCount: 1 });

		expect(String(comments[0].userPostId)).toBe(String(postId));
		expect(personaIds.map(String)).toContain(String(comments[0].userId));
	});

	it('should date the comment between the post and now', () => {
		SEEDS.forEach((seed) => {
			const [comment] = plan({ commentCount: 1, random: createRandom(seed) }).comments;

			expect(comment.createdAt.getTime()).toBeGreaterThanOrEqual(createdAt.getTime());
			expect(comment.createdAt.getTime()).toBeLessThanOrEqual(NOW.getTime());
		});
	});

	it('should give every comment a new id', () => {
		const { comments } = plan({ commentCount: 1 });

		expect(comments[0]._id).toBeInstanceOf(mongoose.Types.ObjectId);
	});

	it('should plan fewer comments than asked when there are not enough texts', () => {
		const { comments } = plan({ commentCount: 1, genericComments: [] });

		expect(comments).toEqual([]);
	});
});

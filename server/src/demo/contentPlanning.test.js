const mongoose = require('mongoose');

const config = require('./demoConfig');
const { sourceFolder, createPhotoLookup, pickWeighted, createCaptionPicker, planPostEngagement } = require('./contentPlanning');
const { createRandom } = require('./random');

const HOUR_MS = config.HOUR_MS;
const POST_TIME = new Date('2026-10-29T10:00:00.000Z');
const OWNER_FOLDER = 'c01-alpine-hiker';
const OTHER_FOLDER = 'c02-golden-retriever';

const buildComments = (prefix, count) => Array.from({ length: count }, (value, index) => `${prefix} comment ${index}`);

const buildCaptionBanks = () =>
	new Map([
		[OWNER_FOLDER, { owner: ['Owner one', 'Owner two', 'Owner three'], guest: ['Guest one', 'Guest two'], comments: buildComments('hiker', 20) }],
		[OTHER_FOLDER, { owner: ['Dog owner one', 'Dog owner two'], guest: ['Dog guest one', 'Dog guest two'], comments: buildComments('dog', 20) }],
		['single', { owner: ['Only caption'], guest: ['Only guest caption'], comments: buildComments('single', 2) }],
	]);

const sourceIn = (folder) => `creator-posts/${folder}/photo.jpg`;

const stringsOf = (ids) => ids.map(String);

describe('sourceFolder', () => {
	it('should return the folder segment of a photo source', () => {
		expect(sourceFolder('creator-posts/c01-alpine-hiker/photo.jpg')).toBe('c01-alpine-hiker');
	});
});

describe('createPhotoLookup', () => {
	const manifest = {
		pool: {
			'creator-posts/a': [{ source: 'creator-posts/a/1.jpg', imageIdentifier: 'id-1' }],
			'regular-user-posts/b': [{ source: 'regular-user-posts/b/2.jpg', imageIdentifier: 'id-2' }],
		},
		avatars: { 'creator-avatars/c': [{ source: 'creator-avatars/c/3.jpg', imageIdentifier: 'id-3' }] },
	};

	it.each([
		['creator-posts/a/1.jpg', 'id-1'],
		['regular-user-posts/b/2.jpg', 'id-2'],
		['creator-avatars/c/3.jpg', 'id-3'],
	])('should find %s anywhere in the manifest', (source, identifier) => {
		expect(createPhotoLookup(manifest)(source).imageIdentifier).toBe(identifier);
	});

	it('should throw naming the source when it is not in the manifest', () => {
		expect(() => createPhotoLookup(manifest)('creator-posts/a/missing.jpg')).toThrow(
			'creator-posts/a/missing.jpg is not in photos.json; run the upload script first',
		);
	});
});

describe('pickWeighted', () => {
	it('should pick the first candidate when the random draw falls in its share', () => {
		expect(pickWeighted(['a', 'b'], [1, 1], () => 0.1)).toBe(0);
	});

	it('should pick the second candidate when the random draw falls in its share', () => {
		expect(pickWeighted(['a', 'b'], [1, 1], () => 0.9)).toBe(1);
	});

	it('should never pick a candidate with weight 0', () => {
		const random = createRandom(4);
		const picks = Array.from({ length: 200 }, () => pickWeighted(['a', 'b', 'c'], [0, 5, 0], random));

		expect(new Set(picks)).toEqual(new Set([1]));
	});

	it('should favour heavier candidates in proportion to their weight', () => {
		const random = createRandom(5);
		const picks = Array.from({ length: 4000 }, () => pickWeighted(['a', 'b'], [1, 3], random));
		const heavyShare = picks.filter((index) => index === 1).length / picks.length;

		expect(heavyShare).toBeGreaterThan(0.7);
		expect(heavyShare).toBeLessThan(0.8);
	});

	it('should fall back to the last candidate when all weights are 0', () => {
		expect(pickWeighted(['a', 'b', 'c'], [0, 0, 0], () => 0.5)).toBe(2);
	});
});

describe('createCaptionPicker', () => {
	const noCaptionRandom = () => 0.1;
	const captionRandom = () => 0.5;

	it('should return no caption when the draw falls in the no-caption share', () => {
		const pick = createCaptionPicker(buildCaptionBanks(), noCaptionRandom);

		expect(pick({ username: 'anna', folder: OWNER_FOLDER }, sourceIn(OWNER_FOLDER))).toBeUndefined();
	});

	it('should return an owner caption when the account posts from its own folder', () => {
		const banks = buildCaptionBanks();
		const pick = createCaptionPicker(banks, captionRandom);

		expect(banks.get(OWNER_FOLDER).owner).toContain(pick({ username: 'anna', folder: OWNER_FOLDER }, sourceIn(OWNER_FOLDER)));
	});

	it('should return a guest caption when the account posts a photo from another folder', () => {
		const banks = buildCaptionBanks();
		const pick = createCaptionPicker(banks, captionRandom);

		expect(banks.get(OTHER_FOLDER).guest).toContain(pick({ username: 'anna', folder: OWNER_FOLDER }, sourceIn(OTHER_FOLDER)));
	});

	it('should return a guest caption for an account that has no folder', () => {
		const banks = buildCaptionBanks();
		const pick = createCaptionPicker(banks, captionRandom);

		expect(banks.get(OWNER_FOLDER).guest).toContain(pick({ username: 'casual_kim', folder: undefined }, sourceIn(OWNER_FOLDER)));
	});

	it('should throw when the photo folder has no caption bank', () => {
		const pick = createCaptionPicker(buildCaptionBanks(), captionRandom);

		expect(() => pick({ username: 'anna', folder: OWNER_FOLDER }, sourceIn('c99-unknown'))).toThrow('No caption bank for c99-unknown');
	});

	it('should use every caption of the list before repeating one', () => {
		const banks = buildCaptionBanks();
		const pick = createCaptionPicker(banks, captionRandom);
		const firstRound = Array.from({ length: 3 }, () => pick({ username: 'anna', folder: OWNER_FOLDER }, sourceIn(OWNER_FOLDER)));

		expect(new Set(firstRound)).toEqual(new Set(banks.get(OWNER_FOLDER).owner));
	});

	it('should keep choosing from the list after it has been used up', () => {
		const banks = buildCaptionBanks();
		const pick = createCaptionPicker(banks, captionRandom);

		for (let index = 0; index < 3; index += 1) {
			pick({ username: 'anna', folder: OWNER_FOLDER }, sourceIn(OWNER_FOLDER));
		}

		expect(banks.get(OWNER_FOLDER).owner).toContain(pick({ username: 'anna', folder: OWNER_FOLDER }, sourceIn(OWNER_FOLDER)));
	});

	describe('avoiding the previous caption', () => {
		it.each(['Owner one', 'Owner two', 'Owner three'])('should not return "%s" again when it was the previous caption', (previousCaption) => {
			const pick = createCaptionPicker(buildCaptionBanks(), captionRandom);
			const caption = pick({ username: 'anna', folder: OWNER_FOLDER }, sourceIn(OWNER_FOLDER), previousCaption);

			expect(caption).not.toBe(previousCaption);
			expect(['Owner one', 'Owner two', 'Owner three']).toContain(caption);
		});

		it('should avoid the previous caption for any shuffle of the list', () => {
			const repeated = Array.from({ length: 100 }, (value, seed) => {
				const random = createRandom(seed);
				const pick = createCaptionPicker(buildCaptionBanks(), () => 0.2 + random() * 0.8);
				const previousCaption = createCaptionPicker(buildCaptionBanks(), () => 0.2 + createRandom(seed)() * 0.8)(
					{ username: 'anna', folder: OWNER_FOLDER },
					sourceIn(OWNER_FOLDER),
				);

				return pick({ username: 'anna', folder: OWNER_FOLDER }, sourceIn(OWNER_FOLDER), previousCaption) === previousCaption;
			});

			expect(repeated.filter(Boolean)).toEqual([]);
		});

		it('should refill the list without the previous caption when the draw empties it', () => {
			const banks = new Map([[OWNER_FOLDER, { owner: ['A', 'B'], guest: ['G'], comments: ['c'] }]]);
			const pick = createCaptionPicker(banks, captionRandom);
			const first = pick({ username: 'anna', folder: OWNER_FOLDER }, sourceIn(OWNER_FOLDER));
			const remaining = ['A', 'B'].find((caption) => caption !== first);

			expect(pick({ username: 'anna', folder: OWNER_FOLDER }, sourceIn(OWNER_FOLDER), remaining)).toBe(first);
		});

		it('should return the only caption when the list has just one, even if it was the previous one', () => {
			const pick = createCaptionPicker(buildCaptionBanks(), captionRandom);

			expect(pick({ username: 'anna', folder: 'single' }, sourceIn('single'), 'Only caption')).toBe('Only caption');
		});

		it('should return a caption when there is no previous caption', () => {
			const pick = createCaptionPicker(buildCaptionBanks(), captionRandom);

			expect(pick({ username: 'anna', folder: OWNER_FOLDER }, sourceIn(OWNER_FOLDER), undefined)).toEqual(expect.any(String));
		});
	});
});

describe('planPostEngagement', () => {
	const REPLIES = ['Thank you!', 'Glad you like it', 'Appreciate it'];
	const accountIds = Array.from({ length: 300 }, () => new mongoose.Types.ObjectId());
	const usernames = new Map(accountIds.map((id, index) => [String(id), `user_${index}`]));
	const [ownerId, ...otherIds] = accountIds;
	const followerIds = otherIds.slice(0, 40);

	const plan = ({ tier = 'creator', seed = 1, source = sourceIn(OWNER_FOLDER), banks = buildCaptionBanks(), followers = followerIds } = {}) =>
		planPostEngagement({
			postId: new mongoose.Types.ObjectId(),
			postTime: POST_TIME,
			owner: { id: ownerId, tier },
			source,
			captionBanks: banks,
			replies: REPLIES,
			allAccountIds: accountIds,
			usernames,
			ownerFollowerIds: followers,
			random: createRandom(seed),
		});

	const plans = (tier, count = 150) => Array.from({ length: count }, (value, index) => plan({ tier, seed: index + 1 }));

	const hoursSincePost = (date) => (date.getTime() - POST_TIME.getTime()) / HOUR_MS;

	describe('likes', () => {
		it.each(['creator', 'casualPoster', 'lurker'])('should keep the number of likes of a %s post within the tier range', (tier) => {
			const [min, max] = config.TIERS[tier].likes;
			const outOfRange = plans(tier).filter(({ likes }) => likes.length < min || likes.length > max);

			expect(outOfRange).toEqual([]);
		});

		it('should never let the owner like their own post', () => {
			expect(plans('creator').filter(({ likes }) => likes.some((like) => String(like.userId) === String(ownerId)))).toEqual([]);
		});

		it('should never like a post twice from the same account', () => {
			expect(plans('creator').filter(({ likes }) => new Set(likes.map((like) => String(like.userId))).size !== likes.length)).toEqual([]);
		});

		it('should prefer the followers of the owner', () => {
			const followerSet = new Set(stringsOf(followerIds));
			const nonFollowerLikes = plans('casualPoster').flatMap(({ likes }) => likes.filter((like) => !followerSet.has(String(like.userId))));

			expect(nonFollowerLikes).toEqual([]);
		});

		it('should fall back to other accounts once the followers are used up', () => {
			const followerSet = new Set(stringsOf(followerIds));
			const { likes } = plan({ tier: 'creator', seed: 9, followers: followerIds.slice(0, 2) });

			expect(likes.filter((like) => !followerSet.has(String(like.userId))).length).toBeGreaterThan(0);
		});

		it('should give no likes when nobody else exists', () => {
			const result = planPostEngagement({
				postId: new mongoose.Types.ObjectId(),
				postTime: POST_TIME,
				owner: { id: ownerId, tier: 'creator' },
				source: sourceIn(OWNER_FOLDER),
				captionBanks: buildCaptionBanks(),
				replies: REPLIES,
				allAccountIds: [ownerId],
				usernames,
				ownerFollowerIds: [],
				random: createRandom(3),
			});

			expect(result.likes).toEqual([]);
		});

		it('should time every like after the post and within 7 days of it', () => {
			const outside = plans('creator').flatMap(({ likes }) =>
				likes.filter((like) => hoursSincePost(like.at) < 0 || hoursSincePost(like.at) > config.LATE_ENGAGEMENT_HOURS),
			);

			expect(outside).toEqual([]);
		});

		it('should put between 1 and 3 likes between 48 and 168 hours after the post', () => {
			const outOfRange = plans('creator').filter(({ likes }) => {
				const late = likes.filter((like) => hoursSincePost(like.at) >= config.EARLY_ENGAGEMENT_HOURS).length;

				return late < config.LATE_LIKES[0] || late > config.LATE_LIKES[1];
			});

			expect(outOfRange).toEqual([]);
		});

		it('should put most likes in the first 48 hours', () => {
			const likes = plans('creator').flatMap((result) => result.likes);
			const early = likes.filter((like) => hoursSincePost(like.at) < config.EARLY_ENGAGEMENT_HOURS);

			expect(early.length / likes.length).toBeGreaterThan(0.9);
		});

		it('should never place more late likes than there are likes', () => {
			const tooMany = plans('lurker').filter(({ likes }) => {
				const late = likes.filter((like) => hoursSincePost(like.at) >= config.EARLY_ENGAGEMENT_HOURS).length;

				return late > likes.length || late > config.LATE_LIKES[1] || (likes.length > 0 && late < 1);
			});

			expect(tooMany).toEqual([]);
		});

		it('should give creator posts more likes than casual poster posts on average', () => {
			const average = (tier) => plans(tier).reduce((sum, { likes }) => sum + likes.length, 0) / 150;

			expect(average('creator')).toBeGreaterThan(average('casualPoster'));
		});
	});

	describe('comments', () => {
		it.each(['creator', 'casualPoster', 'lurker'])('should keep the top-level comments of a %s post within the tier range', (tier) => {
			const [min, max] = config.TIERS[tier].comments;
			const outOfRange = plans(tier).filter(({ comments }) => {
				const topLevel = comments.filter((comment) => !comment.parentCommentId).length;

				return topLevel < min || topLevel > max;
			});

			expect(outOfRange).toEqual([]);
		});

		it('should never let the owner comment top-level on their own post', () => {
			const ownComments = plans('creator').flatMap(({ comments }) =>
				comments.filter((comment) => !comment.parentCommentId && String(comment.userId) === String(ownerId)),
			);

			expect(ownComments).toEqual([]);
		});

		it('should time every comment after the post and within 7 days of it', () => {
			const outside = plans('creator').flatMap(({ comments }) =>
				comments.filter(
					(comment) =>
						!comment.parentCommentId && (hoursSincePost(comment.at) < 0 || hoursSincePost(comment.at) > config.LATE_ENGAGEMENT_HOURS),
				),
			);

			expect(outside).toEqual([]);
		});

		it('should taper off over the days, with most comments in the first 48 hours and some later', () => {
			const comments = plans('creator').flatMap((result) => result.comments.filter((comment) => !comment.parentCommentId));
			const early = comments.filter((comment) => hoursSincePost(comment.at) < config.EARLY_ENGAGEMENT_HOURS).length / comments.length;

			expect(early).toBeGreaterThan(0.65);
			expect(early).toBeLessThan(0.85);
		});

		it('should use each comment text once per post', () => {
			const duplicated = plans('creator').filter(({ comments }) => {
				const texts = comments.filter((comment) => !comment.parentCommentId).map((comment) => comment.text);

				return new Set(texts).size !== texts.length;
			});

			expect(duplicated).toEqual([]);
		});

		it('should give each comment an id and attach it to the post', () => {
			const postId = new mongoose.Types.ObjectId();
			const result = planPostEngagement({
				postId,
				postTime: POST_TIME,
				owner: { id: ownerId, tier: 'creator' },
				source: sourceIn(OWNER_FOLDER),
				captionBanks: buildCaptionBanks(),
				replies: REPLIES,
				allAccountIds: accountIds,
				usernames,
				ownerFollowerIds: followerIds,
				random: createRandom(8),
			});

			expect(result.comments.length).toBeGreaterThan(0);
			expect(result.comments.filter((comment) => String(comment.userPostId) !== String(postId) || !comment._id)).toEqual([]);
		});

		it('should pick comment texts from the bank of the photo folder, not the folder of the poster', () => {
			const banks = buildCaptionBanks();
			const dogComments = new Set(banks.get(OTHER_FOLDER).comments);
			const texts = plans('creator').flatMap(({ comments }) =>
				comments.filter((comment) => !comment.parentCommentId).map((comment) => comment.text),
			);

			const swapped = Array.from({ length: 50 }, (value, index) => plan({ seed: index + 1, source: sourceIn(OTHER_FOLDER) })).flatMap(
				({ comments }) => comments.filter((comment) => !comment.parentCommentId).map((comment) => comment.text),
			);

			expect(texts.every((text) => text.startsWith('hiker comment'))).toBe(true);
			expect(swapped.length).toBeGreaterThan(0);
			expect(swapped.filter((text) => !dogComments.has(text))).toEqual([]);
		});

		it('should plan no more comments than the bank holds', () => {
			const results = Array.from({ length: 50 }, (value, index) => plan({ seed: index + 1, source: sourceIn('single') }));

			expect(results.filter(({ comments }) => comments.filter((comment) => !comment.parentCommentId).length > 2)).toEqual([]);
		});

		it('should add comment likes from other accounts, at most 3 per comment, never from the commenter', () => {
			const comments = plans('creator').flatMap((result) => result.comments.filter((comment) => !comment.parentCommentId));
			const invalid = comments.filter(
				(comment) =>
					comment.likes.length > config.MAX_COMMENT_LIKES ||
					comment.likes.some((like) => String(like.userId) === String(comment.userId)) ||
					new Set(comment.likes.map((like) => String(like.userId))).size !== comment.likes.length,
			);

			expect(comments.filter((comment) => comment.likes.length > 0).length).toBeGreaterThan(0);
			expect(invalid).toEqual([]);
		});

		it('should time every comment like after its comment and within 24 hours of it', () => {
			const outside = plans('creator').flatMap(({ comments }) =>
				comments.flatMap((comment) =>
					comment.likes.filter(
						(like) => like.at < comment.at || like.at.getTime() - comment.at.getTime() > config.MAX_COMMENT_LIKE_DELAY_HOURS * HOUR_MS,
					),
				),
			);

			expect(outside).toEqual([]);
		});
	});

	describe('replies', () => {
		const repliesOf = (results) => results.flatMap(({ comments }) => comments.filter((comment) => comment.parentCommentId));
		const commentsById = (results) => new Map(results.flatMap(({ comments }) => comments).map((comment) => [String(comment._id), comment]));

		it('should create some replies on creator posts', () => {
			expect(repliesOf(plans('creator')).length).toBeGreaterThan(0);
		});

		it('should never create replies on lurker posts', () => {
			expect(repliesOf(plans('lurker'))).toEqual([]);
		});

		it('should author every reply as the post owner', () => {
			expect(repliesOf(plans('creator')).filter((reply) => String(reply.userId) !== String(ownerId))).toEqual([]);
		});

		it('should attach every reply to a top-level comment on the same post', () => {
			const results = plans('creator');
			const byId = commentsById(results);
			const invalid = repliesOf(results).filter((reply) => {
				const parent = byId.get(String(reply.parentCommentId));

				return !parent || parent.parentCommentId !== null || String(parent.userPostId) !== String(reply.userPostId);
			});

			expect(invalid).toEqual([]);
		});

		it('should start every reply with @ and the username of the commenter followed by a space', () => {
			const results = plans('creator');
			const byId = commentsById(results);
			const invalid = repliesOf(results).filter(
				(reply) => !reply.text.startsWith(`@${usernames.get(String(byId.get(String(reply.parentCommentId)).userId))} `),
			);

			expect(invalid).toEqual([]);
		});

		it('should follow the mention with a text from the replies bank', () => {
			expect(repliesOf(plans('creator')).filter((reply) => !REPLIES.includes(reply.text.replace(/^@\S+ /, '')))).toEqual([]);
		});

		it('should set mentionedUserId to the user who wrote the comment answered', () => {
			const results = plans('creator');
			const byId = commentsById(results);
			const invalid = repliesOf(results).filter(
				(reply) => String(reply.mentionedUserId) !== String(byId.get(String(reply.parentCommentId)).userId),
			);

			expect(invalid).toEqual([]);
		});

		it('should leave the parent and mention empty on top-level comments', () => {
			const topLevel = plans('creator').flatMap(({ comments }) => comments.filter((comment) => !comment.parentCommentId));

			expect(topLevel.filter((comment) => comment.parentCommentId !== null || comment.mentionedUserId !== null)).toEqual([]);
		});

		it('should time every reply after its comment and within 24 hours of it', () => {
			const results = plans('creator');
			const byId = commentsById(results);
			const invalid = repliesOf(results).filter((reply) => {
				const parent = byId.get(String(reply.parentCommentId));
				const delay = reply.at.getTime() - parent.at.getTime();

				return delay < 0 || delay > config.MAX_REPLY_DELAY_HOURS * HOUR_MS;
			});

			expect(invalid).toEqual([]);
		});

		it('should place every reply after its parent in the list', () => {
			const misordered = plans('creator').filter(({ comments }) =>
				comments.some(
					(comment, index) =>
						comment.parentCommentId &&
						comments.findIndex((candidate) => String(candidate._id) === String(comment.parentCommentId)) > index,
				),
			);

			expect(misordered).toEqual([]);
		});

		it('should leave replies without likes', () => {
			expect(repliesOf(plans('creator')).filter((reply) => reply.likes.length > 0)).toEqual([]);
		});
	});

	it('should plan the same engagement for the same random seed', () => {
		const first = plan({ seed: 77 });
		const second = plan({ seed: 77 });

		expect(second.likes.map((like) => String(like.userId))).toEqual(first.likes.map((like) => String(like.userId)));
		expect(second.comments.map((comment) => comment.text)).toEqual(first.comments.map((comment) => comment.text));
	});
});

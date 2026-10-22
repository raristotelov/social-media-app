import { addCommentLocally, applyLikeLocally, compareComments, countCommentsAndReplies, getPreviewComments } from './comments';

const buildComment = (id, { likes = [], createdAt = '2024-01-01T00:00:00.000Z', replies } = {}) => ({ _id: id, likes, createdAt, replies });

describe('compareComments', () => {
	it('puts the comment with more likes first', () => {
		const liked = buildComment('liked', { likes: ['u1', 'u2'] });
		const unliked = buildComment('unliked', { likes: ['u1'] });

		expect([unliked, liked].sort(compareComments).map((comment) => comment._id)).toEqual(['liked', 'unliked']);
	});

	it('puts the newer comment first when the like counts are equal', () => {
		const older = buildComment('older', { createdAt: '2024-01-01T00:00:00.000Z' });
		const newer = buildComment('newer', { createdAt: '2024-02-01T00:00:00.000Z' });

		expect([older, newer].sort(compareComments).map((comment) => comment._id)).toEqual(['newer', 'older']);
	});

	it('ranks likes above recency', () => {
		const olderLiked = buildComment('olderLiked', { likes: ['u1'], createdAt: '2024-01-01T00:00:00.000Z' });
		const newerUnliked = buildComment('newerUnliked', { createdAt: '2024-03-01T00:00:00.000Z' });

		expect([newerUnliked, olderLiked].sort(compareComments).map((comment) => comment._id)).toEqual(['olderLiked', 'newerUnliked']);
	});

	it('treats a comment without a likes array as having no likes', () => {
		const withoutLikes = { _id: 'withoutLikes', createdAt: '2024-01-01T00:00:00.000Z' };
		const liked = buildComment('liked', { likes: ['u1'] });

		expect([withoutLikes, liked].sort(compareComments).map((comment) => comment._id)).toEqual(['liked', 'withoutLikes']);
	});
});

describe('getPreviewComments', () => {
	it('returns an empty list when there are no comments', () => {
		expect(getPreviewComments([])).toEqual([]);
	});

	it('returns every comment when there are fewer than the preview limit', () => {
		const comments = [buildComment('a')];

		expect(getPreviewComments(comments)).toHaveLength(1);
	});

	it('returns only two comments when there are more', () => {
		const comments = [buildComment('a'), buildComment('b'), buildComment('c'), buildComment('d')];

		expect(getPreviewComments(comments)).toHaveLength(2);
	});

	it('picks the most liked comments, then the newest', () => {
		const comments = [
			buildComment('oldUnliked', { createdAt: '2024-01-01T00:00:00.000Z' }),
			buildComment('newUnliked', { createdAt: '2024-05-01T00:00:00.000Z' }),
			buildComment('midUnliked', { createdAt: '2024-03-01T00:00:00.000Z' }),
			buildComment('liked', { likes: ['u1'], createdAt: '2024-02-01T00:00:00.000Z' }),
		];

		expect(getPreviewComments(comments).map((comment) => comment._id)).toEqual(['liked', 'newUnliked']);
	});

	it('does not change the list it was given', () => {
		const comments = [
			buildComment('older', { createdAt: '2024-01-01T00:00:00.000Z' }),
			buildComment('newer', { createdAt: '2024-02-01T00:00:00.000Z' }),
		];
		const idsBefore = comments.map((comment) => comment._id);

		getPreviewComments(comments);

		expect(comments.map((comment) => comment._id)).toEqual(idsBefore);
	});

	it('does not include replies of the given comments in the preview', () => {
		const comments = [buildComment('top', { replies: [buildComment('reply', { likes: ['u1', 'u2', 'u3'] })] })];

		expect(getPreviewComments(comments).map((comment) => comment._id)).toEqual(['top']);
	});
});

describe('addCommentLocally', () => {
	const getIds = (comments) => comments.map((comment) => comment._id);

	describe('adding a top-level comment', () => {
		it('adds the comment with an empty replies list', () => {
			const added = { _id: 'new', text: 'hello', likes: [], createdAt: '2024-06-01T00:00:00.000Z', parentCommentId: null };

			const result = addCommentLocally([], added);

			expect(result).toEqual([{ ...added, replies: [] }]);
		});

		it('adds the comment to an empty list', () => {
			const result = addCommentLocally([], buildComment('new'));

			expect(getIds(result)).toEqual(['new']);
		});

		it('places an unliked new comment above older unliked comments, newest first', () => {
			const comments = [buildComment('older', { createdAt: '2024-01-01T00:00:00.000Z' })];

			const result = addCommentLocally(comments, buildComment('new', { createdAt: '2024-06-01T00:00:00.000Z' }));

			expect(getIds(result)).toEqual(['new', 'older']);
		});

		it('keeps comments with more likes above the new comment', () => {
			const comments = [buildComment('liked', { likes: ['u1'], createdAt: '2024-01-01T00:00:00.000Z' })];

			const result = addCommentLocally(comments, buildComment('new', { createdAt: '2024-06-01T00:00:00.000Z' }));

			expect(getIds(result)).toEqual(['liked', 'new']);
		});

		it('sorts the new comment among existing ones by likes, then newest', () => {
			const comments = [
				buildComment('liked', { likes: ['u1', 'u2'], createdAt: '2024-01-01T00:00:00.000Z' }),
				buildComment('newerUnliked', { createdAt: '2024-05-01T00:00:00.000Z' }),
				buildComment('olderUnliked', { createdAt: '2024-02-01T00:00:00.000Z' }),
			];

			const result = addCommentLocally(comments, buildComment('new', { createdAt: '2024-03-01T00:00:00.000Z' }));

			expect(getIds(result)).toEqual(['liked', 'newerUnliked', 'new', 'olderUnliked']);
		});

		it('does not change the list it was given', () => {
			const comments = [buildComment('older')];

			addCommentLocally(comments, buildComment('new'));

			expect(getIds(comments)).toEqual(['older']);
		});
	});

	describe('adding a reply', () => {
		it('appends the reply after the existing replies of its parent', () => {
			const comments = [buildComment('parent', { replies: [buildComment('r1'), buildComment('r2')] })];

			const result = addCommentLocally(comments, { ...buildComment('r3'), parentCommentId: 'parent' });

			expect(getIds(result[0].replies)).toEqual(['r1', 'r2', 'r3']);
		});

		it('adds the first reply to a parent that has none', () => {
			const comments = [buildComment('parent', { replies: [] })];

			const result = addCommentLocally(comments, { ...buildComment('r1'), parentCommentId: 'parent' });

			expect(getIds(result[0].replies)).toEqual(['r1']);
		});

		it('adds the first reply to a parent without a replies array', () => {
			const comments = [{ _id: 'parent', likes: [], createdAt: '2024-01-01T00:00:00.000Z' }];

			const result = addCommentLocally(comments, { ...buildComment('r1'), parentCommentId: 'parent' });

			expect(getIds(result[0].replies)).toEqual(['r1']);
		});

		it('leaves the other comments and their replies untouched', () => {
			const other = buildComment('other', { replies: [buildComment('o1')] });
			const comments = [buildComment('parent', { replies: [] }), other];

			const result = addCommentLocally(comments, { ...buildComment('r1'), parentCommentId: 'parent' });

			expect(result[1]).toBe(other);
		});

		it('keeps the order of the top-level comments', () => {
			const comments = [buildComment('a'), buildComment('parent'), buildComment('b')];

			const result = addCommentLocally(comments, { ...buildComment('r1'), parentCommentId: 'parent' });

			expect(getIds(result)).toEqual(['a', 'parent', 'b']);
		});

		it('does not add a reply to the top level', () => {
			const comments = [buildComment('parent')];

			const result = addCommentLocally(comments, { ...buildComment('r1'), parentCommentId: 'parent' });

			expect(getIds(result)).toEqual(['parent']);
		});

		it('does not change the parent it was given', () => {
			const parent = buildComment('parent', { replies: [buildComment('r1')] });

			addCommentLocally([parent], { ...buildComment('r2'), parentCommentId: 'parent' });

			expect(getIds(parent.replies)).toEqual(['r1']);
		});

		it('changes nothing when the parent is not in the list', () => {
			const comments = [buildComment('a', { replies: [] })];

			const result = addCommentLocally(comments, { ...buildComment('r1'), parentCommentId: 'missing' });

			expect(result).toEqual(comments);
		});
	});
});

describe('applyLikeLocally', () => {
	const getIds = (comments) => comments.map((comment) => comment._id);

	describe('liking', () => {
		it('adds the user to the likes of a top-level comment', () => {
			const result = applyLikeLocally([buildComment('a')], { commentId: 'a', userId: 'u1', isLiked: true });

			expect(result[0].likes).toEqual(['u1']);
		});

		it('keeps the likes already there', () => {
			const result = applyLikeLocally([buildComment('a', { likes: ['u2'] })], { commentId: 'a', userId: 'u1', isLiked: true });

			expect(result[0].likes).toEqual(['u2', 'u1']);
		});

		it('adds the user to the likes of a reply and keeps the parent likes', () => {
			const comments = [buildComment('parent', { likes: ['u2'], replies: [buildComment('r1'), buildComment('r2')] })];

			const result = applyLikeLocally(comments, { commentId: 'r2', userId: 'u1', isLiked: true });

			expect(result[0].likes).toEqual(['u2']);
			expect(result[0].replies.map((reply) => reply.likes)).toEqual([[], ['u1']]);
		});

		it('does not add the same user twice', () => {
			const result = applyLikeLocally([buildComment('a', { likes: ['u1'] })], { commentId: 'a', userId: 'u1', isLiked: true });

			expect(result[0].likes).toEqual(['u1']);
		});

		it('treats a comment without a likes array as having no likes', () => {
			const comments = [{ _id: 'a', createdAt: '2024-01-01T00:00:00.000Z' }];

			const result = applyLikeLocally(comments, { commentId: 'a', userId: 'u1', isLiked: true });

			expect(result[0].likes).toEqual(['u1']);
		});

		it('treats a reply without a likes array as having no likes', () => {
			const comments = [buildComment('parent', { replies: [{ _id: 'r1' }] })];

			const result = applyLikeLocally(comments, { commentId: 'r1', userId: 'u1', isLiked: true });

			expect(result[0].replies[0].likes).toEqual(['u1']);
		});
	});

	describe('unliking', () => {
		it('removes the user from the likes of a top-level comment', () => {
			const result = applyLikeLocally([buildComment('a', { likes: ['u1', 'u2'] })], { commentId: 'a', userId: 'u1', isLiked: false });

			expect(result[0].likes).toEqual(['u2']);
		});

		it('removes the user from the likes of a reply', () => {
			const comments = [buildComment('parent', { replies: [buildComment('r1', { likes: ['u1'] })] })];

			const result = applyLikeLocally(comments, { commentId: 'r1', userId: 'u1', isLiked: false });

			expect(result[0].replies[0].likes).toEqual([]);
		});

		it('changes nothing when the user had not liked it', () => {
			const result = applyLikeLocally([buildComment('a', { likes: ['u2'] })], { commentId: 'a', userId: 'u1', isLiked: false });

			expect(result[0].likes).toEqual(['u2']);
		});

		it('leaves a comment without a likes array with no likes', () => {
			const result = applyLikeLocally([{ _id: 'a', createdAt: '2024-01-01T00:00:00.000Z' }], { commentId: 'a', userId: 'u1', isLiked: false });

			expect(result[0].likes).toEqual([]);
		});
	});

	describe('a comment that is not in the list', () => {
		it('changes no likes', () => {
			const comments = [buildComment('a', { likes: ['u2'], replies: [buildComment('r1')] })];

			const result = applyLikeLocally(comments, { commentId: 'missing', userId: 'u1', isLiked: true });

			expect(result).toEqual(comments);
		});
	});

	describe('ordering', () => {
		it('moves a comment above the others once the like gives it more likes', () => {
			const comments = [
				buildComment('newer', { createdAt: '2024-05-01T00:00:00.000Z' }),
				buildComment('older', { createdAt: '2024-01-01T00:00:00.000Z' }),
			];

			const result = applyLikeLocally(comments, { commentId: 'older', userId: 'u1', isLiked: true });

			expect(getIds(result)).toEqual(['older', 'newer']);
		});

		it('moves a comment back down once the unlike removes its lead', () => {
			const comments = [
				buildComment('older', { likes: ['u1'], createdAt: '2024-01-01T00:00:00.000Z' }),
				buildComment('newer', { createdAt: '2024-05-01T00:00:00.000Z' }),
			];

			const result = applyLikeLocally(comments, { commentId: 'older', userId: 'u1', isLiked: false });

			expect(getIds(result)).toEqual(['newer', 'older']);
		});

		it('does not reorder the replies', () => {
			const comments = [buildComment('parent', { replies: [buildComment('r1'), buildComment('r2')] })];

			const result = applyLikeLocally(comments, { commentId: 'r2', userId: 'u1', isLiked: true });

			expect(getIds(result[0].replies)).toEqual(['r1', 'r2']);
		});
	});

	describe('immutability', () => {
		it('does not change the list, the comment or the reply it was given', () => {
			const reply = buildComment('r1', { likes: ['u2'] });
			const parent = buildComment('parent', { likes: ['u2'], replies: [reply] });
			const comments = [parent];

			applyLikeLocally(comments, { commentId: 'parent', userId: 'u1', isLiked: true });
			applyLikeLocally(comments, { commentId: 'r1', userId: 'u1', isLiked: true });

			expect(comments).toEqual([parent]);
			expect(parent.likes).toEqual(['u2']);
			expect(reply.likes).toEqual(['u2']);
		});

		it('returns an empty list for an empty list', () => {
			expect(applyLikeLocally([], { commentId: 'a', userId: 'u1', isLiked: true })).toEqual([]);
		});
	});
});

describe('countCommentsAndReplies', () => {
	it('returns 0 for no comments', () => {
		expect(countCommentsAndReplies([])).toBe(0);
	});

	it('counts top-level comments without replies', () => {
		expect(countCommentsAndReplies([buildComment('a'), buildComment('b')])).toBe(2);
	});

	it('counts replies as well as their parents', () => {
		const comments = [buildComment('a', { replies: [buildComment('r1'), buildComment('r2')] }), buildComment('b', { replies: [] })];

		expect(countCommentsAndReplies(comments)).toBe(4);
	});

	it('treats a comment with no replies array as having no replies', () => {
		expect(countCommentsAndReplies([{ _id: 'a' }])).toBe(1);
	});
});

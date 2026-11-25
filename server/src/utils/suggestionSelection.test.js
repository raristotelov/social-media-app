const { selectSuggestions } = require('./suggestionSelection');

const SIDEBAR_MIX = { mutual: 2, popular: 2, new: 1 };
const CAROUSEL_MIX = { mutual: 4, popular: 4, new: 2 };
const EMPTY_FEED_MIX = { mutual: 0, popular: 5, new: 3 };

const buildPool = (prefix, count) => Array.from({ length: count }, (_value, index) => ({ _id: `${prefix}${index + 1}` }));

const getIds = (candidates) => candidates.map((candidate) => candidate._id);
const getGroups = (candidates) => candidates.map((candidate) => candidate.group);

describe('selectSuggestions', () => {
	describe('the result', () => {
		it('is the list of suggestions itself, not an object holding it', () => {
			const result = selectSuggestions({ pools: { mutual: [], popular: buildPool('p', 2), new: [] }, mix: SIDEBAR_MIX, size: 5 });

			expect(Array.isArray(result)).toBe(true);
			expect(getIds(result)).toEqual(['p1', 'p2']);
		});

		it('holds exactly the size and never more, however many candidates there are', () => {
			const suggestions = selectSuggestions({
				pools: { mutual: buildPool('m', 20), popular: buildPool('p', 20), new: buildPool('n', 20) },
				mix: SIDEBAR_MIX,
				size: 5,
			});

			expect(suggestions).toHaveLength(5);
		});
	});

	describe('the mix', () => {
		it('picks 2 mutual, 2 most-followed and 1 new for the sidebar, in that order', () => {
			const suggestions = selectSuggestions({
				pools: { mutual: buildPool('m', 6), popular: buildPool('p', 6), new: buildPool('n', 6) },
				mix: SIDEBAR_MIX,
				size: 5,
			});

			expect(getIds(suggestions)).toEqual(['m1', 'm2', 'p1', 'p2', 'n1']);
			expect(getGroups(suggestions)).toEqual(['mutual', 'mutual', 'popular', 'popular', 'new']);
		});

		it('picks 4 / 4 / 2 for the carousel', () => {
			const suggestions = selectSuggestions({
				pools: { mutual: buildPool('m', 8), popular: buildPool('p', 8), new: buildPool('n', 8) },
				mix: CAROUSEL_MIX,
				size: 10,
			});

			expect(getGroups(suggestions)).toEqual([
				'mutual',
				'mutual',
				'mutual',
				'mutual',
				'popular',
				'popular',
				'popular',
				'popular',
				'new',
				'new',
			]);
		});

		it('picks 0 / 5 / 3 for the empty feed, even when mutual candidates exist', () => {
			const suggestions = selectSuggestions({
				pools: { mutual: buildPool('m', 4), popular: buildPool('p', 8), new: buildPool('n', 8) },
				mix: EMPTY_FEED_MIX,
				size: 8,
			});

			expect(getGroups(suggestions)).toEqual(['popular', 'popular', 'popular', 'popular', 'popular', 'new', 'new', 'new']);
		});

		it('keeps new users last', () => {
			const suggestions = selectSuggestions({
				pools: { mutual: [], popular: buildPool('p', 5), new: buildPool('n', 5) },
				mix: SIDEBAR_MIX,
				size: 5,
			});

			expect(suggestions[suggestions.length - 1].group).toBe('new');
		});

		it('keeps the order of each pool within its group', () => {
			const suggestions = selectSuggestions({
				pools: { mutual: [{ _id: 'mB' }, { _id: 'mA' }], popular: [], new: [] },
				mix: SIDEBAR_MIX,
				size: 5,
			});

			expect(getIds(suggestions)).toEqual(['mB', 'mA']);
		});
	});

	describe('when a group runs short', () => {
		it('lets most-followed fill the places a short mutual group leaves', () => {
			const suggestions = selectSuggestions({
				pools: { mutual: buildPool('m', 1), popular: buildPool('p', 6), new: buildPool('n', 6) },
				mix: SIDEBAR_MIX,
				size: 5,
			});

			expect(getGroups(suggestions)).toEqual(['mutual', 'popular', 'popular', 'popular', 'new']);
		});

		it('lets most-followed fill every mutual place when there are no mutual candidates', () => {
			const suggestions = selectSuggestions({
				pools: { mutual: [], popular: buildPool('p', 6), new: buildPool('n', 6) },
				mix: SIDEBAR_MIX,
				size: 5,
			});

			expect(getGroups(suggestions)).toEqual(['popular', 'popular', 'popular', 'popular', 'new']);
		});

		it('lets new users take the places both earlier groups leave', () => {
			const suggestions = selectSuggestions({
				pools: { mutual: [], popular: buildPool('p', 1), new: buildPool('n', 6) },
				mix: SIDEBAR_MIX,
				size: 5,
			});

			expect(getGroups(suggestions)).toEqual(['popular', 'new', 'new', 'new', 'new']);
		});

		it('fills from the earlier groups when the new group is short', () => {
			const suggestions = selectSuggestions({
				pools: { mutual: buildPool('m', 4), popular: buildPool('p', 4), new: [] },
				mix: SIDEBAR_MIX,
				size: 5,
			});

			expect(getGroups(suggestions)).toEqual(['mutual', 'mutual', 'mutual', 'popular', 'popular']);
		});

		it('returns a shorter list when there are not enough candidates at all', () => {
			const suggestions = selectSuggestions({
				pools: { mutual: buildPool('m', 1), popular: buildPool('p', 1), new: buildPool('n', 1) },
				mix: CAROUSEL_MIX,
				size: 10,
			});

			expect(getIds(suggestions)).toEqual(['m1', 'p1', 'n1']);
		});

		it('returns an empty list when there are no candidates', () => {
			expect(selectSuggestions({ pools: { mutual: [], popular: [], new: [] }, mix: SIDEBAR_MIX, size: 5 })).toEqual([]);
		});

		it('treats a missing pool as empty', () => {
			const suggestions = selectSuggestions({ pools: { popular: buildPool('p', 2) }, mix: SIDEBAR_MIX, size: 5 });

			expect(getIds(suggestions)).toEqual(['p1', 'p2']);
		});
	});

	describe('duplicates', () => {
		it('lists a candidate once when it appears in more than one pool, under its first group', () => {
			const suggestions = selectSuggestions({
				pools: { mutual: [{ _id: 'x' }], popular: [{ _id: 'x' }, { _id: 'p2' }], new: [{ _id: 'x' }, { _id: 'n2' }] },
				mix: SIDEBAR_MIX,
				size: 5,
			});

			expect(getIds(suggestions)).toEqual(['x', 'p2', 'n2']);
			expect(suggestions[0].group).toBe('mutual');
		});

		it('treats ObjectId-like values with the same string as the same candidate', () => {
			const makeId = (value) => ({ toString: () => value });
			const suggestions = selectSuggestions({
				pools: { mutual: [{ _id: makeId('same') }], popular: [{ _id: makeId('same') }], new: [] },
				mix: SIDEBAR_MIX,
				size: 5,
			});

			expect(suggestions).toHaveLength(1);
		});

		it('lists a candidate once when it is in both the most-followed and new pools', () => {
			const suggestions = selectSuggestions({
				pools: { mutual: [], popular: buildPool('p', 3), new: [{ _id: 'p1' }, { _id: 'n2' }] },
				mix: { mutual: 0, popular: 2, new: 1 },
				size: 3,
			});

			expect(getIds(suggestions)).toEqual(['p1', 'p2', 'n2']);
		});

		it('still fills the list from the later pools when earlier pools share their people', () => {
			const suggestions = selectSuggestions({
				pools: {
					mutual: [{ _id: 'a' }, { _id: 'b' }],
					popular: [{ _id: 'a' }, { _id: 'b' }, { _id: 'c' }, { _id: 'd' }],
					new: [{ _id: 'a' }, { _id: 'c' }, { _id: 'e' }, { _id: 'f' }],
				},
				mix: SIDEBAR_MIX,
				size: 5,
			});

			expect(getIds(suggestions)).toEqual(['a', 'b', 'c', 'd', 'e']);
		});
	});

	it('does not change the candidates it was given', () => {
		const candidate = { _id: 'p1' };

		selectSuggestions({ pools: { mutual: [], popular: [candidate], new: [] }, mix: SIDEBAR_MIX, size: 5 });

		expect(candidate).toEqual({ _id: 'p1' });
	});
});

const { selectSuggestions } = require('./suggestionSelection');

const SIDEBAR_MIX = { mutual: 2, popular: 2, new: 1 };
const CAROUSEL_MIX = { mutual: 4, popular: 4, new: 2 };
const EMPTY_FEED_MIX = { mutual: 0, popular: 5, new: 3 };

const buildPool = (prefix, count) => Array.from({ length: count }, (_value, index) => ({ _id: `${prefix}${index + 1}` }));

const getIds = (candidates) => candidates.map((candidate) => candidate._id);
const getGroups = (candidates) => candidates.map((candidate) => candidate.group);

describe('selectSuggestions', () => {
	describe('the mix', () => {
		it('picks 2 mutual, 2 most-followed and 1 new for the sidebar, in that order', () => {
			const { suggestions } = selectSuggestions({
				pools: { mutual: buildPool('m', 6), popular: buildPool('p', 6), new: buildPool('n', 6) },
				mix: SIDEBAR_MIX,
				size: 5,
				reserveSize: 5,
			});

			expect(getIds(suggestions)).toEqual(['m1', 'm2', 'p1', 'p2', 'n1']);
			expect(getGroups(suggestions)).toEqual(['mutual', 'mutual', 'popular', 'popular', 'new']);
		});

		it('picks 4 / 4 / 2 for the carousel', () => {
			const { suggestions } = selectSuggestions({
				pools: { mutual: buildPool('m', 8), popular: buildPool('p', 8), new: buildPool('n', 8) },
				mix: CAROUSEL_MIX,
				size: 10,
				reserveSize: 5,
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
			const { suggestions } = selectSuggestions({
				pools: { mutual: buildPool('m', 4), popular: buildPool('p', 8), new: buildPool('n', 8) },
				mix: EMPTY_FEED_MIX,
				size: 8,
				reserveSize: 0,
			});

			expect(getGroups(suggestions)).toEqual(['popular', 'popular', 'popular', 'popular', 'popular', 'new', 'new', 'new']);
		});

		it('keeps new users last', () => {
			const { suggestions } = selectSuggestions({
				pools: { mutual: [], popular: buildPool('p', 5), new: buildPool('n', 5) },
				mix: SIDEBAR_MIX,
				size: 5,
				reserveSize: 0,
			});

			expect(suggestions[suggestions.length - 1].group).toBe('new');
		});

		it('keeps the order of each pool within its group', () => {
			const { suggestions } = selectSuggestions({
				pools: { mutual: [{ _id: 'mB' }, { _id: 'mA' }], popular: [], new: [] },
				mix: SIDEBAR_MIX,
				size: 5,
				reserveSize: 0,
			});

			expect(getIds(suggestions)).toEqual(['mB', 'mA']);
		});
	});

	describe('when a group runs short', () => {
		it('lets most-followed fill the places a short mutual group leaves', () => {
			const { suggestions } = selectSuggestions({
				pools: { mutual: buildPool('m', 1), popular: buildPool('p', 6), new: buildPool('n', 6) },
				mix: SIDEBAR_MIX,
				size: 5,
				reserveSize: 0,
			});

			expect(getGroups(suggestions)).toEqual(['mutual', 'popular', 'popular', 'popular', 'new']);
		});

		it('lets most-followed fill every mutual place when there are no mutual candidates', () => {
			const { suggestions } = selectSuggestions({
				pools: { mutual: [], popular: buildPool('p', 6), new: buildPool('n', 6) },
				mix: SIDEBAR_MIX,
				size: 5,
				reserveSize: 0,
			});

			expect(getGroups(suggestions)).toEqual(['popular', 'popular', 'popular', 'popular', 'new']);
		});

		it('lets new users take the places both earlier groups leave', () => {
			const { suggestions } = selectSuggestions({
				pools: { mutual: [], popular: buildPool('p', 1), new: buildPool('n', 6) },
				mix: SIDEBAR_MIX,
				size: 5,
				reserveSize: 0,
			});

			expect(getGroups(suggestions)).toEqual(['popular', 'new', 'new', 'new', 'new']);
		});

		it('fills from the earlier groups when the new group is short', () => {
			const { suggestions } = selectSuggestions({
				pools: { mutual: buildPool('m', 4), popular: buildPool('p', 4), new: [] },
				mix: SIDEBAR_MIX,
				size: 5,
				reserveSize: 0,
			});

			expect(getGroups(suggestions)).toEqual(['mutual', 'mutual', 'mutual', 'popular', 'popular']);
		});

		it('returns a shorter list when there are not enough candidates at all', () => {
			const { suggestions } = selectSuggestions({
				pools: { mutual: buildPool('m', 1), popular: buildPool('p', 1), new: buildPool('n', 1) },
				mix: CAROUSEL_MIX,
				size: 10,
				reserveSize: 5,
			});

			expect(getIds(suggestions)).toEqual(['m1', 'p1', 'n1']);
		});

		it('returns an empty list and an empty reserve when there are no candidates', () => {
			expect(selectSuggestions({ pools: { mutual: [], popular: [], new: [] }, mix: SIDEBAR_MIX, size: 5, reserveSize: 5 })).toEqual({
				suggestions: [],
				reserve: [],
			});
		});

		it('treats a missing pool as empty', () => {
			const { suggestions } = selectSuggestions({ pools: { popular: buildPool('p', 2) }, mix: SIDEBAR_MIX, size: 5, reserveSize: 0 });

			expect(getIds(suggestions)).toEqual(['p1', 'p2']);
		});
	});

	describe('the reserve', () => {
		it('holds up to the reserve size of candidates that did not make the list', () => {
			const { suggestions, reserve } = selectSuggestions({
				pools: { mutual: buildPool('m', 6), popular: buildPool('p', 6), new: buildPool('n', 6) },
				mix: SIDEBAR_MIX,
				size: 5,
				reserveSize: 5,
			});

			expect(reserve).toHaveLength(5);
			expect(getIds(reserve).filter((id) => getIds(suggestions).includes(id))).toEqual([]);
		});

		it('takes the reserve in group order: leftover mutual first, then most-followed, then new', () => {
			const { reserve } = selectSuggestions({
				pools: { mutual: buildPool('m', 3), popular: buildPool('p', 4), new: buildPool('n', 4) },
				mix: SIDEBAR_MIX,
				size: 5,
				reserveSize: 5,
			});

			expect(getIds(reserve)).toEqual(['m3', 'p3', 'p4', 'n2', 'n3']);
			expect(getGroups(reserve)).toEqual(['mutual', 'popular', 'popular', 'new', 'new']);
		});

		it('is smaller than the reserve size when candidates run out', () => {
			const { reserve } = selectSuggestions({
				pools: { mutual: [], popular: buildPool('p', 8), new: [] },
				mix: SIDEBAR_MIX,
				size: 5,
				reserveSize: 5,
			});

			expect(getIds(reserve)).toEqual(['p6', 'p7', 'p8']);
		});

		it('is empty when the reserve size is 0', () => {
			const { reserve } = selectSuggestions({
				pools: { mutual: [], popular: buildPool('p', 20), new: buildPool('n', 20) },
				mix: EMPTY_FEED_MIX,
				size: 8,
				reserveSize: 0,
			});

			expect(reserve).toEqual([]);
		});
	});

	describe('duplicates', () => {
		it('lists a candidate once when it appears in more than one pool, under its first group', () => {
			const { suggestions } = selectSuggestions({
				pools: { mutual: [{ _id: 'x' }], popular: [{ _id: 'x' }, { _id: 'p2' }], new: [{ _id: 'x' }, { _id: 'n2' }] },
				mix: SIDEBAR_MIX,
				size: 5,
				reserveSize: 0,
			});

			expect(getIds(suggestions)).toEqual(['x', 'p2', 'n2']);
			expect(suggestions[0].group).toBe('mutual');
		});

		it('treats ObjectId-like values with the same string as the same candidate', () => {
			const makeId = (value) => ({ toString: () => value });
			const { suggestions } = selectSuggestions({
				pools: { mutual: [{ _id: makeId('same') }], popular: [{ _id: makeId('same') }], new: [] },
				mix: SIDEBAR_MIX,
				size: 5,
				reserveSize: 0,
			});

			expect(suggestions).toHaveLength(1);
		});

		it('keeps a reserve candidate out of the list', () => {
			const { suggestions, reserve } = selectSuggestions({
				pools: { mutual: [], popular: buildPool('p', 3), new: [{ _id: 'p1' }, { _id: 'n2' }] },
				mix: { mutual: 0, popular: 2, new: 1 },
				size: 3,
				reserveSize: 2,
			});

			expect(getIds([...suggestions, ...reserve]).filter((id) => id === 'p1')).toHaveLength(1);
		});
	});

	it('does not change the candidates it was given', () => {
		const candidate = { _id: 'p1' };

		selectSuggestions({ pools: { mutual: [], popular: [candidate], new: [] }, mix: SIDEBAR_MIX, size: 5, reserveSize: 0 });

		expect(candidate).toEqual({ _id: 'p1' });
	});
});

const mongoose = require('mongoose');

const {
	POPULAR_POSTS_PAGE_SIZE,
	POPULAR_COMMENT_WEIGHT,
	POPULAR_AGE_OFFSET_HOURS,
	POPULAR_AGE_EXPONENT,
	MAX_SHOWN_POST_IDS,
	POPULAR_BODY_LIMIT_BYTES,
	MS_PER_HOUR,
} = require('./popularPosts');

const buildMaxBody = (idCount) =>
	JSON.stringify({
		snapshotTime: new Date().toISOString(),
		shownPostIds: Array.from({ length: idCount }, () => new mongoose.Types.ObjectId().toString()),
	});

describe('popular posts config', () => {
	it('loads 30 posts per page', () => {
		expect(POPULAR_POSTS_PAGE_SIZE).toBe(30);
	});

	it('weighs a comment as 2 likes', () => {
		expect(POPULAR_COMMENT_WEIGHT).toBe(2);
	});

	it('adds 2 hours to the age of a post before applying the exponent', () => {
		expect(POPULAR_AGE_OFFSET_HOURS).toBe(2);
	});

	it('raises the age to the power of 1.5', () => {
		expect(POPULAR_AGE_EXPONENT).toBe(1.5);
	});

	it('accepts at most 10000 shown post ids', () => {
		expect(MAX_SHOWN_POST_IDS).toBe(10000);
	});

	it('counts one hour as 3600000 milliseconds', () => {
		expect(MS_PER_HOUR).toBe(3600000);
	});

	describe('the request body limit', () => {
		it('is about 271 KB', () => {
			expect(POPULAR_BODY_LIMIT_BYTES).toBeGreaterThan(270000);
			expect(POPULAR_BODY_LIMIT_BYTES).toBeLessThan(272000);
		});

		it('fits a request carrying the maximum of 10000 shown post ids', () => {
			expect(Buffer.byteLength(buildMaxBody(MAX_SHOWN_POST_IDS))).toBeLessThanOrEqual(POPULAR_BODY_LIMIT_BYTES);
		});

		it('is far smaller than a megabyte, so a runaway body is refused early', () => {
			expect(POPULAR_BODY_LIMIT_BYTES).toBeLessThan(1024 * 1024);
		});
	});
});

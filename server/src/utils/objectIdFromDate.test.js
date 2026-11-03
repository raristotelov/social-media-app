const mongoose = require('mongoose');

const objectIdFromDate = require('./objectIdFromDate');

describe('objectIdFromDate', () => {
	it('returns an object id', () => {
		expect(objectIdFromDate(new Date('2026-11-03T12:00:00.000Z'))).toBeInstanceOf(mongoose.Types.ObjectId);
	});

	it('carries the date as its creation time', () => {
		const date = new Date('2026-11-03T12:00:00.000Z');

		expect(objectIdFromDate(date).getTimestamp()).toEqual(date);
	});

	it('drops the milliseconds, rounding the time down to the second', () => {
		expect(objectIdFromDate(new Date('2026-11-03T12:00:00.999Z')).getTimestamp()).toEqual(new Date('2026-11-03T12:00:00.000Z'));
	});

	it('has an all-zero tail, so it sorts before every id made in the same second', () => {
		const lowest = objectIdFromDate(new Date('2026-11-03T12:00:00.500Z'));
		const sameSecond = new mongoose.Types.ObjectId(lowest.toHexString().slice(0, 8) + 'ffffffffffffffff');

		expect(lowest.toHexString().slice(8)).toBe('0000000000000000');
		expect(String(lowest) < String(sameSecond)).toBe(true);
	});

	it('sorts before ids made later and after ids made earlier', () => {
		const middle = objectIdFromDate(new Date('2026-11-03T12:00:00.000Z'));
		const earlier = objectIdFromDate(new Date('2026-11-03T11:59:59.000Z'));
		const later = objectIdFromDate(new Date('2026-11-03T12:00:01.000Z'));

		expect([later, middle, earlier].map(String).sort()).toEqual([earlier, middle, later].map(String));
	});

	it('is the same id for the same second', () => {
		expect(String(objectIdFromDate(new Date('2026-11-03T12:00:00.100Z')))).toBe(String(objectIdFromDate(new Date('2026-11-03T12:00:00.900Z'))));
	});

	it('makes a cutoff that an id created a moment later is above, and an id created a moment earlier is below', () => {
		const cutoff = objectIdFromDate(new Date('2026-11-03T12:00:00.000Z'));
		const justAfter = new mongoose.Types.ObjectId(
			objectIdFromDate(new Date('2026-11-03T12:00:01.000Z')).toHexString().slice(0, 8) + 'abcdef0123456789',
		);
		const justBefore = new mongoose.Types.ObjectId(
			objectIdFromDate(new Date('2026-11-03T11:59:59.000Z')).toHexString().slice(0, 8) + 'abcdef0123456789',
		);

		expect(String(justAfter) > String(cutoff)).toBe(true);
		expect(String(justBefore) < String(cutoff)).toBe(true);
	});
});

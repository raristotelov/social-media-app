const createRandom = (seed) => {
	let state = seed;

	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let value = Math.imul(state ^ (state >>> 15), 1 | state);
		value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;

		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
};

const shuffle = (list, random) => {
	const copy = [...list];

	for (let index = copy.length - 1; index > 0; index -= 1) {
		const swapIndex = Math.floor(random() * (index + 1));
		[copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
	}

	return copy;
};

const randomInt = (random, min, max) => min + Math.floor(random() * (max - min + 1));

const pickOne = (list, random) => list[Math.floor(random() * list.length)];

module.exports = {
	createRandom,
	shuffle,
	randomInt,
	pickOne,
};

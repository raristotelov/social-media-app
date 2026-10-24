const { SUGGESTION_GROUP_ORDER } = require('../config/suggestions');

const getGroupRank = (group) => SUGGESTION_GROUP_ORDER.indexOf(group);

const createTaker = (pools) => {
	const takenIds = new Set();

	return (groups, limit) => {
		const taken = [];

		for (const group of groups) {
			for (const candidate of pools[group] ?? []) {
				if (taken.length >= limit) {
					return taken;
				}

				const candidateId = String(candidate._id);

				if (!takenIds.has(candidateId)) {
					takenIds.add(candidateId);
					taken.push({ ...candidate, group });
				}
			}
		}

		return taken;
	};
};

const selectSuggestions = ({ pools, mix, size, reserveSize }) => {
	const take = createTaker(pools);
	const suggestions = [];
	let shortfall = 0;

	for (const group of SUGGESTION_GROUP_ORDER) {
		const quota = mix[group] + shortfall;
		const picked = take([group], quota);

		suggestions.push(...picked);
		shortfall = quota - picked.length;
	}

	suggestions.push(...take(SUGGESTION_GROUP_ORDER, size - suggestions.length));

	suggestions.sort((a, b) => getGroupRank(a.group) - getGroupRank(b.group));

	const reserve = take(SUGGESTION_GROUP_ORDER, reserveSize);

	return { suggestions, reserve };
};

module.exports = {
	selectSuggestions,
};

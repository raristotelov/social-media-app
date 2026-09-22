import { useCallback, useState } from 'react';

const useLocalStorage = (key, initialValue) => {
	const [state, setState] = useState(() => {
		const persistedStateSerialized = localStorage.getItem(key);

		if (persistedStateSerialized) {
			const persistedState = JSON.parse(persistedStateSerialized);

			return persistedState;
		}

		return initialValue;
	});

	// Stable identity so callers can safely list it as an effect dependency.
	const setLocalStorageState = useCallback(
		(value) => {
			setState(value);

			if (value) {
				localStorage.setItem(key, JSON.stringify(value));
			} else {
				localStorage.removeItem(key);
			}
		},
		[key],
	);

	return [state, setLocalStorageState];
};

export default useLocalStorage;

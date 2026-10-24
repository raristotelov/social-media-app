import { useCallback, useSyncExternalStore } from 'react';

const getMediaQueryList = (query) => window.matchMedia?.(query);

const useMediaQuery = (query) => {
	const subscribe = useCallback(
		(onChange) => {
			const mediaQueryList = getMediaQueryList(query);

			mediaQueryList?.addEventListener('change', onChange);

			return () => mediaQueryList?.removeEventListener('change', onChange);
		},
		[query],
	);

	const getSnapshot = useCallback(() => Boolean(getMediaQueryList(query)?.matches), [query]);

	return useSyncExternalStore(subscribe, getSnapshot);
};

export default useMediaQuery;

import { useEffect } from 'react';

import { LOAD_MORE_DISTANCE_PX } from '../constants/layout';

const isNearPageBottom = () => document.documentElement.scrollHeight - (window.scrollY + window.innerHeight) <= LOAD_MORE_DISTANCE_PX;

const useLoadMoreOnScroll = ({ onLoadMore, isEnabled }) => {
	useEffect(() => {
		if (!isEnabled) {
			return undefined;
		}

		let pendingFrame = null;

		const loadMoreWhenNearBottom = () => {
			pendingFrame = null;

			if (isNearPageBottom()) {
				onLoadMore();
			}
		};

		const scheduleCheck = () => {
			if (pendingFrame === null) {
				pendingFrame = window.requestAnimationFrame(loadMoreWhenNearBottom);
			}
		};

		scheduleCheck();

		window.addEventListener('scroll', scheduleCheck, { passive: true });
		window.addEventListener('resize', scheduleCheck);

		return () => {
			window.removeEventListener('scroll', scheduleCheck);
			window.removeEventListener('resize', scheduleCheck);

			if (pendingFrame !== null) {
				window.cancelAnimationFrame(pendingFrame);
			}
		};
	}, [onLoadMore, isEnabled]);
};

export default useLoadMoreOnScroll;

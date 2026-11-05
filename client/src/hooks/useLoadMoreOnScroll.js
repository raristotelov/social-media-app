import { useEffect } from 'react';

import { LIST_LOAD_MORE_DISTANCE_PX, LOAD_MORE_DISTANCE_PX } from '../constants/layout';

const isNearPageBottom = () => document.documentElement.scrollHeight - (window.scrollY + window.innerHeight) <= LOAD_MORE_DISTANCE_PX;

const isNearElementBottom = (element) => element.scrollHeight - (element.scrollTop + element.clientHeight) <= LIST_LOAD_MORE_DISTANCE_PX;

const useLoadMoreOnScroll = ({ onLoadMore, isEnabled, elementRef }) => {
	useEffect(() => {
		const element = elementRef ? elementRef.current : null;

		if (!isEnabled || (elementRef && !element)) {
			return undefined;
		}

		const scrollTarget = element || window;

		let pendingFrame = null;

		const loadMoreWhenNearBottom = () => {
			pendingFrame = null;

			if (element ? isNearElementBottom(element) : isNearPageBottom()) {
				onLoadMore();
			}
		};

		const scheduleCheck = () => {
			if (pendingFrame === null) {
				pendingFrame = window.requestAnimationFrame(loadMoreWhenNearBottom);
			}
		};

		scheduleCheck();

		scrollTarget.addEventListener('scroll', scheduleCheck, { passive: true });
		window.addEventListener('resize', scheduleCheck);

		return () => {
			scrollTarget.removeEventListener('scroll', scheduleCheck);
			window.removeEventListener('resize', scheduleCheck);

			if (pendingFrame !== null) {
				window.cancelAnimationFrame(pendingFrame);
			}
		};
	}, [elementRef, onLoadMore, isEnabled]);
};

export default useLoadMoreOnScroll;

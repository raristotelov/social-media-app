import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { HEADER_HEIGHT_CSS_VARIABLE, MOBILE_MEDIA_QUERY, TAB_BAR_HEIGHT_CSS_VARIABLE } from '../constants/layout';

const readCssPixels = (variableName) => Number.parseFloat(window.getComputedStyle(document.documentElement).getPropertyValue(variableName)) || 0;

const getVisibleBounds = () => {
	const isMobile = window.matchMedia?.(MOBILE_MEDIA_QUERY).matches;

	return {
		top: readCssPixels(HEADER_HEIGHT_CSS_VARIABLE),
		bottom: window.innerHeight - (isMobile ? readCssPixels(TAB_BAR_HEIGHT_CSS_VARIABLE) : 0),
	};
};

const isPostInCurrentPosition = ({ top, bottom }, bounds) => {
	const isFullyInView = top >= bounds.top && bottom <= bounds.bottom;
	const fillsVisibleArea = top <= bounds.top && bottom >= bounds.bottom;

	return isFullyInView || fillsVisibleArea;
};

const usePostHashSync = (postsContainerRef) => {
	const navigate = useNavigate();
	const { hash } = useLocation();

	const initialPostIdRef = useRef(hash.slice(1));
	const currentPostIdRef = useRef(hash.slice(1));
	const hasScrolledToInitialPostRef = useRef(false);

	useEffect(() => {
		const postsContainer = postsContainerRef.current;

		if (!postsContainer) {
			return undefined;
		}

		const getPostElements = () => Array.from(postsContainer.children);

		const getPostIdsInCurrentPosition = () => {
			const bounds = getVisibleBounds();

			return getPostElements()
				.filter((postElement) => isPostInCurrentPosition(postElement.getBoundingClientRect(), bounds))
				.map((postElement) => postElement.id);
		};

		if (!hasScrolledToInitialPostRef.current) {
			hasScrolledToInitialPostRef.current = true;

			getPostElements()
				.find((postElement) => postElement.id === initialPostIdRef.current)
				?.scrollIntoView();
		}

		let previousPostIds = new Set(getPostIdsInCurrentPosition());
		let lastScrollY = window.scrollY;
		let pendingFrame = null;

		const syncHashWithScroll = () => {
			pendingFrame = null;

			const postIds = getPostIdsInCurrentPosition();
			const isScrollingDown = window.scrollY >= lastScrollY;
			const enteringPostIds = postIds.filter((postId) => !previousPostIds.has(postId));

			lastScrollY = window.scrollY;
			previousPostIds = new Set(postIds);

			let nextPostId = currentPostIdRef.current;

			if (enteringPostIds.length) {
				nextPostId = isScrollingDown ? enteringPostIds[enteringPostIds.length - 1] : enteringPostIds[0];
			} else if (postIds.length && !postIds.includes(nextPostId)) {
				nextPostId = postIds[0];
			}

			if (nextPostId && nextPostId !== currentPostIdRef.current) {
				currentPostIdRef.current = nextPostId;

				navigate({ hash: `#${nextPostId}` }, { replace: true });
			}
		};

		const onScroll = () => {
			if (pendingFrame === null) {
				pendingFrame = window.requestAnimationFrame(syncHashWithScroll);
			}
		};

		window.addEventListener('scroll', onScroll, { passive: true });

		return () => {
			window.removeEventListener('scroll', onScroll);

			if (pendingFrame !== null) {
				window.cancelAnimationFrame(pendingFrame);
			}
		};
	}, [postsContainerRef, navigate]);
};

export default usePostHashSync;

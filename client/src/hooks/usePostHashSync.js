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

const isPostVisible = ({ top, bottom }, bounds) => bottom > bounds.top && top < bounds.bottom;

const isPostTallerThanVisibleArea = ({ top, bottom }, bounds) => bottom - top > bounds.bottom - bounds.top;

const isPostFullyInView = ({ top, bottom }, bounds) => top >= bounds.top && bottom <= bounds.bottom;

const hasTallPostReachedEdge = ({ top, bottom }, bounds, isScrollingDown) => {
	if (isScrollingDown) {
		return top <= bounds.top && bottom > bounds.top;
	}

	return bottom >= bounds.bottom && top < bounds.bottom;
};

const canPostBecomeCurrent = (rect, bounds, isScrollingDown) => {
	if (isPostFullyInView(rect, bounds)) {
		return true;
	}

	return isPostTallerThanVisibleArea(rect, bounds) && hasTallPostReachedEdge(rect, bounds, isScrollingDown);
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

		const readPostRects = () =>
			getPostElements().map((postElement) => {
				const { top, bottom } = postElement.getBoundingClientRect();

				return { id: postElement.id, top, bottom };
			});

		const toRectsById = (rects) => new Map(rects.map((rect) => [rect.id, rect]));

		if (!hasScrolledToInitialPostRef.current) {
			hasScrolledToInitialPostRef.current = true;

			getPostElements()
				.find((postElement) => postElement.id === initialPostIdRef.current)
				?.scrollIntoView();
		}

		let previousRectsById = toRectsById(readPostRects());
		let lastScrollY = window.scrollY;
		let pendingFrame = null;

		const syncHashWithScroll = () => {
			pendingFrame = null;

			const bounds = getVisibleBounds();
			const rects = readPostRects();
			const rectsById = toRectsById(rects);
			const isScrollingDown = window.scrollY >= lastScrollY;

			const enteringPostIds = rects
				.filter((rect) => {
					const previousRect = previousRectsById.get(rect.id);
					const wasCurrentCandidate = previousRect && canPostBecomeCurrent(previousRect, bounds, isScrollingDown);

					return canPostBecomeCurrent(rect, bounds, isScrollingDown) && !wasCurrentCandidate;
				})
				.map((rect) => rect.id);

			lastScrollY = window.scrollY;
			previousRectsById = rectsById;

			let nextPostId = currentPostIdRef.current;

			if (enteringPostIds.length) {
				nextPostId = isScrollingDown ? enteringPostIds[enteringPostIds.length - 1] : enteringPostIds[0];
			} else {
				const currentRect = rectsById.get(nextPostId);

				if (!currentRect || !isPostVisible(currentRect, bounds)) {
					const visibleRects = rects.filter((rect) => isPostVisible(rect, bounds));

					if (visibleRects.length) {
						nextPostId = (isScrollingDown ? visibleRects[0] : visibleRects[visibleRects.length - 1]).id;
					}
				}
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

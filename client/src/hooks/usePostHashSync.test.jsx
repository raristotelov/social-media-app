import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';

import usePostHashSync from './usePostHashSync';

const VIEWPORT_HEIGHT = 800;
const HEADER_HEIGHT = 60;
const TAB_BAR_HEIGHT = 50;

let queuedFrames;
let nextFrameId;
let cssVariables;
let isMobileViewport;

const setScrollY = (value) => {
	Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value });
};

const buildPostsContainer = (postIds) => {
	const container = document.createElement('div');
	const postElements = {};

	postIds.forEach((postId) => {
		const postElement = document.createElement('article');

		postElement.id = postId;
		postElement.scrollIntoView = jest.fn();
		container.appendChild(postElement);
		postElements[postId] = postElement;
	});

	document.body.appendChild(container);

	return { container, postElements };
};

const placePost = (postElement, top, bottom) => {
	postElement.getBoundingClientRect = () => ({ top, bottom, height: bottom - top });
};

const placePosts = (postElements, positions) => {
	Object.entries(positions).forEach(([postId, [top, bottom]]) => placePost(postElements[postId], top, bottom));
};

const scrollTo = (scrollY) => {
	act(() => {
		setScrollY(scrollY);
		window.dispatchEvent(new Event('scroll'));
	});
};

const flushFrames = () => {
	act(() => {
		const frames = [...queuedFrames.values()];

		queuedFrames.clear();
		frames.forEach((frame) => frame());
	});
};

const scrollToAndSettle = (scrollY) => {
	scrollTo(scrollY);
	flushFrames();
};

const renderSyncHook = ({ entry = '/user/user2/posts', container }) => {
	const wrapper = ({ children }) => <MemoryRouter initialEntries={[entry]}>{children}</MemoryRouter>;

	return renderHook(
		() => {
			usePostHashSync({ current: container });

			return { location: useLocation(), navigationType: useNavigationType() };
		},
		{ wrapper },
	);
};

describe('usePostHashSync', () => {
	let requestFrameSpy;
	let cancelFrameSpy;
	let computedStyleSpy;
	let originalInnerHeight;
	let originalMatchMedia;

	beforeEach(() => {
		queuedFrames = new Map();
		nextFrameId = 1;
		cssVariables = { '--header-height': `${HEADER_HEIGHT}px`, '--tab-bar-height': `${TAB_BAR_HEIGHT}px` };
		isMobileViewport = false;
		setScrollY(0);

		originalInnerHeight = window.innerHeight;
		originalMatchMedia = window.matchMedia;
		window.innerHeight = VIEWPORT_HEIGHT;
		window.matchMedia = jest.fn(() => ({ matches: isMobileViewport }));

		requestFrameSpy = jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
			const frameId = nextFrameId;

			nextFrameId += 1;
			queuedFrames.set(frameId, callback);

			return frameId;
		});
		cancelFrameSpy = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((frameId) => {
			queuedFrames.delete(frameId);
		});
		computedStyleSpy = jest.spyOn(window, 'getComputedStyle').mockImplementation(() => ({
			getPropertyValue: (name) => cssVariables[name] ?? '',
		}));
	});

	afterEach(() => {
		requestFrameSpy.mockRestore();
		cancelFrameSpy.mockRestore();
		computedStyleSpy.mockRestore();
		window.innerHeight = originalInnerHeight;
		window.matchMedia = originalMatchMedia;
		document.body.innerHTML = '';
	});

	describe('opening at a post', () => {
		it('scrolls the post named by the hash into view', () => {
			const { container, postElements } = buildPostsContainer(['p1', 'p2', 'p3']);

			placePosts(postElements, { p1: [60, 560], p2: [560, 1060], p3: [1060, 1560] });
			renderSyncHook({ entry: '/user/user2/posts#p2', container });

			expect(postElements.p2.scrollIntoView).toHaveBeenCalledTimes(1);
		});

		it('does not scroll the other posts into view', () => {
			const { container, postElements } = buildPostsContainer(['p1', 'p2', 'p3']);

			placePosts(postElements, { p1: [60, 560], p2: [560, 1060], p3: [1060, 1560] });
			renderSyncHook({ entry: '/user/user2/posts#p2', container });

			expect(postElements.p1.scrollIntoView).not.toHaveBeenCalled();
			expect(postElements.p3.scrollIntoView).not.toHaveBeenCalled();
		});

		it('scrolls nothing and does not fail when there is no hash', () => {
			const { container, postElements } = buildPostsContainer(['p1', 'p2']);

			placePosts(postElements, { p1: [60, 560], p2: [560, 1060] });
			renderSyncHook({ container });

			expect(postElements.p1.scrollIntoView).not.toHaveBeenCalled();
			expect(postElements.p2.scrollIntoView).not.toHaveBeenCalled();
		});

		it('scrolls nothing and does not fail when the hash names no post', () => {
			const { container, postElements } = buildPostsContainer(['p1', 'p2']);

			placePosts(postElements, { p1: [60, 560], p2: [560, 1060] });
			renderSyncHook({ entry: '/user/user2/posts#gone', container });

			expect(postElements.p1.scrollIntoView).not.toHaveBeenCalled();
			expect(postElements.p2.scrollIntoView).not.toHaveBeenCalled();
		});

		it('does nothing when there is no posts container', () => {
			const { result } = renderSyncHook({ entry: '/user/user2/posts#p1', container: null });

			expect(result.current.location.hash).toBe('#p1');
		});

		it('keeps the hash it opened with until the user scrolls', () => {
			const { container, postElements } = buildPostsContainer(['p1', 'p2']);

			placePosts(postElements, { p1: [60, 560], p2: [560, 1060] });
			const { result } = renderSyncHook({ entry: '/user/user2/posts#p2', container });

			expect(result.current.location.hash).toBe('#p2');
		});
	});

	describe('following the scroll', () => {
		it('updates the hash to the next post once it is fully in view when scrolling down', () => {
			const { container, postElements } = buildPostsContainer(['p1', 'p2', 'p3']);

			placePosts(postElements, { p1: [60, 560], p2: [560, 1060], p3: [1060, 1560] });
			const { result } = renderSyncHook({ entry: '/user/user2/posts#p1', container });

			placePosts(postElements, { p1: [-340, 160], p2: [160, 660], p3: [660, 1160] });
			scrollToAndSettle(400);

			expect(result.current.location.hash).toBe('#p2');
		});

		it('replaces the history entry instead of adding one', () => {
			const { container, postElements } = buildPostsContainer(['p1', 'p2']);

			placePosts(postElements, { p1: [60, 560], p2: [560, 1060] });
			const { result } = renderSyncHook({ entry: '/user/user2/posts#p1', container });

			placePosts(postElements, { p1: [-340, 160], p2: [160, 660] });
			scrollToAndSettle(400);

			expect(result.current.navigationType).toBe('REPLACE');
		});

		it('keeps the path unchanged when it updates the hash', () => {
			const { container, postElements } = buildPostsContainer(['p1', 'p2']);

			placePosts(postElements, { p1: [60, 560], p2: [560, 1060] });
			const { result } = renderSyncHook({ entry: '/user/user2/posts#p1', container });

			placePosts(postElements, { p1: [-340, 160], p2: [160, 660] });
			scrollToAndSettle(400);

			expect(result.current.location.pathname).toBe('/user/user2/posts');
		});

		it('keeps the previous post while two posts are only partly visible', () => {
			const { container, postElements } = buildPostsContainer(['p1', 'p2', 'p3']);

			placePosts(postElements, { p1: [60, 560], p2: [560, 1060], p3: [1060, 1560] });
			const { result } = renderSyncHook({ entry: '/user/user2/posts#p1', container });

			placePosts(postElements, { p1: [-140, 360], p2: [360, 860], p3: [860, 1360] });
			scrollToAndSettle(200);

			expect(result.current.location.hash).toBe('#p1');
		});

		it('does not change the hash until the animation frame runs', () => {
			const { container, postElements } = buildPostsContainer(['p1', 'p2']);

			placePosts(postElements, { p1: [60, 560], p2: [560, 1060] });
			const { result } = renderSyncHook({ entry: '/user/user2/posts#p1', container });

			placePosts(postElements, { p1: [-340, 160], p2: [160, 660] });
			scrollTo(400);

			expect(result.current.location.hash).toBe('#p1');
		});

		it('updates the hash to the previous post once it is fully in view when scrolling up', () => {
			const { container, postElements } = buildPostsContainer(['p1', 'p2', 'p3']);

			placePosts(postElements, { p1: [-440, 60], p2: [60, 560], p3: [560, 1060] });
			setScrollY(500);
			const { result } = renderSyncHook({ entry: '/user/user2/posts#p2', container });

			placePosts(postElements, { p1: [60, 560], p2: [560, 1060], p3: [1060, 1560] });
			scrollToAndSettle(0);

			expect(result.current.location.hash).toBe('#p1');
		});

		it('treats a post taller than the visible area as current once it fills the visible area', () => {
			const { container, postElements } = buildPostsContainer(['p1', 'p2']);

			placePosts(postElements, { p1: [60, 500], p2: [500, 1500] });
			const { result } = renderSyncHook({ entry: '/user/user2/posts#p1', container });

			placePosts(postElements, { p1: [-440, 0], p2: [0, 1000] });
			scrollToAndSettle(500);

			expect(result.current.location.hash).toBe('#p2');
		});

		it('keeps a tall post as current while it still fills the visible area', () => {
			const { container, postElements } = buildPostsContainer(['p1', 'p2']);

			placePosts(postElements, { p1: [-440, 0], p2: [0, 1000] });
			const { result } = renderSyncHook({ entry: '/user/user2/posts#p2', container });

			placePosts(postElements, { p1: [-540, -100], p2: [-100, 900] });
			scrollToAndSettle(600);

			expect(result.current.location.hash).toBe('#p2');
		});

		it('does not change the hash when the same post stays current', () => {
			const { container, postElements } = buildPostsContainer(['p1', 'p2']);

			placePosts(postElements, { p1: [60, 560], p2: [560, 1060] });
			const { result } = renderSyncHook({ entry: '/user/user2/posts#p1', container });

			scrollToAndSettle(0);

			expect(result.current.navigationType).toBe('POP');
			expect(result.current.location.hash).toBe('#p1');
		});

		it('requests one animation frame for several scroll events before the frame runs', () => {
			const { container, postElements } = buildPostsContainer(['p1', 'p2']);

			placePosts(postElements, { p1: [60, 560], p2: [560, 1060] });
			renderSyncHook({ entry: '/user/user2/posts#p1', container });

			scrollTo(100);
			scrollTo(200);
			scrollTo(300);

			expect(requestFrameSpy).toHaveBeenCalledTimes(1);
		});
	});

	describe('visible area on mobile', () => {
		it('stops the visible area above the tab bar', () => {
			isMobileViewport = true;

			const { container, postElements } = buildPostsContainer(['p1', 'p2']);

			placePosts(postElements, { p1: [60, 560], p2: [560, 1060] });
			const { result } = renderSyncHook({ entry: '/user/user2/posts#p1', container });

			placePosts(postElements, { p1: [-340, 160], p2: [160, 760] });
			scrollToAndSettle(400);

			expect(result.current.location.hash).toBe('#p1');
		});

		it('counts a post as current once it is fully above the tab bar', () => {
			isMobileViewport = true;

			const { container, postElements } = buildPostsContainer(['p1', 'p2']);

			placePosts(postElements, { p1: [60, 560], p2: [560, 1060] });
			const { result } = renderSyncHook({ entry: '/user/user2/posts#p1', container });

			placePosts(postElements, { p1: [-340, 160], p2: [160, 750] });
			scrollToAndSettle(400);

			expect(result.current.location.hash).toBe('#p2');
		});

		it('uses the full viewport height outside the mobile layout', () => {
			isMobileViewport = false;

			const { container, postElements } = buildPostsContainer(['p1', 'p2']);

			placePosts(postElements, { p1: [60, 560], p2: [560, 1060] });
			const { result } = renderSyncHook({ entry: '/user/user2/posts#p1', container });

			placePosts(postElements, { p1: [-340, 160], p2: [160, 760] });
			scrollToAndSettle(400);

			expect(result.current.location.hash).toBe('#p2');
		});
	});

	describe('cleanup', () => {
		it('stops listening to scroll once unmounted', () => {
			const { container, postElements } = buildPostsContainer(['p1', 'p2']);

			placePosts(postElements, { p1: [60, 560], p2: [560, 1060] });
			const { unmount } = renderSyncHook({ entry: '/user/user2/posts#p1', container });

			unmount();
			scrollTo(300);

			expect(requestFrameSpy).not.toHaveBeenCalled();
		});

		it('cancels a pending animation frame when unmounted', () => {
			const { container, postElements } = buildPostsContainer(['p1', 'p2']);

			placePosts(postElements, { p1: [60, 560], p2: [560, 1060] });
			const { unmount } = renderSyncHook({ entry: '/user/user2/posts#p1', container });

			scrollTo(300);
			unmount();

			expect(cancelFrameSpy).toHaveBeenCalledTimes(1);
		});
	});
});

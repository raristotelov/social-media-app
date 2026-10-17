import { useEffect, useState } from 'react';

const MIN_SCROLL_DISTANCE = 8;

const useHideOnScrollDown = () => {
	const [isHidden, setIsHidden] = useState(false);

	useEffect(() => {
		let lastScrollY = window.scrollY;
		let pendingFrame = null;

		const updateVisibility = () => {
			pendingFrame = null;

			const currentScrollY = window.scrollY;

			if (currentScrollY <= 0) {
				setIsHidden(false);
				lastScrollY = currentScrollY;

				return;
			}

			const scrolledDistance = currentScrollY - lastScrollY;

			if (Math.abs(scrolledDistance) < MIN_SCROLL_DISTANCE) {
				return;
			}

			setIsHidden(scrolledDistance > 0);
			lastScrollY = currentScrollY;
		};

		const onScroll = () => {
			if (pendingFrame === null) {
				pendingFrame = window.requestAnimationFrame(updateVisibility);
			}
		};

		window.addEventListener('scroll', onScroll, { passive: true });

		return () => {
			window.removeEventListener('scroll', onScroll);

			if (pendingFrame !== null) {
				window.cancelAnimationFrame(pendingFrame);
			}
		};
	}, []);

	return isHidden;
};

export default useHideOnScrollDown;

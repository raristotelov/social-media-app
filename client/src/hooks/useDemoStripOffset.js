import { useEffect } from 'react';

import { DEMO_STRIP_OFFSET_CSS_VARIABLE } from '../constants/demo';

const useDemoStripOffset = (stripRef, isActive) => {
	useEffect(() => {
		const strip = stripRef.current;

		if (!isActive || !strip) {
			return undefined;
		}

		const root = document.documentElement;
		let stripHeight = strip.offsetHeight;

		const applyOffset = () => {
			root.style.setProperty(DEMO_STRIP_OFFSET_CSS_VARIABLE, `${Math.max(stripHeight - window.scrollY, 0)}px`);
		};

		const measure = () => {
			stripHeight = strip.offsetHeight;
			applyOffset();
		};

		const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);

		applyOffset();
		resizeObserver?.observe(strip);
		window.addEventListener('scroll', applyOffset, { passive: true });
		window.addEventListener('resize', measure);

		return () => {
			resizeObserver?.disconnect();
			window.removeEventListener('scroll', applyOffset);
			window.removeEventListener('resize', measure);
			root.style.removeProperty(DEMO_STRIP_OFFSET_CSS_VARIABLE);
		};
	}, [stripRef, isActive]);
};

export default useDemoStripOffset;

import { fireEvent } from '@testing-library/react';

import { REDUCED_MOTION_MEDIA_QUERY } from '../constants/bottomSheet';
import { MOBILE_MEDIA_QUERY } from '../constants/layout';

export const SHEET_HEIGHT = 400;

const TIME_ORIGIN_MS = 1_000_000;

const originalMatchMedia = window.matchMedia;
const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');

export const installBottomSheetEnvironment = ({ isMobile = true, prefersReducedMotion = false } = {}) => {
	const matchesByQuery = {
		[MOBILE_MEDIA_QUERY]: isMobile,
		[REDUCED_MOTION_MEDIA_QUERY]: prefersReducedMotion,
	};

	window.matchMedia = jest.fn((query) => ({
		matches: Boolean(matchesByQuery[query]),
		addEventListener: jest.fn(),
		removeEventListener: jest.fn(),
	}));

	Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => SHEET_HEIGHT });
};

export const restoreBottomSheetEnvironment = () => {
	window.matchMedia = originalMatchMedia;
	Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight);
};

export const firePointer = (element, type, { clientY = 0, timeStamp = 0, pointerId = 1, pointerType = 'touch', button = 0 } = {}) => {
	const event = new Event(type, { bubbles: true, cancelable: true });

	Object.defineProperties(event, {
		clientY: { value: clientY },
		pointerId: { value: pointerId },
		pointerType: { value: pointerType },
		button: { value: button },
		timeStamp: { value: TIME_ORIGIN_MS + timeStamp },
	});

	fireEvent(element, event);
};

export const fireTransitionEnd = (element, propertyName = 'transform') => {
	const event = new Event('transitionend', { bubbles: true });

	Object.defineProperty(event, 'propertyName', { value: propertyName });

	fireEvent(element, event);
};

export const dragDown = (element, distance, { duration = 1000, pointerType = 'touch' } = {}) => {
	firePointer(element, 'pointerdown', { clientY: 100, timeStamp: 0, pointerType });
	firePointer(element, 'pointermove', { clientY: 100 + distance, timeStamp: duration, pointerType });
	firePointer(element, 'pointerup', { clientY: 100 + distance, timeStamp: duration, pointerType });
};

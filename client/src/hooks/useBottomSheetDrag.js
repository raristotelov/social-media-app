import { useRef } from 'react';

import {
	BOTTOM_SHEET_CLOSE_HEIGHT_RATIO,
	BOTTOM_SHEET_DRAG_ZONE_SELECTOR,
	BOTTOM_SHEET_FLICK_VELOCITY_PX_PER_MS,
	BOTTOM_SHEET_SLIDE_OUT_MS,
	BOTTOM_SHEET_SPRING_BACK_MS,
	REDUCED_MOTION_MEDIA_QUERY,
} from '../constants/bottomSheet';
import { MOBILE_MEDIA_QUERY } from '../constants/layout';

import useMediaQuery from './useMediaQuery';

const PRIMARY_MOUSE_BUTTON = 0;

const prefersReducedMotion = () => Boolean(window.matchMedia?.(REDUCED_MOTION_MEDIA_QUERY)?.matches);

const capturePointer = (element, pointerId) => {
	try {
		element.setPointerCapture?.(pointerId);

		return true;
	} catch {
		return false;
	}
};

const releasePointer = (element, pointerId) => {
	try {
		element.releasePointerCapture?.(pointerId);

		return true;
	} catch {
		return false;
	}
};

const useBottomSheetDrag = (onClose) => {
	const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY);
	const dragRef = useRef(null);
	const isClosingRef = useRef(false);

	const clearTransition = (element) => {
		element.style.transition = '';
	};

	const handlePointerDown = (event) => {
		const isPrimaryPress = event.pointerType !== 'mouse' || event.button === PRIMARY_MOUSE_BUTTON;

		if (isClosingRef.current || !isPrimaryPress || !event.target.closest(BOTTOM_SHEET_DRAG_ZONE_SELECTOR)) {
			return;
		}

		const sheet = event.currentTarget;

		clearTransition(sheet);

		dragRef.current = {
			sheet,
			pointerId: event.pointerId,
			startY: event.clientY,
			lastY: event.clientY,
			lastTime: event.timeStamp,
			offset: 0,
			velocity: 0,
		};

		capturePointer(sheet, event.pointerId);
	};

	const handlePointerMove = (event) => {
		const drag = dragRef.current;

		if (!drag || drag.pointerId !== event.pointerId) {
			return;
		}

		const elapsed = event.timeStamp - drag.lastTime;

		if (elapsed > 0) {
			drag.velocity = (event.clientY - drag.lastY) / elapsed;
		}

		drag.lastY = event.clientY;
		drag.lastTime = event.timeStamp;
		drag.offset = Math.max(0, event.clientY - drag.startY);
		drag.sheet.style.transform = `translateY(${drag.offset}px)`;
	};

	const finishDrag = (event, isCancelled) => {
		const drag = dragRef.current;

		if (!drag || drag.pointerId !== event.pointerId) {
			return;
		}

		dragRef.current = null;
		releasePointer(drag.sheet, event.pointerId);

		const isPastCloseDistance = drag.offset > drag.sheet.offsetHeight * BOTTOM_SHEET_CLOSE_HEIGHT_RATIO;
		const isFlick = drag.offset > 0 && drag.velocity > BOTTOM_SHEET_FLICK_VELOCITY_PX_PER_MS;

		if (!isCancelled && (isPastCloseDistance || isFlick)) {
			const sheetHeight = drag.sheet.offsetHeight;

			if (prefersReducedMotion() || drag.offset >= sheetHeight) {
				onClose();

				return;
			}

			isClosingRef.current = true;
			drag.sheet.style.transition = `transform ${BOTTOM_SHEET_SLIDE_OUT_MS}ms ease-in`;
			drag.sheet.style.transform = `translateY(${sheetHeight}px)`;

			return;
		}

		if (prefersReducedMotion()) {
			drag.sheet.style.transform = '';

			return;
		}

		drag.sheet.style.transition = `transform ${BOTTOM_SHEET_SPRING_BACK_MS}ms ease-out`;
		drag.sheet.style.transform = '';
	};

	const handleTransitionEnd = (event) => {
		if (event.target !== event.currentTarget || event.propertyName !== 'transform') {
			return;
		}

		if (isClosingRef.current) {
			isClosingRef.current = false;
			onClose();

			return;
		}

		clearTransition(event.currentTarget);
	};

	if (!isMobile) {
		return {};
	}

	return {
		onPointerDown: handlePointerDown,
		onPointerMove: handlePointerMove,
		onPointerUp: (event) => finishDrag(event, false),
		onPointerCancel: (event) => finishDrag(event, true),
		onTransitionEnd: handleTransitionEnd,
	};
};

export default useBottomSheetDrag;

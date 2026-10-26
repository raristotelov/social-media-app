import '@testing-library/jest-dom';
import { render, renderHook, screen } from '@testing-library/react';

import {
	SHEET_HEIGHT,
	dragDown,
	fireTransitionEnd,
	firePointer,
	installBottomSheetEnvironment,
	restoreBottomSheetEnvironment,
} from '../testUtils/bottomSheet';

import useBottomSheetDrag from './useBottomSheetDrag';

const CLOSE_DISTANCE = SHEET_HEIGHT * 0.25;

const Sheet = ({ onClose }) => {
	const dragProps = useBottomSheetDrag(onClose);

	return (
		<div data-testid='sheet' {...dragProps}>
			<div className='bottom-sheet-handle' data-testid='handle' />

			<h2 className='bottom-sheet-header' data-testid='header'>
				Title
			</h2>

			<ul>
				<li data-testid='content'>Item</li>
			</ul>
		</div>
	);
};

const renderSheet = (environment) => {
	installBottomSheetEnvironment(environment);

	const onClose = jest.fn();

	render(<Sheet onClose={onClose} />);

	return {
		onClose,
		sheet: screen.getByTestId('sheet'),
		handle: screen.getByTestId('handle'),
		header: screen.getByTestId('header'),
		content: screen.getByTestId('content'),
	};
};

describe('useBottomSheetDrag', () => {
	afterEach(() => {
		restoreBottomSheetEnvironment();
	});

	describe('on a screen below 600px', () => {
		it('returns the pointer and transition handlers', () => {
			installBottomSheetEnvironment();

			const { result } = renderHook(() => useBottomSheetDrag(jest.fn()));

			expect(Object.keys(result.current).sort()).toEqual([
				'onPointerCancel',
				'onPointerDown',
				'onPointerMove',
				'onPointerUp',
				'onTransitionEnd',
			]);
		});

		describe('following the pointer', () => {
			it('moves the sheet down by the distance the pointer has moved from the handle', () => {
				const { sheet, handle } = renderSheet();

				firePointer(handle, 'pointerdown', { clientY: 100 });
				firePointer(handle, 'pointermove', { clientY: 160 });

				expect(sheet.style.transform).toBe('translateY(60px)');
			});

			it('follows the pointer on every move', () => {
				const { sheet, handle } = renderSheet();

				firePointer(handle, 'pointerdown', { clientY: 100 });
				firePointer(handle, 'pointermove', { clientY: 140 });
				firePointer(handle, 'pointermove', { clientY: 120 });

				expect(sheet.style.transform).toBe('translateY(20px)');
			});

			it('never moves the sheet above its resting position', () => {
				const { sheet, handle } = renderSheet();

				firePointer(handle, 'pointerdown', { clientY: 100 });
				firePointer(handle, 'pointermove', { clientY: 40 });

				expect(sheet.style.transform).toBe('translateY(0px)');
			});

			it('captures the pointer on the sheet so the drag continues outside it', () => {
				const { sheet, handle } = renderSheet();

				sheet.setPointerCapture = jest.fn();
				firePointer(handle, 'pointerdown', { clientY: 100, pointerId: 7 });

				expect(sheet.setPointerCapture).toHaveBeenCalledWith(7);
			});

			it('clears a spring-back transition still running when a new drag starts, so the sheet tracks the pointer directly', () => {
				const { sheet, handle } = renderSheet();

				dragDown(handle, 20);
				expect(sheet.style.transition).toBe('transform 200ms ease-out');

				firePointer(handle, 'pointerdown', { clientY: 100 });

				expect(sheet.style.transition).toBe('');
			});
		});

		describe('where a drag can start', () => {
			it('starts on the handle', () => {
				const { sheet, handle } = renderSheet();

				firePointer(handle, 'pointerdown', { clientY: 100 });
				firePointer(handle, 'pointermove', { clientY: 130 });

				expect(sheet.style.transform).toBe('translateY(30px)');
			});

			it('starts on the header', () => {
				const { sheet, header } = renderSheet();

				firePointer(header, 'pointerdown', { clientY: 100 });
				firePointer(header, 'pointermove', { clientY: 130 });

				expect(sheet.style.transform).toBe('translateY(30px)');
			});

			it('does nothing when the press starts in the list content', () => {
				const { sheet, content, onClose } = renderSheet();

				dragDown(content, SHEET_HEIGHT);

				expect(sheet.style.transform).toBe('');
				expect(sheet.style.transition).toBe('');
				expect(onClose).not.toHaveBeenCalled();
			});

			it('does nothing when the press starts on the sheet itself, outside the handle and header', () => {
				const { sheet, onClose } = renderSheet();

				dragDown(sheet, SHEET_HEIGHT);

				expect(sheet.style.transform).toBe('');
				expect(onClose).not.toHaveBeenCalled();
			});

			it('ignores pointer moves that were not preceded by a press on the handle or header', () => {
				const { sheet, content } = renderSheet();

				firePointer(content, 'pointermove', { clientY: 300 });

				expect(sheet.style.transform).toBe('');
			});

			it('starts with the primary mouse button', () => {
				const { sheet, handle } = renderSheet();

				firePointer(handle, 'pointerdown', { clientY: 100, pointerType: 'mouse', button: 0 });
				firePointer(handle, 'pointermove', { clientY: 130, pointerType: 'mouse' });

				expect(sheet.style.transform).toBe('translateY(30px)');
			});

			it('ignores a secondary mouse button', () => {
				const { sheet, handle } = renderSheet();

				firePointer(handle, 'pointerdown', { clientY: 100, pointerType: 'mouse', button: 2 });
				firePointer(handle, 'pointermove', { clientY: 130, pointerType: 'mouse' });

				expect(sheet.style.transform).toBe('');
			});

			it('ignores moves of a different pointer than the one that pressed', () => {
				const { sheet, handle } = renderSheet();

				firePointer(handle, 'pointerdown', { clientY: 100, pointerId: 1 });
				firePointer(handle, 'pointermove', { clientY: 200, pointerId: 2 });

				expect(sheet.style.transform).toBe('');
			});

			it('ignores the release of a different pointer than the one that pressed', () => {
				const { sheet, handle, onClose } = renderSheet();

				firePointer(handle, 'pointerdown', { clientY: 100, pointerId: 1 });
				firePointer(handle, 'pointermove', { clientY: 300, pointerId: 1, timeStamp: 1000 });
				firePointer(handle, 'pointerup', { clientY: 300, pointerId: 2, timeStamp: 1000 });

				expect(sheet.style.transition).toBe('');
				expect(sheet.style.transform).toBe('translateY(200px)');
				expect(onClose).not.toHaveBeenCalled();
			});
		});

		describe('releasing past 25% of the sheet height', () => {
			it('slides the sheet out the full height over 200ms ease-in', () => {
				const { sheet, handle } = renderSheet();

				dragDown(handle, CLOSE_DISTANCE + 1);

				expect(sheet.style.transition).toBe('transform 200ms ease-in');
				expect(sheet.style.transform).toBe(`translateY(${SHEET_HEIGHT}px)`);
			});

			it('does not close until the slide-out has finished', () => {
				const { handle, onClose } = renderSheet();

				dragDown(handle, CLOSE_DISTANCE + 1);

				expect(onClose).not.toHaveBeenCalled();
			});

			it('closes once the transform transition of the sheet itself ends', () => {
				const { sheet, handle, onClose } = renderSheet();

				dragDown(handle, CLOSE_DISTANCE + 1);
				fireTransitionEnd(sheet);

				expect(onClose).toHaveBeenCalledTimes(1);
			});

			it('closes only once even if the transition ends again', () => {
				const { sheet, handle, onClose } = renderSheet();

				dragDown(handle, CLOSE_DISTANCE + 1);
				fireTransitionEnd(sheet);
				fireTransitionEnd(sheet);

				expect(onClose).toHaveBeenCalledTimes(1);
			});

			it('does not close when a transition ends on a child of the sheet', () => {
				const { handle, content, onClose } = renderSheet();

				dragDown(handle, CLOSE_DISTANCE + 1);
				fireTransitionEnd(content);

				expect(onClose).not.toHaveBeenCalled();
			});

			it('does not close when a property other than transform finishes transitioning', () => {
				const { sheet, handle, onClose } = renderSheet();

				dragDown(handle, CLOSE_DISTANCE + 1);
				fireTransitionEnd(sheet, 'opacity');

				expect(onClose).not.toHaveBeenCalled();
			});

			it('closes immediately, with no slide-out, when dragged the full height of the sheet', () => {
				const { sheet, handle, onClose } = renderSheet();

				dragDown(handle, SHEET_HEIGHT);

				expect(onClose).toHaveBeenCalledTimes(1);
				expect(sheet.style.transition).toBe('');
			});

			it('ignores a new drag while the sheet is sliding out', () => {
				const { sheet, handle } = renderSheet();

				dragDown(handle, CLOSE_DISTANCE + 1);
				firePointer(handle, 'pointerdown', { clientY: 100 });
				firePointer(handle, 'pointermove', { clientY: 110 });

				expect(sheet.style.transform).toBe(`translateY(${SHEET_HEIGHT}px)`);
				expect(sheet.style.transition).toBe('transform 200ms ease-in');
			});

			it('does not close twice when a new drag is attempted during the slide-out', () => {
				const { sheet, handle, onClose } = renderSheet();

				dragDown(handle, CLOSE_DISTANCE + 1);
				dragDown(handle, CLOSE_DISTANCE + 1);
				fireTransitionEnd(sheet);

				expect(onClose).toHaveBeenCalledTimes(1);
			});

			it('accepts a new drag again after the sheet has closed and stayed mounted', () => {
				const { sheet, handle } = renderSheet();

				dragDown(handle, CLOSE_DISTANCE + 1);
				fireTransitionEnd(sheet);
				firePointer(handle, 'pointerdown', { clientY: 100 });
				firePointer(handle, 'pointermove', { clientY: 130 });

				expect(sheet.style.transform).toBe('translateY(30px)');
			});
		});

		describe('releasing at or below 25% of the sheet height', () => {
			it('springs back over 200ms ease-out', () => {
				const { sheet, handle } = renderSheet();

				dragDown(handle, CLOSE_DISTANCE - 1);

				expect(sheet.style.transition).toBe('transform 200ms ease-out');
				expect(sheet.style.transform).toBe('');
			});

			it('springs back at exactly 25%, as the threshold is passed only above it', () => {
				const { sheet, handle, onClose } = renderSheet();

				dragDown(handle, CLOSE_DISTANCE);
				fireTransitionEnd(sheet);

				expect(sheet.style.transform).toBe('');
				expect(onClose).not.toHaveBeenCalled();
			});

			it('never calls the close callback', () => {
				const { sheet, handle, onClose } = renderSheet();

				dragDown(handle, CLOSE_DISTANCE - 1);
				fireTransitionEnd(sheet);

				expect(onClose).not.toHaveBeenCalled();
			});

			it('clears the spring-back transition once it has finished', () => {
				const { sheet, handle } = renderSheet();

				dragDown(handle, CLOSE_DISTANCE - 1);
				fireTransitionEnd(sheet);

				expect(sheet.style.transition).toBe('');
			});

			it('does nothing visible for a press and release without movement', () => {
				const { sheet, handle, onClose } = renderSheet();

				firePointer(handle, 'pointerdown', { clientY: 100 });
				firePointer(handle, 'pointerup', { clientY: 100 });

				expect(sheet.style.transform).toBe('');
				expect(onClose).not.toHaveBeenCalled();
			});

			it('ignores a release that was not preceded by a press on the handle', () => {
				const { sheet, content, onClose } = renderSheet();

				firePointer(content, 'pointerup', { clientY: 400 });

				expect(sheet.style.transition).toBe('');
				expect(onClose).not.toHaveBeenCalled();
			});
		});

		describe('a flick', () => {
			it('slides out and closes a short drag faster than 0.5 px/ms', () => {
				const { sheet, handle, onClose } = renderSheet();

				firePointer(handle, 'pointerdown', { clientY: 100, timeStamp: 0 });
				firePointer(handle, 'pointermove', { clientY: 130, timeStamp: 40 });
				firePointer(handle, 'pointerup', { clientY: 130, timeStamp: 40 });

				expect(sheet.style.transition).toBe('transform 200ms ease-in');
				fireTransitionEnd(sheet);
				expect(onClose).toHaveBeenCalledTimes(1);
			});

			it('springs back when the speed is exactly 0.5 px/ms, as a flick is faster than that', () => {
				const { sheet, handle } = renderSheet();

				firePointer(handle, 'pointerdown', { clientY: 100, timeStamp: 0 });
				firePointer(handle, 'pointermove', { clientY: 130, timeStamp: 60 });
				firePointer(handle, 'pointerup', { clientY: 130, timeStamp: 60 });

				expect(sheet.style.transition).toBe('transform 200ms ease-out');
			});

			it('springs back a slow short drag', () => {
				const { sheet, handle } = renderSheet();

				firePointer(handle, 'pointerdown', { clientY: 100, timeStamp: 0 });
				firePointer(handle, 'pointermove', { clientY: 130, timeStamp: 500 });
				firePointer(handle, 'pointerup', { clientY: 130, timeStamp: 500 });

				expect(sheet.style.transition).toBe('transform 200ms ease-out');
			});

			it('measures the speed from the last move sample, so a fast start that slows down is not a flick', () => {
				const { sheet, handle } = renderSheet();

				firePointer(handle, 'pointerdown', { clientY: 100, timeStamp: 0 });
				firePointer(handle, 'pointermove', { clientY: 140, timeStamp: 10 });
				firePointer(handle, 'pointermove', { clientY: 142, timeStamp: 200 });
				firePointer(handle, 'pointerup', { clientY: 142, timeStamp: 200 });

				expect(sheet.style.transition).toBe('transform 200ms ease-out');
			});

			it('measures the speed from the last move sample, so a slow start that speeds up is a flick', () => {
				const { sheet, handle } = renderSheet();

				firePointer(handle, 'pointerdown', { clientY: 100, timeStamp: 0 });
				firePointer(handle, 'pointermove', { clientY: 110, timeStamp: 500 });
				firePointer(handle, 'pointermove', { clientY: 130, timeStamp: 520 });
				firePointer(handle, 'pointerup', { clientY: 130, timeStamp: 520 });

				expect(sheet.style.transition).toBe('transform 200ms ease-in');
			});

			it('springs back a fast upward move', () => {
				const { sheet, handle } = renderSheet();

				firePointer(handle, 'pointerdown', { clientY: 100, timeStamp: 0 });
				firePointer(handle, 'pointermove', { clientY: 40, timeStamp: 20 });
				firePointer(handle, 'pointerup', { clientY: 40, timeStamp: 20 });

				expect(sheet.style.transition).toBe('transform 200ms ease-out');
			});

			it('springs back a fast move down that returns to the start before release', () => {
				const { sheet, handle } = renderSheet();

				firePointer(handle, 'pointerdown', { clientY: 100, timeStamp: 0 });
				firePointer(handle, 'pointermove', { clientY: 130, timeStamp: 10 });
				firePointer(handle, 'pointermove', { clientY: 100, timeStamp: 500 });
				firePointer(handle, 'pointerup', { clientY: 100, timeStamp: 500 });

				expect(sheet.style.transition).toBe('transform 200ms ease-out');
			});
		});

		describe('a cancelled pointer', () => {
			it('springs back even when the sheet had been dragged past 25%', () => {
				const { sheet, handle, onClose } = renderSheet();

				firePointer(handle, 'pointerdown', { clientY: 100 });
				firePointer(handle, 'pointermove', { clientY: 100 + CLOSE_DISTANCE + 50, timeStamp: 1000 });
				firePointer(handle, 'pointercancel', { clientY: 100 + CLOSE_DISTANCE + 50, timeStamp: 1000 });

				expect(sheet.style.transition).toBe('transform 200ms ease-out');
				expect(sheet.style.transform).toBe('');
				expect(onClose).not.toHaveBeenCalled();
			});

			it('springs back even when the last move was a flick', () => {
				const { sheet, handle, onClose } = renderSheet();

				firePointer(handle, 'pointerdown', { clientY: 100, timeStamp: 0 });
				firePointer(handle, 'pointermove', { clientY: 130, timeStamp: 10 });
				firePointer(handle, 'pointercancel', { clientY: 130, timeStamp: 10 });
				fireTransitionEnd(sheet);

				expect(sheet.style.transition).toBe('');
				expect(onClose).not.toHaveBeenCalled();
			});
		});
	});

	describe('with reduced motion preferred', () => {
		it('closes at once, with no slide-out, when released past 25%', () => {
			const { sheet, handle, onClose } = renderSheet({ prefersReducedMotion: true });

			dragDown(handle, CLOSE_DISTANCE + 1);

			expect(onClose).toHaveBeenCalledTimes(1);
			expect(sheet.style.transition).toBe('');
		});

		it('closes at once on a flick', () => {
			const { handle, onClose } = renderSheet({ prefersReducedMotion: true });

			firePointer(handle, 'pointerdown', { clientY: 100, timeStamp: 0 });
			firePointer(handle, 'pointermove', { clientY: 130, timeStamp: 10 });
			firePointer(handle, 'pointerup', { clientY: 130, timeStamp: 10 });

			expect(onClose).toHaveBeenCalledTimes(1);
		});

		it('snaps back with no transition when released short of 25%', () => {
			const { sheet, handle, onClose } = renderSheet({ prefersReducedMotion: true });

			dragDown(handle, CLOSE_DISTANCE - 1);

			expect(sheet.style.transform).toBe('');
			expect(sheet.style.transition).toBe('');
			expect(onClose).not.toHaveBeenCalled();
		});

		it('snaps back with no transition when the pointer is cancelled', () => {
			const { sheet, handle, onClose } = renderSheet({ prefersReducedMotion: true });

			firePointer(handle, 'pointerdown', { clientY: 100 });
			firePointer(handle, 'pointermove', { clientY: 100 + CLOSE_DISTANCE + 50, timeStamp: 1000 });
			firePointer(handle, 'pointercancel', { clientY: 100 + CLOSE_DISTANCE + 50, timeStamp: 1000 });

			expect(sheet.style.transform).toBe('');
			expect(sheet.style.transition).toBe('');
			expect(onClose).not.toHaveBeenCalled();
		});
	});

	describe('on a screen of 600px or wider', () => {
		it('returns no handlers', () => {
			installBottomSheetEnvironment({ isMobile: false });

			const { result } = renderHook(() => useBottomSheetDrag(jest.fn()));

			expect(result.current).toEqual({});
		});

		it('does not move or close the sheet when a drag is attempted', () => {
			const { sheet, handle, onClose } = renderSheet({ isMobile: false });

			dragDown(handle, SHEET_HEIGHT);
			fireTransitionEnd(sheet);

			expect(sheet.style.transform).toBe('');
			expect(onClose).not.toHaveBeenCalled();
		});
	});

	describe('when the browser has no matchMedia', () => {
		it('returns no handlers', () => {
			window.matchMedia = undefined;

			const { result } = renderHook(() => useBottomSheetDrag(jest.fn()));

			expect(result.current).toEqual({});
		});
	});
});

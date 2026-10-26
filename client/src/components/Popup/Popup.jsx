import { useEffect, useRef } from 'react';

import useBottomSheetDrag from '../../hooks/useBottomSheetDrag';

import BottomSheetHandle from '../BottomSheetHandle/BottomSheetHandle';
import CloseIcon from '../icons/Close';

import './Popup.css';

const Popup = ({ title, onClosePopupClick, className, bodyClassName, isBottomSheet = false, children }) => {
	const containerRef = useRef(null);
	const bottomSheetDragProps = useBottomSheetDrag(onClosePopupClick);

	useEffect(() => {
		const closeOnEscape = (event) => {
			const hasPopupOnTop = Boolean(containerRef.current?.querySelector('.popup-container'));

			if (event.key === 'Escape' && !hasPopupOnTop) {
				onClosePopupClick();
			}
		};

		document.addEventListener('keydown', closeOnEscape);

		return () => {
			document.removeEventListener('keydown', closeOnEscape);
		};
	}, [onClosePopupClick]);

	const containerClassNames = ['popup-container', className].filter(Boolean).join(' ');
	const bodyClassNames = ['popup-body', isBottomSheet && 'bottom-sheet', bodyClassName].filter(Boolean).join(' ');
	const titleClassNames = ['popup-title', isBottomSheet && 'bottom-sheet-header'].filter(Boolean).join(' ');
	const sheetDragProps = isBottomSheet ? bottomSheetDragProps : {};

	return (
		<div ref={containerRef} className={containerClassNames} onMouseDown={onClosePopupClick}>
			<div className={bodyClassNames} onMouseDown={(e) => e.stopPropagation()} {...sheetDragProps}>
				{isBottomSheet ? <BottomSheetHandle /> : null}

				<button type='button' className='popup-close' onClick={onClosePopupClick} aria-label='Close'>
					<CloseIcon iconColorProp='currentColor' />
				</button>

				{title ? <h2 className={titleClassNames}>{title}</h2> : null}

				{children}
			</div>
		</div>
	);
};

export default Popup;

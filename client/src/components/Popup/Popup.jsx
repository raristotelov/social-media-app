import CloseIcon from '../icons/Close';

import './Popup.css';

const Popup = ({ title, onClosePopupClick, children }) => {
	return (
		<div className='popup-container' onMouseDown={onClosePopupClick}>
			<div className='popup-body' onMouseDown={(e) => e.stopPropagation()}>
				<button type='button' className='popup-close' onClick={onClosePopupClick} aria-label='Close'>
					<CloseIcon iconColorProp='currentColor' />
				</button>

				{title ? <h2 className='popup-title'>{title}</h2> : null}

				{children}
			</div>
		</div>
	);
};

export default Popup;

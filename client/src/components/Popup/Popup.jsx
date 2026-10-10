import CloseIcon from '../icons/Close';

import './Popup.css';

const Popup = ({ title, onClosePopupClick, className, bodyClassName, children }) => {
	const containerClassNames = ['popup-container', className].filter(Boolean).join(' ');
	const bodyClassNames = ['popup-body', bodyClassName].filter(Boolean).join(' ');

	return (
		<div className={containerClassNames} onMouseDown={onClosePopupClick}>
			<div className={bodyClassNames} onMouseDown={(e) => e.stopPropagation()}>
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

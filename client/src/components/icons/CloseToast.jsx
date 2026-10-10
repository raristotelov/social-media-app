const CloseToast = ({ iconColorProp }) => {
	const iconColor = iconColorProp || 'currentColor';

	return (
		<svg width='20' height='20' viewBox='0 0 20 20' fill='none' xmlns='http://www.w3.org/2000/svg' aria-hidden='true'>
			<path d='M5 5L15 15' stroke={iconColor} strokeWidth='2' strokeLinecap='round' />

			<path d='M15 5L5 15' stroke={iconColor} strokeWidth='2' strokeLinecap='round' />
		</svg>
	);
};

export default CloseToast;

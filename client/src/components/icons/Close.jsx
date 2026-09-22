const Close = ({ iconColorProp }) => {
	const iconColor = iconColorProp || '#4B4B4B';

	return (
		<svg width='24' height='24' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
			<path d='M18 6L6 18' stroke={iconColor} strokeWidth='2' strokeLinecap='round' />

			<path d='M6 6L18 18' stroke={iconColor} strokeWidth='2' strokeLinecap='round' />
		</svg>
	);
};

export default Close;

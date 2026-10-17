const ChevronLeft = ({ iconColorProp }) => {
	const iconColor = iconColorProp || '#4B4B4B';

	return (
		<svg width='24' height='24' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
			<path d='M15 18L9 12L15 6' stroke={iconColor} strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' />
		</svg>
	);
};

export default ChevronLeft;

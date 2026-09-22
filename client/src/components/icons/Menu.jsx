const Menu = ({ iconColorProp }) => {
	const iconColor = iconColorProp || '#4B4B4B';

	return (
		<svg width='24' height='24' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
			<path d='M4 7H20M4 12H20M4 17H20' stroke={iconColor} strokeWidth='2' strokeLinecap='round' />
		</svg>
	);
};

export default Menu;

const Check = ({ iconColorProp }) => {
	const iconColor = iconColorProp || 'currentColor';

	return (
		<svg width='20' height='20' viewBox='0 0 20 20' fill='none' xmlns='http://www.w3.org/2000/svg' aria-hidden='true'>
			<path
				d='M18 10C18 14.418 14.418 18 10 18C5.582 18 2 14.418 2 10C2 5.582 5.582 2 10 2C14.418 2 18 5.582 18 10Z'
				stroke={iconColor}
				strokeWidth='2'
			/>

			<path d='M6.5 10.25L8.75 12.5L13.5 7.75' stroke={iconColor} strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' />
		</svg>
	);
};

export default Check;

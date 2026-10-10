const Alert = ({ iconColorProp }) => {
	const iconColor = iconColorProp || 'currentColor';

	return (
		<svg width='20' height='20' viewBox='0 0 20 20' fill='none' xmlns='http://www.w3.org/2000/svg' aria-hidden='true'>
			<path
				d='M18 10C18 14.4183 14.4183 18 10 18C5.58172 18 2 14.4183 2 10C2 5.58172 5.58172 2 10 2C14.4183 2 18 5.58172 18 10Z'
				stroke={iconColor}
				strokeWidth='2'
			/>

			<path d='M10 6V10.5' stroke={iconColor} strokeWidth='2' strokeLinecap='round' />

			<path d='M10 14H10.01' stroke={iconColor} strokeWidth='2' strokeLinecap='round' />
		</svg>
	);
};

export default Alert;

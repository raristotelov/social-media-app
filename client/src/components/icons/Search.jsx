const Search = ({ iconColorProp }) => {
	const iconColor = iconColorProp || '#4B4B4B';

	return (
		<svg width='22' height='22' viewBox='0 0 22 22' fill='none' xmlns='http://www.w3.org/2000/svg'>
			<path
				d='M10.0833 16.5C13.6272 16.5 16.5 13.6272 16.5 10.0833C16.5 6.53951 13.6272 3.66667 10.0833 3.66667C6.53951 3.66667 3.66667 6.53951 3.66667 10.0833C3.66667 13.6272 6.53951 16.5 10.0833 16.5Z'
				stroke={iconColor}
				strokeWidth='1.83333'
			/>

			<path d='M15.125 15.125L19.25 19.25' stroke={iconColor} strokeWidth='1.83333' strokeLinecap='round' />
		</svg>
	);
};

export default Search;

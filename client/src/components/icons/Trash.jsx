const Trash = ({ iconColorProp = 'currentColor' }) => (
	<svg width='20' height='20' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg' aria-hidden='true' focusable='false'>
		<path d='M4 7H20' stroke={iconColorProp} strokeWidth='1.8' strokeLinecap='round' />

		<path d='M9 7V4.5C9 4.22 9.22 4 9.5 4H14.5C14.78 4 15 4.22 15 4.5V7' stroke={iconColorProp} strokeWidth='1.8' strokeLinejoin='round' />

		<path
			d='M6 7L7 19.5C7.04 19.78 7.28 20 7.56 20H16.44C16.72 20 16.96 19.78 17 19.5L18 7'
			stroke={iconColorProp}
			strokeWidth='1.8'
			strokeLinejoin='round'
		/>

		<path d='M10 11V16M14 11V16' stroke={iconColorProp} strokeWidth='1.8' strokeLinecap='round' />
	</svg>
);

export default Trash;

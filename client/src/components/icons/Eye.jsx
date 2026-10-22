const Eye = ({ iconColorProp = 'currentColor' }) => (
	<svg width='18' height='18' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg' aria-hidden='true' focusable='false'>
		<path
			d='M2 12C2 12 5.5 5 12 5C18.5 5 22 12 22 12C22 12 18.5 19 12 19C5.5 19 2 12 2 12Z'
			stroke={iconColorProp}
			strokeWidth='1.8'
			strokeLinecap='round'
			strokeLinejoin='round'
		/>

		<circle cx='12' cy='12' r='3' stroke={iconColorProp} strokeWidth='1.8' />
	</svg>
);

export default Eye;

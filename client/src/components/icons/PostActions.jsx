const PostActions = ({ iconColorProp }) => {
	const iconColor = iconColorProp || '#4B4B4B';

	return (
		<svg width='32' height='32' viewBox='0 0 32 32' fill='none' xmlns='http://www.w3.org/2000/svg'>
			<circle cx='10' cy='16' r='2' fill={iconColor} />

			<circle cx='16' cy='16' r='2' fill={iconColor} />

			<circle cx='22' cy='16' r='2' fill={iconColor} />
		</svg>
	);
};

export default PostActions;

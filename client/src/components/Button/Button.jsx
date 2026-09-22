import './Button.css';

const Button = ({ label, variant = 'primary', ...props }) => {
	const classes = ['button-classname'];

	if (variant === 'secondary') {
		classes.push('button-secondary');
	}

	return (
		<button className={classes.join(' ')} {...props}>
			{label}
		</button>
	);
};

export default Button;

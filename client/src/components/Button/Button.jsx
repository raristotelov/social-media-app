import './Button.css';

const Button = ({ label, variant = 'primary', className, ...props }) => {
	const classes = ['button-classname'];

	if (variant === 'secondary') {
		classes.push('button-secondary');
	}

	if (className) {
		classes.push(className);
	}

	return (
		<button className={classes.join(' ')} {...props}>
			{label}
		</button>
	);
};

export default Button;

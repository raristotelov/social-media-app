import './Logo.css';

const Logo = ({ className }) => {
	const classes = ['logo'];

	if (className) {
		classes.push(className);
	}

	return <span className={classes.join(' ')}>ShareSnap</span>;
};

export default Logo;

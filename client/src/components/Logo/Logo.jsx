import { APP_NAME } from '../../constants/app';

import './Logo.css';

const Logo = ({ className }) => {
	const classes = ['logo'];

	if (className) {
		classes.push(className);
	}

	return <span className={classes.join(' ')}>{APP_NAME}</span>;
};

export default Logo;

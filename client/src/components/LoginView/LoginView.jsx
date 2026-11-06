import { useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { login } from '../../services/userService';

import LoginForm from '../LoginForm/LoginForm';

import './LoginView.css';

const LoginView = () => {
	const { setLoggedInUser } = useContext(LoggedInUserContext);
	const navigate = useNavigate();
	const location = useLocation();

	const redirectPath = location.state?.from || '/user-feed';

	const loginHandler = async (loginCredentials) => {
		const loggedInUser = await login(loginCredentials);

		setLoggedInUser(loggedInUser);
		navigate(redirectPath, { replace: true });
	};

	return (
		<section className='login-wrapper'>
			<LoginForm loginHandler={loginHandler} />
		</section>
	);
};

export default LoginView;

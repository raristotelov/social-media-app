import { useContext } from 'react';
import { useNavigate } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { signUp } from '../../services/userService';

import SignUpForm from '../SignUpForm/SignUpForm';

import './SignUpView.css';

const SignUpView = () => {
	const { setLoggedInUser } = useContext(LoggedInUserContext);
	const navigate = useNavigate();

	const signUpHandler = async ({ repeatPassword, ...newUserData }) => {
		const newUser = await signUp(newUserData);

		setLoggedInUser(newUser);
		navigate('/user-feed');
	};

	return (
		<section className='sign-up-wrapper'>
			<SignUpForm signUpHandler={signUpHandler} />
		</section>
	);
};

export default SignUpView;

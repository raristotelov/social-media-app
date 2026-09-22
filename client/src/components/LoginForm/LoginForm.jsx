import { Link } from 'react-router-dom';

import { useForm } from '../../hooks/useForm';
import { validateLogin } from '../../utils/validators';

import Button from '../Button/Button';

import './LoginForm.css';

const LoginForm = ({ loginHandler }) => {
	const { values, changeHandler, onSubmit, isSubmitting, errors, formError } = useForm(
		{
			email: '',
			password: '',
		},
		loginHandler,
		{ submitAllValues: true, validate: validateLogin },
	);

	return (
		<section className='login-section'>
			<form id='login-form' onSubmit={onSubmit} className='login-form'>
				<h1>Login</h1>

				<div className='auth-input-wrapper'>
					<input
						type='email'
						id='email'
						name='email'
						placeholder='Email'
						value={values.email}
						onChange={changeHandler}
						className={errors.email?.length ? 'has-error' : undefined}
						aria-invalid={Boolean(errors.email?.length)}
					/>

					{errors.email?.map((message) => (
						<span key={message} className='field-error'>
							{message}
						</span>
					))}
				</div>

				<div className='auth-input-wrapper'>
					<input
						type='password'
						id='password'
						name='password'
						placeholder='Password'
						value={values.password}
						onChange={changeHandler}
						className={errors.password?.length ? 'has-error' : undefined}
						aria-invalid={Boolean(errors.password?.length)}
					/>

					{errors.password?.map((message) => (
						<span key={message} className='field-error'>
							{message}
						</span>
					))}
				</div>

				{formError && (
					<p className='form-error' role='alert'>
						{formError}
					</p>
				)}

				<Button label={isSubmitting ? 'Submitting...' : 'Submit'} disabled={isSubmitting} />
			</form>

			<span className='sign-up-link'>
				Don't have an account? <Link to='/sign-up'>Sign up</Link>
			</span>
		</section>
	);
};

export default LoginForm;

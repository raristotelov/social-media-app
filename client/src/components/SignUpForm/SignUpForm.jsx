import { Link } from 'react-router-dom';

import { useForm } from '../../hooks/useForm';
import { validateSignUp } from '../../utils/validators';

import Button from '../Button/Button';

import './SignUpForm.css';

const SignUpForm = ({ signUpHandler }) => {
	const { values, changeHandler, onSubmit, isSubmitting, errors, formError } = useForm(
		{
			email: '',
			username: '',
			password: '',
			repeatPassword: '',
		},
		signUpHandler,
		{ submitAllValues: true, validate: validateSignUp },
	);

	return (
		<section className='sign-up-section'>
			<form id='sign-up-form' onSubmit={onSubmit} className='sign-up-form'>
				<h1>Sign up</h1>

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
						type='text'
						id='username'
						name='username'
						placeholder='Username'
						value={values.username}
						onChange={changeHandler}
						className={errors.username?.length ? 'has-error' : undefined}
						aria-invalid={Boolean(errors.username?.length)}
					/>

					{errors.username?.map((message) => (
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

				<div className='auth-input-wrapper'>
					<input
						type='password'
						id='repeatPassword'
						name='repeatPassword'
						placeholder='Repeat password'
						value={values.repeatPassword}
						onChange={changeHandler}
						className={errors.repeatPassword?.length ? 'has-error' : undefined}
						aria-invalid={Boolean(errors.repeatPassword?.length)}
					/>

					{errors.repeatPassword?.map((message) => (
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

			<span className='login-link'>
				Already have an account? <Link to='/log-in'>Login</Link>
			</span>
		</section>
	);
};

export default SignUpForm;

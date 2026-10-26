import { useForm } from '../../hooks/useForm';
import { validateChangePassword } from '../../utils/validators';
import { ACTION_FALLBACK_MESSAGES } from '../../constants/errorMessages';

import Button from '../Button/Button';

import './ChangePasswordForm.css';

const INITIAL_VALUES = Object.freeze({
	currentPassword: '',
	newPassword: '',
	confirmPassword: '',
});

const ChangePasswordForm = ({ onSubmit: changePasswordHandler, onCancelClick }) => {
	const { values, changeHandler, onSubmit, isSubmitting, errors, formError } = useForm(INITIAL_VALUES, changePasswordHandler, {
		submitAllValues: true,
		validate: validateChangePassword,
		fallbackMessage: ACTION_FALLBACK_MESSAGES.CHANGE_PASSWORD,
	});

	return (
		<form id='change-password-form' onSubmit={onSubmit} className='change-password-form'>
			<div className='profile-form-input-wrapper'>
				<input
					type='password'
					id='currentPassword'
					name='currentPassword'
					placeholder='Current password'
					autoComplete='current-password'
					value={values.currentPassword}
					onChange={changeHandler}
					className={errors.currentPassword?.length ? 'has-error' : undefined}
					aria-invalid={Boolean(errors.currentPassword?.length)}
				/>

				{errors.currentPassword?.length ? <span className='field-error'>{errors.currentPassword[0]}</span> : null}
			</div>

			<div className='profile-form-input-wrapper'>
				<input
					type='password'
					id='newPassword'
					name='newPassword'
					placeholder='New password'
					autoComplete='new-password'
					value={values.newPassword}
					onChange={changeHandler}
					className={errors.newPassword?.length ? 'has-error' : undefined}
					aria-invalid={Boolean(errors.newPassword?.length)}
				/>

				{errors.newPassword?.length ? <span className='field-error'>{errors.newPassword[0]}</span> : null}
			</div>

			<div className='profile-form-input-wrapper'>
				<input
					type='password'
					id='confirmPassword'
					name='confirmPassword'
					placeholder='Confirm new password'
					autoComplete='new-password'
					value={values.confirmPassword}
					onChange={changeHandler}
				/>
			</div>

			{formError ? (
				<p className='form-error change-password-error' role='alert'>
					{formError}
				</p>
			) : null}

			<div className='profile-form-button-row'>
				<Button type='submit' label='Save' disabled={isSubmitting} />

				<Button type='button' label='Cancel' variant='secondary' onClick={onCancelClick} />
			</div>
		</form>
	);
};

export default ChangePasswordForm;

import { useContext, useRef, useState } from 'react';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import useLoginRedirect from '../../hooks/useLoginRedirect';
import useSessionGuard from '../../hooks/useSessionGuard';
import { ACTION_FALLBACK_MESSAGES } from '../../constants/errorMessages';
import { getErrorMessage, isUnauthenticatedError } from '../../utils/errors';

import './AddCommentForm.css';

const AddCommentForm = ({
	onSubmit,
	placeholder = 'Add a comment...',
	initialText = '',
	fallbackMessage = ACTION_FALLBACK_MESSAGES.ADD_COMMENT,
	isDisabled = false,
	className,
}) => {
	const [text, setText] = useState(initialText);
	const [formError, setFormError] = useState('');
	const [isSubmitting, setIsSubmitting] = useState(false);
	const isSubmittingRef = useRef(false);

	const { loggedInUser } = useContext(LoggedInUserContext);
	const { runWithSessionGuard } = useSessionGuard();
	const redirectToLogin = useLoginRedirect();

	const isGuest = !loggedInUser;
	const trimmedText = text.trim();
	const hasText = Boolean(trimmedText) && trimmedText !== initialText.trim();

	const changeHandler = (event) => {
		setText(event.target.value);
		setFormError('');
	};

	const submitHandler = async (event) => {
		event.preventDefault();

		if (isGuest) {
			redirectToLogin();

			return;
		}

		if (isSubmittingRef.current || !hasText) {
			return;
		}

		isSubmittingRef.current = true;

		setFormError('');
		setIsSubmitting(true);

		try {
			await runWithSessionGuard(() => onSubmit(text));

			setText('');
		} catch (error) {
			if (!isUnauthenticatedError(error)) {
				setFormError(getErrorMessage(error, fallbackMessage));
			}
		} finally {
			isSubmittingRef.current = false;
			setIsSubmitting(false);
		}
	};

	const classNames = ['add-comment-form', isDisabled ? 'add-comment-form-disabled' : null, className].filter(Boolean).join(' ');

	return (
		<div className={classNames}>
			<form className='add-comment-form-row' onSubmit={submitHandler}>
				<input
					type='text'
					className='add-comment-form-input'
					placeholder={placeholder}
					aria-label={placeholder}
					value={text}
					readOnly={isGuest}
					disabled={isDisabled}
					onChange={changeHandler}
					onClick={isGuest ? redirectToLogin : undefined}
				/>

				<button type='submit' className='add-comment-form-submit' disabled={isDisabled || isSubmitting || !hasText}>
					Post
				</button>
			</form>

			{formError ? (
				<p className='add-comment-form-error' role='alert'>
					{formError}
				</p>
			) : null}
		</div>
	);
};

export default AddCommentForm;

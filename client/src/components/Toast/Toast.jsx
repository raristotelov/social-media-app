import { useEffect, useRef, useState } from 'react';

import { TOAST_DURATION_MS, TOAST_TYPES } from '../../constants/toast';

import AlertIcon from '../icons/Alert';
import CheckIcon from '../icons/Check';
import CloseToastIcon from '../icons/CloseToast';

import './Toast.css';

const Toast = ({ message, type = TOAST_TYPES.ERROR, onDismiss }) => {
	const [isPaused, setIsPaused] = useState(false);
	const remainingTimeRef = useRef(TOAST_DURATION_MS);
	const isSuccess = type === TOAST_TYPES.SUCCESS;

	useEffect(() => {
		if (isPaused) {
			return;
		}

		const startedAt = Date.now();
		const timeoutId = setTimeout(onDismiss, remainingTimeRef.current);

		return () => {
			clearTimeout(timeoutId);
			remainingTimeRef.current -= Date.now() - startedAt;
		};
	}, [isPaused, onDismiss]);

	const pauseTimer = () => setIsPaused(true);
	const resumeTimer = () => setIsPaused(false);

	return (
		<div className='toast' onMouseEnter={pauseTimer} onMouseLeave={resumeTimer} onFocus={pauseTimer} onBlur={resumeTimer}>
			<span className={isSuccess ? 'toast-icon toast-icon-success' : 'toast-icon'}>{isSuccess ? <CheckIcon /> : <AlertIcon />}</span>

			<p className='toast-message'>{message}</p>

			<button type='button' className='toast-close' onClick={onDismiss} aria-label='Close'>
				<CloseToastIcon />
			</button>
		</div>
	);
};

export default Toast;

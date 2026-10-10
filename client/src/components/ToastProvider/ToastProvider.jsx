import { useCallback, useMemo, useRef, useState } from 'react';

import ToastContext from '../../contexts/ToastContext';

import Toast from '../Toast/Toast';

const ToastProvider = ({ children }) => {
	const [toast, setToast] = useState(null);
	const lastToastIdRef = useRef(0);

	const showToast = useCallback((message) => {
		lastToastIdRef.current += 1;

		setToast({ id: lastToastIdRef.current, message });
	}, []);

	const dismissToast = useCallback(() => {
		setToast(null);
	}, []);

	const toastContextValues = useMemo(() => ({ showToast, dismissToast }), [showToast, dismissToast]);

	return (
		<ToastContext.Provider value={toastContextValues}>
			{children}

			<div className='toast-region' role='alert' aria-live='assertive' aria-atomic='true'>
				{toast ? <Toast key={toast.id} message={toast.message} onDismiss={dismissToast} /> : null}
			</div>
		</ToastContext.Provider>
	);
};

export default ToastProvider;

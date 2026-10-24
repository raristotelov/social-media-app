import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const FIRST_HISTORY_ENTRY_INDEX = 0;

const isFirstHistoryEntry = () => window.history.state?.idx === FIRST_HISTORY_ENTRY_INDEX;

const useGoBackOrTo = (fallbackPath) => {
	const navigate = useNavigate();

	return useCallback(() => {
		if (isFirstHistoryEntry()) {
			navigate(fallbackPath, { replace: true });

			return;
		}

		navigate(-1);
	}, [navigate, fallbackPath]);
};

export default useGoBackOrTo;

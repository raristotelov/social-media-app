import { useCallback, useContext } from 'react';

import LoggedInUserContext from '../contexts/LoggedInUserContext';
import { isUnauthenticatedError } from '../utils/errors';

const useSessionGuard = () => {
	const { endSession } = useContext(LoggedInUserContext);

	const endSessionIfUnauthenticated = useCallback(
		(error) => {
			if (isUnauthenticatedError(error)) {
				endSession();
			}
		},
		[endSession],
	);

	const runWithSessionGuard = useCallback(
		async (action) => {
			try {
				return await action();
			} catch (error) {
				endSessionIfUnauthenticated(error);

				throw error;
			}
		},
		[endSessionIfUnauthenticated],
	);

	return { endSessionIfUnauthenticated, runWithSessionGuard };
};

export default useSessionGuard;

import { useContext, useEffect } from 'react';

import NotFoundContext from '../contexts/NotFoundContext';

const useMarkPageNotFound = () => {
	const { setIsNotFound } = useContext(NotFoundContext);

	useEffect(() => {
		setIsNotFound(true);

		return () => setIsNotFound(false);
	}, [setIsNotFound]);
};

export default useMarkPageNotFound;

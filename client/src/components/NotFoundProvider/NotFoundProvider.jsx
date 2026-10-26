import { useMemo, useState } from 'react';

import NotFoundContext from '../../contexts/NotFoundContext';

const NotFoundProvider = ({ children }) => {
	const [isNotFound, setIsNotFound] = useState(false);

	const notFoundContextValues = useMemo(() => ({ isNotFound, setIsNotFound }), [isNotFound]);

	return <NotFoundContext.Provider value={notFoundContextValues}>{children}</NotFoundContext.Provider>;
};

export default NotFoundProvider;

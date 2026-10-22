import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const useLoginRedirect = () => {
	const navigate = useNavigate();
	const { pathname, search, hash } = useLocation();

	return useCallback(() => {
		navigate('/log-in', { state: { from: `${pathname}${search}${hash}` } });
	}, [navigate, pathname, search, hash]);
};

export default useLoginRedirect;

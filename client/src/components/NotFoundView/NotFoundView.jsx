import { useNavigate } from 'react-router-dom';

import useMarkPageNotFound from '../../hooks/useMarkPageNotFound';
import { LOAD_ERROR_MESSAGES } from '../../constants/errorMessages';

import PageLoadError from '../PageLoadError/PageLoadError';

const NotFoundView = () => {
	const navigate = useNavigate();

	useMarkPageNotFound();

	return <PageLoadError messages={LOAD_ERROR_MESSAGES.NOT_FOUND} onRetryClick={() => navigate('/')} />;
};

export default NotFoundView;

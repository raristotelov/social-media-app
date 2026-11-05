import { NOTIFICATIONS_UNREAD_LABEL } from '../../constants/notifications';

import './UnreadDot.css';

const UnreadDot = ({ className }) => {
	const classNames = ['unread-dot', className].filter(Boolean).join(' ');

	return <span className={classNames} role='img' aria-label={NOTIFICATIONS_UNREAD_LABEL} />;
};

export default UnreadDot;

import { Link } from 'react-router-dom';

import { formatNotificationAge, getNotificationMessage, getNotificationProfilePath, getNotificationTarget } from '../../utils/notifications';

import ProfilePicture from '../ProfilePicture/ProfilePicture';

import './NotificationRow.css';

const NotificationRow = ({ notification, isUnread, onClick }) => {
	const { actor, post, createdAt } = notification;

	const profilePath = getNotificationProfilePath(notification);
	const { to: targetPath, state: targetState } = getNotificationTarget(notification);
	const message = getNotificationMessage(notification);

	const classNames = isUnread ? 'notification-row notification-row-unread' : 'notification-row';

	return (
		<li className={classNames}>
			<Link
				to={targetPath}
				state={targetState}
				className='notification-row-target'
				aria-label={`${actor.username} ${message}`}
				onClick={onClick}
			/>

			<Link to={profilePath} className='notification-row-avatar-link' tabIndex={-1} aria-hidden='true' onClick={onClick}>
				<ProfilePicture imageUrl={actor.profilePicture?.imageUrl} className='notification-row-avatar' />
			</Link>

			<p className='notification-row-text'>
				<Link to={profilePath} className='notification-row-username' onClick={onClick}>
					{actor.username}
				</Link>

				{` ${message} `}

				<span className='notification-row-time'>{formatNotificationAge(createdAt)}</span>
			</p>

			{post ? <img className='notification-row-thumbnail' src={post.imageUrl} alt='' /> : null}
		</li>
	);
};

export default NotificationRow;

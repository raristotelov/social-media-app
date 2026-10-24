import { Link } from 'react-router-dom';

import { SUGGESTED_USER_ACTION_STYLES } from '../../constants/suggestions';
import { getSuggestionReason } from '../../utils/suggestions';

import Button from '../Button/Button';
import ProfilePicture from '../ProfilePicture/ProfilePicture';

import './SuggestedUser.css';

const SuggestedUser = ({ suggestion, actionStyle, isFollowed = false, onFollowClick, onUnfollowClick }) => {
	const { _id: userId, username, profilePicture } = suggestion;

	const actionLabel = isFollowed ? 'Unfollow' : 'Follow';
	const handleActionClick = () => (isFollowed ? onUnfollowClick(userId) : onFollowClick(userId));

	return (
		<div className='suggested-user'>
			<Link to={`/user/${userId}`} className='suggested-user-link'>
				<ProfilePicture imageUrl={profilePicture?.imageUrl} className='suggested-user-avatar' />

				<span className='suggested-user-text'>
					<span className='suggested-user-username'>{username}</span>

					<span className='suggested-user-reason'>{getSuggestionReason(suggestion)}</span>
				</span>
			</Link>

			{actionStyle === SUGGESTED_USER_ACTION_STYLES.LINK ? (
				<button type='button' className='suggested-user-follow-link' aria-label={`${actionLabel} ${username}`} onClick={handleActionClick}>
					{actionLabel}
				</button>
			) : (
				<Button
					type='button'
					className='suggested-user-follow-button'
					variant={isFollowed ? 'secondary' : 'primary'}
					label={actionLabel}
					aria-label={`${actionLabel} ${username}`}
					onClick={handleActionClick}
				/>
			)}
		</div>
	);
};

export default SuggestedUser;

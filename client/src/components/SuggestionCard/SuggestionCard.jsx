import { Link } from 'react-router';

import { getStoryRingState } from '../../utils/stories';
import { getSuggestionReason } from '../../utils/suggestions';

import Button from '../Button/Button';
import ProfilePicture from '../ProfilePicture/ProfilePicture';

import './SuggestionCard.css';

const SuggestionCard = ({ suggestion, isFollowed = false, onFollowClick, onUnfollowClick }) => {
	const { _id: userId, username, profilePicture, story } = suggestion;

	const actionLabel = isFollowed ? 'Unfollow' : 'Follow';
	const handleActionClick = () => (isFollowed ? onUnfollowClick(userId) : onFollowClick(userId));

	return (
		<article className='suggestion-card'>
			<Link to={`/user/${userId}`} className='suggestion-card-link'>
				<ProfilePicture imageUrl={profilePicture?.imageUrl} ringState={getStoryRingState(story)} className='suggestion-card-avatar' />

				<span className='suggestion-card-username'>{username}</span>
			</Link>

			<p className='suggestion-card-reason'>{getSuggestionReason(suggestion)}</p>

			<Button
				type='button'
				className='suggestion-card-follow-button'
				variant={isFollowed ? 'secondary' : 'primary'}
				label={actionLabel}
				aria-label={`${actionLabel} ${username}`}
				onClick={handleActionClick}
			/>
		</article>
	);
};

export default SuggestionCard;

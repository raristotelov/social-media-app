import { Link } from 'react-router-dom';

import { getSuggestionReason } from '../../utils/suggestions';

import Button from '../Button/Button';
import ProfilePicture from '../ProfilePicture/ProfilePicture';

import './SuggestionCard.css';

const SuggestionCard = ({ suggestion, onFollowClick }) => {
	const { _id: userId, username, profilePicture } = suggestion;

	return (
		<article className='suggestion-card'>
			<Link to={`/user/${userId}`} className='suggestion-card-link'>
				<ProfilePicture imageUrl={profilePicture?.imageUrl} className='suggestion-card-avatar' />

				<span className='suggestion-card-username'>{username}</span>
			</Link>

			<p className='suggestion-card-reason'>{getSuggestionReason(suggestion)}</p>

			<Button
				type='button'
				className='suggestion-card-follow-button'
				variant='secondary'
				label='Follow'
				aria-label={`Follow ${username}`}
				onClick={() => onFollowClick(userId)}
			/>
		</article>
	);
};

export default SuggestionCard;

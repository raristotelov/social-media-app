import ProfilePicture from '../ProfilePicture/ProfilePicture';
import PlusSmallIcon from '../icons/PlusSmall';

import './StoryCircle.css';

export const STORY_RING_STATES = Object.freeze({
	UNWATCHED: 'unwatched',
	WATCHED: 'watched',
});

const StoryCircle = ({ imageUrl, label, ringState = STORY_RING_STATES.WATCHED, hasAddBadge = false, onClick, onAddClick, ariaLabel }) => {
	const ringClassName = ringState === STORY_RING_STATES.UNWATCHED ? 'story-circle-ring story-circle-ring-unwatched' : 'story-circle-ring';

	return (
		<div className='story-circle'>
			<button type='button' className='story-circle-button' onClick={onClick} aria-label={ariaLabel}>
				<span className={ringClassName}>
					<ProfilePicture imageUrl={imageUrl} className='story-circle-avatar' />
				</span>

				<span className='story-circle-label'>{label}</span>
			</button>

			{hasAddBadge && onAddClick ? (
				<button type='button' className='story-circle-badge' onClick={onAddClick} aria-label='Add to your story'>
					<PlusSmallIcon />
				</button>
			) : null}

			{hasAddBadge && !onAddClick ? (
				<span className='story-circle-badge story-circle-badge-decorative' aria-hidden='true'>
					<PlusSmallIcon />
				</span>
			) : null}
		</div>
	);
};

export default StoryCircle;

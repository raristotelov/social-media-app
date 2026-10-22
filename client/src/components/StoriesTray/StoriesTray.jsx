import { useCallback, useContext, useState } from 'react';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { CREATE_MODES, OWN_STORY_LABEL } from '../../constants/stories';

import StoryCircle, { STORY_RING_STATES } from '../StoryCircle/StoryCircle';
import CreatePopup from '../CreatePopup/CreatePopup';
import StoryViewer from '../StoryViewer/StoryViewer';

import './StoriesTray.css';

const StoriesTray = ({ entries, isLoaded, reload }) => {
	const [isCreatePopupOpen, setIsCreatePopupOpen] = useState(false);
	const [openViewer, setOpenViewer] = useState(null);

	const { loggedInUser } = useContext(LoggedInUserContext);

	const closeViewer = useCallback(() => {
		setOpenViewer(null);
		reload();
	}, [reload]);

	if (!isLoaded) {
		return <section className='stories-tray' aria-label='Stories' />;
	}

	const ownEntry = entries.find((entry) => entry.isOwn);
	const otherEntries = entries.filter((entry) => !entry.isOwn);
	const viewerQueue = ownEntry ? [ownEntry, ...otherEntries] : otherEntries;

	const showViewer = (startIndex) => {
		setOpenViewer({ queue: viewerQueue, startIndex });
	};

	const openCreatePopup = () => {
		setIsCreatePopupOpen(true);
	};

	const closeCreatePopup = () => {
		setIsCreatePopupOpen(false);
	};

	return (
		<section className='stories-tray' aria-label='Stories'>
			<StoryCircle
				imageUrl={loggedInUser?.profilePicture?.imageUrl}
				label={OWN_STORY_LABEL}
				hasAddBadge
				ariaLabel={ownEntry ? 'View your story' : 'Add to your story'}
				onClick={ownEntry ? () => showViewer(0) : openCreatePopup}
				onAddClick={ownEntry ? openCreatePopup : undefined}
			/>

			{otherEntries.map((entry, index) => (
				<StoryCircle
					key={entry.user._id}
					imageUrl={entry.user.profilePicture?.imageUrl}
					label={entry.user.username}
					ringState={entry.isWatched ? STORY_RING_STATES.WATCHED : STORY_RING_STATES.UNWATCHED}
					ariaLabel={`View ${entry.user.username}'s story`}
					onClick={() => showViewer(ownEntry ? index + 1 : index)}
				/>
			))}

			{isCreatePopupOpen ? <CreatePopup initialMode={CREATE_MODES.STORY} onClose={closeCreatePopup} onStoryAdded={reload} /> : null}

			{openViewer ? <StoryViewer queue={openViewer.queue} startIndex={openViewer.startIndex} onClose={closeViewer} /> : null}
		</section>
	);
};

export default StoriesTray;

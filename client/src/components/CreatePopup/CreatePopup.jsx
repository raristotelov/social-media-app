import { useContext, useState } from 'react';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import useSessionGuard from '../../hooks/useSessionGuard';
import { addUserPost } from '../../services/userPostService';
import { addStory } from '../../services/storyService';
import { CREATE_MODES, CREATE_MODE_LABELS } from '../../constants/stories';
import { resizeImage } from '../../utils/images';

import Popup from '../Popup/Popup';
import AddImagePostForm from '../AddImagePostForm/AddImagePostForm';

import './CreatePopup.css';

const CREATE_MODE_ORDER = Object.freeze([CREATE_MODES.POST, CREATE_MODES.STORY]);

const CreatePopup = ({ initialMode = CREATE_MODES.POST, onClose, onPostAdded, onStoryAdded }) => {
	const [mode, setMode] = useState(initialMode);

	const { jwtToken } = useContext(LoggedInUserContext);
	const { runWithSessionGuard } = useSessionGuard();

	const submitPost = (image, caption) =>
		runWithSessionGuard(async () => {
			const resizedImage = await resizeImage(image);

			const savedUserPost = await addUserPost({ image: resizedImage, caption }, jwtToken);

			onPostAdded?.(savedUserPost);

			onClose();
		});

	const submitStory = (image) =>
		runWithSessionGuard(async () => {
			const resizedImage = await resizeImage(image);

			const savedStory = await addStory({ image: resizedImage }, jwtToken);

			onStoryAdded?.(savedStory);

			onClose();
		});

	return (
		<Popup className='create-popup' onClosePopupClick={onClose}>
			<div className='create-tabs' role='tablist'>
				{CREATE_MODE_ORDER.map((tabMode) => (
					<button
						key={tabMode}
						type='button'
						role='tab'
						aria-selected={tabMode === mode}
						className={tabMode === mode ? 'create-tab create-tab-active' : 'create-tab'}
						onClick={() => setMode(tabMode)}
					>
						<span className='create-tab-label'>{CREATE_MODE_LABELS[tabMode]}</span>

						<span className='create-tab-underline' />
					</button>
				))}
			</div>

			<AddImagePostForm mode={mode} submitHandler={mode === CREATE_MODES.STORY ? submitStory : submitPost} onCancelClick={onClose} />
		</Popup>
	);
};

export default CreatePopup;

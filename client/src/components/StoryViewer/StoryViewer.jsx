import { useCallback, useContext, useEffect, useRef, useState } from 'react';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import ToastContext from '../../contexts/ToastContext';
import useSessionGuard from '../../hooks/useSessionGuard';
import { deleteStory, getUserStories, markStoryViewed } from '../../services/storyService';
import { USER_LIST_TYPES } from '../../constants/userLists';
import { ACTION_FALLBACK_MESSAGES } from '../../constants/errorMessages';
import {
	DELETE_STORY_MESSAGE,
	STORY_DURATION_MS,
	STORY_HOLD_THRESHOLD_MS,
	STORY_START_TARGETS,
	STORY_VIEWER_OVERLAYS,
} from '../../constants/stories';
import { getErrorMessage, isUnauthenticatedError } from '../../utils/errors';
import { formatStoryAge, getStartStoryIndex, isStoryAspectRatio } from '../../utils/stories';

import DeletePostConfirm from '../DeletePostConfirm/DeletePostConfirm';
import LoadingSpinner from '../LoadingSpinner/LoadingSpinner';
import Popup from '../Popup/Popup';
import ProfilePicture from '../ProfilePicture/ProfilePicture';
import UserListPopup from '../UserListPopup/UserListPopup';
import ChevronLeftIcon from '../icons/ChevronLeft';
import ChevronRightIcon from '../icons/ChevronRight';
import CloseIcon from '../icons/Close';
import EyeIcon from '../icons/Eye';
import TrashIcon from '../icons/Trash';

import './StoryViewer.css';

const StoryViewer = ({ queue, startIndex, onClose }) => {
	const [userIndex, setUserIndex] = useState(startIndex);
	const [storyIndex, setStoryIndex] = useState(0);
	const [loadedStories, setLoadedStories] = useState({});
	const [isHolding, setIsHolding] = useState(false);
	const [openOverlay, setOpenOverlay] = useState(null);
	const [isDeleting, setIsDeleting] = useState(false);
	const [loadedPhotoStoryId, setLoadedPhotoStoryId] = useState(null);
	const holdStartedAtRef = useRef(0);
	const viewedStoryIdsRef = useRef(new Set());
	const startTargetRef = useRef(STORY_START_TARGETS.FIRST_UNWATCHED);

	const { jwtToken } = useContext(LoggedInUserContext);
	const { showToast } = useContext(ToastContext);
	const { endSessionIfUnauthenticated } = useSessionGuard();

	const { user, isOwn } = queue[userIndex];
	const userId = user._id;
	const userStories = loadedStories[userId]?.stories;
	const currentStory = userStories?.[storyIndex];
	const currentStoryId = currentStory?._id;
	const hasStoryAspectRatio = currentStory ? isStoryAspectRatio(currentStory) : false;
	const isUserLoaded = Boolean(userStories);
	const isPhotoLoaded = Boolean(currentStoryId) && loadedPhotoStoryId === currentStoryId;
	const isPaused = isHolding || openOverlay !== null || !isPhotoLoaded;
	const hasPreviousStory = userIndex > 0 || storyIndex > 0;

	const advanceToNextUser = useCallback(() => {
		if (userIndex + 1 < queue.length) {
			const nextStories = loadedStories[queue[userIndex + 1].user._id]?.stories;

			startTargetRef.current = STORY_START_TARGETS.FIRST_UNWATCHED;

			setLoadedPhotoStoryId(null);
			setUserIndex(userIndex + 1);
			setStoryIndex(nextStories ? getStartStoryIndex(nextStories, STORY_START_TARGETS.FIRST_UNWATCHED) : 0);

			return;
		}

		onClose();
	}, [userIndex, queue, loadedStories, onClose]);

	const goToNext = useCallback(() => {
		if (!userStories) {
			return;
		}

		if (storyIndex + 1 < userStories.length) {
			setLoadedPhotoStoryId(null);
			setStoryIndex(storyIndex + 1);

			return;
		}

		advanceToNextUser();
	}, [userStories, storyIndex, advanceToNextUser]);

	const goToPrevious = useCallback(() => {
		if (!userStories) {
			return;
		}

		if (storyIndex > 0) {
			setLoadedPhotoStoryId(null);
			setStoryIndex(storyIndex - 1);
		} else if (userIndex > 0) {
			const previousUserId = queue[userIndex - 1].user._id;
			const previousStories = loadedStories[previousUserId]?.stories;

			startTargetRef.current = STORY_START_TARGETS.LAST;

			setLoadedPhotoStoryId(null);
			setUserIndex(userIndex - 1);
			setStoryIndex(previousStories ? getStartStoryIndex(previousStories, STORY_START_TARGETS.LAST) : 0);
		}
	}, [userStories, storyIndex, userIndex, queue, loadedStories]);

	const closeOverlay = useCallback(() => {
		setOpenOverlay(null);
	}, []);

	useEffect(() => {
		if (isUserLoaded) {
			return;
		}

		let isCurrentRequest = true;

		getUserStories({ userId, jwtToken })
			.then((result) => {
				if (!isCurrentRequest) {
					return;
				}

				const startTarget = startTargetRef.current;

				startTargetRef.current = STORY_START_TARGETS.FIRST;

				setLoadedStories((state) => ({ ...state, [userId]: result }));
				setStoryIndex(getStartStoryIndex(result.stories, startTarget));
			})
			.catch((error) => {
				if (!isCurrentRequest) {
					return;
				}

				if (isUnauthenticatedError(error)) {
					endSessionIfUnauthenticated(error);
				} else {
					showToast(getErrorMessage(error, ACTION_FALLBACK_MESSAGES.LOAD_STORIES));
				}

				onClose();
			});

		return () => {
			isCurrentRequest = false;
		};
	}, [userId, isUserLoaded, jwtToken, endSessionIfUnauthenticated, showToast, onClose]);

	useEffect(() => {
		if (userStories && storyIndex >= userStories.length) {
			advanceToNextUser();
		}
	}, [userStories, storyIndex, advanceToNextUser]);

	const handlePhotoLoad = () => {
		setLoadedPhotoStoryId(currentStoryId);

		if (isOwn || viewedStoryIdsRef.current.has(currentStoryId)) {
			return;
		}

		viewedStoryIdsRef.current.add(currentStoryId);

		markStoryViewed({ storyId: currentStoryId, jwtToken }).catch(endSessionIfUnauthenticated);
	};

	useEffect(() => {
		const handleKeyDown = (event) => {
			if (openOverlay !== null) {
				return;
			}

			if (event.key === 'Escape') {
				onClose();
			} else if (event.key === 'ArrowLeft') {
				goToPrevious();
			} else if (event.key === 'ArrowRight') {
				goToNext();
			}
		};

		document.addEventListener('keydown', handleKeyDown);

		return () => {
			document.removeEventListener('keydown', handleKeyDown);
		};
	}, [openOverlay, onClose, goToPrevious, goToNext]);

	const startHold = () => {
		holdStartedAtRef.current = Date.now();
		setIsHolding(true);
	};

	const cancelHold = () => {
		holdStartedAtRef.current = 0;
		setIsHolding(false);
	};

	const finishHold = (navigate) => () => {
		const wasTap = Date.now() - holdStartedAtRef.current < STORY_HOLD_THRESHOLD_MS;

		cancelHold();

		if (wasTap) {
			navigate();
		}
	};

	const navigateFromKeyboard = (navigate) => (event) => {
		if (event.detail === 0) {
			navigate();
		}
	};

	const confirmDelete = async () => {
		setIsDeleting(true);

		try {
			await deleteStory({ storyId: currentStoryId, jwtToken });

			setLoadedStories((state) => ({
				...state,
				[userId]: { ...state[userId], stories: state[userId].stories.filter((story) => story._id !== currentStoryId) },
			}));
		} catch (error) {
			if (isUnauthenticatedError(error)) {
				endSessionIfUnauthenticated(error);
			} else {
				showToast(getErrorMessage(error, ACTION_FALLBACK_MESSAGES.DELETE_STORY));
			}
		} finally {
			setIsDeleting(false);
			closeOverlay();
		}
	};

	const renderSegmentFill = (index) => {
		if (index < storyIndex) {
			return <div className='story-viewer-segment-fill story-viewer-segment-fill-complete' />;
		}

		if (index === storyIndex) {
			return (
				<div
					key={currentStoryId}
					className='story-viewer-segment-fill story-viewer-segment-fill-active'
					style={{ animationDuration: `${STORY_DURATION_MS}ms` }}
					onAnimationEnd={goToNext}
				/>
			);
		}

		return null;
	};

	return (
		<div className={isPaused ? 'story-viewer story-viewer-paused' : 'story-viewer'} role='dialog' aria-modal='true' aria-label='Story viewer'>
			<div className='story-viewer-backdrop' />

			<div className='story-viewer-stage'>
				<div className='story-viewer-card'>
					{currentStory ? (
						<div key={currentStoryId} className='story-viewer-media'>
							{hasStoryAspectRatio ? null : (
								<img className='story-viewer-media-blur' src={currentStory.imageUrl} alt='' aria-hidden='true' draggable={false} />
							)}

							<img
								className={hasStoryAspectRatio ? 'story-viewer-photo story-viewer-photo-cover' : 'story-viewer-photo'}
								src={currentStory.imageUrl}
								alt={`Story by ${user.username}`}
								draggable={false}
								onLoad={handlePhotoLoad}
								onError={goToNext}
							/>
						</div>
					) : (
						<div className='story-viewer-loading'>
							<LoadingSpinner />
						</div>
					)}

					<div className='story-viewer-scrim story-viewer-scrim-top' />

					<div className='story-viewer-scrim story-viewer-scrim-bottom' />

					<button
						type='button'
						className='story-viewer-zone story-viewer-zone-previous'
						aria-label='Previous story'
						onPointerDown={startHold}
						onPointerUp={finishHold(goToPrevious)}
						onPointerLeave={cancelHold}
						onPointerCancel={cancelHold}
						onClick={navigateFromKeyboard(goToPrevious)}
					/>

					<button
						type='button'
						className='story-viewer-zone story-viewer-zone-next'
						aria-label='Next story'
						onPointerDown={startHold}
						onPointerUp={finishHold(goToNext)}
						onPointerLeave={cancelHold}
						onPointerCancel={cancelHold}
						onClick={navigateFromKeyboard(goToNext)}
					/>

					<div className='story-viewer-progress'>
						{userStories?.map((story, index) => (
							<div key={story._id} className='story-viewer-segment'>
								{renderSegmentFill(index)}
							</div>
						))}
					</div>

					<header className='story-viewer-header'>
						<div className='story-viewer-poster'>
							<ProfilePicture imageUrl={user.profilePicture?.imageUrl} className='story-viewer-avatar' />

							<span className='story-viewer-username'>{user.username}</span>

							{currentStory ? <span className='story-viewer-age'>{formatStoryAge(currentStory.createdAt)}</span> : null}
						</div>

						<button type='button' className='story-viewer-icon-button' aria-label='Close' onClick={onClose}>
							<CloseIcon iconColorProp='currentColor' />
						</button>
					</header>

					{isOwn && currentStory ? (
						<footer className='story-viewer-footer'>
							{currentStory.viewersCount > 0 ? (
								<button type='button' className='story-viewer-seen-by' onClick={() => setOpenOverlay(STORY_VIEWER_OVERLAYS.VIEWERS)}>
									<EyeIcon />

									<span>{`Seen by ${currentStory.viewersCount}`}</span>
								</button>
							) : null}

							<button
								type='button'
								className='story-viewer-icon-button'
								aria-label='Delete story'
								onClick={() => setOpenOverlay(STORY_VIEWER_OVERLAYS.DELETE)}
							>
								<TrashIcon />
							</button>
						</footer>
					) : null}
				</div>

				{hasPreviousStory ? (
					<button
						type='button'
						className='story-viewer-arrow story-viewer-arrow-previous'
						aria-label='Previous story'
						onClick={goToPrevious}
					>
						<ChevronLeftIcon iconColorProp='currentColor' />
					</button>
				) : null}

				<button type='button' className='story-viewer-arrow story-viewer-arrow-next' aria-label='Next story' onClick={goToNext}>
					<ChevronRightIcon iconColorProp='currentColor' />
				</button>
			</div>

			{openOverlay === STORY_VIEWER_OVERLAYS.VIEWERS ? (
				<UserListPopup storyId={currentStoryId} listType={USER_LIST_TYPES.VIEWERS} onClose={closeOverlay} />
			) : null}

			{openOverlay === STORY_VIEWER_OVERLAYS.DELETE ? (
				<Popup title='Delete story' className='delete-post-popup' bodyClassName='bottom-sheet' onClosePopupClick={closeOverlay}>
					<DeletePostConfirm
						message={DELETE_STORY_MESSAGE}
						onDeleteClick={confirmDelete}
						onCancelClick={closeOverlay}
						isDeleting={isDeleting}
					/>
				</Popup>
			) : null}
		</div>
	);
};

export default StoryViewer;

import { useContext, useEffect, useRef, useState } from 'react';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { getComments, addComment } from '../../services/commentService';
import { LOAD_ERROR_MESSAGES } from '../../constants/errorMessages';
import { addCommentLocally } from '../../utils/comments';

import AddCommentForm from '../AddCommentForm/AddCommentForm';
import Comment from '../Comment/Comment';
import LoadingSpinner from '../LoadingSpinner/LoadingSpinner';
import Popup from '../Popup/Popup';

import './CommentsPopup.css';

const CommentsPopup = ({ userPostId, onClose, onCommentsLoaded }) => {
	const [comments, setComments] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [hasLoadFailed, setHasLoadFailed] = useState(false);
	const [retryCount, setRetryCount] = useState(0);

	const { jwtToken } = useContext(LoggedInUserContext);

	const onCommentsLoadedRef = useRef(onCommentsLoaded);

	useEffect(() => {
		onCommentsLoadedRef.current = onCommentsLoaded;
	}, [onCommentsLoaded]);

	useEffect(() => {
		let isCurrentRequest = true;

		setIsLoading(true);
		setHasLoadFailed(false);

		getComments({ userPostId, jwtToken })
			.then((result) => {
				if (!isCurrentRequest) {
					return;
				}

				setComments(result);
				onCommentsLoadedRef.current(result);
			})
			.catch(() => {
				if (isCurrentRequest) {
					setHasLoadFailed(true);
				}
			})
			.finally(() => {
				if (isCurrentRequest) {
					setIsLoading(false);
				}
			});

		return () => {
			isCurrentRequest = false;
		};
	}, [userPostId, jwtToken, retryCount]);

	const retryLoad = () => {
		setRetryCount((count) => count + 1);
	};

	const reloadComments = async (addedComment) => {
		try {
			const result = await getComments({ userPostId, jwtToken });

			setComments(result);
			setHasLoadFailed(false);
			onCommentsLoadedRef.current(result);
		} catch {
			if (!addedComment) {
				setHasLoadFailed(true);

				return;
			}

			const updatedComments = addCommentLocally(comments, addedComment);

			setComments(updatedComments);
			setHasLoadFailed(false);
			onCommentsLoadedRef.current(updatedComments);
		}
	};

	const submitComment = async (text) => {
		const addedComment = await addComment({ userPostId, text, jwtToken });

		await reloadComments(addedComment);
	};

	const renderComments = () => {
		if (isLoading) {
			return <LoadingSpinner />;
		}

		if (hasLoadFailed) {
			return (
				<p className='comments-popup-message' role='alert'>
					<span>{LOAD_ERROR_MESSAGES.COMMENTS.MESSAGE}</span>

					<span aria-hidden='true'>·</span>

					<button type='button' className='comments-popup-retry' onClick={retryLoad}>
						{LOAD_ERROR_MESSAGES.COMMENTS.RETRY_LABEL}
					</button>
				</p>
			);
		}

		if (!comments.length) {
			return <p className='comments-popup-message'>No comments yet. Be the first to comment.</p>;
		}

		return (
			<div className='comments-popup-list'>
				{comments.map((comment) => (
					<Comment key={comment._id} comment={comment} userPostId={userPostId} onReload={reloadComments} />
				))}
			</div>
		);
	};

	return (
		<Popup title='Comments' className='comments-popup' bodyClassName='bottom-sheet' onClosePopupClick={onClose}>
			<div className='comments-popup-content'>{renderComments()}</div>

			<AddCommentForm onSubmit={submitComment} isDisabled={hasLoadFailed && !isLoading} className='comments-popup-form' />
		</Popup>
	);
};

export default CommentsPopup;

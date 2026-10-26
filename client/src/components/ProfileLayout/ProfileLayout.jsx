import { useState, useEffect, useContext, useMemo } from 'react';
import { Outlet, useMatch, useNavigate, useParams } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import ToastContext from '../../contexts/ToastContext';
import useSessionGuard from '../../hooks/useSessionGuard';
import { updateUserPostCaption, deleteUserPost } from '../../services/userPostService';
import { getUsersProfileData } from '../../services/userService';
import { ERROR_CODES } from '../../constants/errorCodes';
import { ACTION_FALLBACK_MESSAGES } from '../../constants/errorMessages';
import { getErrorCode, getErrorMessage, isUnauthenticatedError } from '../../utils/errors';

import PageLoadError from '../PageLoadError/PageLoadError';
import Popup from '../Popup/Popup';
import EditPostForm from '../EditPostForm/EditPostForm';
import DeletePostConfirm from '../DeletePostConfirm/DeletePostConfirm';

const isSamePost = (post, postId) => (post._id ?? post) === postId;

const ProfileLayout = () => {
	const [userPosts, setUserPosts] = useState([]);
	const [userData, setUserData] = useState(null);
	const [postToEdit, setPostToEdit] = useState(null);
	const [postToDelete, setPostToDelete] = useState(null);
	const [isDeletingPost, setIsDeletingPost] = useState(false);
	const [isLoadingProfile, setIsLoadingProfile] = useState(true);
	const [loadFailedUserId, setLoadFailedUserId] = useState(null);
	const [reloadCount, setReloadCount] = useState(0);
	const [profileRequestCount, setProfileRequestCount] = useState(0);

	const { jwtToken, loggedInUser, endSession } = useContext(LoggedInUserContext);
	const { showToast } = useContext(ToastContext);
	const { runWithSessionGuard } = useSessionGuard();

	const { userId } = useParams();
	const navigate = useNavigate();
	const isPostsViewOpen = Boolean(useMatch('/user/:userId/posts'));

	const isLoggedInUserProfile = useMemo(() => {
		return userId === loggedInUser?._id;
	}, [userId, loggedInUser]);

	useEffect(() => {
		let isCurrentRequest = true;

		setIsLoadingProfile(true);
		setProfileRequestCount((count) => count + 1);

		getUsersProfileData({ userIds: [userId], jwtToken })
			.then((result) => {
				if (!isCurrentRequest) {
					return;
				}

				setUserData(result[0]);
				setUserPosts(result[0].posts);
				setLoadFailedUserId(null);
			})
			.catch((error) => {
				if (!isCurrentRequest) {
					return;
				}

				if (getErrorCode(error) === ERROR_CODES.USER_NOT_FOUND) {
					setUserData(null);
					setLoadFailedUserId(null);

					return;
				}

				if (isUnauthenticatedError(error)) {
					endSession();

					return;
				}

				setLoadFailedUserId(userId);
			})
			.finally(() => {
				if (isCurrentRequest) {
					setIsLoadingProfile(false);
				}
			});

		return () => {
			isCurrentRequest = false;
		};
	}, [userId, jwtToken, isLoggedInUserProfile, loggedInUser, reloadCount, endSession]);

	const retryProfileLoad = () => {
		setReloadCount((count) => count + 1);
	};

	const closeEditPostForm = () => {
		setPostToEdit(null);
	};

	const editPostHandler = (caption) =>
		runWithSessionGuard(async () => {
			const updatedPost = await updateUserPostCaption({ userPostId: postToEdit._id, caption, jwtToken });

			setUserPosts((state) => state.map((post) => (isSamePost(post, updatedPost._id) ? { ...post, caption: updatedPost.caption } : post)));

			closeEditPostForm();
		});

	const closeDeletePostConfirm = () => {
		setPostToDelete(null);
	};

	const deletePostHandler = async () => {
		const deletedPostId = postToDelete._id;

		setIsDeletingPost(true);

		try {
			await deleteUserPost({ userPostId: deletedPostId, jwtToken });

			setUserPosts((state) => state.filter((post) => !isSamePost(post, deletedPostId)));
			setUserData((state) => ({ ...state, posts: state.posts.filter((post) => !isSamePost(post, deletedPostId)) }));

			if (isPostsViewOpen && userPosts.every((post) => isSamePost(post, deletedPostId))) {
				navigate(`/user/${userId}`, { replace: true });
			}

			closeDeletePostConfirm();
		} catch (error) {
			closeDeletePostConfirm();

			if (isUnauthenticatedError(error)) {
				endSession();
			} else {
				showToast(getErrorMessage(error, ACTION_FALLBACK_MESSAGES.DELETE_POST));
			}
		} finally {
			setIsDeletingPost(false);
		}
	};

	if (loadFailedUserId === userId && userData?._id !== userId) {
		return <PageLoadError onRetryClick={retryProfileLoad} isRetrying={isLoadingProfile} />;
	}

	if (!userData) {
		return null;
	}

	const outletContext = {
		userData,
		setUserData,
		userPosts,
		setUserPosts,
		isLoggedInUserProfile,
		profileRequestCount,
		onEditPostClick: setPostToEdit,
		onDeletePostClick: setPostToDelete,
	};

	return (
		<>
			<Outlet context={outletContext} />

			{postToEdit ? (
				<Popup title='Edit Picture' onClosePopupClick={closeEditPostForm}>
					<EditPostForm post={postToEdit} editPostHandler={editPostHandler} onCancelClick={closeEditPostForm} />
				</Popup>
			) : null}

			{postToDelete ? (
				<Popup title='Delete post' className='delete-post-popup' isBottomSheet onClosePopupClick={closeDeletePostConfirm}>
					<DeletePostConfirm onDeleteClick={deletePostHandler} onCancelClick={closeDeletePostConfirm} isDeleting={isDeletingPost} />
				</Popup>
			) : null}
		</>
	);
};

export default ProfileLayout;

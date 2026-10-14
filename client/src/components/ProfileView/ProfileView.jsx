import { useState, useEffect, useContext, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import ToastContext from '../../contexts/ToastContext';
import { addUserPost, updateUserPostCaption, deleteUserPost } from '../../services/userPostService';
import { getUsersProfileData, updateUserProfileData, followUser, unfollowUser } from '../../services/userService';
import { ERROR_CODES } from '../../constants/errorCodes';
import { ACTION_FALLBACK_MESSAGES } from '../../constants/errorMessages';
import { getErrorCode, getErrorMessage, isUnauthenticatedError } from '../../utils/errors';
import { resizeImage } from '../../utils/images';

import ProfileHeader from '../ProfileHeader/ProfileHeader';
import ProfileLoadError from '../ProfileLoadError/ProfileLoadError';
import UserProfilePost from '../UserProfilePost/UserProfilePost';
import Popup from '../Popup/Popup';
import AddImagePostForm from '../AddImagePostForm/AddImagePostForm';
import EditProfileForm from '../EditProfileForm/EditProfileForm';
import EditPostForm from '../EditPostForm/EditPostForm';
import DeletePostConfirm from '../DeletePostConfirm/DeletePostConfirm';
import PlusIcon from '../icons/Plus';

import './ProfileView.css';

const isSamePost = (post, postId) => (post._id ?? post) === postId;

const ProfileView = (props) => {
	const [userPosts, setUserPosts] = useState([]);
	const [userData, setUserData] = useState(null);
	const [isAddPicturePopupOpen, setIsAddPicturePopupOpen] = useState(false);
	const [isEditProfileFormOpen, setIsEditProfileFormOpen] = useState(false);
	const [postToEdit, setPostToEdit] = useState(null);
	const [postToDelete, setPostToDelete] = useState(null);
	const [isDeletingPost, setIsDeletingPost] = useState(false);
	const [isLoadingProfile, setIsLoadingProfile] = useState(true);
	const [loadFailedUserId, setLoadFailedUserId] = useState(null);
	const [reloadCount, setReloadCount] = useState(0);

	const { jwtToken, loggedInUser, updateLoggedInUser, endSession } = useContext(LoggedInUserContext);
	const { showToast } = useContext(ToastContext);

	const navigate = useNavigate();
	const location = useLocation();

	let { userId } = useParams();

	const isLoggedInUserProfile = useMemo(() => {
		return userId === loggedInUser?._id;
	}, [userId, loggedInUser]);

	const endSessionIfUnauthenticated = useCallback(
		(error) => {
			if (isUnauthenticatedError(error)) {
				endSession();
			}
		},
		[endSession],
	);

	const runWithSessionGuard = async (action) => {
		try {
			return await action();
		} catch (error) {
			endSessionIfUnauthenticated(error);

			throw error;
		}
	};

	useEffect(() => {
		let isCurrentRequest = true;

		setIsLoadingProfile(true);

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

	const openAddPictureForm = () => {
		setIsAddPicturePopupOpen(true);
	};

	const closeAddPictureForm = () => {
		setIsAddPicturePopupOpen(false);
	};

	const addImagePostHandler = async (uploadedImage, caption) => {
		if (uploadedImage === null) {
			return;
		}

		await runWithSessionGuard(async () => {
			const resizedImage = await resizeImage(uploadedImage);

			const savedUserPost = await addUserPost({ image: resizedImage, caption }, jwtToken);

			setUserPosts((state) => [...state, savedUserPost]);
			setUserData((state) => ({ ...state, posts: [...state.posts, savedUserPost] }));

			closeAddPictureForm();
		});
	};

	const openEditProfileForm = () => {
		setIsEditProfileFormOpen(true);
	};

	const closeEditProfileForm = () => {
		setIsEditProfileFormOpen(false);
	};

	const editProfileDataHandler = (userUpdatedData) =>
		runWithSessionGuard(async () => {
			let updatedProfileData = { ...userUpdatedData };

			if (updatedProfileData.profilePicture) {
				updatedProfileData = {
					...updatedProfileData,
					profilePicture: await resizeImage(updatedProfileData.profilePicture),
				};
			}

			const updatedUserData = await updateUserProfileData({
				userId,
				jwtToken,
				updatedProfileData,
			});

			setUserData(updatedUserData.user);
			updateLoggedInUser(updatedUserData);

			closeEditProfileForm();
		});

	const closeEditPostForm = () => {
		setPostToEdit(null);
	};

	const editPostHandler = (caption) =>
		runWithSessionGuard(async () => {
			const updatedPost = await updateUserPostCaption({ userPostId: postToEdit._id, caption, jwtToken });

			setUserPosts((state) => state.map((post) => (isSamePost(post, updatedPost._id) ? { ...post, caption: updatedPost.caption } : post)));

			closeEditPostForm();
		});

	const openDeletePostConfirm = (post) => {
		setPostToDelete(post);
	};

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

	const followUserHandler = async (userIdToFollow) => {
		if (!loggedInUser) {
			navigate('/log-in', { state: { from: location.pathname } });

			return;
		}

		try {
			const updatedUserData = await followUser({
				userId: loggedInUser?._id,
				jwtToken,
				userIdToFollow,
			});

			updateLoggedInUser(updatedUserData);
		} catch (error) {
			endSessionIfUnauthenticated(error);
		}
	};

	const onUnfollowUserHandler = async (userIdToUnfollow) => {
		try {
			const updatedUserData = await unfollowUser({
				userId: loggedInUser?._id,
				jwtToken,
				userIdToUnfollow,
			});

			updateLoggedInUser(updatedUserData);
		} catch (error) {
			endSessionIfUnauthenticated(error);
		}
	};

	if (loadFailedUserId === userId && userData?._id !== userId) {
		return <ProfileLoadError onRetryClick={retryProfileLoad} isRetrying={isLoadingProfile} />;
	}

	if (!userData) {
		return null;
	}

	return (
		<div className='profile-view-wrapper'>
			<ProfileHeader
				userData={userData}
				loggedInUserData={loggedInUser}
				isLoggedInUserProfile={isLoggedInUserProfile}
				onEditProfileClick={openEditProfileForm}
				onFollowUserClick={followUserHandler}
				onUnfollowUserClick={onUnfollowUserHandler}
			/>

			<section className='profile-posts-wrapper'>
				{isLoggedInUserProfile ? (
					<button className='add-post-button' onClick={openAddPictureForm}>
						<PlusIcon iconColorProp='currentColor' />

						<span>Upload Picture</span>
					</button>
				) : null}

				{userPosts.map((post) => (
					<UserProfilePost
						key={post.imageIdentifier}
						post={post}
						showActions={isLoggedInUserProfile}
						onEditClick={setPostToEdit}
						onDeleteClick={openDeletePostConfirm}
					/>
				))}
			</section>

			{isAddPicturePopupOpen ? (
				<Popup title='Upload Picture' onClosePopupClick={closeAddPictureForm}>
					<AddImagePostForm addImagePostHandler={addImagePostHandler} onCancelClick={closeAddPictureForm} />
				</Popup>
			) : null}

			{isEditProfileFormOpen ? (
				<Popup title='Edit Profile' onClosePopupClick={closeEditProfileForm}>
					<EditProfileForm userData={userData} editProfileData={editProfileDataHandler} onCancelClick={closeEditProfileForm} />
				</Popup>
			) : null}

			{postToEdit ? (
				<Popup title='Edit Picture' onClosePopupClick={closeEditPostForm}>
					<EditPostForm post={postToEdit} editPostHandler={editPostHandler} onCancelClick={closeEditPostForm} />
				</Popup>
			) : null}

			{postToDelete ? (
				<Popup title='Delete post' className='delete-post-popup' bodyClassName='bottom-sheet' onClosePopupClick={closeDeletePostConfirm}>
					<DeletePostConfirm onDeleteClick={deletePostHandler} onCancelClick={closeDeletePostConfirm} isDeleting={isDeletingPost} />
				</Popup>
			) : null}
		</div>
	);
};

export default ProfileView;

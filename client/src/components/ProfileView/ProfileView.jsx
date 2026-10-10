import { useState, useEffect, useContext, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { addUserPost, updateUserPostCaption, deleteUserPost } from '../../services/userPostService';
import { uploadImageToCloudinary } from '../../services/cloudinaryService';
import { getUsersProfileData, updateUserProfileData, followUser, unfollowUser } from '../../services/userService';

import ProfileHeader from '../ProfileHeader/ProfileHeader';
import UserProfilePost from '../UserProfilePost/UserProfilePost';
import Popup from '../Popup/Popup';
import AddImagePostForm from '../AddImagePostForm/AddImagePostForm';
import EditProfileForm from '../EditProfileForm/EditProfileForm';
import EditPostForm from '../EditPostForm/EditPostForm';
import DeletePostConfirm from '../DeletePostConfirm/DeletePostConfirm';
import PlusIcon from '../icons/Plus';

import './ProfileView.css';

const DELETE_POST_FALLBACK_ERROR = 'Something went wrong. Please try again.';

const isSamePost = (post, postId) => (post._id ?? post) === postId;

const ProfileView = (props) => {
	const [userPosts, setUserPosts] = useState([]);
	const [userData, setUserData] = useState(null);
	const [isAddPicturePopupOpen, setIsAddPicturePopupOpen] = useState(false);
	const [isEditProfileFormOpen, setIsEditProfileFormOpen] = useState(false);
	const [postToEdit, setPostToEdit] = useState(null);
	const [postToDelete, setPostToDelete] = useState(null);
	const [isDeletingPost, setIsDeletingPost] = useState(false);
	const [deletePostError, setDeletePostError] = useState('');

	const { jwtToken, loggedInUser, updateLoggedInUser } = useContext(LoggedInUserContext);

	const navigate = useNavigate();
	const location = useLocation();

	let { userId } = useParams();

	const isLoggedInUserProfile = useMemo(() => {
		return userId === loggedInUser?._id;
	}, [userId, loggedInUser]);

	useEffect(() => {
		getUsersProfileData({ userIds: [userId], jwtToken })
			.then((result) => {
				setUserData(result[0]);
				setUserPosts(result[0].posts);
			})
			.catch(() => {
				console.log('something went wrong while trying to fetch user data');
			});
	}, [userId, jwtToken, isLoggedInUserProfile, loggedInUser]);

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

		try {
			const createdImage = await uploadImageToCloudinary(uploadedImage);

			const savedUserPost = await addUserPost({ ...createdImage, caption }, jwtToken);

			setUserPosts((state) => [...state, savedUserPost]);
			setUserData((state) => ({ ...state, posts: [...state.posts, savedUserPost] }));

			closeAddPictureForm();
		} catch (error) {
			// TODO add some error handling
			console.log('Something went wrong while trying to uploade image');
		}
	};

	const openEditProfileForm = () => {
		setIsEditProfileFormOpen(true);
	};

	const closeEditProfileForm = () => {
		setIsEditProfileFormOpen(false);
	};

	const editProfileDataHandler = async (userUpdatedData) => {
		let updatedProfileData = { ...userUpdatedData };

		if (updatedProfileData.profilePicture) {
			const createdImageForProflePicrture = await uploadImageToCloudinary(updatedProfileData.profilePicture);

			updatedProfileData = {
				...updatedProfileData,
				profilePicture: createdImageForProflePicrture,
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
	};

	const closeEditPostForm = () => {
		setPostToEdit(null);
	};

	const editPostHandler = async (caption) => {
		const updatedPost = await updateUserPostCaption({ userPostId: postToEdit._id, caption, jwtToken });

		setUserPosts((state) => state.map((post) => (isSamePost(post, updatedPost._id) ? { ...post, caption: updatedPost.caption } : post)));

		closeEditPostForm();
	};

	const openDeletePostConfirm = (post) => {
		setDeletePostError('');
		setPostToDelete(post);
	};

	const closeDeletePostConfirm = () => {
		setPostToDelete(null);
		setDeletePostError('');
	};

	const deletePostHandler = async () => {
		const deletedPostId = postToDelete._id;

		setIsDeletingPost(true);
		setDeletePostError('');

		try {
			await deleteUserPost({ userPostId: deletedPostId, jwtToken });

			setUserPosts((state) => state.filter((post) => !isSamePost(post, deletedPostId)));
			setUserData((state) => ({ ...state, posts: state.posts.filter((post) => !isSamePost(post, deletedPostId)) }));

			closeDeletePostConfirm();
		} catch (error) {
			setDeletePostError(error?.error || DELETE_POST_FALLBACK_ERROR);
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
		} catch (error) {}
	};

	const onUnfollowUserHandler = async (userIdToUnfollow) => {
		try {
			const updatedUserData = await unfollowUser({
				userId: loggedInUser?._id,
				jwtToken,
				userIdToUnfollow,
			});

			updateLoggedInUser(updatedUserData);
		} catch (error) {}
	};

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
						<PlusIcon iconColorProp='#B5B5B5' />

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
					<DeletePostConfirm
						onDeleteClick={deletePostHandler}
						onCancelClick={closeDeletePostConfirm}
						isDeleting={isDeletingPost}
						errorMessage={deletePostError}
					/>
				</Popup>
			) : null}
		</div>
	);
};

export default ProfileView;

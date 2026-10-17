import { useState, useEffect, useContext, useRef } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import useLoginRedirect from '../../hooks/useLoginRedirect';
import useSessionGuard from '../../hooks/useSessionGuard';
import { addUserPost } from '../../services/userPostService';
import { updateUserProfileData, followUser, unfollowUser } from '../../services/userService';
import { FOLLOW_LIST_TYPES } from '../../constants/followLists';
import { resizeImage } from '../../utils/images';

import ProfileHeader from '../ProfileHeader/ProfileHeader';
import UserProfilePost from '../UserProfilePost/UserProfilePost';
import Popup from '../Popup/Popup';
import AddImagePostForm from '../AddImagePostForm/AddImagePostForm';
import EditProfileForm from '../EditProfileForm/EditProfileForm';
import FollowListPopup from '../FollowListPopup/FollowListPopup';
import PlusIcon from '../icons/Plus';

import './ProfileView.css';

const withId = (ids = [], id, shouldInclude) => {
	const otherIds = ids.filter((existingId) => existingId !== id);

	return shouldInclude ? [...otherIds, id] : otherIds;
};

const ProfileView = () => {
	const [isAddPicturePopupOpen, setIsAddPicturePopupOpen] = useState(false);
	const [isEditProfileFormOpen, setIsEditProfileFormOpen] = useState(false);
	const [openFollowList, setOpenFollowList] = useState(null);
	const [optimisticIsFollowed, setOptimisticIsFollowed] = useState(null);
	const latestFollowRequestId = useRef(0);

	const { userData, setUserData, userPosts, setUserPosts, isLoggedInUserProfile, profileRequestCount, onEditPostClick, onDeletePostClick } =
		useOutletContext();
	const { jwtToken, loggedInUser, updateLoggedInUser } = useContext(LoggedInUserContext);
	const { endSessionIfUnauthenticated, runWithSessionGuard } = useSessionGuard();
	const redirectToLogin = useLoginRedirect();

	const { userId } = useParams();

	useEffect(() => {
		setOptimisticIsFollowed(null);
	}, [profileRequestCount]);

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

			setUserPosts((state) => [savedUserPost, ...state]);
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

	const showFollowStateOptimistically = (isFollowed) => {
		setOptimisticIsFollowed(isFollowed);
		setUserData((state) => ({ ...state, followers: withId(state.followers, loggedInUser._id, isFollowed) }));
	};

	const sendFollowRequest = async (isFollowed, sendRequest) => {
		latestFollowRequestId.current += 1;

		const requestId = latestFollowRequestId.current;

		showFollowStateOptimistically(isFollowed);

		try {
			const updatedUserData = await sendRequest();

			if (requestId === latestFollowRequestId.current) {
				updateLoggedInUser(updatedUserData);
			}
		} catch (error) {
			endSessionIfUnauthenticated(error);
		}
	};

	const followUserHandler = async (userIdToFollow) => {
		if (!loggedInUser) {
			redirectToLogin();

			return;
		}

		await sendFollowRequest(true, () =>
			followUser({
				userId: loggedInUser?._id,
				jwtToken,
				userIdToFollow,
			}),
		);
	};

	const onUnfollowUserHandler = async (userIdToUnfollow) => {
		await sendFollowRequest(false, () =>
			unfollowUser({
				userId: loggedInUser?._id,
				jwtToken,
				userIdToUnfollow,
			}),
		);
	};

	const closeFollowList = () => {
		setOpenFollowList(null);
	};

	const headerLoggedInUser =
		optimisticIsFollowed === null ? loggedInUser : { ...loggedInUser, following: withId(loggedInUser?.following, userId, optimisticIsFollowed) };

	return (
		<div className='profile-view-wrapper'>
			<ProfileHeader
				userData={userData}
				loggedInUserData={headerLoggedInUser}
				isLoggedInUserProfile={isLoggedInUserProfile}
				onEditProfileClick={openEditProfileForm}
				onFollowUserClick={followUserHandler}
				onUnfollowUserClick={onUnfollowUserHandler}
				onFollowersClick={() => setOpenFollowList(FOLLOW_LIST_TYPES.FOLLOWERS)}
				onFollowingClick={() => setOpenFollowList(FOLLOW_LIST_TYPES.FOLLOWING)}
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
						to={`/user/${userId}/posts#${post._id}`}
						showActions={isLoggedInUserProfile}
						onEditClick={onEditPostClick}
						onDeleteClick={onDeletePostClick}
					/>
				))}
			</section>

			{openFollowList ? <FollowListPopup userId={userId} listType={openFollowList} onClose={closeFollowList} /> : null}

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
		</div>
	);
};

export default ProfileView;

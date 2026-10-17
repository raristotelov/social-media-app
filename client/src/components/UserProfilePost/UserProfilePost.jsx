import { Link } from 'react-router-dom';

import usePostActionsMenu from '../../hooks/usePostActionsMenu';

import PostActionsMenu from '../PostActionsMenu/PostActionsMenu';
import PostActionsIcon from '../icons/PostActions';
import HeartIcon from '../icons/Heart';
import CommentOutlineIcon from '../icons/CommentOutline';

import './UserProfilePost.css';

const UserProfilePost = ({ post, to, showActions = false, onEditClick, onDeleteClick }) => {
	const { isMenuOpen, menuContainerRef, toggleMenu, closeMenu } = usePostActionsMenu();

	const editClickHandler = () => {
		closeMenu();
		onEditClick(post);
	};

	const deleteClickHandler = () => {
		closeMenu();
		onDeleteClick(post);
	};

	const tileContent = (
		<>
			<img src={post.imageUrl} alt='user-post' />

			<div className='profile-post-stats' aria-hidden='true'>
				<div className='profile-post-stats-content'>
					<span className='profile-post-stat'>
						<HeartIcon iconColorProp='var(--static-white)' />

						{post.likes?.length ?? 0}
					</span>

					<span className='profile-post-stat'>
						<CommentOutlineIcon iconColorProp='var(--static-white)' />

						{post.commentsCount ?? 0}
					</span>
				</div>
			</div>
		</>
	);

	return (
		<div className='profile-post' ref={menuContainerRef}>
			{to ? (
				<Link to={to} className='profile-post-link'>
					{tileContent}
				</Link>
			) : (
				tileContent
			)}

			{showActions ? (
				<button type='button' className='post-actions-button' aria-label='Post actions' aria-expanded={isMenuOpen} onClick={toggleMenu}>
					<PostActionsIcon iconColorProp='var(--static-white)' />
				</button>
			) : null}

			{isMenuOpen ? <PostActionsMenu onEditClick={editClickHandler} onDeleteClick={deleteClickHandler} onClose={closeMenu} /> : null}
		</div>
	);
};

export default UserProfilePost;

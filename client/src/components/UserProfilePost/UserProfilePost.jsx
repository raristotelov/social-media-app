import { useState, useEffect, useRef } from 'react';

import PostActionsMenu from '../PostActionsMenu/PostActionsMenu';
import PostActionsIcon from '../icons/PostActions';

import './UserProfilePost.css';

const UserProfilePost = ({ post, showActions = false, onEditClick, onDeleteClick }) => {
	const [isMenuOpen, setIsMenuOpen] = useState(false);

	const postRef = useRef(null);

	useEffect(() => {
		if (!isMenuOpen) {
			return;
		}

		const closeOnOutsideClick = (event) => {
			if (postRef.current && !postRef.current.contains(event.target)) {
				setIsMenuOpen(false);
			}
		};

		const closeOnEscape = (event) => {
			if (event.key === 'Escape') {
				setIsMenuOpen(false);
			}
		};

		document.addEventListener('mousedown', closeOnOutsideClick);
		document.addEventListener('keydown', closeOnEscape);

		return () => {
			document.removeEventListener('mousedown', closeOnOutsideClick);
			document.removeEventListener('keydown', closeOnEscape);
		};
	}, [isMenuOpen]);

	const editClickHandler = () => {
		setIsMenuOpen(false);
		onEditClick(post);
	};

	const deleteClickHandler = () => {
		setIsMenuOpen(false);
		onDeleteClick(post);
	};

	return (
		<div className='profile-post' ref={postRef}>
			<img src={post.imageUrl} alt='user-post' />

			{showActions ? (
				<button
					type='button'
					className='post-actions-button'
					aria-label='Post actions'
					aria-expanded={isMenuOpen}
					onClick={() => setIsMenuOpen((state) => !state)}
				>
					<PostActionsIcon iconColorProp='var(--static-white)' />
				</button>
			) : null}

			{isMenuOpen ? (
				<PostActionsMenu onEditClick={editClickHandler} onDeleteClick={deleteClickHandler} onClose={() => setIsMenuOpen(false)} />
			) : null}
		</div>
	);
};

export default UserProfilePost;

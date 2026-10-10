import './PostActionsMenu.css';

const PostActionsMenu = ({ onEditClick, onDeleteClick, onClose }) => {
	const closeOnScrimPress = (event) => {
		if (event.target === event.currentTarget) {
			onClose();
		}
	};

	return (
		<div className='post-actions-scrim' onMouseDown={closeOnScrimPress}>
			<div className='account-menu post-actions-menu bottom-sheet'>
				<button type='button' className='account-menu-row' onClick={onEditClick}>
					<span>Edit</span>
				</button>

				<button type='button' className='account-menu-row post-actions-menu-row-danger' onClick={onDeleteClick}>
					<span>Delete</span>
				</button>
			</div>
		</div>
	);
};

export default PostActionsMenu;

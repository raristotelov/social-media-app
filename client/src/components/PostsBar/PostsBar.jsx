import useHideOnScrollDown from '../../hooks/useHideOnScrollDown';

import ChevronLeftIcon from '../icons/ChevronLeft';

import './PostsBar.css';

const PostsBar = ({ subtitle, onBackClick }) => {
	const isHidden = useHideOnScrollDown();

	const classNames = isHidden ? 'posts-bar posts-bar-hidden' : 'posts-bar';

	return (
		<div className={classNames}>
			<button type='button' className='posts-bar-back' aria-label='Back' onClick={onBackClick}>
				<ChevronLeftIcon iconColorProp='currentColor' />
			</button>

			<div className='posts-bar-title'>
				<h1 className='posts-bar-heading'>Posts</h1>

				<span className='posts-bar-subtitle'>{subtitle}</span>
			</div>
		</div>
	);
};

export default PostsBar;

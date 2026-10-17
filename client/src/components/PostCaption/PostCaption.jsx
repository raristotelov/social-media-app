import { useLayoutEffect, useRef, useState } from 'react';

import './PostCaption.css';

const OVERFLOW_TOLERANCE_PX = 1;

const PostCaption = ({ username, caption }) => {
	const [isExpanded, setIsExpanded] = useState(false);
	const [isOverflowing, setIsOverflowing] = useState(false);

	const captionRef = useRef(null);

	useLayoutEffect(() => {
		if (isExpanded) {
			return undefined;
		}

		const captionElement = captionRef.current;

		let isCurrent = true;

		const measureOverflow = () => {
			if (isCurrent) {
				setIsOverflowing(captionElement.scrollHeight - captionElement.clientHeight > OVERFLOW_TOLERANCE_PX);
			}
		};

		measureOverflow();

		window.addEventListener('resize', measureOverflow);
		document.fonts?.ready.then(measureOverflow);

		return () => {
			isCurrent = false;

			window.removeEventListener('resize', measureOverflow);
		};
	}, [caption, isExpanded]);

	const classNames = isExpanded ? 'post-caption' : 'post-caption post-caption-clamped';

	return (
		<p className={classNames} ref={captionRef}>
			<span className='post-caption-username'>{username}</span>

			{` ${caption}`}

			{!isExpanded && isOverflowing ? (
				<button type='button' className='post-caption-more' onClick={() => setIsExpanded(true)}>
					<span className='post-caption-more-ellipsis'>… </span>more
				</button>
			) : null}
		</p>
	);
};

export default PostCaption;

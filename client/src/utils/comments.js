import { COMMENT_PREVIEW_LIMIT } from '../constants/comments';

const countLikes = (comment) => (comment.likes ?? []).length;

export const compareComments = (a, b) => countLikes(b) - countLikes(a) || new Date(b.createdAt) - new Date(a.createdAt);

export const addCommentLocally = (comments, addedComment) => {
	if (!addedComment.parentCommentId) {
		return [...comments, { ...addedComment, replies: [] }].sort(compareComments);
	}

	return comments.map((comment) =>
		comment._id === addedComment.parentCommentId ? { ...comment, replies: [...(comment.replies ?? []), addedComment] } : comment,
	);
};

export const applyLikeLocally = (comments, { commentId, userId, isLiked }) => {
	const updateLikes = (comment) => {
		if (comment._id !== commentId) {
			return comment;
		}

		const otherLikes = (comment.likes ?? []).filter((likeUserId) => likeUserId !== userId);

		return { ...comment, likes: isLiked ? [...otherLikes, userId] : otherLikes };
	};

	return comments
		.map((comment) => {
			const updatedComment = updateLikes(comment);

			return comment.replies ? { ...updatedComment, replies: comment.replies.map(updateLikes) } : updatedComment;
		})
		.sort(compareComments);
};

export const getPreviewComments = (comments) => [...comments].sort(compareComments).slice(0, COMMENT_PREVIEW_LIMIT);

export const countCommentsAndReplies = (comments) =>
	comments.reduce((total, comment) => total + 1 + (comment.replies ? comment.replies.length : 0), 0);

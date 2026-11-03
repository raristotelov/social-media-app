const { Router } = require('express');
const router = Router();

const { commentService } = require('../services');
const verifyJwtToken = require('../middlewares/verifyJwtToken');
const readOptionalJwtToken = require('../middlewares/readOptionalJwtToken');

// Add a comment, or a reply when parentCommentId is provided.
router.post('/', verifyJwtToken, async (req, res) => {
	const { userPostId, text, parentCommentId, mentionedUserId } = req.body;

	const comment = await commentService.addComment({
		userPostId,
		userId: res.userId,
		text,
		parentCommentId,
		mentionedUserId,
	});

	return res.json(comment);
});

router.get('/post/:userPostId', readOptionalJwtToken, async (req, res) => {
	const comments = await commentService.getCommentsForPost({ userPostId: req.params.userPostId, requesterId: res.userId });

	return res.json(comments);
});

router.get('/:commentId/likes', readOptionalJwtToken, async (req, res) => {
	const likes = await commentService.getCommentLikes({ commentId: req.params.commentId, requesterId: res.userId });

	return res.json(likes);
});

router.post('/:commentId/like', verifyJwtToken, async (req, res) => {
	const comment = await commentService.likeComment({ commentId: req.params.commentId, userId: res.userId });

	return res.json(comment);
});

router.post('/:commentId/unlike', verifyJwtToken, async (req, res) => {
	const comment = await commentService.unlikeComment({ commentId: req.params.commentId, userId: res.userId });

	return res.json(comment);
});

module.exports = router;

const { Router } = require('express');
const router = Router();

const { userPostService, popularPostService } = require('../services');
const verifyJwtToken = require('../middlewares/verifyJwtToken');
const readOptionalJwtToken = require('../middlewares/readOptionalJwtToken');
const uploadImage = require('../middlewares/uploadImage');
const constants = require('../config/constants');

router.get('/', verifyJwtToken, async (req, res) => {
	const userPostsData = await userPostService.getAllUserPosts(res.userId);

	return res.json(userPostsData);
});

router.post('/', verifyJwtToken, uploadImage(constants.POST_IMAGE_FIELD), async (req, res) => {
	const userPostData = await userPostService.addUserPost({ caption: req.body?.caption, imageFile: req.file }, res.userId);

	return res.json(userPostData);
});

router.get('/followed-users-posts', verifyJwtToken, async (req, res) => {
	const followedUsersPostsData = await userPostService.getFollowedUsersPosts(res.userId);

	return res.json(followedUsersPostsData);
});

router.get('/popular', readOptionalJwtToken, async (req, res) => {
	const popularPostsData = await popularPostService.getPopularPosts({
		userId: res.userId,
		firstPostId: req.query.firstPostId,
	});

	return res.json(popularPostsData);
});

router.post('/popular', readOptionalJwtToken, async (req, res) => {
	const popularPostsData = await popularPostService.getNextPopularPosts({
		userId: res.userId,
		snapshotTime: req.body?.snapshotTime,
		shownPostIds: req.body?.shownPostIds,
	});

	return res.json(popularPostsData);
});

router.post('/like/:userPostId', verifyJwtToken, async (req, res) => {
	const currentlyLoggedInUserId = res.userId;
	const userPostId = req.params.userPostId;

	const userPostData = await userPostService.likeUserPost({ userPostId, userWhoLikedId: currentlyLoggedInUserId });

	return res.json(userPostData);
});

router.post('/unlike/:userPostId', verifyJwtToken, async (req, res) => {
	const currentlyLoggedInUserId = res.userId;
	const userPostId = req.params.userPostId;

	const userPostData = await userPostService.unlikeUserPost({ userPostId, userWhoUnlikedId: currentlyLoggedInUserId });

	return res.json(userPostData);
});

router.patch('/:userPostId', verifyJwtToken, async (req, res) => {
	const userPostData = await userPostService.updateUserPostCaption({
		userPostId: req.params.userPostId,
		userId: res.userId,
		caption: req.body.caption,
	});

	return res.json(userPostData);
});

router.delete('/:userPostId', verifyJwtToken, async (req, res) => {
	await userPostService.deleteUserPost({ userPostId: req.params.userPostId, userId: res.userId });

	return res.status(204).end();
});

module.exports = router;

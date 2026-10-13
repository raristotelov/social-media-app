const { Router } = require('express');
const router = Router();

const { userService } = require('../services');
const verifyJwtToken = require('../middlewares/verifyJwtToken');
const uploadImage = require('../middlewares/uploadImage');
const constants = require('../config/constants');

router.post('/sign-up', async (req, res) => {
	const userData = await userService.signUp(req.body);

	return res.json(userData);
});

router.post('/login', async (req, res) => {
	const userData = await userService.login(req.body);

	return res.json(userData);
});

router.get('/', async (req, res) => {
	const userIdsString = req.query.userIds;
	const searchWord = req.query.searchWord;

	const userIds = userIdsString?.split(',');

	let usersAccountData = [];

	if (userIds) {
		usersAccountData = await userService.getUsersProfileDataByUserIds({ userIds });
	} else if (searchWord) {
		usersAccountData = await userService.getUsersProfileDataBySearchWord({ searchWord });
	}

	return res.json(usersAccountData);
});

router.patch('/update/:userId', verifyJwtToken, uploadImage(constants.PROFILE_PICTURE_FIELD), async (req, res) => {
	const userId = req.params.userId;

	const userAccountData = await userService.updateUserProfileData(userId, req.body, req.file);

	return res.json(userAccountData);
});

router.post('/:userId/follow/:userIdToFollow', verifyJwtToken, async (req, res) => {
	const userId = req.params.userId;
	const userIdToFollow = req.params.userIdToFollow;

	const userAccountData = await userService.followUser(userId, userIdToFollow);

	return res.json(userAccountData);
});

router.post('/:userId/unfollow/:userIdToUnfollow', verifyJwtToken, async (req, res) => {
	const userId = req.params.userId;
	const userIdToUnfollow = req.params.userIdToUnfollow;

	const userAccountData = await userService.unfollowUser(userId, userIdToUnfollow);

	return res.json(userAccountData);
});

module.exports = router;

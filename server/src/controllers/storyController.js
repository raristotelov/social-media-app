const { Router } = require('express');
const router = Router();

const { storyService } = require('../services');
const verifyJwtToken = require('../middlewares/verifyJwtToken');
const uploadImage = require('../middlewares/uploadImage');
const constants = require('../config/constants');

router.post('/', verifyJwtToken, uploadImage(constants.STORY_IMAGE_FIELD), async (req, res) => {
	const storyData = await storyService.addStory({ imageFile: req.file }, res.userId);

	return res.json(storyData);
});

router.get('/tray', verifyJwtToken, async (req, res) => {
	const trayData = await storyService.getStoryTray(res.userId);

	return res.json(trayData);
});

router.get('/user/:userId', verifyJwtToken, async (req, res) => {
	const userStoriesData = await storyService.getUserStories({ authorId: req.params.userId, requesterId: res.userId });

	return res.json(userStoriesData);
});

router.post('/:storyId/view', verifyJwtToken, async (req, res) => {
	await storyService.recordStoryView({ storyId: req.params.storyId, viewerId: res.userId });

	return res.status(204).end();
});

router.get('/:storyId/viewers', verifyJwtToken, async (req, res) => {
	const viewersData = await storyService.getStoryViewers({ storyId: req.params.storyId, userId: res.userId });

	return res.json(viewersData);
});

router.delete('/:storyId', verifyJwtToken, async (req, res) => {
	await storyService.deleteStory({ storyId: req.params.storyId, userId: res.userId });

	return res.status(204).end();
});

module.exports = router;

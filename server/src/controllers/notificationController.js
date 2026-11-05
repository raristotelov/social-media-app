const { Router } = require('express');
const router = Router();

const { notificationService } = require('../services');
const verifyJwtToken = require('../middlewares/verifyJwtToken');

router.get('/unread-count', verifyJwtToken, async (req, res) => {
	const unreadCount = await notificationService.getUnreadCount(res.userId);

	return res.json(unreadCount);
});

router.get('/', verifyJwtToken, async (req, res) => {
	const notificationsPage = await notificationService.getNotifications(res.userId, { cursor: req.query.cursor });

	return res.json(notificationsPage);
});

router.post('/mark-all-read', verifyJwtToken, async (req, res) => {
	await notificationService.markAllRead(res.userId, { cutoff: req.body?.cutoff });

	return res.sendStatus(204);
});

module.exports = router;

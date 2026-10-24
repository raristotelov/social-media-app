const { Router } = require('express');
const router = Router();

const { suggestionService } = require('../services');
const verifyJwtToken = require('../middlewares/verifyJwtToken');

router.get('/', verifyJwtToken, async (req, res) => {
	const suggestionsData = await suggestionService.getSuggestions({ userId: res.userId, placement: req.query.placement });

	return res.json(suggestionsData);
});

router.post('/carousel/dismiss', verifyJwtToken, async (req, res) => {
	await suggestionService.dismissCarousel(res.userId);

	return res.status(204).end();
});

module.exports = router;

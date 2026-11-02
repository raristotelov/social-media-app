const { Router } = require('express');
const router = Router();

const verifyDemoActivityToken = require('../middlewares/verifyDemoActivityToken');
const { triggerDemoActivity } = require('../jobs/demoActivityJob');

router.post('/', verifyDemoActivityToken, (req, res) => {
	triggerDemoActivity();

	return res.status(202).end();
});

module.exports = router;

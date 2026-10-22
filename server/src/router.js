const { Router } = require('express');
const router = Router();

const { userController, userPostController, commentController, storyController } = require('./controllers');

router.use('/users', userController);
router.use('/user-posts', userPostController);
router.use('/comments', commentController);
router.use('/stories', storyController);

module.exports = router;

export const USER_LIST_TYPES = Object.freeze({
	FOLLOWERS: 'followers',
	FOLLOWING: 'following',
	VIEWERS: 'viewers',
	POST_LIKES: 'post-likes',
	COMMENT_LIKES: 'comment-likes',
});

export const USER_LIST_TITLES = Object.freeze({
	[USER_LIST_TYPES.FOLLOWERS]: 'Followers',
	[USER_LIST_TYPES.FOLLOWING]: 'Following',
	[USER_LIST_TYPES.VIEWERS]: 'Viewers',
	[USER_LIST_TYPES.POST_LIKES]: 'Likes',
	[USER_LIST_TYPES.COMMENT_LIKES]: 'Likes',
});

export const USER_LIST_EMPTY_MESSAGES = Object.freeze({
	[USER_LIST_TYPES.VIEWERS]: 'No viewers yet',
	[USER_LIST_TYPES.POST_LIKES]: 'No likes yet',
	[USER_LIST_TYPES.COMMENT_LIKES]: 'No likes yet',
});

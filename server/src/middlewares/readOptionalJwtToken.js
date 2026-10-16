const JWT = require('jsonwebtoken');

module.exports = (req, res, next) => {
	const jwtToken = req.header('X-Authorization');

	if (jwtToken) {
		try {
			res.userId = JWT.verify(jwtToken, process.env.JWT_SECRET).userId;
		} catch {
			res.userId = undefined;
		}
	}

	next();
};

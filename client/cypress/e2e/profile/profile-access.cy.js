import { buildTestUser } from '../../support/testUser';
import {
	serverUrl,
	createUserViaApi,
	loginViaApi,
	userIdFromToken,
	uploadPostViaApi,
	uploadProfilePictureViaApi,
	getProfileViaApi,
	getFollowedUsersPostsViaApi,
	getFollowersViaApi,
	getFollowingViaApi,
	updateProfileViaApi,
	followUserViaApi,
	unfollowUserViaApi,
} from '../../support/api';

describe('profile access', () => {
	const owner = buildTestUser();
	const attacker = buildTestUser();
	const target = buildTestUser();

	let ownerToken;
	let attackerToken;
	let targetToken;
	let ownerId;
	let attackerId;
	let targetId;

	before(() => {
		createUserViaApi(owner);
		createUserViaApi(attacker);
		createUserViaApi(target);

		loginViaApi(owner).then((token) => {
			ownerToken = token;
			ownerId = userIdFromToken(token);
		});

		loginViaApi(attacker).then((token) => {
			attackerToken = token;
			attackerId = userIdFromToken(token);
		});

		loginViaApi(target).then((token) => {
			targetToken = token;
			targetId = userIdFromToken(token);
		});

		cy.then(() => uploadPostViaApi(targetToken, 'A post by the target'));
	});

	after(() => {
		cy.task('deleteTestUser', owner.email);
		cy.task('deleteTestUser', attacker.email);
		cy.task('deleteTestUser', target.email);
	});

	describe('changing another user', () => {
		const expectProfileForbidden = (response) => {
			expect(response.status).to.eq(403);
			expect(response.body).to.have.property('code', 'PROFILE_FORBIDDEN');
		};

		it("rejects updating another user's profile and leaves it unchanged", () => {
			cy.then(() => updateProfileViaApi(attackerToken, ownerId, { bio: 'Hijacked' }, false)).then(expectProfileForbidden);

			cy.then(() => getProfileViaApi(ownerId)).then((profile) => {
				expect(profile.bio).not.to.eq('Hijacked');
			});
		});

		it('still lets the owner update their own profile', () => {
			cy.then(() => updateProfileViaApi(ownerToken, ownerId, { bio: 'Written by me' }))
				.its('status')
				.should('eq', 200);

			cy.then(() => getProfileViaApi(ownerId))
				.its('bio')
				.should('eq', 'Written by me');
		});

		it('rejects following on behalf of another user and changes no followers', () => {
			cy.then(() => getProfileViaApi(targetId)).then((before) => {
				cy.then(() => followUserViaApi(attackerToken, targetId, { actingUserId: ownerId, failOnStatusCode: false })).then(
					expectProfileForbidden,
				);

				cy.then(() => getProfileViaApi(targetId)).then((after) => {
					expect(after.followers).to.deep.eq(before.followers);
				});
			});
		});

		it('rejects unfollowing on behalf of another user and keeps the follow', () => {
			cy.then(() => followUserViaApi(ownerToken, targetId));

			cy.then(() => unfollowUserViaApi(attackerToken, targetId, { actingUserId: ownerId, failOnStatusCode: false })).then(
				expectProfileForbidden,
			);

			cy.then(() => getProfileViaApi(targetId)).then((profile) => {
				expect(profile.followers).to.include(ownerId);
			});
		});

		it('still lets a user follow and unfollow as themselves', () => {
			cy.then(() => followUserViaApi(attackerToken, targetId))
				.its('status')
				.should('eq', 200);

			cy.then(() => getProfileViaApi(targetId)).then((profile) => {
				expect(profile.followers).to.include(attackerId);
			});

			cy.then(() => unfollowUserViaApi(attackerToken, targetId))
				.its('status')
				.should('eq', 200);

			cy.then(() => getProfileViaApi(targetId)).then((profile) => {
				expect(profile.followers).not.to.include(attackerId);
			});
		});

		it('answers 401 rather than 403 when there is no token', () => {
			cy.request({
				method: 'PATCH',
				url: `${serverUrl}/users/update/${ownerId}`,
				body: { bio: 'Hijacked' },
				failOnStatusCode: false,
			})
				.its('status')
				.should('eq', 401);
		});
	});

	describe('email privacy', () => {
		const requestProfiles = (userIds, headers = {}) =>
			cy.request({ method: 'GET', url: `${serverUrl}/users?userIds=${userIds.join(',')}`, headers });

		it('leaves the email out of the response for a guest', () => {
			cy.then(() => getProfileViaApi(ownerId)).then((profile) => {
				expect(profile).to.have.property('username', owner.username);
				expect(profile).not.to.have.property('email');
			});
		});

		it('leaves the email out of the response for another logged-in user', () => {
			cy.then(() => getProfileViaApi(ownerId, attackerToken)).then((profile) => {
				expect(profile).not.to.have.property('email');
			});
		});

		it('leaves the email out of the response when the token is invalid', () => {
			cy.then(() => requestProfiles([ownerId], { 'X-Authorization': 'not.a.valid.token' })).then((response) => {
				expect(response.status).to.eq(200);
				expect(response.body[0]).not.to.have.property('email');
			});
		});

		it('returns the email to the account owner', () => {
			cy.then(() => getProfileViaApi(ownerId, ownerToken))
				.its('email')
				.should('eq', owner.email);
		});

		it("returns the email only on the requester's own profile when several profiles are requested", () => {
			cy.then(() => requestProfiles([ownerId, attackerId], { 'X-Authorization': ownerToken })).then((response) => {
				const ownerProfile = response.body.find((profile) => profile._id === ownerId);
				const attackerProfile = response.body.find((profile) => profile._id === attackerId);

				expect(ownerProfile).to.have.property('email', owner.email);
				expect(attackerProfile).not.to.have.property('email');
			});
		});

		it('exposes neither the email nor the password hash of followed users in the followed posts', () => {
			cy.then(() => followUserViaApi(ownerToken, targetId));

			cy.then(() => getFollowedUsersPostsViaApi(ownerToken)).then((followedPosts) => {
				expect(followedPosts).to.have.length.greaterThan(0);

				followedPosts.forEach((post) => {
					expect(post.userId).to.have.property('username', target.username);
					expect(post.userId).not.to.have.property('email');
					expect(post.userId).not.to.have.property('password');
				});
			});
		});
	});

	describe('followed users posts', () => {
		it("lists a followed user's posts but not their profile picture", () => {
			cy.then(() => uploadProfilePictureViaApi(targetToken)).then((picture) => {
				cy.then(() => followUserViaApi(ownerToken, targetId));

				cy.then(() => getFollowedUsersPostsViaApi(ownerToken)).then((followedPosts) => {
					const imageUrls = followedPosts.map((post) => post.imageUrl);

					expect(followedPosts).to.have.length(1);
					expect(imageUrls).not.to.include(picture.imageUrl);
					expect(followedPosts[0].userId.profilePicture).to.have.property('imageUrl', picture.imageUrl);
				});
			});
		});
	});

	describe('followers and following endpoints', () => {
		const slimRowFields = ['_id', 'username', 'profilePicture', 'followersCount'];

		const expectSlimRows = (rows) => {
			rows.forEach((row) => {
				Object.keys(row).forEach((field) => expect(slimRowFields).to.include(field));
				['email', 'password', 'followers', 'following', 'posts', 'bio'].forEach((field) => expect(row).not.to.have.property(field));
			});
		};

		beforeEach(() => {
			cy.then(() => followUserViaApi(attackerToken, targetId));
			cy.then(() => followUserViaApi(ownerToken, targetId));
		});

		it('returns slim rows with no email to a guest', () => {
			cy.then(() => getFollowersViaApi(targetId)).then((rows) => {
				expect(rows.map((row) => row._id)).to.include.members([ownerId, attackerId]);
				expectSlimRows(rows);
			});
		});

		it('returns each row with a username and the follower count', () => {
			cy.then(() => getFollowersViaApi(targetId)).then((rows) => {
				const ownerRow = rows.find((row) => row._id === ownerId);

				expect(ownerRow).to.have.property('username', owner.username);
				expect(ownerRow.followersCount).to.be.a('number');
			});
		});

		it('puts the logged-in requester first', () => {
			cy.then(() => getFollowersViaApi(targetId, attackerToken)).then((rows) => {
				expect(rows[0]._id).to.eq(attackerId);
				expectSlimRows(rows);
			});

			cy.then(() => getFollowersViaApi(targetId, ownerToken)).then((rows) => {
				expect(rows[0]._id).to.eq(ownerId);
			});
		});

		it('lists the users a profile follows in the following endpoint', () => {
			cy.then(() => getFollowingViaApi(ownerId, ownerToken)).then((rows) => {
				expect(rows.map((row) => row._id)).to.include(targetId);
				expectSlimRows(rows);
			});
		});

		it('answers 404 USER_NOT_FOUND for a malformed user id', () => {
			cy.request({ method: 'GET', url: `${serverUrl}/users/not-an-id/followers`, failOnStatusCode: false }).then((response) => {
				expect(response.status).to.eq(404);
				expect(response.body).to.have.property('code', 'USER_NOT_FOUND');
			});
		});
	});

	describe('profile post data', () => {
		it('includes a comment count on every profile post', () => {
			cy.then(() => getProfileViaApi(targetId)).then((profile) => {
				expect(profile.posts).to.have.length(1);
				expect(profile.posts[0]).to.have.property('commentsCount', 0);
			});
		});
	});
});

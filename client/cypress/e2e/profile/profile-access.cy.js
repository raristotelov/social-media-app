import { buildTestUser } from '../../support/testUser';
import {
	serverUrl,
	authHeaders,
	cookieHeader,
	createUserViaApi,
	loginViaApi,
	userIdFromSession,
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

	let ownerSession;
	let attackerSession;
	let targetSession;
	let ownerId;
	let attackerId;
	let targetId;

	before(() => {
		createUserViaApi(owner);
		createUserViaApi(attacker);
		createUserViaApi(target);

		loginViaApi(owner).then((session) => {
			ownerSession = session;
			ownerId = userIdFromSession(session);
		});

		loginViaApi(attacker).then((session) => {
			attackerSession = session;
			attackerId = userIdFromSession(session);
		});

		loginViaApi(target).then((session) => {
			targetSession = session;
			targetId = userIdFromSession(session);
		});

		cy.then(() => uploadPostViaApi(targetSession, 'A post by the target'));
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
			cy.then(() => updateProfileViaApi(attackerSession, ownerId, { bio: 'Hijacked' }, false)).then(expectProfileForbidden);

			cy.then(() => getProfileViaApi(ownerId)).then((profile) => {
				expect(profile.bio).not.to.eq('Hijacked');
			});
		});

		it('still lets the owner update their own profile', () => {
			cy.then(() => updateProfileViaApi(ownerSession, ownerId, { bio: 'Written by me' }))
				.its('status')
				.should('eq', 200);

			cy.then(() => getProfileViaApi(ownerId))
				.its('bio')
				.should('eq', 'Written by me');
		});

		it('rejects following on behalf of another user and changes no followers', () => {
			cy.then(() => getProfileViaApi(targetId)).then((before) => {
				cy.then(() => followUserViaApi(attackerSession, targetId, { actingUserId: ownerId, failOnStatusCode: false })).then(
					expectProfileForbidden,
				);

				cy.then(() => getProfileViaApi(targetId)).then((after) => {
					expect(after.followers).to.deep.eq(before.followers);
				});
			});
		});

		it('rejects unfollowing on behalf of another user and keeps the follow', () => {
			cy.then(() => followUserViaApi(ownerSession, targetId));

			cy.then(() => unfollowUserViaApi(attackerSession, targetId, { actingUserId: ownerId, failOnStatusCode: false })).then(
				expectProfileForbidden,
			);

			cy.then(() => getProfileViaApi(targetId)).then((profile) => {
				expect(profile.followers).to.include(ownerId);
			});
		});

		it('still lets a user follow and unfollow as themselves', () => {
			cy.then(() => followUserViaApi(attackerSession, targetId))
				.its('status')
				.should('eq', 200);

			cy.then(() => getProfileViaApi(targetId)).then((profile) => {
				expect(profile.followers).to.include(attackerId);
			});

			cy.then(() => unfollowUserViaApi(attackerSession, targetId))
				.its('status')
				.should('eq', 200);

			cy.then(() => getProfileViaApi(targetId)).then((profile) => {
				expect(profile.followers).not.to.include(attackerId);
			});
		});

		it('answers 401 rather than 403 when there is no session cookie', () => {
			cy.request({
				method: 'PATCH',
				url: `${serverUrl}/users/update/${ownerId}`,
				headers: cookieHeader(''),
				body: { bio: 'Hijacked' },
				failOnStatusCode: false,
			})
				.its('status')
				.should('eq', 401);
		});
	});

	describe('email privacy', () => {
		const requestProfiles = (userIds, headers = cookieHeader('')) =>
			cy.request({ method: 'GET', url: `${serverUrl}/users?userIds=${userIds.join(',')}`, headers });

		it('leaves the email out of the response for a guest', () => {
			cy.then(() => getProfileViaApi(ownerId)).then((profile) => {
				expect(profile).to.have.property('username', owner.username);
				expect(profile).not.to.have.property('email');
			});
		});

		it('leaves the email out of the response for another logged-in user', () => {
			cy.then(() => getProfileViaApi(ownerId, attackerSession)).then((profile) => {
				expect(profile).not.to.have.property('email');
			});
		});

		it('leaves the email out of the response when the session cookie is invalid', () => {
			cy.then(() => requestProfiles([ownerId], cookieHeader('not.a.valid.token'))).then((response) => {
				expect(response.status).to.eq(200);
				expect(response.body[0]).not.to.have.property('email');
			});
		});

		it('returns the email to the account owner', () => {
			cy.then(() => getProfileViaApi(ownerId, ownerSession))
				.its('email')
				.should('eq', owner.email);
		});

		it("returns the email only on the requester's own profile when several profiles are requested", () => {
			cy.then(() => requestProfiles([ownerId, attackerId], authHeaders(ownerSession))).then((response) => {
				const ownerProfile = response.body.find((profile) => profile._id === ownerId);
				const attackerProfile = response.body.find((profile) => profile._id === attackerId);

				expect(ownerProfile).to.have.property('email', owner.email);
				expect(attackerProfile).not.to.have.property('email');
			});
		});

		it('exposes neither the email nor the password hash of followed users in the followed posts', () => {
			cy.then(() => followUserViaApi(ownerSession, targetId));

			cy.then(() => getFollowedUsersPostsViaApi(ownerSession)).then((followedPosts) => {
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
			cy.then(() => uploadProfilePictureViaApi(targetSession)).then((picture) => {
				cy.then(() => followUserViaApi(ownerSession, targetId));

				cy.then(() => getFollowedUsersPostsViaApi(ownerSession)).then((followedPosts) => {
					const imageUrls = followedPosts.map((post) => post.imageUrl);

					expect(followedPosts).to.have.length(1);
					expect(imageUrls).not.to.include(picture.imageUrl);
					expect(followedPosts[0].userId.profilePicture).to.have.property('imageUrl', picture.imageUrl);
				});
			});
		});
	});

	describe('followers and following endpoints', () => {
		const slimRowFields = ['_id', 'username', 'profilePicture'];

		const expectSlimRows = (rows) => {
			rows.forEach((row) => {
				Object.keys(row).forEach((field) => expect(slimRowFields).to.include(field));
				['email', 'password', 'followers', 'following', 'posts', 'bio'].forEach((field) => expect(row).not.to.have.property(field));
			});
		};

		beforeEach(() => {
			cy.then(() => followUserViaApi(attackerSession, targetId));
			cy.then(() => followUserViaApi(ownerSession, targetId));
		});

		it('returns slim rows with no email to a guest', () => {
			cy.then(() => getFollowersViaApi(targetId)).then((rows) => {
				expect(rows.map((row) => row._id)).to.include.members([ownerId, attackerId]);
				expectSlimRows(rows);
			});
		});

		it('returns each row with a username and no follower count', () => {
			cy.then(() => getFollowersViaApi(targetId)).then((rows) => {
				const ownerRow = rows.find((row) => row._id === ownerId);

				expect(ownerRow).to.have.property('username', owner.username);
				expect(ownerRow).not.to.have.property('followersCount');
			});
		});

		it('puts the logged-in requester first', () => {
			cy.then(() => getFollowersViaApi(targetId, attackerSession)).then((rows) => {
				expect(rows[0]._id).to.eq(attackerId);
				expectSlimRows(rows);
			});

			cy.then(() => getFollowersViaApi(targetId, ownerSession)).then((rows) => {
				expect(rows[0]._id).to.eq(ownerId);
			});
		});

		it('lists the users a profile follows in the following endpoint', () => {
			cy.then(() => getFollowingViaApi(ownerId, ownerSession)).then((rows) => {
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

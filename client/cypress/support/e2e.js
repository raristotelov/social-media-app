// Loaded before every e2e spec.
//
// Specs run against the local dev database with its real data. A spec that needs
// records creates them and deletes only those; it never clears the database. Test
// accounts use the cypress+<unique>@test.local convention from ./testUser.js.
//
// A spec that creates a known user should delete it in its own after() hook via the
// deleteTestUser task. The sweep below is only a safety net, catching accounts left
// behind by a spec that died before its own cleanup ran.

after(() => {
	cy.task('cleanTestUsers').then((removed) => {
		if (removed.users) {
			cy.log(
				`swept ${removed.users} leftover test users, ${removed.posts} posts, ${removed.comments} comments, ${removed.stories} stories, ${removed.storyViews} story views`,
			);
		}
	});
});

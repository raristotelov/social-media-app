jest.mock('../models/userModel');
jest.mock('../models/demoScheduledEventModel');
jest.mock('./scheduledEvents');

const DemoScheduledEventModel = require('../models/demoScheduledEventModel');
const UserModel = require('../models/userModel');
const { applyFollow, runReaction, scheduleReactions, storeScheduledEvents } = require('./reactionDelivery');
const { applyEvent } = require('./scheduledEvents');

const NOW = new Date('2026-11-03T12:00:00.000Z');
const PERSONA_ID = 'persona1';
const VISITOR_ID = 'visitor1';

const followEvent = (dueAt) => ({ type: 'follow', userId: PERSONA_ID, targetUserId: VISITOR_ID, dueAt });

describe('reactionDelivery', () => {
	let consoleErrorSpy;

	beforeEach(() => {
		jest.resetAllMocks();
		consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		jest.useRealTimers();
		consoleErrorSpy.mockRestore();
	});

	describe('applyFollow', () => {
		it('should add the follower to the target and the target to the following of the follower', async () => {
			UserModel.updateOne.mockResolvedValue({ matchedCount: 1 });

			await applyFollow(followEvent(NOW));

			expect(UserModel.updateOne).toHaveBeenCalledWith({ _id: VISITOR_ID }, { $addToSet: { followers: PERSONA_ID } });
			expect(UserModel.updateOne).toHaveBeenCalledWith({ _id: PERSONA_ID }, { $addToSet: { following: VISITOR_ID } });
		});

		it('should not touch the follower when the target no longer exists', async () => {
			UserModel.updateOne.mockResolvedValue({ matchedCount: 0 });

			await applyFollow(followEvent(NOW));

			expect(UserModel.updateOne).toHaveBeenCalledTimes(1);
		});
	});

	describe('runReaction', () => {
		it('should apply a follow as a follow', async () => {
			UserModel.updateOne.mockResolvedValue({ matchedCount: 1 });

			await runReaction(followEvent(NOW));

			expect(UserModel.updateOne).toHaveBeenCalledTimes(2);
			expect(applyEvent).not.toHaveBeenCalled();
		});

		it.each(['postLike', 'comment'])('should hand a %s to the scheduled event applier', async (type) => {
			const event = { type, userPostId: 'post1', userId: PERSONA_ID, dueAt: NOW };

			await runReaction(event);

			expect(applyEvent).toHaveBeenCalledWith(event);
			expect(UserModel.updateOne).not.toHaveBeenCalled();
		});

		it('should log a failure instead of throwing', async () => {
			const cause = new Error('connection lost');

			UserModel.updateOne.mockRejectedValue(cause);

			await expect(runReaction(followEvent(NOW))).resolves.toBeUndefined();
			expect(consoleErrorSpy).toHaveBeenCalledWith('Could not apply a demo reaction', cause);
		});
	});

	describe('scheduleReactions', () => {
		beforeEach(() => {
			jest.useFakeTimers({ now: NOW });
			UserModel.updateOne.mockResolvedValue({ matchedCount: 1 });
		});

		it('should not apply a reaction before it is due', () => {
			scheduleReactions([followEvent(new Date(NOW.getTime() + 60 * 1000))]);

			jest.advanceTimersByTime(59 * 1000);

			expect(UserModel.updateOne).not.toHaveBeenCalled();
		});

		it('should apply a reaction once it is due', async () => {
			scheduleReactions([followEvent(new Date(NOW.getTime() + 60 * 1000))]);

			await jest.advanceTimersByTimeAsync(60 * 1000);

			expect(UserModel.updateOne).toHaveBeenCalledTimes(2);
		});

		it('should apply the reactions one at a time, each at its own moment', async () => {
			scheduleReactions([followEvent(new Date(NOW.getTime() + 30 * 1000)), followEvent(new Date(NOW.getTime() + 120 * 1000))]);

			await jest.advanceTimersByTimeAsync(30 * 1000);

			expect(UserModel.updateOne).toHaveBeenCalledTimes(2);

			await jest.advanceTimersByTimeAsync(90 * 1000);

			expect(UserModel.updateOne).toHaveBeenCalledTimes(4);
		});

		it('should apply a reaction that is already overdue straight away', async () => {
			scheduleReactions([followEvent(new Date(NOW.getTime() - 5000))]);

			await jest.advanceTimersByTimeAsync(0);

			expect(UserModel.updateOne).toHaveBeenCalledTimes(2);
		});

		it('should schedule nothing for an empty list', () => {
			scheduleReactions([]);

			expect(jest.getTimerCount()).toBe(0);
		});

		it('should not keep the process alive for a reaction that is not due yet', () => {
			const unref = jest.fn();
			const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockReturnValue({ unref });

			scheduleReactions([followEvent(new Date(NOW.getTime() + 60 * 1000))]);

			expect(unref).toHaveBeenCalledTimes(1);

			setTimeoutSpy.mockRestore();
		});

		it('should keep delivering the other reactions when one fails', async () => {
			UserModel.updateOne.mockRejectedValueOnce(new Error('connection lost')).mockResolvedValue({ matchedCount: 1 });

			scheduleReactions([followEvent(new Date(NOW.getTime() + 10 * 1000)), followEvent(new Date(NOW.getTime() + 20 * 1000))]);

			await jest.advanceTimersByTimeAsync(20 * 1000);

			expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
			expect(UserModel.updateOne).toHaveBeenCalledTimes(3);
		});
	});

	describe('storeScheduledEvents', () => {
		it('should store the events for the hourly job', async () => {
			const events = [{ type: 'postLike', userPostId: 'post1', userId: PERSONA_ID, dueAt: NOW }];

			await storeScheduledEvents(events);

			expect(DemoScheduledEventModel.insertMany).toHaveBeenCalledWith(events);
		});

		it('should not touch the database when there is nothing to store', async () => {
			await storeScheduledEvents([]);

			expect(DemoScheduledEventModel.insertMany).not.toHaveBeenCalled();
		});
	});
});

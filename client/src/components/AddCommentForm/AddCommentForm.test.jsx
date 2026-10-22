import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';

import AddCommentForm from './AddCommentForm';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
	...jest.requireActual('react-router-dom'),
	useNavigate: () => mockNavigate,
}));

const loggedInUser = { _id: 'user1', username: 'johndoe' };

const buildDeferred = () => {
	const deferred = {};

	deferred.promise = new Promise((resolve, reject) => {
		deferred.resolve = resolve;
		deferred.reject = reject;
	});

	return deferred;
};

const renderForm = ({ user = loggedInUser, entry = '/user-feed', endSession = jest.fn(), ...props } = {}) => {
	const onSubmit = props.onSubmit ?? jest.fn().mockResolvedValue(undefined);

	const rendered = render(
		<LoggedInUserContext.Provider value={{ jwtToken: 'token123', loggedInUser: user, endSession }}>
			<MemoryRouter initialEntries={[entry]}>
				<AddCommentForm {...props} onSubmit={onSubmit} />
			</MemoryRouter>
		</LoggedInUserContext.Provider>,
	);

	return { ...rendered, onSubmit, endSession };
};

const getInput = () => screen.getByPlaceholderText('Add a comment...');

const getPostButton = () => screen.getByRole('button', { name: 'Post' });

describe('AddCommentForm', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('Post button state', () => {
		it('is disabled while the box is empty', () => {
			renderForm();

			expect(getPostButton()).toBeDisabled();
		});

		it('is disabled while the box holds only spaces', () => {
			renderForm();

			userEvent.type(getInput(), '    ');

			expect(getPostButton()).toBeDisabled();
		});

		it('is enabled once the box holds text', () => {
			renderForm();

			userEvent.type(getInput(), 'Nice shot');

			expect(getPostButton()).toBeEnabled();
		});

		it('is disabled again after the text is deleted', () => {
			renderForm();

			userEvent.type(getInput(), 'Nice shot');
			userEvent.clear(getInput());

			expect(getPostButton()).toBeDisabled();
		});

		it('is disabled, together with the box, when the form is disabled', () => {
			renderForm({ isDisabled: true });

			expect(getInput()).toBeDisabled();
			expect(getPostButton()).toBeDisabled();
		});
	});

	describe('submitting', () => {
		it('calls onSubmit with the text when Post is clicked', async () => {
			const { onSubmit } = renderForm();

			userEvent.type(getInput(), 'Nice shot');
			userEvent.click(getPostButton());

			await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Nice shot'));
		});

		it('submits when Enter is pressed in the box', async () => {
			const { onSubmit } = renderForm();

			userEvent.type(getInput(), 'Nice shot{enter}');

			await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Nice shot'));
		});

		it('clears the box after a successful submit', async () => {
			renderForm();

			userEvent.type(getInput(), 'Nice shot');
			userEvent.click(getPostButton());

			await waitFor(() => expect(getInput()).toHaveValue(''));
		});

		it('sends no request when the box is empty', () => {
			const { onSubmit, container } = renderForm();

			fireEvent.submit(container.querySelector('form'));

			expect(onSubmit).not.toHaveBeenCalled();
		});

		it('sends no request when the box holds only spaces', () => {
			const { onSubmit, container } = renderForm();

			userEvent.type(getInput(), '   ');
			fireEvent.submit(container.querySelector('form'));

			expect(onSubmit).not.toHaveBeenCalled();
		});

		it('disables Post while the request is in flight', async () => {
			const request = buildDeferred();

			renderForm({ onSubmit: jest.fn().mockReturnValue(request.promise) });

			userEvent.type(getInput(), 'Nice shot');
			userEvent.click(getPostButton());

			expect(getPostButton()).toBeDisabled();

			request.resolve();
			await waitFor(() => expect(getInput()).toHaveValue(''));
		});

		it('sends one request when the form is submitted twice before the first returns', async () => {
			const request = buildDeferred();
			const { onSubmit, container } = renderForm({ onSubmit: jest.fn().mockReturnValue(request.promise) });

			userEvent.type(getInput(), 'Nice shot');
			fireEvent.submit(container.querySelector('form'));
			fireEvent.submit(container.querySelector('form'));

			expect(onSubmit).toHaveBeenCalledTimes(1);

			request.resolve();
			await waitFor(() => expect(getInput()).toHaveValue(''));
		});
	});

	describe('errors', () => {
		const submitFailing = async (error, props = {}) => {
			const rendered = renderForm({ onSubmit: jest.fn().mockRejectedValue(error), ...props });

			userEvent.type(getInput(), 'Nice shot');
			userEvent.click(getPostButton());

			await waitFor(() => expect(rendered.onSubmit).toHaveBeenCalledTimes(1));

			return rendered;
		};

		it.each([
			['COMMENT_TEXT_REQUIRED', 400, "Comment can't be empty"],
			['COMMENT_NOT_FOUND', 404, 'This comment no longer exists'],
			['POST_NOT_FOUND', 404, 'This post no longer exists'],
		])('shows the %s copy as the form message', async (code, status, copy) => {
			await submitFailing({ code, status });

			expect(await screen.findByRole('alert')).toHaveTextContent(copy);
		});

		it('shows the add-comment fallback copy for INTERNAL_ERROR', async () => {
			await submitFailing({ code: 'INTERNAL_ERROR', status: 500 });

			expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't post your comment. Try again.");
		});

		it('shows the fallback copy when the failure is not a request error', async () => {
			await submitFailing(new Error('network down'));

			expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't post your comment. Try again.");
		});

		it('shows the fallback copy it was given, such as the reply one', async () => {
			await submitFailing({ code: 'INTERNAL_ERROR', status: 500 }, { fallbackMessage: "Couldn't post your reply. Try again." });

			expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't post your reply. Try again.");
		});

		it('keeps the typed text after a failure', async () => {
			await submitFailing({ code: 'INTERNAL_ERROR', status: 500 });

			await screen.findByRole('alert');
			expect(getInput()).toHaveValue('Nice shot');
		});

		it('enables Post again after a failure', async () => {
			await submitFailing({ code: 'INTERNAL_ERROR', status: 500 });

			await screen.findByRole('alert');
			expect(getPostButton()).toBeEnabled();
		});

		it('ends the session and shows no message for UNAUTHENTICATED', async () => {
			const { endSession } = await submitFailing({ code: 'UNAUTHENTICATED', status: 401 });

			await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
			expect(screen.queryByRole('alert')).not.toBeInTheDocument();
		});

		it('does not end the session for any other failure', async () => {
			const { endSession } = await submitFailing({ code: 'INTERNAL_ERROR', status: 500 });

			await screen.findByRole('alert');
			expect(endSession).not.toHaveBeenCalled();
		});

		it('clears the message when the user types again', async () => {
			await submitFailing({ code: 'INTERNAL_ERROR', status: 500 });

			await screen.findByRole('alert');
			userEvent.type(getInput(), '!');

			expect(screen.queryByRole('alert')).not.toBeInTheDocument();
		});

		it('clears the message when submitting again', async () => {
			const request = buildDeferred();
			const { onSubmit } = renderForm({
				onSubmit: jest.fn().mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 }).mockReturnValueOnce(request.promise),
			});

			userEvent.type(getInput(), 'Nice shot');
			userEvent.click(getPostButton());
			await screen.findByRole('alert');

			userEvent.click(getPostButton());

			expect(screen.queryByRole('alert')).not.toBeInTheDocument();
			await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));

			request.resolve();
			await waitFor(() => expect(getInput()).toHaveValue(''));
		});
	});

	describe('initial text', () => {
		it('fills the box with it', () => {
			renderForm({ initialText: '@alice ' });

			expect(getInput()).toHaveValue('@alice ');
		});

		it('keeps Post disabled while the box holds only the initial text', () => {
			renderForm({ initialText: '@alice ' });

			expect(getPostButton()).toBeDisabled();
		});

		it('keeps Post disabled when the initial text is left without its trailing space', () => {
			renderForm({ initialText: '@alice ' });

			userEvent.type(getInput(), '{backspace}');

			expect(getPostButton()).toBeDisabled();
		});

		it('enables Post once text is added after the initial text', () => {
			renderForm({ initialText: '@alice ' });

			userEvent.type(getInput(), 'thanks');

			expect(getPostButton()).toBeEnabled();
		});

		it('disables Post when the initial text is deleted', () => {
			renderForm({ initialText: '@alice ' });

			userEvent.clear(getInput());

			expect(getPostButton()).toBeDisabled();
		});

		it('enables Post when the initial text is replaced by other text', () => {
			renderForm({ initialText: '@alice ' });

			userEvent.clear(getInput());
			userEvent.type(getInput(), 'hello');

			expect(getPostButton()).toBeEnabled();
		});

		it('sends no request when submitted with only the initial text', () => {
			const { onSubmit, container } = renderForm({ initialText: '@alice ' });

			fireEvent.submit(container.querySelector('form'));

			expect(onSubmit).not.toHaveBeenCalled();
		});

		it('submits the initial text together with what was typed after it', async () => {
			const { onSubmit } = renderForm({ initialText: '@alice ' });

			userEvent.type(getInput(), 'thanks');
			userEvent.click(getPostButton());

			await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('@alice thanks'));
		});

		it('clears the box after a successful submit', async () => {
			renderForm({ initialText: '@alice ' });

			userEvent.type(getInput(), 'thanks');
			userEvent.click(getPostButton());

			await waitFor(() => expect(getInput()).toHaveValue(''));
		});
	});

	describe('as a guest', () => {
		it('sends the guest to /log-in with the current URL, hash included, when the box is clicked', () => {
			renderForm({ user: null, entry: '/user/user2/posts#post7' });

			userEvent.click(getInput());

			expect(mockNavigate).toHaveBeenCalledWith('/log-in', { state: { from: '/user/user2/posts#post7' } });
		});

		it('sends the guest to /log-in with the current URL when the form is submitted, for example by Enter', () => {
			const { container } = renderForm({ user: null, entry: '/user/user2/posts#post7' });

			fireEvent.submit(container.querySelector('form'));

			expect(mockNavigate).toHaveBeenCalledWith('/log-in', { state: { from: '/user/user2/posts#post7' } });
		});

		it('sends a user whose session ended while typing to /log-in on submit, without calling onSubmit', () => {
			const { onSubmit, container, rerender } = renderForm({ entry: '/user/user2/posts#post7' });

			userEvent.type(getInput(), 'Nice shot');

			rerender(
				<LoggedInUserContext.Provider value={{ jwtToken: null, loggedInUser: null, endSession: jest.fn() }}>
					<MemoryRouter initialEntries={['/user/user2/posts#post7']}>
						<AddCommentForm onSubmit={onSubmit} />
					</MemoryRouter>
				</LoggedInUserContext.Provider>,
			);

			fireEvent.submit(container.querySelector('form'));

			expect(mockNavigate).toHaveBeenCalledWith('/log-in', { state: { from: '/user/user2/posts#post7' } });
			expect(onSubmit).not.toHaveBeenCalled();
		});

		it('never calls onSubmit', () => {
			const { onSubmit } = renderForm({ user: null });

			userEvent.click(getInput());
			userEvent.click(getPostButton());

			expect(onSubmit).not.toHaveBeenCalled();
		});

		it('does not redirect when the box only receives focus', () => {
			renderForm({ user: null });

			fireEvent.focus(getInput());

			expect(mockNavigate).not.toHaveBeenCalled();
		});

		it('does not redirect when the guest tabs into the box', () => {
			renderForm({ user: null });

			userEvent.tab();

			expect(getInput()).toHaveFocus();
			expect(mockNavigate).not.toHaveBeenCalled();
		});

		it('keeps the box read-only', () => {
			renderForm({ user: null });

			expect(getInput()).toHaveAttribute('readonly');
		});

		it('shows Post disabled, like an empty box for a logged-in user', () => {
			renderForm({ user: null });

			expect(getPostButton()).toBeDisabled();
		});

		it('does not redirect when the disabled Post is clicked', () => {
			renderForm({ user: null });

			userEvent.click(getPostButton());

			expect(mockNavigate).not.toHaveBeenCalled();
		});
	});

	describe('as a logged-in user', () => {
		it('does not redirect when the box is clicked', () => {
			renderForm();

			userEvent.click(getInput());

			expect(mockNavigate).not.toHaveBeenCalled();
		});

		it('lets the user type in the box', () => {
			renderForm();

			expect(getInput()).not.toHaveAttribute('readonly');
		});
	});

	describe('focus on mount', () => {
		it('does not focus the box by default', () => {
			renderForm();

			expect(getInput()).not.toHaveFocus();
		});

		it('does not focus the box when shouldFocusOnMount is false', () => {
			renderForm({ shouldFocusOnMount: false, initialText: '@alice ' });

			expect(getInput()).not.toHaveFocus();
		});

		it('focuses the box when shouldFocusOnMount is set', () => {
			renderForm({ shouldFocusOnMount: true });

			expect(getInput()).toHaveFocus();
		});

		it('puts the caret at the end of the initial text', () => {
			renderForm({ shouldFocusOnMount: true, initialText: '@alice ' });

			expect([getInput().selectionStart, getInput().selectionEnd]).toEqual([7, 7]);
		});

		it('puts the caret after a long initial text, not at the start', () => {
			renderForm({ shouldFocusOnMount: true, initialText: '@alice_in_wonderland_1234 ' });

			expect(getInput().selectionStart).toBe('@alice_in_wonderland_1234 '.length);
		});

		it('keeps the initial text intact when focusing', () => {
			renderForm({ shouldFocusOnMount: true, initialText: '@alice ' });

			expect(getInput()).toHaveValue('@alice ');
		});

		it('lets the next typed characters land after the mention', () => {
			renderForm({ shouldFocusOnMount: true, initialText: '@alice ' });

			userEvent.keyboard('thanks');

			expect(getInput()).toHaveValue('@alice thanks');
		});

		it('focuses an empty box without error', () => {
			renderForm({ shouldFocusOnMount: true });

			expect(getInput().selectionStart).toBe(0);
		});
	});

	describe('custom placeholder', () => {
		it('uses the placeholder it was given for the box and its label', () => {
			renderForm({ placeholder: 'Write a reply...' });

			expect(screen.getByPlaceholderText('Write a reply...')).toBeInTheDocument();
			expect(screen.getByLabelText('Write a reply...')).toBeInTheDocument();
		});
	});
});

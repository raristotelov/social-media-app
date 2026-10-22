import { act, renderHook } from '@testing-library/react';

import usePostActionsMenu from './usePostActionsMenu';

const renderMenuHook = () => {
	const rendered = renderHook(() => usePostActionsMenu());
	const menuContainer = document.createElement('div');
	const insideElement = document.createElement('button');
	const outsideElement = document.createElement('div');

	menuContainer.appendChild(insideElement);
	document.body.appendChild(menuContainer);
	document.body.appendChild(outsideElement);
	rendered.result.current.menuContainerRef.current = menuContainer;

	return { ...rendered, menuContainer, insideElement, outsideElement };
};

const fireMouseDown = (element) => {
	act(() => {
		element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
	});
};

const fireKeyDown = (key) => {
	act(() => {
		document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
	});
};

describe('usePostActionsMenu', () => {
	afterEach(() => {
		document.body.innerHTML = '';
	});

	it('starts closed', () => {
		const { result } = renderMenuHook();

		expect(result.current.isMenuOpen).toBe(false);
	});

	it('opens when toggled', () => {
		const { result } = renderMenuHook();

		act(() => result.current.toggleMenu());

		expect(result.current.isMenuOpen).toBe(true);
	});

	it('closes when toggled twice', () => {
		const { result } = renderMenuHook();

		act(() => result.current.toggleMenu());
		act(() => result.current.toggleMenu());

		expect(result.current.isMenuOpen).toBe(false);
	});

	it('closes when closeMenu is called', () => {
		const { result } = renderMenuHook();

		act(() => result.current.toggleMenu());
		act(() => result.current.closeMenu());

		expect(result.current.isMenuOpen).toBe(false);
	});

	it('closes on a mousedown outside the menu container', () => {
		const { result, outsideElement } = renderMenuHook();

		act(() => result.current.toggleMenu());
		fireMouseDown(outsideElement);

		expect(result.current.isMenuOpen).toBe(false);
	});

	it('stays open on a mousedown inside the menu container', () => {
		const { result, insideElement } = renderMenuHook();

		act(() => result.current.toggleMenu());
		fireMouseDown(insideElement);

		expect(result.current.isMenuOpen).toBe(true);
	});

	it('closes on Escape', () => {
		const { result } = renderMenuHook();

		act(() => result.current.toggleMenu());
		fireKeyDown('Escape');

		expect(result.current.isMenuOpen).toBe(false);
	});

	it('stays open on any other key', () => {
		const { result } = renderMenuHook();

		act(() => result.current.toggleMenu());
		fireKeyDown('a');

		expect(result.current.isMenuOpen).toBe(true);
	});

	it('does not listen for outside clicks while closed', () => {
		const addEventListenerSpy = jest.spyOn(document, 'addEventListener');

		renderMenuHook();

		expect(addEventListenerSpy).not.toHaveBeenCalledWith('mousedown', expect.any(Function));

		addEventListenerSpy.mockRestore();
	});

	it('removes its listeners once the menu closes', () => {
		const removeEventListenerSpy = jest.spyOn(document, 'removeEventListener');
		const { result } = renderMenuHook();

		act(() => result.current.toggleMenu());
		act(() => result.current.closeMenu());

		expect(removeEventListenerSpy).toHaveBeenCalledWith('mousedown', expect.any(Function));
		expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));

		removeEventListenerSpy.mockRestore();
	});
});

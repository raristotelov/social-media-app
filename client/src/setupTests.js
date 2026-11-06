import '@testing-library/jest-dom/vitest';

globalThis.jest = { advanceTimersByTime: (milliseconds) => vi.advanceTimersByTime(milliseconds) };

globalThis.AnimationEvent ??= class AnimationEvent extends Event {};

Element.prototype.scrollIntoView = () => {};

import '@testing-library/jest-dom';

// jsdom doesn't implement scrollIntoView (used by ChatBox auto-scroll).
window.HTMLElement.prototype.scrollIntoView = () => {};

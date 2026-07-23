import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '../../../tests/helpers/render';
import { resetAllStores } from '../../../tests/helpers/store';
import AboutTab from './AboutTab';

beforeEach(() => {
  resetAllStores();
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('AboutTab', () => {
  it('FE-COMP-ABOUT-001: renders without crashing', () => {
    render(<AboutTab appVersion="2.9.10" />);
    expect(document.body).toBeDefined();
  });

  it('FE-COMP-ABOUT-002: displays the version badge', () => {
    render(<AboutTab appVersion="2.9.10" />);
    expect(screen.getByText('v2.9.10')).toBeDefined();
  });

  it('FE-COMP-ABOUT-003: displays Telegram link with correct href', () => {
    render(<AboutTab appVersion="2.9.10" />);
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('https://t.me/GroveTeamDev');
  });

  it('FE-COMP-ABOUT-004: all external links have rel="noopener noreferrer"', () => {
    render(<AboutTab appVersion="2.9.10" />);
    const links = document.querySelectorAll('a');
    links.forEach((link) => {
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    });
  });

  it('FE-COMP-ABOUT-005: all external links open in a new tab', () => {
    render(<AboutTab appVersion="2.9.10" />);
    const links = document.querySelectorAll('a');
    links.forEach((link) => {
      expect(link.getAttribute('target')).toBe('_blank');
    });
  });

  it('FE-COMP-ABOUT-006: Telegram link hover changes border and box-shadow styles', () => {
    render(<AboutTab appVersion="1.0.0" />);
    const link = screen.getByRole('link') as HTMLAnchorElement;
    fireEvent.mouseEnter(link);
    expect(link.style.borderColor).toBe('rgb(34, 158, 217)');
    expect(link.style.boxShadow).not.toBe('');
    fireEvent.mouseLeave(link);
    expect(link.style.borderColor).toBe('var(--border-primary)');
    expect(link.style.boxShadow).toBe('none');
  });
});

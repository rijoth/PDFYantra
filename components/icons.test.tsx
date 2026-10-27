// @vitest-environment jsdom
import React from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { config } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import './iconSetup';
import Footer from './Footer';
import Sidebar from './Sidebar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('self-hosted Font Awesome icons', () => {
  it('disables runtime style injection', () => {
    expect(config.autoAddCss).toBe(false);
  });

  it('renders static solid and brand icons as inline SVG', () => {
    act(() => {
      root.render(
        <div>
          <Footer />
          <FontAwesomeIcon icon={faXmark} />
        </div>
      );
    });

    const icons = container.querySelectorAll('svg.svg-inline--fa');
    expect(icons).toHaveLength(2);
    expect(container.querySelector('svg.fa-github')).not.toBeNull();
    expect(container.querySelector('svg.fa-xmark')).not.toBeNull();
    expect(container.querySelectorAll('i')).toHaveLength(0);
    for (const icon of icons) {
      expect(icon.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('renders navigation icons from the tool config as inline SVG', () => {
    act(() => {
      root.render(<Sidebar activeTool="home" onToolChange={() => undefined} />);
    });

    // Five tools rendered in both the desktop rail and mobile bottom nav.
    expect(container.querySelectorAll('svg.svg-inline--fa')).toHaveLength(10);
    expect(container.querySelectorAll('i')).toHaveLength(0);
    expect(container.querySelector('svg.fa-house')).not.toBeNull();
    expect(container.querySelector('svg.fa-layer-group')).not.toBeNull();
  });
});

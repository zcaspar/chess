import React from 'react';
import { render, screen, act } from '@testing-library/react';
import App from './App';

// App composes AuthProvider/SocketProvider/GameProvider, which kick off async
// effects (auth state, socket connection, profile fetch). Stub fetch so those
// effects never hit the real network and resolve deterministically.
beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({}),
  }) as jest.Mock;
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('App', () => {
  it('renders the chess app shell without crashing', async () => {
    await act(async () => {
      render(<App />);
    });

    // The Header always renders the app title in an <h1>, regardless of auth or
    // connection state, so it is a stable smoke-test anchor.
    const heading = await screen.findByRole('heading', { name: /chess/i });
    expect(heading).toBeInTheDocument();
  });

  it('renders the main content region', async () => {
    await act(async () => {
      render(<App />);
    });

    // The default 'game' view is mounted inside the <main> landmark.
    expect(screen.getByRole('main')).toBeInTheDocument();
  });
});

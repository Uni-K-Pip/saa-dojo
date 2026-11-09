import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const update = vi.fn(async () => undefined);
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({ needRefresh: [true, () => undefined], offlineReady: [false, () => undefined], updateServiceWorker: update }),
}));

describe('更新の通知', () => {
  it('新しいバージョンがあればトーストを出し、再読み込みで更新する', async () => {
    const { UpdateToast } = await import('./UpdateToast');
    render(<UpdateToast />);
    expect(screen.getByText('新しいバージョンがあります。')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: '再読み込み' }));
    expect(update).toHaveBeenCalledWith(true);
  });
});

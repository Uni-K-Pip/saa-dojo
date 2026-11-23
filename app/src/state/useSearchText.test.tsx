import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { describe, expect, it } from 'vitest';
import { useSearchText } from './useSearchText';

let navigate: ReturnType<typeof useNavigate>;

function Search() {
  const { text, setText, update, params } = useSearchText();
  const location = useLocation();
  navigate = useNavigate();
  return (
    <div>
      <input type="search" value={text} onChange={(e) => setText(e.target.value)} />
      <button type="button" onClick={() => update((now) => ({ tier: (now.get('tier') ?? '') + '1' }))}>追記</button>
      <button type="button" onClick={() => update({ tier: params.get('tier') ? null : '1' })}>区分</button>
      <output>{location.search}</output>
    </div>
  );
}

function renderSearch(entries: string[], index = entries.length - 1) {
  render(
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <Search />
    </MemoryRouter>,
  );
  return screen.getByRole('searchbox') as HTMLInputElement;
}

const search = () => screen.getByRole('status').textContent;

describe('useSearchText', () => {
  it('URL の確定を待たずに続けて入力しても、文字が消えない', async () => {
    const input = renderSearch(['/s']);
    act(() => {
      for (const value of ['a', 'ab', 'abc']) fireEvent.change(input, { target: { value } });
    });
    expect(input.value).toBe('abc');
    await waitFor(() => expect(search()).toBe('?q=abc'));
    expect(input.value).toBe('abc');
  });

  it('URL の検索語から始め、空にすると ?q= を消す（ほかの絞り込みは残す）', async () => {
    const input = renderSearch(['/s?q=vpc&tier=1']);
    expect(input.value).toBe('vpc');
    fireEvent.change(input, { target: { value: '' } });
    await waitFor(() => expect(search()).toBe('?tier=1'));
  });

  it('ほかの絞り込みを書くときも、確定前の検索語を残す', async () => {
    const input = renderSearch(['/s']);
    act(() => {
      fireEvent.change(input, { target: { value: 'nat' } });
      fireEvent.click(screen.getByRole('button', { name: '区分' }));
    });
    await waitFor(() => expect(search()).toBe('?q=nat&tier=1'));
    expect(input.value).toBe('nat');
  });

  it('外から URL が変わったとき（リンク、戻る・進む）は入力を URL に合わせる', async () => {
    const input = renderSearch(['/s?q=one', '/s?q=two']);
    expect(input.value).toBe('two');
    fireEvent.change(input, { target: { value: 'twox' } });
    await waitFor(() => expect(search()).toBe('?q=twox'));

    act(() => { void navigate('/s?q=link'); });
    await waitFor(() => expect(input.value).toBe('link'));

    act(() => { void navigate(-1); });
    await waitFor(() => expect(input.value).toBe('twox'));
    act(() => { void navigate(-1); });
    await waitFor(() => expect(input.value).toBe('one'));
    act(() => { void navigate(1); });
    await waitFor(() => expect(input.value).toBe('twox'));
  });

  it('確定の前に別の検索語へ移り、戻ったときも、入力を URL に合わせる', async () => {
    const input = renderSearch(['/s?q=vpc']);
    act(() => {
      fireEvent.change(input, { target: { value: 'vpcxx' } });
      void navigate('/s?q=nat');
    });
    await waitFor(() => expect(input.value).toBe('nat'));
    act(() => { void navigate(-1); });
    await waitFor(() => expect(input.value).toBe('vpcxx'));
    expect(search()).toBe('?q=vpcxx');
  });

  it('確定の前に 2 つ続けて更新しても、先の変更が消えない', async () => {
    renderSearch(['/s']);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '追記' }));
      fireEvent.click(screen.getByRole('button', { name: '追記' }));
    });
    await waitFor(() => expect(search()).toBe('?tier=11'));
  });
});

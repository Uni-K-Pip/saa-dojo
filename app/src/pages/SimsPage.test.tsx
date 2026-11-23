import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SimIndexEntry, SimScenario } from '../content/types';
import { appendEvent, getAllEvents, mergeEvents } from '../db/repo';
import { makeBackup, parseBackup } from '../domain/backup';
import { buildHistory } from '../domain/history';
import { parseSyncFile, toSyncFiles } from '../domain/sync';
import { makeContentFiles } from '../test/fixtures';
import { renderApp, resetDb, useFakeContent } from '../test/render';

const id = 'sim-cidr-reserved-addresses';
const scenario: SimScenario = {
  id,
  sim: 'cidr',
  title: '小さなサブネットに何台置けるか',
  status: 'pending',
  intro: '管理用のサーバーを置くために、VPC の中にサブネットを作ります。',
  predict: {
    key: 'usable', text: 'サーバーに割り当てられるアドレスはいくつですか。',
    choices: [{ text: '16 個', value: 16 }, { text: '11 個', value: 11 }],
  },
  config: { op: 'size', role: 'subnet', cidr: '10.0.0.0/28' },
  toggles: [{ id: 'prefix-27', label: '/27 にする', set: { cidr: '10.0.0.0/27' } }],
  explain: {
    initial: 'AWS が [アドレスを予約します](#/services/vpc?f=subnet-reserved-ips) 。',
    toggles: { 'prefix-27': '使えるアドレスが増えます。' },
  },
  references: [{ href: '#/lessons/lesson-basics-ip-subnet-routing', title: 'IP アドレスとサブネット' }],
};

const entry: SimIndexEntry = {
  id: 'cidr', name: 'CIDR とサブネット', description: 'アドレスの数を確かめます。',
  notCovered: ['IPv6 の CIDR とサブネットは扱いません。', 'セカンダリ CIDR の追加は扱いません。', '範囲の用途は確かめません。'],
  scenarios: [{ id, title: scenario.title, status: scenario.status }],
};

const files = (entries: SimIndexEntry[] = [entry]) => makeContentFiles([], {
  'sim-index': entries,
  ...(entries.length ? { [`sim:${id}`]: scenario } : {}),
});

describe('シミュレーターの画面', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it.each([
    ['/sims', 'シミュレーター', '表示できるシミュレーターはまだありません。'],
    ['/sims/cidr', 'CIDR とサブネット', '表示できるシナリオはまだありません。'],
    [`/sims/cidr/${id}`, '見つかりません', /まだ検証が済んでいないシナリオ/],
  ])('0 件で %s を開く', async (path, heading, message) => {
    useFakeContent(files([]));
    renderApp(path);
    expect(await screen.findByRole('heading', { name: heading, level: 1 })).toBeVisible();
    expect(screen.getByText(message)).toBeVisible();
    expect(screen.queryByRole('heading', { name: '自由に試す' })).toBeNull();
  });

  it('シミュレーターの一覧に説明とシナリオの数を表示する', async () => {
    useFakeContent(files());
    renderApp('/sims');
    expect(await screen.findByRole('link', { name: entry.name })).toHaveAttribute('href', '/sims/cidr');
    expect(screen.getByText('アドレスの数を確かめます。（シナリオ 1 件）')).toBeVisible();
  });

  it('予想・実行・理由・変更・リセットを順に表示し、実行ごとに記録する', async () => {
    const user = userEvent.setup();
    useFakeContent(files());
    renderApp(`/sims/cidr/${id}`);
    const execute = await screen.findByRole('button', { name: '実行する' });
    expect(execute).toBeDisabled();
    expect(screen.getByText('未検証')).toBeVisible();
    expect(screen.getByText('このシミュレーターが扱わないこと').closest('details')).not.toHaveAttribute('open');
    expect(screen.queryByRole('heading', { name: '理由' })).toBeNull();

    const wrong = screen.getByRole('button', { name: '16 個' });
    const right = screen.getByRole('button', { name: '11 個' });
    await user.click(right);
    expect(right).toHaveAttribute('aria-pressed', 'true');
    await user.click(wrong);
    expect(right).toHaveAttribute('aria-pressed', 'false');
    expect(wrong).toHaveAttribute('aria-pressed', 'true');
    expect(execute).toBeEnabled();
    await user.click(execute);

    expect(screen.getByRole('heading', { name: '結果' })).toHaveFocus();
    expect(screen.getByText('予想と違う', { exact: false, selector: '.badge' })).toBeVisible();
    expect(screen.getByText('正しい選択肢は「11 個」です。')).toBeVisible();
    expect(screen.getByRole('heading', { name: '理由' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'アドレスを予約します' })).toHaveAttribute('href', '#/services/vpc?f=subnet-reserved-ips');
    expect(screen.getByRole('link', { name: 'IP アドレスとサブネット' })).toHaveAttribute('href', '/lessons/lesson-basics-ip-subnet-routing');
    expect(screen.getAllByText(/^予約 [0-9]+$/)).toHaveLength(5);
    const toggle = screen.getByRole('button', { name: '/27 にする' });
    await user.click(toggle);
    expect(screen.getByText('CIDR: 10.0.0.0/28 → 10.0.0.0/27')).toBeVisible();
    expect(screen.getByRole('heading', { name: '最初の結果' })).toBeVisible();
    expect(screen.getByRole('heading', { name: '変更した結果' })).toBeVisible();
    expect(screen.getByText('使えるアドレスが増えます。')).toBeVisible();
    await user.click(toggle);
    await user.click(screen.getByRole('button', { name: '最初の設定に戻す' }));
    expect(toggle).toHaveFocus();
    expect(screen.queryByRole('heading', { name: '変更した結果' })).toBeNull();
    expect(screen.getByRole('heading', { name: '理由' })).toBeVisible();

    await waitFor(async () => {
      const events = await getAllEvents();
      expect(events).toHaveLength(3);
      expect(events.find((event) => event.type === 'sim-run' && event.run === 'initial')).toMatchObject({
        sim: 'cidr', scenarioId: id, choice: 1, correct: false,
      });
      const toggles = events.filter((event) => event.type === 'sim-run' && event.run === 'prefix-27');
      expect(toggles).toHaveLength(2);
      expect(toggles.every((event) => !('choice' in event) && !('correct' in event))).toBe(true);
    });

    await user.click(screen.getByRole('button', { name: '最初からやり直す' }));
    expect(execute).toBeDisabled();
    expect(screen.queryByRole('heading', { name: '結果' })).toBeNull();
    await user.click(right);
    await user.click(execute);
    expect(screen.getByText('予想どおり', { exact: false, selector: '.badge' })).toBeVisible();

    await act(async () => {
      await user.click(screen.getByRole('link', { name: 'CIDR とサブネットのシナリオ一覧' }));
    });
    expect(await screen.findByText('実行済み（前回は予想どおり）')).toBeVisible();
    await act(async () => {
      await user.click(screen.getByRole('link', { name: scenario.title }));
    });
    expect(await screen.findByRole('button', { name: '実行する' })).toBeDisabled();
    expect(screen.queryByText('あなたの予想')).toBeNull();
  });

  it('存在しないシナリオや toggle の記録を表示しない', async () => {
    await appendEvent({ type: 'sim-run', sim: 'cidr', scenarioId: 'sim-cidr-old', run: 'initial', correct: true });
    await appendEvent({ type: 'sim-run', sim: 'cidr', scenarioId: id, run: 'old-toggle', correct: true });
    useFakeContent(files());
    renderApp('/sims/cidr');
    expect(await screen.findByRole('link', { name: scenario.title })).toBeVisible();
    expect(screen.queryByText(/実行済み/)).toBeNull();
  });

  it('自由に試すで 3 つの操作と入力エラーを表示し、記録しない', async () => {
    const user = userEvent.setup();
    useFakeContent(files());
    renderApp('/sims/cidr');
    const controls = within(await screen.findByRole('region', { name: '自由に試す' }));
    expect(screen.getByRole('link', { name: 'プライベート IP アドレスの範囲' })).toBeVisible();
    const slider = controls.getByRole('slider', { name: 'プレフィックス長' });
    expect(slider).toHaveAttribute('min', '8');
    expect(slider).toHaveAttribute('max', '32');
    fireEvent.change(slider, { target: { value: '29' } });
    expect(controls.getByText('作れない大きさ')).toBeVisible();

    const input = controls.getByRole('textbox', { name: 'CIDR' });
    fireEvent.change(input, { target: { value: '10.0.0.5/24' } });
    expect(controls.getByText(/先頭のアドレスは 10.0.0.0/)).toBeVisible();
    await user.click(controls.getByRole('button', { name: /直した値を入れる/ }));
    expect(input).toHaveValue('10.0.0.0/24');
    fireEvent.change(input, { target: { value: '2001:db8::/32' } });
    expect(controls.getByText('IPv6 の CIDR とサブネットは扱いません。')).toBeVisible();

    await user.click(controls.getByRole('button', { name: '重なり' }));
    expect(controls.getByText('範囲 A が範囲 B を含みます。')).toBeVisible();
    await user.click(controls.getByRole('button', { name: '分割' }));
    expect(controls.getByText('サブネットが全部は入りません。')).toBeVisible();
    expect(await getAllEvents()).toEqual([]);
  });

  it.each([false, true])('メニューで出すシナリオの有無に合わせる（%s）', async (show) => {
    useFakeContent(files(show ? [entry] : []));
    renderApp('/menu');
    await screen.findByRole('heading', { name: 'メニュー' });
    const main = within(screen.getByRole('main'));
    expect(main.getByRole('link', { name: /学習コース/ })).toBeVisible();
    if (show) expect(await main.findByRole('link', { name: /シミュレーター/ })).toHaveAttribute('href', '/sims');
    else {
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(main.queryByRole('link', { name: /シミュレーター/ })).toBeNull();
    }
  });

  it.each([false, true])('横のナビは、manifest のシナリオの件数で出し分ける（%s）', async (show) => {
    useFakeContent(files(show ? [entry] : []));
    renderApp('/');
    await screen.findByRole('heading', { level: 1 });
    const nav = within(screen.getByRole('navigation', { name: 'メインメニュー' }));
    if (show) expect(await nav.findByRole('link', { name: /シミュレーター/ })).toHaveAttribute('href', '/sims');
    else {
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(nav.queryByRole('link', { name: /シミュレーター/ })).toBeNull();
    }
  });

  it('書き出し・読み込み・同期で実行記録が残り、問題の履歴には入らない', async () => {
    const event = await appendEvent({ type: 'sim-run', sim: 'cidr', scenarioId: id, run: 'initial', choice: 2, correct: true });
    expect(buildHistory([event])).toEqual(buildHistory([]));
    const backup = parseBackup(JSON.stringify(makeBackup([event], event.deviceId, event.at)));
    expect(backup).toMatchObject({ ok: true, events: [event], skipped: 0 });
    const sync = parseSyncFile(Object.values(toSyncFiles([event]))[0]!);
    expect(sync).toEqual({ events: [event], skipped: 0 });
    await resetDb();
    expect(await mergeEvents(sync.events)).toBe(1);
    expect(await getAllEvents()).toEqual([event]);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NOT_COVERED, run, type SplitConfig } from '../../../scripts/lib/sims/cidr.mjs';
import { buildPresetConfig, DESCRIPTION as TRACE_DESCRIPTION, NOT_COVERED as TRACE_NOT_COVERED } from '../../../scripts/lib/sims/trace.mjs';
import { CidrResult } from '../sims/cidr/CidrResult';
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
  notCovered: [...NOT_COVERED],
  scenarios: [{ id, title: scenario.title, status: scenario.status }],
};

const traceId = 'sim-trace-nacl-ephemeral';
const traceConfig = buildPresetConfig({ appNacl: 'https' });
const traceScenario: SimScenario = {
  id: traceId,
  sim: 'trace',
  title: '443 だけを許可したネットワーク ACL',
  status: 'pending',
  intro: 'アプリから S3 に接続し、応答が戻るかを確かめます。',
  predict: {
    key: 'stop', text: '通信はどこで止まりますか。',
    choices: [{ text: '戻りのネットワーク ACL', value: 'return-nacl-in' }, { text: '行きも戻りも通る', value: 'none' }],
  },
  config: traceConfig,
  toggles: [
    {
      id: 'rename-subnet', label: 'アプリのサブネットの名前を変える',
      set: { subnets: traceConfig.subnets.map((subnet) => subnet.id === 'app' ? { ...subnet, label: 'アプリのサブネット' } : subnet) },
    },
    {
      id: 'allow-return', label: '応答のポートを許可する',
      set: { nacls: buildPresetConfig({ appNacl: 'ephemeral' }).nacls },
    },
  ],
  explain: {
    initial: 'ネットワーク ACL では戻りにも許可が要ります。',
    toggles: { 'rename-subnet': 'サブネットの名前が変わりました。', 'allow-return': '応答も通ります。' },
  },
  references: [{ href: '#/lessons/lesson-1.2-vpc-network-security', title: 'VPC のネットワークセキュリティ' }],
};
const traceEntry: SimIndexEntry = {
  id: 'trace', name: 'VPC の通信の追跡', description: TRACE_DESCRIPTION,
  notCovered: TRACE_NOT_COVERED,
  scenarios: [{ id: traceId, title: traceScenario.title, status: traceScenario.status }],
};

const files = (entries: SimIndexEntry[] = [entry]) => makeContentFiles([], {
  'sim-index': entries,
  ...(entries.some(({ id }) => id === 'cidr') ? { [`sim:${id}`]: scenario } : {}),
  ...(entries.some(({ id }) => id === 'trace') ? { [`sim:${traceId}`]: traceScenario } : {}),
});

describe('シミュレーターの画面', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it.each([
    ['/sims', 'シミュレーター', '表示できるシミュレーターはまだありません。'],
    ['/sims/cidr', 'CIDR とサブネット', '表示できるシナリオはまだありません。'],
    ['/sims/trace', 'VPC の通信の追跡', '表示できるシナリオはまだありません。'],
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

  it('trace の予想と実行を表示し、設定を変えた結果を読み上げて記録する', async () => {
    const user = userEvent.setup();
    useFakeContent(files([traceEntry]));
    renderApp(`/sims/trace/${traceId}`);
    const execute = await screen.findByRole('button', { name: '実行する' });
    expect(execute).toBeDisabled();
    expect(screen.getByRole('heading', { name: traceScenario.title })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '戻りのネットワーク ACL' }));
    await user.click(execute);
    expect(screen.getByRole('heading', { name: '結果' })).toHaveFocus();
    expect(screen.getByText('予想どおり', { exact: false, selector: '.badge' })).toBeVisible();
    expect(screen.getByText('戻りのネットワーク ACL（アプリ）で止まりました', { selector: '.trace-summary strong' })).toBeVisible();
    expect(screen.getByText('ネットワーク ACL では戻りにも許可が要ります。')).toBeVisible();

    const live = document.querySelector('.sim-flow [aria-live="polite"]');
    await user.click(screen.getByRole('button', { name: 'アプリのサブネットの名前を変える' }));
    expect(live).toHaveTextContent('戻りのネットワーク ACL（アプリのサブネット）で止まりました');
    expect(screen.getByText('戻りのネットワーク ACL（アプリのサブネット）で止まりました', { selector: '.trace-summary strong' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '応答のポートを許可する' }));
    expect(screen.getByRole('heading', { name: '最初の結果' })).toBeVisible();
    expect(screen.getByRole('heading', { name: '変更した結果' })).toBeVisible();
    expect(screen.getByText('届きました（行きと戻り）', { selector: '.trace-summary strong' })).toBeVisible();
    expect(screen.getByText('応答も通ります。')).toBeVisible();

    await waitFor(async () => {
      const events = await getAllEvents();
      expect(events).toHaveLength(3);
      expect(events).toEqual(expect.arrayContaining([
        expect.objectContaining({ sim: 'trace', scenarioId: traceId, run: 'initial', choice: 1, correct: true }),
        expect.objectContaining({ sim: 'trace', scenarioId: traceId, run: 'rename-subnet' }),
        expect.objectContaining({ sim: 'trace', scenarioId: traceId, run: 'allow-return' }),
      ]));
    });
  });

  it('trace の自由に試すで結果と入力エラーを表示し、記録しない', async () => {
    const user = userEvent.setup();
    useFakeContent(files([entry, traceEntry]));
    renderApp('/sims/trace');
    const controls = within(await screen.findByRole('region', { name: '自由に試す' }));
    expect(screen.getByRole('link', { name: traceScenario.title })).toHaveAttribute('href', `/sims/trace/${traceId}`);
    expect(screen.getByRole('link', { name: 'VPC どうしの接続' })).toHaveAttribute('href', '/lessons/lesson-3.4-hybrid-and-multi-vpc');
    expect(controls.getByText('届きました（行きと戻り）', { selector: '.trace-summary strong' })).toBeVisible();
    expect(controls.getAllByRole('combobox')).toHaveLength(10);

    const nacl = controls.getByRole('combobox', { name: 'アプリのサブネットのネットワーク ACL' });
    await user.selectOptions(nacl, 'https');
    expect(controls.getByText('戻りのネットワーク ACL（アプリ）で止まりました', { selector: '.trace-summary strong' })).toBeVisible();
    const destination = controls.getByRole('combobox', { name: '宛先' });
    await user.selectOptions(destination, 'app');
    expect(controls.getByRole('alert')).toHaveTextContent('送信元と宛先には別の相手を指定してください。');
    expect(controls.queryByRole('heading', { name: '行き' })).toBeNull();
    await user.selectOptions(destination, 's3');
    await user.selectOptions(nacl, 'ephemeral');
    expect(controls.queryByRole('alert')).toBeNull();
    expect(controls.getByText('届きました（行きと戻り）', { selector: '.trace-summary strong' })).toBeVisible();
    expect(await getAllEvents()).toEqual([]);
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
    // 作れない大きさの範囲は「重なりを理由に作れなくなることはありません」と出さない
    fireEvent.change(controls.getByRole('textbox', { name: '範囲 A' }), { target: { value: '10.0.0.0/8' } });
    fireEvent.change(controls.getByRole('textbox', { name: '範囲 B' }), { target: { value: '11.0.0.0/8' } });
    expect(controls.getByText(/範囲 A は大きすぎる、範囲 B は大きすぎる/)).toBeVisible();
    expect(controls.getByText('VPC ピアリング：この大きさの VPC は作れません。')).toBeVisible();
    expect(controls.queryByText(/重なりを理由に作れなくなることはありません/)).toBeNull();
    fireEvent.change(controls.getByRole('textbox', { name: '範囲 A' }), { target: { value: '10.0.0.0/16' } });
    fireEvent.change(controls.getByRole('textbox', { name: '範囲 B' }), { target: { value: '10.1.0.0/16' } });
    expect(controls.getByText('VPC ピアリング：重なりを理由に作れなくなることはありません。')).toBeVisible();
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

  it('分割の結果: 層の語を重ねず、「入らない」は数が足りないときだけ出す', () => {
    const show = (config: SplitConfig) => {
      const result = run(config);
      if (!result.ok) throw new Error(result.error.message);
      return render(<CidrResult config={config} output={result.output} />);
    };
    const tiers = [{ name: 'パブリック', kind: 'public' as const }, { name: 'アプリ', kind: 'private' as const }];
    const notEnough = show({ op: 'split', vpc: '10.0.0.0/24', azs: 2, tiers, prefix: 25 });
    const items = notEnough.getAllByRole('listitem').map(({ textContent }) => textContent);
    expect(items).toEqual([expect.stringContaining('AZ 1 ／ パブリック使える'), expect.stringContaining('AZ 2 ／ パブリック使える')]);
    expect(notEnough.container.textContent).not.toContain('パブリック（パブリック）');
    expect(notEnough.getByText('入らない：2 個のサブネット')).toBeVisible();
    notEnough.unmount();
    const tooLarge = show({ op: 'split', vpc: '10.0.0.0/8', azs: 2, tiers, prefix: 24 });
    expect(tooLarge.getByText('VPC を作れない大きさです。')).toBeVisible();
    expect(tooLarge.queryByText(/入らない/)).toBeNull();
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

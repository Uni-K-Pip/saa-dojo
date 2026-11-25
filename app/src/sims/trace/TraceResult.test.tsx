import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildPresetConfig, run, type PresetSwitches } from '../../../../scripts/lib/sims/trace.mjs';
import { TraceResult, summarizeTrace, traceSettings, withStopLabel } from './TraceResult';

function trace(switches?: PresetSwitches) {
  const config = buildPresetConfig(switches);
  const result = run(config);
  if (!result.ok) throw new Error(result.error.message);
  return { config, output: result.output };
}

function direction(name: '行き' | '戻り') {
  return within(screen.getByRole('heading', { name }).closest('section')!);
}

describe('VPC の通信の追跡の結果', () => {
  it('設定の最上位の項目をそれぞれ 1 行で要約する', () => {
    const config = buildPresetConfig({ to: 'update', appNacl: 'https' });
    const rows = traceSettings(config);
    const values = Object.fromEntries(rows.map(({ key, value }) => [key, value]));
    expect(rows.map(({ key }) => key).sort()).toEqual(Object.keys(config).sort());
    expect(values.vpc).toBe('VPC 10.0.0.0/16、インターネットゲートウェイあり');
    expect(values.flow).toBe('アプリ → 更新サーバー、TCP 443（送信元のポート 50000）');
    expect(values.routeTables).toContain('rt-app: 0.0.0.0/0 → NAT ゲートウェイ');
    expect(values.nacls).toContain('ルール 100: 許可 TCP 443 0.0.0.0/0');
    expect(values.publicIps).toContain('ALB: 203.0.113.10');
  });

  it('要約に行き戻りの別、関門、設定の場所の名前を使う', () => {
    const delivered = trace();
    expect(summarizeTrace(delivered.output)).toBe('届きました（行きと戻り）');
    const stopped = trace({ appNacl: 'https' });
    expect(summarizeTrace(withStopLabel(stopped.config, stopped.output))).toBe('戻りのネットワーク ACL（アプリ）で止まりました');
    const noIgw = trace({ from: 'client', to: 'alb', igw: false });
    expect(summarizeTrace(withStopLabel(noIgw.config, noIgw.output))).toBe('行きで止まりました（インターネットと通信する条件を満たしていません）');
  });

  it('届いたときは行きと戻りを通った順に表示する', () => {
    const data = trace();
    render(<TraceResult {...data} />);
    expect(screen.getByText('届きました（行きと戻り）')).toBeVisible();
    const forward = direction('行き').getAllByRole('listitem');
    const back = direction('戻り').getAllByRole('listitem');
    expect(forward).toHaveLength(data.output.forward.length);
    expect(back).toHaveLength(data.output.return.length);
    expect(forward[0]).toHaveTextContent('1セキュリティグループ（出る）アプリ✓ 通る');
    expect(forward[2]).toHaveTextContent('pl-s3 → ゲートウェイエンドポイント');
    expect(forward.at(-1)).toHaveTextContent('到着S3✓ 通る');
    expect(screen.queryByText('ここから先へは進みません')).toBeNull();
  });

  it('行きで止まると停止した段で終わり、戻りがないと表示する', () => {
    render(<TraceResult {...trace({ appNacl: 'https', port: 80 })} />);
    expect(screen.getByText('行きのネットワーク ACL（アプリ）で止まりました')).toBeVisible();
    const forward = direction('行き').getAllByRole('listitem');
    expect(forward).toHaveLength(2);
    expect(forward[1]).toHaveClass('trace-stopped');
    expect(forward[1]).toHaveTextContent('✕ 止まる');
    expect(forward[1]).toHaveTextContent('ここから先へは進みません');
    expect(direction('戻り').getByText('行きで止まったので、戻りはありません')).toBeVisible();
    expect(direction('戻り').queryByRole('listitem')).toBeNull();
  });

  it('戻りで止まると、行きで当たったルールと戻りの拒否を表示する', () => {
    render(<TraceResult {...trace({ appNacl: 'https' })} />);
    expect(screen.getByText('戻りのネットワーク ACL（アプリ）で止まりました')).toBeVisible();
    expect(direction('行き').getByText('ルール 100: 許可 TCP 443 0.0.0.0/0')).toBeVisible();
    const back = direction('戻り').getAllByRole('listitem');
    expect(back).toHaveLength(2);
    expect(back[1]).toHaveClass('trace-stopped');
    expect(back[1]).toHaveTextContent('最後の * のルールで拒否されました。');
    expect(back[1]).not.toHaveTextContent('どのルールにも当てはまらない（*）');
  });

  it('戻りのセキュリティグループでステートフルの判定を表示する', () => {
    render(<TraceResult {...trace({ from: 'alb', to: 'app' })} />);
    expect(direction('行き').getByText('ルール 1 行目: 許可 TCP 443 セキュリティグループ sg-alb')).toBeVisible();
    expect(direction('戻り').getAllByText('応答なので通す（ステートフル）')).toHaveLength(2);
  });

  it('NAT とインターネットゲートウェイの付け替えを行きと戻りに表示する', () => {
    render(<TraceResult {...trace({ to: 'update' })} />);
    expect(direction('行き').getByText('送信元を 10.0.1.20 に付け替え（元のアドレス 10.0.2.10）')).toBeVisible();
    expect(direction('行き').getByText('送信元を 203.0.113.20 に付け替え（元のアドレス 10.0.1.20）')).toBeVisible();
    expect(direction('戻り').getByText('宛先を 10.0.2.10 に付け替え（元のアドレス 10.0.1.20）')).toBeVisible();
  });

  it('インターネットから NAT ゲートウェイへ向かう接続は、NAT の段で、内側の部品へ接続できない理由を表示する', () => {
    render(<TraceResult {...trace({ from: 'client', to: 'nat' })} />);
    expect(screen.getByText('行きのNAT ゲートウェイ（NAT）で止まりました')).toBeVisible();
    const forward = direction('行き').getAllByRole('listitem');
    expect(forward.at(-1)).toHaveClass('trace-stopped');
    expect(forward.at(-1)).toHaveTextContent('外側から、NAT ゲートウェイの内側の部品への接続は開始できません。');
    expect(direction('戻り').getByText('行きで止まったので、戻りはありません')).toBeVisible();
  });

  it('閉じた構成にサブネットの種類、ルート、部品、段の番号を表示する', async () => {
    const user = userEvent.setup();
    render(<TraceResult {...trace()} />);
    const summary = screen.getByText('構成を見る');
    const topology = summary.closest('details')!;
    expect(topology).not.toHaveAttribute('open');
    await user.click(summary);
    expect(topology).toHaveAttribute('open');
    const inside = within(topology);
    expect(inside.getByRole('heading', { name: 'パブリック パブリック' })).toBeVisible();
    expect(inside.getByRole('heading', { name: 'データ 分離' })).toBeVisible();
    const app = within(inside.getByRole('heading', { name: 'アプリ プライベート' }).closest('section')!);
    expect(app.getByText('行き 2、3・戻り 2')).toBeVisible();
    expect(app.getByText('10.0.0.0/16 → local')).toBeVisible();
    expect(app.getByText('pl-s3 → ゲートウェイエンドポイント')).toBeVisible();
    expect(app.getByText('プライベート IP アドレス 10.0.2.10')).toBeVisible();
  });

  it('印刷のあいだだけ構成を開き、終わったら元の開閉に戻す', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<TraceResult {...trace()} />);
    const summary = screen.getByText('構成を見る');
    const topology = summary.closest('details')!;
    const print = (type: 'beforeprint' | 'afterprint') => window.dispatchEvent(new Event(type));

    // 閉じていた構成は、印刷の前に開き、あとで閉じる
    print('beforeprint');
    expect(topology).toHaveAttribute('open');
    // 印刷の前の通知が 2 回続いても、元の開閉を見失わない
    print('beforeprint');
    print('afterprint');
    expect(topology).not.toHaveAttribute('open');

    // 開いていた構成は、印刷のあとも開いたまま
    await user.click(summary);
    print('beforeprint');
    print('afterprint');
    expect(topology).toHaveAttribute('open');

    // 印刷の前の通知がないまま、あとの通知だけが来ても変えない
    await user.click(summary);
    print('afterprint');
    expect(topology).not.toHaveAttribute('open');

    // 画面から外したあとは、通知を受けない
    unmount();
    print('beforeprint');
    expect(topology).not.toHaveAttribute('open');
  });
});

import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildPresetConfig, run, type Config, type PresetSwitches } from '../../../../scripts/lib/sims/iam.mjs';
import { IamExplore } from './IamExplore';
import { IamResult, iamSettings, summarizeIam } from './IamResult';

function evaluate(config: Config) {
  const result = run(config);
  if (!result.ok) throw new Error(result.error.message);
  return { config, output: result.output };
}

function iam(switches?: PresetSwitches) {
  return evaluate(buildPresetConfig(switches));
}

const BUCKET = 'arn:aws:s3:::example-reports';
const RESOURCE = `${BUCKET}/2026/q1.csv`;
const ACCOUNT = '111122223333';

describe('IAM のポリシーの評価の結果', () => {
  it('最上位の項目を漏れなく 1 行ずつ要約する', () => {
    const config = buildPresetConfig({ tls: false, scp: 'deny-delete', identity: 'read-write', boundary: 'read',
      bucketPolicy: 'allow-principal-deny-insecure' });
    const rows = iamSettings(config);
    expect(rows.map(({ key }) => key).sort()).toEqual(Object.keys(config).sort());
    expect(rows.map(({ label, value }) => [label, value])).toEqual([
      ['操作', 'ポリシーの評価'],
      ['だれが', `IAM ユーザー hana（アカウント ${ACCOUNT}）`],
      ['組織での立場', 'メンバーアカウント（o-exampleorgid）'],
      ['何を', 's3:GetObject（TLS なし）'],
      ['どのリソースに', `${RESOURCE}（アカウント ${ACCOUNT}）`],
      ['SCP', 'ルート: Allow * ／ OU: Allow * ／ アカウント: Allow *; Deny s3:DeleteObject'],
      ['アイデンティティベースのポリシー', `Allow s3:GetObject、s3:PutObject → ${BUCKET}/*`],
      ['権限の境界', 'Allow s3:Get* → *'],
      ['リソースベースのポリシー', `Allow s3:GetObject、s3:PutObject → ${BUCKET}/*（Principal: arn:aws:iam::${ACCOUNT}:user/hana） ／ Deny s3:* → ${BUCKET}/*（Principal: すべて（*））（条件: aws:SecureTransport が false）`],
    ]);
  });

  it('ロール、ルートユーザー、組織の立場、空のポリシーと root ARN を表記する', () => {
    const role = buildPresetConfig({ principal: 'role', membership: 'none', identity: 'none', crossAccount: true });
    role.resourcePolicy = [{ effect: 'Allow', actions: ['s3:GetObject'], resources: [`${BUCKET}/*`],
      principal: { arn: `arn:aws:iam::${ACCOUNT}:root` } }];
    const values = (config: Config) => Object.fromEntries(iamSettings(config).map(({ key, value }) => [key, value]));
    expect(values(role)).toMatchObject({
      principal: `ロール analytics-role（アカウント ${ACCOUNT}）`, org: '組織に入っていない',
      request: 's3:GetObject（TLS あり）', resource: `${RESOURCE}（アカウント 444455556666）`,
      scps: 'なし', identityPolicy: 'なし', boundary: 'なし',
      resourcePolicy: `Allow s3:GetObject → ${BUCKET}/*（Principal: arn:aws:iam::${ACCOUNT}:root）`,
    });
    expect(values(buildPresetConfig({ principal: 'root', membership: 'management' }))).toMatchObject({
      principal: `ルートユーザー（アカウント ${ACCOUNT}）`, org: '管理アカウント（o-exampleorgid）', resourcePolicy: 'なし',
    });
  });

  it('許可、明示的な拒否、暗黙の拒否と決め手を要約する', () => {
    expect(summarizeIam(iam().output)).toBe('許可されます');
    const explicit = buildPresetConfig({ action: 's3:DeleteObject', scp: 'deny-delete', tls: false, bucketPolicy: 'deny-insecure' });
    expect(summarizeIam(evaluate(explicit).output)).toBe('拒否されます（明示的な拒否）。SCP（アカウント）、リソースベースのポリシーに、当てはまる Deny があります');
    expect(summarizeIam(iam({ action: 's3:PutObject' }).output)).toBe('拒否されます（暗黙の拒否）。許可するポリシーがありません');
    expect(summarizeIam(iam({ action: 's3:PutObject', boundary: 'read' }).output)).toBe('拒否されます（暗黙の拒否）。許可するポリシーがありません。権限の境界に許可がありません');
  });

  it('同じアカウントの段を番号、印、状態とともに表示する', () => {
    render(<IamResult {...iam({ scp: 'full' })} />);
    expect(screen.getByText('許可されます')).toBeVisible();
    const stages = screen.getAllByRole('listitem');
    expect(stages.map((item) => item.firstElementChild?.textContent)).toEqual([
      '1明示的な拒否✓ 拒否なし', '2SCP✓ 許可あり', '3リソースベースのポリシー－ ポリシーなし',
      '4アイデンティティベースのポリシー✓ 許可あり', '5権限の境界－ ポリシーなし',
    ]);
    expect(within(stages[0]).getByText('✓')).toHaveAttribute('aria-hidden', 'true');
    expect(stages[1]).toHaveTextContent('当てはまった文: SCP（ルート）: Allow * ／ SCP（OU）: Allow * ／ SCP（アカウント）: Allow *');
    expect(stages[1]).toHaveTextContent('上限を満たしています。');
    expect(stages[2]).toHaveClass('iam-stage-muted');
    expect(stages[3]).toHaveTextContent('許可を与えています。');
  });

  it('別アカウントの段を 2 つに分け、通し番号を付ける', () => {
    render(<IamResult {...iam({ crossAccount: true })} />);
    expect(screen.getByText('別のアカウントのリソースなので、両方の評価が許可して初めて通ります。')).toBeVisible();
    const principal = screen.getByRole('heading', { name: 'プリンシパルのアカウントの評価' }).closest('section')!;
    const resource = screen.getByRole('heading', { name: 'リソースのアカウントの評価' }).closest('section')!;
    expect(within(principal).getAllByRole('listitem')).toHaveLength(4);
    expect(within(resource).getAllByRole('listitem').map((item) => item.firstElementChild?.textContent)).toEqual([
      '5明示的な拒否✓ 拒否なし', '6リソースベースのポリシー－ ポリシーなし',
    ]);
  });

  it('ルートユーザーには SCP の説明と 2 段を出す', () => {
    render(<IamResult {...iam({ principal: 'root', membership: 'management', scp: 'full' })} />);
    expect(screen.getByText('ルートユーザーの実行では、SCP だけを見ます。')).toBeVisible();
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      '1明示的な拒否✓ 拒否なし', '2SCP－ 対象外（管理アカウント）',
    ]);
  });

  it('各段が結果にどう効くかを表示し、結果が変わると段を描き直す', () => {
    const { container, rerender } = render(<IamResult {...iam({ action: 's3:PutObject', boundary: 'read', bucketPolicy: 'allow-principal' })} />);
    expect(screen.getAllByText('リソースベースのポリシーが IAM ユーザーを名指しで許可しているので、ここに許可がなくても結果は変わりません。')).toHaveLength(2);
    const before = screen.getAllByRole('listitem')[0];
    rerender(<IamResult {...iam({ action: 's3:PutObject', boundary: 'read' })} />);
    expect(screen.getAllByRole('listitem')[0]).not.toBe(before);
    const boundary = screen.getAllByRole('listitem')[4];
    expect(boundary).toHaveStyle({ animationDelay: '480ms' });
    expect(boundary).toHaveClass('iam-stage-blocked');
    expect(boundary).toHaveTextContent('－ 許可なしここに許可がないので、拒否になります。');
    rerender(<IamResult {...iam({ tls: false, bucketPolicy: 'deny-insecure' })} />);
    const deny = screen.getAllByRole('listitem')[0];
    expect(deny).toHaveClass('iam-stage-blocked');
    expect(deny).toHaveTextContent('✕ 拒否あり');
    expect(deny).toHaveTextContent('ここで拒否に決まります。ほかのポリシーの許可は結果を変えません。');
    expect(container).not.toHaveTextContent(/評価が終わ|この先は見ません/);
  });

  it('折りたたんだポリシーのうち、当てはまった文だけに札を付ける', async () => {
    const user = userEvent.setup();
    render(<IamResult {...iam({ bucketPolicy: 'allow-principal-deny-insecure' })} />);
    const summary = screen.getByText('ポリシーを見る');
    const details = summary.closest('details')!;
    expect(details).not.toHaveAttribute('open');
    await user.click(summary);
    expect(details).toHaveAttribute('open');
    const inside = within(details);
    const resource = within(inside.getByRole('heading', { name: 'リソースベースのポリシー' }).closest('section')!);
    expect(resource.getAllByText('当てはまった文')).toHaveLength(1);
    expect(resource.getByText('Allow').closest('.iam-statement')).toHaveTextContent('当てはまった文');
    expect(resource.getByText('Deny').closest('.iam-statement')).not.toHaveTextContent('当てはまった文');
    expect(resource.getByText('すべて（*）')).toBeVisible();
    expect(resource.getByText('aws:SecureTransport が false')).toBeVisible();
  });
});

describe('自由に試す', () => {
  it('既定の結果を表示して読み上げ、適用されない項目を無効にする', async () => {
    const user = userEvent.setup();
    const { container } = render(<IamExplore />);
    expect(screen.getByRole('heading', { name: '自由に試す' })).toBeVisible();
    expect(screen.getByText(`IAM ユーザー hana（アカウント ${ACCOUNT}） ／ s3:GetObject（TLS あり） ／ ${RESOURCE}（アカウント ${ACCOUNT}）`)).toBeVisible();
    expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent('許可されます');
    await user.selectOptions(screen.getByLabelText('だれが'), 'root');
    for (const label of ['リソースのアカウント', 'アイデンティティベースのポリシー', '権限の境界', 'バケットポリシー']) {
      expect(screen.getByLabelText(label)).toBeDisabled();
    }
    expect(screen.getByLabelText('SCP')).toBeEnabled();
    await user.selectOptions(screen.getByLabelText('組織での立場'), 'none');
    expect(screen.getByLabelText('SCP')).toBeDisabled();
  });

  it('同じアカウントで組織への Allow を選ぶと入力のエラーを表示する', async () => {
    const user = userEvent.setup();
    render(<IamExplore />);
    await user.selectOptions(screen.getByLabelText('バケットポリシー'), 'allow-org');
    expect(screen.getByRole('alert')).toHaveTextContent('同じアカウントの Allow では、ルートユーザーの ARN（アカウント全体）や * を Principal に指定できません。');
    expect(screen.queryByText('ポリシーを見る')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('リソースのアカウント'), 'true');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('ポリシーを見る')).toBeVisible();
  });
});

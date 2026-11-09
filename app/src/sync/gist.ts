// GitHub Gist API の最小限のクライアント。トークンは api.github.com にだけ送る。
import { SYNC_DESCRIPTION } from '../domain/sync';

export const API = 'https://api.github.com';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export class GistError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'GistError';
  }
}

interface GistFile {
  filename: string;
  content?: string;
  truncated?: boolean;
  raw_url?: string;
}

export interface Gist {
  id: string;
  description: string | null;
  public: boolean;
  files: Record<string, GistFile | null>;
}

function message(status: number): string {
  if (status === 401) return 'トークンが無効です（期限切れ・取り消しの可能性があります）';
  if (status === 403) return 'アクセスが拒否されました（トークンの gist 権限、または利用回数の上限を確認してください）';
  if (status === 404) return 'Gist が見つかりません';
  if (status === 422) return 'Gist の内容が受け付けられませんでした';
  return `GitHub API のエラー（HTTP ${status}）`;
}

export class GistClient {
  constructor(
    private readonly token: string,
    private readonly fetcher: FetchLike = (u, i) => fetch(u, i),
  ) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let res: Response;
    try {
      res = await this.fetcher(`${API}${path}`, {
        ...init,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${this.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        },
      });
    } catch {
      throw new GistError('GitHub に接続できませんでした（オフラインの可能性があります）', 0);
    }
    if (!res.ok) throw new GistError(message(res.status), res.status);
    return (await res.json()) as T;
  }

  /** 自分の Gist から同期用（説明が saa-dojo sync）のものを探す */
  async find(): Promise<Gist | null> {
    for (let page = 1; page <= 10; page++) {
      const list = await this.request<Gist[]>(`/gists?per_page=100&page=${page}`);
      const hit = list.find((g) => g.description === SYNC_DESCRIPTION && !g.public);
      if (hit) return hit;
      if (list.length < 100) return null;
    }
    return null;
  }

  async get(id: string): Promise<Gist> {
    return this.request<Gist>(`/gists/${encodeURIComponent(id)}`);
  }

  async create(files: Record<string, string>): Promise<Gist> {
    return this.request<Gist>('/gists', {
      method: 'POST',
      body: JSON.stringify({ description: SYNC_DESCRIPTION, public: false, files: mapFiles(files) }),
    });
  }

  async update(id: string, files: Record<string, string | null>): Promise<Gist> {
    return this.request<Gist>(`/gists/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ description: SYNC_DESCRIPTION, files: mapFiles(files) }),
    });
  }

  /**
   * ファイルの中身。API の応答で省略されていたら raw_url から読む。
   * raw_url は gist.githubusercontent.com なので、トークンは付けない（シークレット Gist は URL だけで読める）。
   */
  async content(file: GistFile): Promise<string> {
    if (!file.truncated && typeof file.content === 'string') return file.content;
    if (!file.raw_url || !/^https:\/\/gist\.githubusercontent\.com\//.test(file.raw_url)) throw new GistError('Gist のファイルを読めませんでした', 0);
    const res = await this.fetcher(file.raw_url, { credentials: 'omit' });
    if (!res.ok) throw new GistError(message(res.status), res.status);
    return res.text();
  }
}

function mapFiles(files: Record<string, string | null>): Record<string, { content: string } | null> {
  return Object.fromEntries(Object.entries(files).map(([name, content]) => [name, content === null ? null : { content }]));
}

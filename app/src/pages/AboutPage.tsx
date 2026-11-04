import { use } from 'react';
import { loadManifest } from '../content/loader';
import { REPO_URL } from '../domain/links';

export default function AboutPage() {
  const manifest = use(loadManifest());
  const c = manifest.counts;
  return (
    <div>
      <h1>このアプリについて</h1>
      <div className="card">
        <h2>免責事項</h2>
        <ul>
          <li>SAA Dojo は、AWS 認定ソリューションアーキテクト – アソシエイト（SAA-C03）の学習を目的とした非公式のアプリです。</li>
          <li>Amazon Web Services, Inc. およびその関連会社とは関係がなく、承認や後援を受けたものではありません。</li>
          <li>AWS および各サービス名は、Amazon.com, Inc. またはその関連会社の商標です。</li>
          <li>問題はすべて独自に作成したもので、実際の試験問題ではありません。試験の出題内容や合否を保証するものではありません。</li>
          <li>内容には誤りが含まれる可能性があります。最新の仕様は AWS の公式ドキュメントで確認してください。誤りを見つけたら、各問題の「誤りを報告」から知らせてください。</li>
        </ul>
      </div>
      <div className="card">
        <h2>データの扱い</h2>
        <p>学習記録はこの端末のブラウザ（IndexedDB）にだけ保存されます。サーバーへ送られることはありません。</p>
        <p>
          設定画面で同期を有効にした場合だけ、自分の GitHub アカウントのシークレット Gist に学習記録を保存します。アクセストークンはこのブラウザにだけ保存し、api.github.com
          以外へは送りません。
        </p>
      </div>
      <div className="card">
        <h2>収録内容</h2>
        <ul>
          <li>
            演習問題 {c.questions.practice} 問、基礎講座の問題 {c.questions.basics} 問、保留模試 A {c.questions.mockA} 問・B {c.questions.mockB} 問
          </li>
          <li>
            レッスン {c.lessons} 本、基礎講座のレッスン {c.basicsLessons} 本
          </li>
          <li>
            フラッシュカード {c.flashcards} 枚、用語 {c.glossary} 語、早見表 {c.cheatsheets} 本、ガイド {c.guides} 本
          </li>
          <li>
            検証済み {c.verified} 問・未検証 {c.pending} 問
          </li>
        </ul>
        <p className="small muted">コンテンツの版: {manifest.contentHash}</p>
      </div>
      <p>
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
          ソースコード（GitHub）
        </a>
      </p>
    </div>
  );
}

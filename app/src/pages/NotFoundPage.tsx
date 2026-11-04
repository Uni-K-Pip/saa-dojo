import { Link } from 'react-router';

export default function NotFoundPage() {
  return (
    <div className="card">
      <h1>ページが見つかりません</h1>
      <p>URL を確認するか、ホームから移動してください。</p>
      <Link className="btn" to="/">
        ホームへ
      </Link>
    </div>
  );
}

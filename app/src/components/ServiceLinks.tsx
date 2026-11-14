// サービス名を図鑑へのリンクにする。台帳にない名前（範囲外・不明）はリンクにせず文字のまま出す
import { Link } from 'react-router';
import type { ServiceLinker } from '../domain/catalog';
import { catalogPath } from '../domain/catalog';

export function ServiceLink({ name, link, className }: { name: string; link: ServiceLinker; className?: string }) {
  const id = link(name);
  if (!id) return className ? <span className={className}>{name}</span> : <>{name}</>;
  return (
    <Link className={className} to={catalogPath(id)}>
      {name}
    </Link>
  );
}

/** 「A、B、C」の形で並べる */
export function ServiceLinkList({ names, link }: { names: readonly string[]; link: ServiceLinker }) {
  return (
    <>
      {names.map((n, i) => (
        <span key={n}>
          {i > 0 && '、'}
          <ServiceLink name={n} link={link} />
        </span>
      ))}
    </>
  );
}

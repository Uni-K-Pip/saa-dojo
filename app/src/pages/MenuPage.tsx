import { use, useEffect } from 'react';
import { Link, useOutletContext } from 'react-router';
import { menuItems } from '../components/Layout';
import { loadSimIndex } from '../content/loader';

export default function MenuPage() {
  const setHasSims = useOutletContext<((visible: boolean) => void) | null>();
  const hasSims = use(loadSimIndex()).some(({ scenarios }) => scenarios.length > 0);
  const items = menuItems(hasSims);
  const groups = [...new Set(items.map((i) => i.group))];
  useEffect(() => setHasSims?.(hasSims), [hasSims, setHasSims]);
  return (
    <div>
      <h1>メニュー</h1>
      {groups.map((g) => (
        <section key={g || 'top'} className="card">
          {g && <h2 style={{ marginTop: 0 }}>{g}</h2>}
          <ul className="list">
            {items.filter((i) => i.group === g).map((i) => (
              <li key={i.to}>
                <Link to={i.to}>
                  <span aria-hidden="true">{i.icon} </span>
                  {i.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

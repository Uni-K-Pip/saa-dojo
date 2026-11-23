import { Link } from 'react-router';
import { useNavItems } from '../components/Layout';

export default function MenuPage() {
  const navItems = useNavItems();
  const groups = [...new Set(navItems.map((i) => i.group))];
  return (
    <div>
      <h1>メニュー</h1>
      {groups.map((g) => (
        <section key={g || 'top'} className="card">
          {g && <h2 style={{ marginTop: 0 }}>{g}</h2>}
          <ul className="list">
            {navItems.filter((i) => i.group === g).map((i) => (
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

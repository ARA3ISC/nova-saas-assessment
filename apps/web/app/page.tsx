import { NOVA_APP_NAME } from '@nova/shared';

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        fontFamily: 'system-ui, sans-serif',
        background: '#0f172a',
        color: '#e2e8f0',
      }}
    >
      <section style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{NOVA_APP_NAME.toUpperCase()}</h1>
        <p style={{ margin: 0 }}>Web application scaffold is running.</p>
      </section>
    </main>
  );
}

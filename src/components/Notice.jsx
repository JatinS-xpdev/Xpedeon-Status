export function Notice({ title, children, tone = 'default' }) {
  return (
    <main className="page page-centered">
      <section className={`notice notice-${tone}`}>
        <h1>{title}</h1>
        <p>{children}</p>
      </section>
    </main>
  );
}

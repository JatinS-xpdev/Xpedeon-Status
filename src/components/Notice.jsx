export function Notice({ title, children, tone = 'info', type, fullPage = false }) {
  const resolvedTone = type || tone;
  const content = (
    <section className={`notice notice-${resolvedTone}`} role={resolvedTone === 'error' ? 'alert' : 'status'}>
      {title ? <h2>{title}</h2> : null}
      {children ? <p>{children}</p> : null}
    </section>
  );

  if (fullPage) {
    return <main className="page page-centered">{content}</main>;
  }

  return content;
}

export default function AdminPageContainer({
  summary = null,
  children = null,
  secondary = null,
}) {
  return (
    <div className="space-y-6">
      {summary}
      {children}
      {secondary ? (
        <section className="space-y-4">
          {secondary}
        </section>
      ) : null}
    </div>
  );
}


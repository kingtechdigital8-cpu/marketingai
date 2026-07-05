export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>&copy; {new Date().getFullYear()} MarketingAI. Semua hak dilindungi.</p>
        <div className="flex gap-5">
          <a href="#" className="hover:text-foreground">Kebijakan Privasi</a>
          <a href="#" className="hover:text-foreground">Syarat Layanan</a>
        </div>
      </div>
    </footer>
  );
}

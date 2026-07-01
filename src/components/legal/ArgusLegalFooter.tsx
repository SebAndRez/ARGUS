const links = [
  ["/legal/terms", "Terminos de uso"],
  ["/legal/privacy", "Privacidad"],
  ["/legal/data-license", "Licencia de datos"],
  ["/legal/institutional-access", "Uso institucional"],
] as const;

export default function ArgusLegalFooter() {
  return (
    <footer className="border-t border-white/10 bg-slate-950 px-4 py-5 text-xs text-slate-500">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p>ARGUS GRID - Plataforma civil de apoyo a crisis. No reemplaza autoridades.</p>
        <nav className="flex flex-wrap gap-3" aria-label="Legal ARGUS">
          {links.map(([href, label]) => (
            <a key={href} href={href} className="text-slate-400 hover:text-cyan-100">
              {label}
            </a>
          ))}
          <a href="mailto:sebastian.andres.official@gmail.com" className="text-slate-400 hover:text-cyan-100">
            Contacto
          </a>
        </nav>
      </div>
    </footer>
  );
}

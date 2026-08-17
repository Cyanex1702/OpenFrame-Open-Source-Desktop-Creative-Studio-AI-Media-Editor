export function Logo({ compact = false }: { compact?: boolean }) {
  return <div className="brand" aria-label="OpenFrame">
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M5 9.5A4.5 4.5 0 0 1 9.5 5H23a4 4 0 0 1 4 4v13.5a4.5 4.5 0 0 1-4.5 4.5H9a4 4 0 0 1-4-4V9.5Z" />
      <path d="M11 11h10v10H11z" />
      <circle cx="24" cy="8" r="3" />
    </svg>
    {!compact && <span>OpenFrame</span>}
  </div>;
}


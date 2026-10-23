export function AuthPageLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 py-10">
      <div className="flex items-center gap-3">
        <img
          src="/logo.webp"
          alt=""
          className="h-10 w-auto object-contain brightness-0 invert contrast-110"
          width={120}
          height={40}
        />
        <span className="font-heading text-xl font-semibold tracking-tight text-foreground">Feed Viewer Pro</span>
      </div>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}

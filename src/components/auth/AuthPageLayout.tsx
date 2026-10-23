import { Link } from "react-router-dom";
import { BrandLogo } from "@/components/BrandLogo";

export function AuthPageLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 py-10">
      <Link to="/" aria-label="Feed Viewer Pro home" className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <BrandLogo className="[&_svg]:h-10 [&_svg]:w-10 [&>span:nth-child(2)]:text-xl" />
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}

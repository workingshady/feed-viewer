import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="text-center max-w-md space-y-4">
        <h1 className="text-4xl font-bold">404</h1>
        <p className="text-xl text-muted-foreground">This page does not exist.</p>
        <p className="text-sm text-muted-foreground">
          <Link to="/sitemap" className="text-primary-text underline underline-offset-2 hover:text-primary-text/90">
            Browse the site map
          </Link>{" "}
          for all routes, or return home.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
          <Link to="/" className="text-primary-text font-medium underline underline-offset-2 hover:text-primary-text/90">
            Home
          </Link>
          <span className="text-muted-foreground" aria-hidden>
            ·
          </span>
          <Link to="/sitemap" className="text-primary-text font-medium underline underline-offset-2 hover:text-primary-text/90">
            Site map
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFound;

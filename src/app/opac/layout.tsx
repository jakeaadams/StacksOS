import { Metadata } from "next";
import { LibraryProvider } from "@/hooks/useLibrary";
import { PatronSessionProvider } from "@/hooks/usePatronSession";
import { OPACHeader } from "@/components/opac/OPACHeader";
import { OPACFooter } from "@/components/opac/OPACFooter";

export const metadata: Metadata = {
  title: {
    template: "%s | Library Catalog",
    default: "Library Catalog",
  },
  description: "Search our catalog, place holds, and manage your library account.",
};

export default function OPACLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <LibraryProvider>
      <PatronSessionProvider>
        <div className="min-h-screen flex flex-col bg-muted/30">
          {/* Skip link for keyboard navigation */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0 
                     focus:z-[100] focus:bg-primary-600 focus:text-white focus:px-4 focus:py-2
                     focus:outline-none"
          >
            Skip to main content
          </a>
          <OPACHeader />
          <main id="main-content" className="flex-1" role="main">
            {children}
          </main>
          <OPACFooter />
        </div>
      </PatronSessionProvider>
    </LibraryProvider>
  );
}

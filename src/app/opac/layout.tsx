import { Metadata } from "next";
import { LibraryProvider } from "@/hooks/use-library";
import { PatronSessionProvider } from "@/hooks/use-patron-session";
import { OpacShell } from "@/components/opac/OpacShell";

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
        <OpacShell>{children}</OpacShell>
      </PatronSessionProvider>
    </LibraryProvider>
  );
}

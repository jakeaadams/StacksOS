import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Events & Programs",
  description:
    "Discover upcoming library events, programs, and workshops. Storytimes, book clubs, tech help, author visits, and more.",
  openGraph: {
    title: "Events & Programs | Library Catalog",
    description: "Discover upcoming library events, programs, and workshops.",
  },
};

export default function EventsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Digital Library",
  description:
    "Access free eBooks, eAudiobooks, streaming movies, and more with your library card. Browse OverDrive, Hoopla, cloudLibrary, and Kanopy.",
  openGraph: {
    title: "Digital Library | Library Catalog",
    description:
      "Access free eBooks, eAudiobooks, streaming movies, and more with your library card.",
  },
};

export default function DigitalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

import type { Metadata } from "next";
import { callOpenSRF, isOpenSRFEvent } from "@/lib/api";

interface RecordLayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

async function fetchRecordMetadata(id: string) {
  const bibId = parseInt(id);
  if (!Number.isFinite(bibId)) return null;

  try {
    const modsResponse = await callOpenSRF(
      "open-ils.search",
      "open-ils.search.biblio.record.mods_slim.retrieve",
      [bibId]
    );

    const mods = modsResponse?.payload?.[0];
    if (!mods || mods.ilsevent || isOpenSRFEvent(mods)) return null;

    // Fetch MARC XML for summary and additional fields
    let summary = "";
    const isbn = mods.isbn || "";
    let language = "";

    const marcResponse = await callOpenSRF(
      "open-ils.supercat",
      "open-ils.supercat.record.marcxml.retrieve",
      [bibId]
    );
    const marcXml = marcResponse?.payload?.[0];

    if (typeof marcXml === "string") {
      const summaryMatch = marcXml.match(
        /<datafield tag="520"[^>]*>[\s\S]*?<subfield code="a">([^<]+)<\/subfield>/
      );
      if (summaryMatch) {
        summary = summaryMatch[1] ?? "";
      }

      const controlMatch = marcXml.match(/<controlfield tag="008">([^<]+)<\/controlfield>/);
      if (controlMatch && controlMatch[1] && controlMatch[1].length >= 38) {
        language = controlMatch[1]!.substring(35, 38);
      }
    }

    return {
      id: bibId,
      title: mods.title || "Unknown Title",
      author: mods.author || "",
      publisher: mods.publisher || "",
      pubdate: mods.pubdate || "",
      isbn,
      summary,
      language,
    };
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const record = await fetchRecordMetadata(id);

  if (!record) {
    return {
      title: "Record Not Found",
    };
  }

  const titleParts = [record.title];
  if (record.author) titleParts.push(`by ${record.author}`);

  return {
    title: titleParts.join(" "),
    description:
      record.summary?.slice(0, 160) ||
      `${record.title}${record.author ? ` by ${record.author}` : ""}${record.publisher ? `. Published by ${record.publisher}` : ""}`,
    openGraph: {
      title: record.title,
      description: record.summary?.slice(0, 160) || `Catalog record for ${record.title}`,
      type: "book",
    },
  };
}

export default async function RecordLayout({ children, params }: RecordLayoutProps) {
  const { id } = await params;
  const record = await fetchRecordMetadata(id);

  return (
    <>
      {record && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Book",
              name: record.title,
              ...(record.author && {
                author: {
                  "@type": "Person",
                  name: record.author,
                },
              }),
              ...(record.isbn && { isbn: record.isbn }),
              ...(record.publisher && {
                publisher: {
                  "@type": "Organization",
                  name: record.publisher,
                },
              }),
              ...(record.pubdate && { datePublished: record.pubdate }),
              ...(record.summary && {
                description: record.summary.slice(0, 500),
              }),
              ...(record.language && { inLanguage: record.language }),
            }),
          }}
        />
      )}
      {children}
    </>
  );
}

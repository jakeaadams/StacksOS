/**
 * Example usage of MarcDiff component
 */

"use client";

import { useState } from "react";
import { clientLogger } from "@/lib/client-logger";
import { MarcDiff } from "@/components/shared";
import { Button } from "@/components/ui/button";

export default function MarcDiffExample() {
  const [showDiff, setShowDiff] = useState(false);

  // Example MARC XML records
  const oldMarcXml = `<?xml version="1.0" encoding="UTF-8"?>
<record xmlns="http://www.loc.gov/MARC21/slim">
  <leader>00000nam a22000007i 4500</leader>
  <controlfield tag="001">123456</controlfield>
  <controlfield tag="003">StacksOS</controlfield>
  <datafield tag="020" ind1=" " ind2=" ">
    <subfield code="a">978-0-123-45678-9</subfield>
  </datafield>
  <datafield tag="100" ind1="1" ind2=" ">
    <subfield code="a">Smith, John</subfield>
  </datafield>
  <datafield tag="245" ind1="1" ind2="0">
    <subfield code="a">Introduction to Library Science</subfield>
    <subfield code="c">by John Smith</subfield>
  </datafield>
  <datafield tag="264" ind1=" " ind2="1">
    <subfield code="a">New York</subfield>
    <subfield code="b">Academic Press</subfield>
    <subfield code="c">2023</subfield>
  </datafield>
  <datafield tag="650" ind1=" " ind2="0">
    <subfield code="a">Library science</subfield>
  </datafield>
</record>`;

  const newMarcXml = `<?xml version="1.0" encoding="UTF-8"?>
<record xmlns="http://www.loc.gov/MARC21/slim">
  <leader>00000nam a22000007i 4500</leader>
  <controlfield tag="001">123456</controlfield>
  <controlfield tag="003">StacksOS</controlfield>
  <datafield tag="020" ind1=" " ind2=" ">
    <subfield code="a">978-0-123-45678-9</subfield>
  </datafield>
  <datafield tag="100" ind1="1" ind2=" ">
    <subfield code="a">Smith, John A.</subfield>
  </datafield>
  <datafield tag="245" ind1="1" ind2="0">
    <subfield code="a">Introduction to Library and Information Science</subfield>
    <subfield code="c">by John A. Smith</subfield>
  </datafield>
  <datafield tag="250" ind1=" " ind2=" ">
    <subfield code="a">2nd edition</subfield>
  </datafield>
  <datafield tag="264" ind1=" " ind2="1">
    <subfield code="a">New York</subfield>
    <subfield code="b">Academic Press</subfield>
    <subfield code="c">2024</subfield>
  </datafield>
  <datafield tag="650" ind1=" " ind2="0">
    <subfield code="a">Library science</subfield>
  </datafield>
  <datafield tag="650" ind1=" " ind2="0">
    <subfield code="a">Information science</subfield>
  </datafield>
</record>`;

  const handleConfirm = () => {
    clientLogger.info("Changes confirmed! Save the new MARC record.");
    // Your save logic here
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">MARC Diff Example</h1>

      <Button onClick={() => setShowDiff(true)}>
        Show MARC Diff
      </Button>

      <MarcDiff
        oldMarc={oldMarcXml}
        newMarc={newMarcXml}
        open={showDiff}
        onOpenChange={setShowDiff}
        onConfirm={handleConfirm}
      />

      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-2">What changed:</h2>
        <ul className="list-disc list-inside space-y-1 text-sm">
          <li>{`100$a: "Smith, John" → "Smith, John A."`}</li>
          <li>{`245$a: "Introduction to Library Science" → "Introduction to Library and Information Science"`}</li>
          <li>{`245$c: "by John Smith" → "by John A. Smith"`}</li>
          <li>{`250: Added "2nd edition"`}</li>
          <li>{`264$c: "2023" → "2024"`}</li>
          <li>{`650: Added new subject "Information science"`}</li>
        </ul>
      </div>
    </div>
  );
}

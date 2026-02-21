import type { FixedFieldOption, IndicatorRule } from "./marc-types";

export const marcFieldDescriptions: Record<string, string> = {
  "001": "Control Number",
  "003": "Control Number Identifier",
  "005": "Date/Time of Latest Transaction",
  "008": "Fixed-Length Data Elements",
  "010": "Library of Congress Control Number",
  "020": "ISBN",
  "022": "ISSN",
  "040": "Cataloging Source",
  "041": "Language Code",
  "050": "LC Call Number",
  "082": "Dewey Decimal Number",
  "100": "Main Entry - Personal Name",
  "110": "Main Entry - Corporate Name",
  "245": "Title Statement",
  "246": "Varying Form of Title",
  "250": "Edition Statement",
  "264": "Production/Publication",
  "300": "Physical Description",
  "336": "Content Type",
  "337": "Media Type",
  "338": "Carrier Type",
  "490": "Series Statement",
  "500": "General Note",
  "504": "Bibliography Note",
  "505": "Contents Note",
  "520": "Summary",
  "600": "Subject - Personal Name",
  "650": "Subject - Topical Term",
  "651": "Subject - Geographic",
  "700": "Added Entry - Personal Name",
  "856": "Electronic Location",
};

export const marcTagSuggestions = Object.entries(marcFieldDescriptions)
  .sort((a, b) => Number.parseInt(a[0], 10) - Number.parseInt(b[0], 10))
  .map(([tag, label]) => ({ tag, label }));

export const indicatorRules: Record<string, IndicatorRule> = {
  "020": { ind1: [" "], ind2: [" "] },
  "022": { ind1: [" "], ind2: [" "] },
  "040": { ind1: [" "], ind2: [" "] },
  "041": { ind1: ["0", "1", " "], ind2: [" "] },
  "050": { ind1: ["0", "1", "2", "3", "4", " "], ind2: ["0", "4", " "] },
  "082": { ind1: ["0", "1", "7", " "], ind2: ["0", "4", " "] },
  "100": { ind1: ["0", "1", "3"], ind2: [" "] },
  "110": { ind1: ["0", "1", "2"], ind2: [" "] },
  "111": { ind1: ["0", "1", "2"], ind2: [" "] },
  "130": { ind1: ["0", "1", "2", "3", "9"], ind2: [" "] },
  "245": { ind1: ["0", "1"], ind2: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] },
  "246": { ind1: ["0", "1", "2", "3"], ind2: ["0", "1", "2", "3", "4", "5", "6", "7", "8"] },
  "250": { ind1: [" "], ind2: [" "] },
  "264": { ind1: [" ", "2", "3"], ind2: ["0", "1", "2", "3", "4"] },
  "300": { ind1: [" "], ind2: [" "] },
  "336": { ind1: [" "], ind2: [" "] },
  "337": { ind1: [" "], ind2: [" "] },
  "338": { ind1: [" "], ind2: [" "] },
  "490": { ind1: ["0", "1"], ind2: [" "] },
  "500": { ind1: [" "], ind2: [" "] },
  "504": { ind1: [" "], ind2: [" "] },
  "505": { ind1: ["0", "1", "2", "8"], ind2: [" "] },
  "520": { ind1: [" ", "0", "1", "2", "3", "4", "8"], ind2: [" "] },
  "600": { ind1: ["0", "1", "3"], ind2: ["0", "1", "2", "3", "4", "5", "6", "7"] },
  "610": { ind1: ["0", "1", "2"], ind2: ["0", "1", "2", "3", "4", "5", "6", "7"] },
  "611": { ind1: ["0", "1", "2"], ind2: ["0", "1", "2", "3", "4", "5", "6", "7"] },
  "630": {
    ind1: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
    ind2: ["0", "1", "2", "3", "4", "5", "6", "7"],
  },
  "650": { ind1: [" ", "0", "1", "2", "3"], ind2: ["0", "1", "2", "3", "4", "5", "6", "7"] },
  "651": { ind1: [" ", "0", "1", "2", "3"], ind2: ["0", "1", "2", "3", "4", "5", "6", "7"] },
  "655": {
    ind1: [" ", "0", "1", "2", "3", "4", "5", "6", "7"],
    ind2: ["0", "1", "2", "3", "4", "5", "6", "7"],
  },
  "700": { ind1: ["0", "1", "3"], ind2: [" "] },
  "710": { ind1: ["0", "1", "2"], ind2: [" "] },
  "711": { ind1: ["0", "1", "2"], ind2: [" "] },
  "730": { ind1: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"], ind2: [" "] },
  "740": { ind1: ["0", "1", "2", "3"], ind2: [" "] },
  "800": { ind1: ["0", "1", "3"], ind2: [" "] },
  "810": { ind1: ["0", "1", "2"], ind2: [" "] },
  "830": { ind1: [" ", "0", "1"], ind2: [" "] },
  "856": { ind1: [" ", "0", "1", "2", "3", "4", "7", "8"], ind2: [" ", "0", "1", "2", "8"] },
};

export function indicatorLabel(value: string): string {
  return value === " " ? "blank" : value;
}

export const defaultMarcRecord = {
  leader: "00000nam a22000007i 4500",
  fields: [
    { tag: "001", ind1: " ", ind2: " ", subfields: [{ code: "", value: "" }] },
    { tag: "003", ind1: " ", ind2: " ", subfields: [{ code: "", value: "StacksOS" }] },
    {
      tag: "008",
      ind1: " ",
      ind2: " ",
      subfields: [{ code: "", value: "240120s2024    xxu           000 0 eng d" }],
    },
    { tag: "020", ind1: " ", ind2: " ", subfields: [{ code: "a", value: "" }] },
    { tag: "100", ind1: "1", ind2: " ", subfields: [{ code: "a", value: "" }] },
    {
      tag: "245",
      ind1: "1",
      ind2: "0",
      subfields: [
        { code: "a", value: "" },
        { code: "c", value: "" },
      ],
    },
    {
      tag: "264",
      ind1: " ",
      ind2: "1",
      subfields: [
        { code: "a", value: "" },
        { code: "b", value: "" },
        { code: "c", value: "" },
      ],
    },
    { tag: "300", ind1: " ", ind2: " ", subfields: [{ code: "a", value: "" }] },
    { tag: "650", ind1: " ", ind2: "0", subfields: [{ code: "a", value: "" }] },
  ],
};

export const leaderRecordStatusOptions: FixedFieldOption[] = [
  { value: "n", label: "New (n)" },
  { value: "c", label: "Corrected/Revised (c)" },
  { value: "a", label: "Encoding level increase (a)" },
  { value: "d", label: "Deleted (d)" },
  { value: "p", label: "Prepublication level increase (p)" },
];

export const leaderTypeOptions: FixedFieldOption[] = [
  { value: "a", label: "Language material (a)" },
  { value: "c", label: "Notated music (c)" },
  { value: "g", label: "Projected medium (g)" },
  { value: "i", label: "Nonmusical sound recording (i)" },
  { value: "j", label: "Musical sound recording (j)" },
  { value: "k", label: "Graphic (k)" },
  { value: "m", label: "Computer file (m)" },
];

export const leaderBibLevelOptions: FixedFieldOption[] = [
  { value: "m", label: "Monograph/item (m)" },
  { value: "s", label: "Serial (s)" },
  { value: "a", label: "Monographic component part (a)" },
  { value: "c", label: "Collection (c)" },
  { value: "i", label: "Integrating resource (i)" },
];

export const leaderEncodingOptions: FixedFieldOption[] = [
  { value: " ", label: "Full level (blank)" },
  { value: "1", label: "Full, material not examined (1)" },
  { value: "3", label: "Abbreviated level (3)" },
  { value: "4", label: "Core level (4)" },
  { value: "5", label: "Partial level (5)" },
  { value: "7", label: "Minimal level (7)" },
  { value: "8", label: "Prepublication level (8)" },
];

export const leaderCatalogingFormOptions: FixedFieldOption[] = [
  { value: " ", label: "Non-ISBD (blank)" },
  { value: "a", label: "AACR2 (a)" },
  { value: "i", label: "ISBD punctuation included (i)" },
  { value: "n", label: "Non-ISBD punctuation omitted (n)" },
];

export const fixed008DateTypeOptions: FixedFieldOption[] = [
  { value: "s", label: "Single known/probable date (s)" },
  { value: "m", label: "Multiple dates (m)" },
  { value: "r", label: "Reprint/reissue and original date (r)" },
  { value: "t", label: "Publication date + copyright date (t)" },
  { value: "c", label: "Continuing resource currently published (c)" },
  { value: "d", label: "Continuing resource ceased (d)" },
  { value: "n", label: "Dates unknown (n)" },
  { value: "q", label: "Questionable date (q)" },
];

export const fixed008AudienceOptions: FixedFieldOption[] = [
  { value: " ", label: "Unknown/unspecified (blank)" },
  { value: "a", label: "Preschool (a)" },
  { value: "b", label: "Primary (b)" },
  { value: "c", label: "Pre-adolescent (c)" },
  { value: "d", label: "Adolescent (d)" },
  { value: "e", label: "Adult (e)" },
  { value: "g", label: "General (g)" },
  { value: "j", label: "Juvenile (j)" },
];

export const fixed008FormOptions: FixedFieldOption[] = [
  { value: " ", label: "None of the following (blank)" },
  { value: "a", label: "Microfilm (a)" },
  { value: "b", label: "Microfiche (b)" },
  { value: "d", label: "Large print (d)" },
  { value: "f", label: "Braille (f)" },
  { value: "o", label: "Online (o)" },
  { value: "q", label: "Direct electronic (q)" },
  { value: "s", label: "Electronic (s)" },
];

export const fixed008CatalogingSourceOptions: FixedFieldOption[] = [
  { value: " ", label: "National bibliographic agency (blank)" },
  { value: "c", label: "Cooperative cataloging program (c)" },
  { value: "d", label: "Other (d)" },
  { value: "u", label: "Unknown (u)" },
];

export const fixed008LanguageOptions: FixedFieldOption[] = [
  { value: "eng", label: "English (eng)" },
  { value: "spa", label: "Spanish (spa)" },
  { value: "fre", label: "French (fre)" },
  { value: "ger", label: "German (ger)" },
  { value: "ita", label: "Italian (ita)" },
  { value: "por", label: "Portuguese (por)" },
  { value: "chi", label: "Chinese (chi)" },
  { value: "jpn", label: "Japanese (jpn)" },
  { value: "kor", label: "Korean (kor)" },
  { value: "ara", label: "Arabic (ara)" },
  { value: "rus", label: "Russian (rus)" },
];

export const QUICK_ADD_TAGS = [
  "020", "050", "082", "100", "245", "264", "300", "500", "650", "700", "856",
];

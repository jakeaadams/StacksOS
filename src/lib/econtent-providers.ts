/**
 * e-Content Provider Configuration
 *
 * Defines the digital content providers available through this library system.
 *
 * HOW TO CONFIGURE WITH ACTUAL LIBRARY-SPECIFIC URLs:
 * ====================================================
 * 1. Replace the placeholder `browseUrl` values below with your library's
 *    actual provider URLs. These are typically:
 *    - OverDrive/Libby: https://yourlibrary.overdrive.com or the Libby deep link
 *    - Hoopla: https://www.hoopladigital.com/my/hoopla
 *    - cloudLibrary: https://ebook.yourcloudlibrary.com/library/yourlibrary
 *    - Kanopy: https://yourlibrary.kanopy.com
 *
 * 2. Replace placeholder logo URLs with actual provider logos hosted on your CDN,
 *    or reference them from a /public/images/providers/ directory.
 *
 * 3. In production, this data could be stored in the database and configured
 *    through the admin panel under Settings > e-Content Providers.
 *
 * 4. To add a new provider, add an entry to the PROVIDERS array following the
 *    same structure.
 *
 * Environment variables (optional):
 *   OVERDRIVE_LIBRARY_URL - Override OverDrive URL
 *   HOOPLA_LIBRARY_URL - Override Hoopla URL
 *   CLOUDLIBRARY_URL - Override cloudLibrary URL
 *   KANOPY_LIBRARY_URL - Override Kanopy URL
 */

export type EContentType = "ebook" | "eaudiobook" | "streaming" | "emagazine";

export interface EContentProvider {
  id: string;
  name: string;
  description: string;
  logoUrl: string;
  browseUrl: string;
  types: EContentType[];
  color: string; // brand color for UI accents
  featured: boolean;
  alwaysAvailableTitles?: number; // approximate count of always-available titles
}

const PROVIDERS: EContentProvider[] = [
  {
    id: "overdrive",
    name: "OverDrive / Libby",
    description:
      "Borrow eBooks and eAudiobooks with the Libby app. The largest selection of digital titles from bestsellers to indie gems. Works on phones, tablets, Kindle, and computers.",
    logoUrl: "/images/providers/libby-logo.svg",
    browseUrl: process.env.OVERDRIVE_LIBRARY_URL || "https://yourlibrary.overdrive.com",
    types: ["ebook", "eaudiobook", "emagazine"],
    color: "#0A7B83",
    featured: true,
    alwaysAvailableTitles: 5000,
  },
  {
    id: "hoopla",
    name: "Hoopla",
    description:
      "Instantly borrow digital movies, music, eBooks, audiobooks, comics, and TV shows. No waiting -- titles are always available with a monthly checkout limit.",
    logoUrl: "/images/providers/hoopla-logo.svg",
    browseUrl: process.env.HOOPLA_LIBRARY_URL || "https://www.hoopladigital.com",
    types: ["ebook", "eaudiobook", "streaming"],
    color: "#E8490F",
    featured: true,
    alwaysAvailableTitles: 950000,
  },
  {
    id: "cloudlibrary",
    name: "cloudLibrary",
    description:
      "Browse and borrow eBooks and eAudiobooks with an easy-to-use app. Curated collections and personalized recommendations help you find your next great read.",
    logoUrl: "/images/providers/cloudlibrary-logo.svg",
    browseUrl: process.env.CLOUDLIBRARY_URL || "https://ebook.yourcloudlibrary.com",
    types: ["ebook", "eaudiobook"],
    color: "#2196F3",
    featured: true,
  },
  {
    id: "kanopy",
    name: "Kanopy",
    description:
      "Stream thousands of films for free, including award-winning documentaries, rare and hard-to-find titles, film festival favorites, indie and classic films, and Kanopy Kids content.",
    logoUrl: "/images/providers/kanopy-logo.svg",
    browseUrl: process.env.KANOPY_LIBRARY_URL || "https://yourlibrary.kanopy.com",
    types: ["streaming"],
    color: "#2D5A27",
    featured: true,
  },
];

/**
 * Get all configured e-content providers.
 */
export function getEContentProviders(): EContentProvider[] {
  return [...PROVIDERS];
}

/**
 * Get a specific provider by ID.
 */
export function getEContentProvider(id: string): EContentProvider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/**
 * Get providers that support a specific content type.
 */
export function getProvidersByType(type: EContentType): EContentProvider[] {
  return PROVIDERS.filter((p) => p.types.includes(type));
}

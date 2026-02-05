"use client";

import Link from "next/link";
import { useLibrary } from "@/hooks/useLibrary";
import { featureFlags } from "@/lib/feature-flags";
import { 
  Facebook, 
  Twitter, 
  Instagram, 
  Youtube,
  Mail,
  Phone,
  MapPin,
  ExternalLink
} from "lucide-react";

export function OPACFooter() {
  const { library } = useLibrary();
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-foreground text-muted-foreground/50">
      {/* Main footer content */}
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Library info */}
          <div>
            <h3 className="text-white font-bold text-lg mb-4">
              {library?.name || "Your Library"}
            </h3>
            {library?.address && (
              <div className="flex items-start gap-2 mb-3">
                <MapPin className="h-5 w-5 shrink-0 mt-0.5" />
                <span className="text-sm">{library.address}</span>
              </div>
            )}
            {library?.phone && (
              <div className="flex items-center gap-2 mb-3">
                <Phone className="h-5 w-5 shrink-0" />
                <a href={`tel:${library.phone}`} className="text-sm hover:text-white">
                  {library.phone}
                </a>
              </div>
            )}
            {library?.email && (
              <div className="flex items-center gap-2 mb-3">
                <Mail className="h-5 w-5 shrink-0" />
                <a href={`mailto:${library.email}`} className="text-sm hover:text-white">
                  {library.email}
                </a>
              </div>
            )}
            
            {/* Social links */}
            <div className="flex items-center gap-4 mt-4">
              {library?.socialLinks?.facebook && (
                <a 
                  href={library.socialLinks.facebook}
                  target="_blank" rel="noopener noreferrer"
                  className="hover:text-white transition-colors"
                  aria-label="Facebook"
                >
                  <Facebook className="h-5 w-5" />
                </a>
              )}
              {library?.socialLinks?.twitter && (
                <a 
                  href={library.socialLinks.twitter}
                  target="_blank" rel="noopener noreferrer"
                  className="hover:text-white transition-colors"
                  aria-label="Twitter"
                >
                  <Twitter className="h-5 w-5" />
                </a>
              )}
              {library?.socialLinks?.instagram && (
                <a 
                  href={library.socialLinks.instagram}
                  target="_blank" rel="noopener noreferrer"
                  className="hover:text-white transition-colors"
                  aria-label="Instagram"
                >
                  <Instagram className="h-5 w-5" />
                </a>
              )}
              {library?.socialLinks?.youtube && (
                <a 
                  href={library.socialLinks.youtube}
                  target="_blank" rel="noopener noreferrer"
                  className="hover:text-white transition-colors"
                  aria-label="YouTube"
                >
                  <Youtube className="h-5 w-5" />
                </a>
              )}
            </div>
          </div>

          {/* Quick links */}
          <div>
            <h3 className="text-white font-bold text-lg mb-4">Catalog</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/opac/search" className="text-sm hover:text-white transition-colors">
                  Search Catalog
                </Link>
              </li>
              {featureFlags.opacBrowseV2 ? (
                <>
                  <li>
                    <Link href="/opac/new-titles" className="text-sm hover:text-white transition-colors">
                      New Arrivals
                    </Link>
                  </li>
                  <li>
                    <Link href="/opac/lists" className="text-sm hover:text-white transition-colors">
                      Staff Picks
                    </Link>
                  </li>
                </>
              ) : null}
              <li>
                {featureFlags.opacKids ? (
                  <Link href="/opac/kids" className="text-sm hover:text-white transition-colors">
                    Kids Catalog
                  </Link>
                ) : null}
              </li>
              <li>
                <Link href="/opac/search?format=ebook" className="text-sm hover:text-white transition-colors">
                  eBooks & Audiobooks
                </Link>
              </li>
            </ul>
          </div>

          {/* Account */}
          <div>
            <h3 className="text-white font-bold text-lg mb-4">My Account</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/opac/login" className="text-sm hover:text-white transition-colors">
                  Sign In
                </Link>
              </li>
              <li>
                <Link href="/opac/account/checkouts" className="text-sm hover:text-white transition-colors">
                  My Checkouts
                </Link>
              </li>
              <li>
                <Link href="/opac/account/holds" className="text-sm hover:text-white transition-colors">
                  My Holds
                </Link>
              </li>
              <li>
                <Link href="/opac/account/fines" className="text-sm hover:text-white transition-colors">
                  Fines & Fees
                </Link>
              </li>
              <li>
                <Link href="/opac/account" className="text-sm hover:text-white transition-colors">
                  Account Settings
                </Link>
              </li>
            </ul>
          </div>

          {/* Library hours */}
          <div>
            <h3 className="text-white font-bold text-lg mb-4">Hours</h3>
            {library?.hoursDetailed ? (
              <ul className="space-y-1 text-sm">
                {library.hoursDetailed.map((day: { day: string; hours: string }) => (
                  <li key={day.day} className="flex justify-between">
                    <span>{day.day}</span>
                    <span>{day.hours}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm">Contact library for hours</p>
            )}
            
            {library?.locations && library.locations.length > 1 && (
              <Link 
                href="/opac/locations"
                className="inline-flex items-center gap-1 mt-4 text-sm text-primary-400 hover:text-primary-300"
              >
                View all {library.locations.length} locations
                <ExternalLink className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-foreground/20">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-sm text-muted-foreground">
              © {currentYear} {library?.name || "Library"}. All rights reserved.
            </p>
            <div className="flex items-center gap-6 text-sm">
              <Link href="/opac/accessibility" className="text-muted-foreground hover:text-muted-foreground/50">
                Accessibility
              </Link>
              <Link href="/opac/privacy" className="text-muted-foreground hover:text-muted-foreground/50">
                Privacy Policy
              </Link>
              <span className="text-muted-foreground">
                Powered by <span className="text-primary-400">StacksOS</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

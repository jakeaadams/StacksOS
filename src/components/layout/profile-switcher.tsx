"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  GraduationCap,
  Church,
  School,
  Palette,
  Check,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fetchWithAuth } from "@/lib/client-fetch";
import { toast } from "sonner";

interface ProfileInfo {
  type: string;
  description: string;
  primaryColor?: string;
}

const PROFILE_META: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; label: string; shortLabel: string }
> = {
  public: { icon: BookOpen, label: "Public Library", shortLabel: "Public" },
  school: { icon: School, label: "School / K-12", shortLabel: "School" },
  church: { icon: Church, label: "Church / Faith", shortLabel: "Church" },
  academic: { icon: GraduationCap, label: "Academic", shortLabel: "Academic" },
  custom: { icon: Palette, label: "Custom", shortLabel: "Custom" },
};

function hexToHsl(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return `0 0% ${Math.round(l * 100)}%`;
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function isHexColor(value: string | undefined): value is string {
  if (!value) return false;
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function applyBrandColor(hex: string) {
  if (!isHexColor(hex)) return;
  const hsl = hexToHsl(hex);
  const root = document.documentElement;
  root.style.setProperty("--brand-1", hsl);
  root.style.setProperty("--primary", hsl);
  root.style.setProperty("--ring", hsl);
}

export function ProfileSwitcher() {
  const router = useRouter();
  const [currentProfile, setCurrentProfile] = useState<string>("public");
  const [currentColor, setCurrentColor] = useState<string>("#0f766e");
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [switching, setSwitching] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetchWithAuth("/api/admin/demo-profile")
      .then((r) => r.json())
      .then((data) => {
        if (data?.currentProfile) setCurrentProfile(data.currentProfile);
        if (data?.primaryColor) setCurrentColor(data.primaryColor);
        if (data?.profiles) setProfiles(data.profiles);
        if (isHexColor(data?.primaryColor)) {
          applyBrandColor(data.primaryColor);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const handleSwitch = useCallback(
    async (profileType: string) => {
      if (profileType === currentProfile || switching) return;
      setSwitching(true);

      try {
        const res = await fetchWithAuth("/api/admin/demo-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileType }),
        });
        const data = await res.json();

        if (!res.ok || !data?.switched) {
          throw new Error(data?.error || "Failed to switch profile");
        }

        setCurrentProfile(profileType);
        setCurrentColor(data.primaryColor || "#0f766e");

        if (data.primaryColor) {
          applyBrandColor(data.primaryColor);
        }

        toast.success(`Switched to ${PROFILE_META[profileType]?.label || profileType} profile`, {
          description: data.description,
        });

        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to switch profile");
      } finally {
        setSwitching(false);
      }
    },
    [currentProfile, switching, router]
  );

  if (!loaded || profiles.length === 0) return null;

  const meta = (PROFILE_META[currentProfile] || PROFILE_META.public)!;
  const Icon = meta.icon;

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 px-3 gap-2 text-foreground/80 hover:text-foreground hover:bg-muted/70 rounded-full stx-pill"
              disabled={switching}
            >
              {switching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Icon className="h-4 w-4" />
              )}
              <span className="text-xs font-medium hidden lg:inline">{meta.shortLabel}</span>
              <div
                className="h-2.5 w-2.5 rounded-full ring-1 ring-border/50"
                style={{ backgroundColor: currentColor }}
              />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <div className="flex items-center gap-2">
            <Sparkles className="h-3 w-3" />
            Demo Profile Switcher
          </div>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="w-80">
        <DropdownMenuLabel className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5" />
          Switch Library Profile
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {profiles.map((profile) => {
          const pmeta = (PROFILE_META[profile.type] || PROFILE_META.custom)!;
          const PIcon = pmeta.icon;
          const isActive = profile.type === currentProfile;

          return (
            <DropdownMenuItem
              key={profile.type}
              onSelect={(e) => {
                e.preventDefault();
                void handleSwitch(profile.type);
              }}
              className="flex items-start gap-3 py-3 cursor-pointer"
              disabled={switching}
            >
              <div
                className="mt-0.5 h-8 w-8 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{
                  backgroundColor: profile.primaryColor
                    ? `${profile.primaryColor}18`
                    : "hsl(var(--muted))",
                  color: profile.primaryColor || "hsl(var(--foreground))",
                }}
              >
                <PIcon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{pmeta.label}</span>
                  {isActive && (
                    <Badge
                      variant="secondary"
                      className="h-5 px-1.5 text-[10px] rounded-full bg-emerald-500/10 text-emerald-600"
                    >
                      Active
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  {profile.description}
                </p>
              </div>
              {isActive && <Check className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <div className="px-2 py-2 text-[11px] text-muted-foreground">
          Switching profiles updates branding, feature flags, and discovery scope for demo purposes.
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

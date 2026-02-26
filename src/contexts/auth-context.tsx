"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { clientLogger } from "@/lib/client-logger";
import { fetchWithAuth, resetCSRFToken } from "@/lib/client-fetch";

interface OrgUnit {
  id: number;
  name: string;
  shortname: string;
}

interface User {
  id: number;
  username: string;
  displayName: string;
  photoUrl?: string;
  profileName?: string;
  saasRole?: string | null;
  saasTenantIds?: string[];
  isPlatformAdmin?: boolean;
  homeLibrary: string;
  homeLibraryId: number;
  activeOrgId: number;
  activeOrgName: string;
  workstation: string;
}

interface AuthContextType {
  user: User | null;
  orgs: OrgUnit[];
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string, workstation?: string) => Promise<boolean>;
  logout: () => Promise<void>;
  getOrgName: (orgId: number) => string;
  updateUser: (patch: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const WORKSTATION_KEY = "stacksos_workstation";
const WORKSTATION_ORG_KEY = "stacksos_workstation_org";

function normalizeSaaS(raw: any): {
  role: string | null;
  tenantIds: string[];
  isPlatformAdmin: boolean;
} {
  const platformRole =
    typeof raw?.platformRole === "string" && raw.platformRole.trim()
      ? raw.platformRole.trim()
      : null;
  const tenantIds = Array.isArray(raw?.tenantIds)
    ? raw.tenantIds.map((v: unknown) => String(v || "").trim()).filter(Boolean)
    : [];
  return {
    role: platformRole || (tenantIds.length > 0 ? "tenant_user" : null),
    tenantIds,
    isPlatformAdmin: Boolean(raw?.isPlatformAdmin),
  };
}

// Helper to flatten org tree
function flattenOrgTree(org: any): OrgUnit[] {
  const result: OrgUnit[] = [
    {
      id: org.id || org[0],
      name: org.name || org[6] || "Unknown",
      shortname: org.shortname || org[5] || "",
    },
  ];

  const children = org.children || org[1] || [];
  if (Array.isArray(children)) {
    for (const child of children) {
      result.push(...flattenOrgTree(child));
    }
  }

  return result;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [orgs, setOrgs] = useState<OrgUnit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const updateUser = (patch: Partial<User>) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  async function loadOrgs() {
    try {
      const res = await fetch("/api/evergreen/orgs", { credentials: "include" });
      const data = await res.json();

      // Handle Evergreen response format
      const orgTree = data?.payload?.[0] || data;
      if (orgTree) {
        const flatOrgs = flattenOrgTree(orgTree);
        setOrgs(flatOrgs);
      }
    } catch (err) {
      clientLogger.error("Failed to load orgs:", err);
    }
  }

  const getOrgName = (orgId: number): string => {
    const org = orgs.find((o) => o.id === orgId);
    return org?.name || `Library ${orgId}`;
  };

  async function checkSession() {
    try {
      const res = await fetch("/api/evergreen/auth", { credentials: "include" });
      const data = await res.json();

      if (data.ok && data.authenticated && data.user) {
        const homeOu = data.user.home_ou || 1;
        const saas = normalizeSaaS(data.saas);

        // Ensure we have an org list for name resolution.
        const orgsRes = await fetch("/api/evergreen/orgs", { credentials: "include" });
        const orgsData = await orgsRes.json();
        const orgTree = orgsData?.payload?.[0] || orgsData;
        const flatOrgs = orgTree ? flattenOrgTree(orgTree) : [];

        const homeOrg = flatOrgs.find((o) => o.id === homeOu);

        const workstationName =
          typeof window !== "undefined" ? localStorage.getItem(WORKSTATION_KEY) || "" : "";
        const rawOrg =
          typeof window !== "undefined" ? localStorage.getItem(WORKSTATION_ORG_KEY) : null;
        const workstationOrgId = rawOrg ? parseInt(rawOrg, 10) : NaN;

        const activeOrgId = Number.isFinite(workstationOrgId) ? workstationOrgId : homeOu;
        const activeOrg = flatOrgs.find((o) => o.id === activeOrgId);

        setUser({
          id: data.user.id || 0,
          username: data.user.usrname || "staff",
          displayName: data.user.first_given_name
            ? `${data.user.first_given_name} ${data.user.family_name}`
            : "Staff User",
          photoUrl: data.user.photo_url || data.user.photoUrl || undefined,
          profileName: data.profileName || undefined,
          saasRole: saas.role,
          saasTenantIds: saas.tenantIds,
          isPlatformAdmin: saas.isPlatformAdmin,
          homeLibrary: homeOrg?.name || `Library ${homeOu}`,
          homeLibraryId: homeOu,
          activeOrgId,
          activeOrgName: activeOrg?.name || homeOrg?.name || `Library ${activeOrgId}`,
          workstation: workstationName || "StacksOS",
        });
      }
    } catch (err) {
      clientLogger.error("Session check failed:", err);
    }

    setIsLoading(false);
  }
  useEffect(() => {
    void loadOrgs();
    void checkSession();
  }, []);

  const login = async (
    username: string,
    password: string,
    workstation?: string
  ): Promise<boolean> => {
    try {
      const res = await fetchWithAuth("/api/evergreen/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, workstation }),
      });

      const data = await res.json();

      if (data.ok) {
        const homeOu = data.user?.home_ou || 1;
        const homeOrg = orgs.find((o) => o.id === homeOu);
        const saas = normalizeSaaS(data.saas);

        // Best-effort: read active org from storage (login flow registers it).
        const rawOrg =
          typeof window !== "undefined" ? localStorage.getItem(WORKSTATION_ORG_KEY) : null;
        const workstationOrgId = rawOrg ? parseInt(rawOrg, 10) : NaN;
        const activeOrgId = Number.isFinite(workstationOrgId) ? workstationOrgId : homeOu;
        const activeOrgName = getOrgName(activeOrgId);

        setUser({
          id: data.user?.id || 1,
          username,
          displayName: data.user?.first_given_name
            ? `${data.user.first_given_name} ${data.user.family_name}`
            : username,
          photoUrl: data.user?.photo_url || data.user?.photoUrl || undefined,
          profileName: data.profileName || undefined,
          saasRole: saas.role,
          saasTenantIds: saas.tenantIds,
          isPlatformAdmin: saas.isPlatformAdmin,
          homeLibrary: homeOrg?.name || `Library ${homeOu}`,
          homeLibraryId: homeOu,
          activeOrgId,
          activeOrgName,
          workstation: workstation || "StacksOS",
        });
        return true;
      }
      return false;
    } catch (err) {
      clientLogger.error("Login failed:", err);
      return false;
    }
  };

  const logout = async () => {
    try {
      await fetchWithAuth("/api/evergreen/auth", { method: "DELETE" });
    } catch (err) {
      clientLogger.error("Logout error:", err);
    }
    resetCSRFToken();
    setUser(null);
    router.push("/login");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        orgs,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        getOrgName,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

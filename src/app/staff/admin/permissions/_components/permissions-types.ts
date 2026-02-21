export type PermissionItem = {
  code: string;
  label: string;
  description: string;
  evergreenHint: string;
};

export type PermissionSection = {
  title: string;
  description: string;
  items: PermissionItem[];
};

export type PermGroup = {
  id: number;
  name: string;
  parent?: number | null;
  parentName?: string | null;
  description?: string | null;
  application_perm?: string | null;
};

export type GroupPerm = {
  id: number;
  grp: number;
  perm: number;
  permCode?: string | null;
  permDescription?: string | null;
  depth?: unknown;
  grantable?: boolean;
};

export type EvergreenPermission = {
  id: number;
  code: string;
  description?: string | null;
};

export const SECTIONS: PermissionSection[] = [
  {
    title: "Circulation",
    description: "Checkout/checkin, holds, claims, payments, overrides.",
    items: [
      {
        code: "COPY_CHECKOUT",
        label: "Checkout items",
        description: "Allows staff to check out copies to patrons.",
        evergreenHint: "Evergreen Admin → Permission Groups → circulation perms",
      },
      {
        code: "COPY_CHECKIN",
        label: "Checkin items",
        description: "Allows staff to check in copies and trigger routing decisions.",
        evergreenHint: "Evergreen Admin → Permission Groups → circulation perms",
      },
      {
        code: "CIRC_OVERRIDE_DUE_DATE",
        label: "Override due date",
        description: "Allows overriding due dates when policy blocks a checkout.",
        evergreenHint: "Evergreen Admin → Permission Groups → circulation overrides",
      },
      {
        code: "MARK_ITEM_CLAIMS_RETURNED",
        label: "Mark claims returned",
        description: "Allows resolving claims returned and related stop-fines states.",
        evergreenHint: "Evergreen Admin → Permission Groups → circulation perms",
      },
      {
        code: "MAKE_PAYMENTS",
        label: "Take payments",
        description: "Allows posting payments and waives (where configured).",
        evergreenHint: "Evergreen Admin → Permission Groups → money perms",
      },
      {
        code: "REFUND_PAYMENT",
        label: "Refund payments",
        description: "Allows refunding a payment transaction.",
        evergreenHint: "Evergreen Admin → Permission Groups → money perms",
      },
    ],
  },
  {
    title: "Patrons",
    description: "Create/edit patrons, blocks/penalties, notes.",
    items: [
      {
        code: "CREATE_USER",
        label: "Create patrons",
        description: "Allows creating new patron accounts.",
        evergreenHint: "Evergreen Admin → Permission Groups → patron perms",
      },
      {
        code: "UPDATE_USER",
        label: "Edit patrons",
        description: "Allows editing patron core fields and addresses.",
        evergreenHint: "Evergreen Admin → Permission Groups → patron perms",
      },
      {
        code: "VIEW_USER",
        label: "View staff users",
        description: "Allows listing and searching staff accounts (Administration → Users).",
        evergreenHint: "Evergreen Admin → Permission Groups → staff/admin perms",
      },
    ],
  },
  {
    title: "Cataloging",
    description: "MARC, holdings, item status.",
    items: [
      {
        code: "CREATE_MARC",
        label: "Create / import bibliographic records",
        description: "Allows creating new bib records and importing MARC.",
        evergreenHint: "Evergreen Admin → Permission Groups → cataloging perms",
      },
      {
        code: "UPDATE_MARC",
        label: "Edit MARC",
        description: "Allows updating MARC for existing bib records.",
        evergreenHint: "Evergreen Admin → Permission Groups → cataloging perms",
      },
      {
        code: "ADMIN_COPY_STATUS",
        label: "Manage item statuses",
        description: "Allows editing copy statuses and related status flags.",
        evergreenHint: "Evergreen Admin → Local Administration → Copy Statuses",
      },
    ],
  },
  {
    title: "Acquisitions",
    description: "P.O.s, receiving, cancel/claim.",
    items: [
      {
        code: "VIEW_FUND",
        label: "View funds",
        description: "Allows viewing acquisitions funds.",
        evergreenHint: "Evergreen Admin → Permission Groups → acquisitions perms",
      },
      {
        code: "VIEW_PROVIDER",
        label: "View vendors",
        description: "Allows viewing vendor/provider records.",
        evergreenHint: "Evergreen Admin → Permission Groups → acquisitions perms",
      },
      {
        code: "ADMIN_ACQ_CLAIM",
        label: "Claim lineitems",
        description: "Allows claiming acquisitions lineitems (vendor follow-up).",
        evergreenHint: "Evergreen Admin → Permission Groups → acquisitions admin perms",
      },
    ],
  },
  {
    title: "Administration",
    description: "Workstations, org settings, server admin.",
    items: [
      {
        code: "ADMIN_WORKSTATION",
        label: "Manage workstations",
        description: "Allows registering and managing circulation workstations.",
        evergreenHint: "Evergreen Admin → Local Administration → Workstations",
      },
      {
        code: "ADMIN_ORG_UNIT",
        label: "Manage org units",
        description: "Allows editing org units and settings inheritance.",
        evergreenHint: "Evergreen Admin → Server Administration → Org Units",
      },
    ],
  },
];


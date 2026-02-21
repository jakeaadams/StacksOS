export type CircMatchpoint = {
  id: number;
  active: boolean;
  orgUnit?: number | null;
  orgUnitName?: string | null;
  grp?: number | null;
  grpName?: string | null;
  circModifier?: string | null;
  copyLocation?: number | null;
  copyLocationName?: string | null;
  isRenewal?: unknown;
  refFlag?: unknown;
  circulate?: boolean;
  durationRule?: number | null;
  durationRuleName?: string | null;
  recurringFineRule?: number | null;
  recurringFineRuleName?: string | null;
  maxFineRule?: number | null;
  maxFineRuleName?: string | null;
  description?: string | null;
};

export type CircMatchpointDraft = {
  active: boolean;
  orgUnit: number | null;
  grp: number | null;
  circModifier: string | null;
  copyLocation: number | null;
  isRenewal: boolean | null;
  refFlag: boolean | null;
  circulate: boolean;
  durationRule: number | null;
  recurringFineRule: number | null;
  maxFineRule: number | null;
  description: string;
};

export const DEFAULT_MATCHPOINT_DRAFT: CircMatchpointDraft = {
  active: true,
  orgUnit: null,
  grp: null,
  circModifier: null,
  copyLocation: null,
  isRenewal: null,
  refFlag: null,
  circulate: true,
  durationRule: null,
  recurringFineRule: null,
  maxFineRule: null,
  description: "",
};

export type DurationRule = {
  id: number;
  name: string;
  normal?: unknown;
  shrt?: unknown;
  extended?: unknown;
  maxRenewals?: unknown;
  maxAutoRenewals?: unknown;
};

export type FineRule = {
  id: number;
  name: string;
  normal?: unknown;
  high?: unknown;
  low?: unknown;
  recurrenceInterval?: unknown;
  gracePeriod?: unknown;
};

export type MaxFineRule = {
  id: number;
  name: string;
  amount?: unknown;
  isByPercent?: boolean;
};

export type CircModifier = {
  code: string;
  name: string;
  description?: string;
  sip2MediaType?: string;
  magneticMedia?: boolean;
};

export type OrgTreeNode = {
  id: number;
  name?: string | null;
  shortname?: string | null;
  children?: OrgTreeNode[];
};

export type OrgOption = { id: number; label: string; depth: number };

export type PermGroup = {
  id: number;
  name: string;
  parent?: number | null;
  parentName?: string | null;
  description?: string | null;
};

export type CopyLocation = {
  id: number;
  name: string;
  owningLib?: number | null;
  owningLibShortname?: string | null;
  opacVisible?: boolean;
};


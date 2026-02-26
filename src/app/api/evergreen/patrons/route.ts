import { NextRequest, NextResponse } from "next/server";
import {
  callOpenSRF,
  successResponse,
  errorResponse,
  notFoundResponse,
  serverErrorResponse,
  parseJsonBodyWithSchema,
  requireFields,
  encodeFieldmapper,
  getErrorMessage,
  getOrgTree,
  isOpenSRFEvent,
  getPatronFleshed,
  getRequestMeta,
  payloadFirst,
  AU_FIELDS,
  AC_FIELDS,
  AOU_FIELDS,
  CSP_FIELDS,
} from "@/lib/api";
import { logAuditEvent } from "@/lib/audit";
import { requirePermissions } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { storeCredential } from "@/lib/credential-store";
import { z } from "zod";

export async function GET(req: NextRequest) {
  try {
    const { authtoken, actor } = await requirePermissions(["VIEW_USER"]);
    const searchParams = req.nextUrl.searchParams;
    const action = searchParams.get("action");
    const query = searchParams.get("q") || "";
    const barcode = searchParams.get("barcode");
    const searchType = searchParams.get("type") || "name";
    const limit = parseInt(searchParams.get("limit") || "20");
    const idParam = searchParams.get("id") || searchParams.get("patron_id");

    // Fetch permission groups
    if (action === "groups") {
      const groupsResponse = await callOpenSRF(
        "open-ils.actor",
        "open-ils.actor.groups.tree.retrieve"
      );
      return successResponse({ groups: groupsResponse?.payload?.[0] });
    }

    // Lookup by patron id
    if (idParam) {
      const numericId = parseInt(String(idParam), 10);
      if (!Number.isFinite(numericId)) {
        return errorResponse("Invalid patron id", 400);
      }

      const patron = await getPatronFleshed(authtoken, numericId);
      if (patron && !patron.ilsevent) {
        const normalized = normalizePatron(patron);
        return successResponse({ patron: normalized, raw: patron });
      }
      return notFoundResponse("Patron not found");
    }

    // Lookup by barcode
    if (barcode) {
      const patronResponse = await callOpenSRF(
        "open-ils.actor",
        "open-ils.actor.user.fleshed.retrieve_by_barcode",
        [authtoken, barcode, ["card", "cards", "standing_penalties", "home_ou", "profile"]]
      );

      const patron = payloadFirst(patronResponse) as Record<string, unknown> | null;
      if (patron && !patron.ilsevent) {
        const normalized = normalizePatron(patron, barcode);
        return successResponse({ patron: normalized });
      }
      return notFoundResponse("Patron not found");
    }

    // Search patrons
    if (!query) {
      return errorResponse("Query or barcode required", 400);
    }

    logger.debug(
      {
        requestId: getRequestMeta(req).requestId,
        route: "api.evergreen.patrons",
        query,
        searchType,
      },
      "Patrons search"
    );

    const fleshFields = ["card", "home_ou", "profile"];
    const searchOu =
      Number(
        (actor as Record<string, unknown>)?.ws_ou ??
          (actor as Record<string, unknown>)?.home_ou ??
          1
      ) || 1;
    const offset = parseInt(searchParams.get("offset") || "0");

    if (searchType === "barcode") {
      const searchResponse = await callOpenSRF(
        "open-ils.actor",
        "open-ils.actor.user.fleshed.retrieve_by_barcode",
        [authtoken, query, fleshFields]
      );

      const patron = payloadFirst(searchResponse) as Record<string, unknown> | null;
      if (patron && !patron.ilsevent) {
        return successResponse({
          count: 1,
          patrons: [formatPatron(patron)],
        });
      }
    } else {
      const includeInactive = searchParams.get("inactive") === "true";

      // Primary: use Evergreen's advanced search (preferred), but some Evergreen installs
      // are buggy here. If it errors, fallback to a pcrud search on actor.usr.
      try {
        // Some Evergreen installs build invalid SQL when sort strings contain spaces
        // (e.g. "family_name ASC" arriving as "family_name+ASC"). Passing an empty
        // sort list delegates ordering to Evergreen defaults and avoids that bug.
        const sort: string[] = [];

        let search: Record<string, unknown>;
        if (searchType === "name") {
          search = { name: { value: query } };
        } else if (searchType === "email") {
          search = { email: { value: query, group: 0 } };
        } else if (searchType === "phone") {
          // Evergreen's staff UI uses a dedicated "phone" key grouped with other contact fields.
          search = { phone: { value: query, group: 2 } };
        } else {
          search = { name: { value: query } };
        }

        const searchResponse = await callOpenSRF(
          "open-ils.actor",
          "open-ils.actor.patron.search.advanced.fleshed",
          [authtoken, search, limit, sort, includeInactive, searchOu, fleshFields, offset]
        );

        const results = Array.isArray(searchResponse?.payload) ? searchResponse.payload : [];
        const patrons = results
          .filter((p: Record<string, unknown>) => p && !p.ilsevent)
          .map(formatPatron);

        return successResponse({ count: patrons.length, patrons });
      } catch (err: unknown) {
        logger.warn(
          {
            requestId: getRequestMeta(req).requestId,
            route: "api.evergreen.patrons",
            error: String(err),
          },
          "Advanced patron search failed; falling back to pcrud actor.usr search"
        );

        // Fallback: pcrud search on actor.usr (au), fleshed for card/home_ou/profile.
        const q = query.trim();
        const parts = q.split(/\s+/).filter(Boolean);
        const qOr = (v: string) => ({ "~*": v });

        const orConditions: Record<string, unknown>[] = [
          { usrname: qOr(q) },
          { first_given_name: qOr(q) },
          { family_name: qOr(q) },
          { email: qOr(q) },
          { day_phone: qOr(q) },
          { other_phone: qOr(q) },
        ];

        // If user typed multiple tokens (e.g. "Jake Adams"), also search each token.
        for (const part of parts) {
          orConditions.push({ usrname: qOr(part) });
          orConditions.push({ first_given_name: qOr(part) });
          orConditions.push({ family_name: qOr(part) });
        }

        const baseFilter: Record<string, unknown> = {
          deleted: "f",
          "-or": orConditions,
        };

        if (!includeInactive) {
          baseFilter.active = "t";
        }

        const pcrudResponse = await callOpenSRF(
          "open-ils.pcrud",
          "open-ils.pcrud.search.au.atomic",
          [
            authtoken,
            baseFilter,
            {
              flesh: 1,
              flesh_fields: { au: ["card", "home_ou", "profile"] },
              limit,
              offset,
              order_by: { au: "family_name" },
            },
          ]
        );

        const results = Array.isArray(pcrudResponse?.payload?.[0]) ? pcrudResponse.payload[0] : [];
        const patrons = results
          .filter((p: Record<string, unknown>) => p && !p.ilsevent)
          .map((p: Record<string, unknown>) => normalizePatron(p as Record<string, unknown>));

        return successResponse({ count: patrons.length, patrons });
      }
    }

    return successResponse({ count: 0, patrons: [] });
  } catch (error: unknown) {
    return serverErrorResponse(error, "Patrons GET", req);
  }
}

function formatPatron(patron: Record<string, unknown>) {
  const cardRaw = patron.card as Record<string, unknown> | undefined;
  const card = cardRaw?.__p || cardRaw || {};
  const profileRaw = patron.profile as Record<string, unknown> | undefined;
  const profile = profileRaw?.__p || profileRaw || {};
  const __p = patron.__p as unknown[] | undefined;

  return {
    id: patron.id ?? __p?.[AU_FIELDS.id],
    barcode: Array.isArray(card)
      ? card[AC_FIELDS.barcode]
      : (card as Record<string, unknown>).barcode || "Unknown",
    firstName: patron.first_given_name || __p?.[AU_FIELDS.first_given_name] || "",
    lastName: patron.family_name || __p?.[AU_FIELDS.family_name] || "",
    email: patron.email || __p?.[AU_FIELDS.email] || "",
    phone: patron.day_phone || __p?.[AU_FIELDS.day_phone] || "",
    homeLibrary: patron.home_ou || __p?.[AU_FIELDS.home_ou] || 1,
    patronType: (profile as Record<string, unknown>).name || "Patron",
    isActive: patron.active === "t" || __p?.[AU_FIELDS.active] === "t",
    cardExpiry: patron.expire_date || __p?.[AU_FIELDS.expire_date] || "",
  };
}

function extractCard(patron: Record<string, unknown>) {
  const __p = patron.__p as unknown[] | undefined;
  const cards = patron.card || patron.cards || __p?.[AU_FIELDS.card];
  const card = Array.isArray(cards) ? cards[0] : cards;
  if (!card) return null;

  const cardObj = card as Record<string, unknown>;
  if (Array.isArray(cardObj.__p)) {
    const cp = cardObj.__p as unknown[];
    return {
      active: cp[AC_FIELDS.active],
      barcode: cp[AC_FIELDS.barcode],
      id: cp[AC_FIELDS.id],
      usr: cp[AC_FIELDS.usr],
    };
  }

  return {
    active: cardObj.active,
    barcode: cardObj.barcode,
    id: cardObj.id,
    usr: cardObj.usr,
  };
}

function normalizePatron(patron: Record<string, unknown>, fallbackBarcode?: string) {
  const card = extractCard(patron);
  const __p = patron.__p as unknown[] | undefined;
  const rawId = patron.id ?? __p?.[AU_FIELDS.id];
  const parsedId = typeof rawId === "number" ? rawId : parseInt(String(rawId || ""), 10);
  const patronId = Number.isFinite(parsedId) ? parsedId : (card?.usr ?? card?.id);
  const firstGiven =
    patron.first_given_name || patron.firstName || __p?.[AU_FIELDS.first_given_name] || "";
  const familyName = patron.family_name || patron.lastName || __p?.[AU_FIELDS.family_name] || "";
  const activeVal = patron.active ?? __p?.[AU_FIELDS.active];
  const barredVal = patron.barred ?? __p?.[AU_FIELDS.barred];

  return {
    id: patronId,
    barcode: card?.barcode || patron.barcode || fallbackBarcode || "",
    first_given_name: firstGiven,
    family_name: familyName,
    email: patron.email,
    day_phone: patron.day_phone,
    home_ou: patron.home_ou || __p?.[AU_FIELDS.home_ou] || __p?.[AU_FIELDS.ws_ou],
    profile: patron.profile || __p?.[AU_FIELDS.profile] || __p?.[AU_FIELDS.id],
    active: activeVal === "t" || activeVal === true,
    barred: barredVal === "t" || barredVal === true,
    expire_date: patron.expire_date || __p?.[AU_FIELDS.expire_date],
    standing_penalties: patron.standing_penalties || __p?.[AU_FIELDS.standing_penalties] || [],
  };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\.{2,}/g, ".")
    .slice(0, 32);
}

function formatDate(value: Date) {
  return value.toISOString().split("T")[0];
}

async function resolveHomeOu(provided?: string | number | null) {
  const numeric = typeof provided === "number" ? provided : parseInt(String(provided || ""), 10);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;

  const tree = await getOrgTree();
  const rootId = typeof tree?.id === "number" ? tree.id : tree?.__p?.[AOU_FIELDS.id] || 1;
  return typeof rootId === "number" ? rootId : 1;
}

async function getDefaultProfileId(_authtoken: string): Promise<number> {
  const groupsResponse = await callOpenSRF("open-ils.actor", "open-ils.actor.groups.tree.retrieve");
  const tree = payloadFirst(groupsResponse);
  const candidates: Array<{ id: number; name: string }> = [];

  const walk = (node: Record<string, unknown>) => {
    if (!node) return;
    const name = node.name ?? node[2];
    const id = node.id ?? node[0];
    if (typeof name === "string" && name.toLowerCase().includes("patron")) {
      const parsedId = typeof id === "number" ? id : parseInt(String(id || ""), 10);
      if (Number.isFinite(parsedId)) {
        candidates.push({ id: parsedId, name });
      }
    }
    const children = node.children || node[3] || [];
    if (Array.isArray(children)) children.forEach((c: Record<string, unknown>) => walk(c));
  };

  if (Array.isArray(tree)) {
    tree.forEach((t: Record<string, unknown>) => walk(t));
  } else if (tree && typeof tree === "object") {
    walk(tree as Record<string, unknown>);
  }

  if (candidates.length === 0) return 2;

  const normalized = candidates.map((c) => ({
    ...c,
    nameLower: c.name.toLowerCase(),
  }));

  const best =
    normalized.find((c) => /\bpatrons?\b/.test(c.nameLower) && !c.nameLower.includes("api")) ||
    normalized.find((c) => !c.nameLower.includes("api")) ||
    normalized[0];

  return best?.id ?? 2;
}

async function getDefaultPatronSettings(authtoken: string, homeOu: number) {
  const settingsResponse = await callOpenSRF(
    "open-ils.actor",
    "open-ils.actor.ou_setting.ancestor_default.batch",
    [homeOu, ["ui.patron.default_ident_type", "ui.patron.default_country"], authtoken]
  );
  const settings = (payloadFirst(settingsResponse) as Record<string, unknown>) || {};

  const identTypeRaw = settings["ui.patron.default_ident_type"];
  const identTypeParsed = parseInt(String(identTypeRaw ?? ""), 10);
  const identType = Number.isFinite(identTypeParsed) ? identTypeParsed : 1;

  const country = (settings["ui.patron.default_country"] as string) || "US";
  return { identType, country };
}

async function checkUsernameExists(authtoken: string, username: string): Promise<boolean> {
  const response = await callOpenSRF("open-ils.actor", "open-ils.actor.username.exists", [
    authtoken,
    username,
  ]);
  const result = payloadFirst(response);
  if (isOpenSRFEvent(result)) {
    throw result;
  }
  if (result === null || result === undefined || result === 0 || result === "0") {
    return false;
  }
  if (result === 1 || result === "1") {
    return true;
  }
  return !!result;
}

async function checkBarcodeExists(authtoken: string, barcode: string): Promise<boolean> {
  const response = await callOpenSRF("open-ils.actor", "open-ils.actor.barcode.exists", [
    authtoken,
    barcode,
  ]);
  const result = payloadFirst(response);
  if (isOpenSRFEvent(result)) {
    throw result;
  }
  if (result === null || result === undefined || result === 0 || result === "0") {
    return false;
  }
  if (result === 1 || result === "1") {
    return true;
  }
  return !!result;
}

async function generateUniqueUsername(authtoken: string, base: string): Promise<string> {
  const candidate = slugify(base) || "patron";
  if (!(await checkUsernameExists(authtoken, candidate))) return candidate;

  for (let attempt = 0; attempt < 10; attempt++) {
    const suffix = Math.floor(Math.random() * 900 + 100).toString();
    const next = `${candidate}.${suffix}`;
    if (!(await checkUsernameExists(authtoken, next))) return next;
  }

  throw new Error("Unable to generate a unique username");
}

async function generateUniqueBarcode(authtoken: string, prefix = "29"): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const random = Math.floor(Math.random() * 1e12)
      .toString()
      .padStart(12, "0");
    const candidate = `${prefix}${random}`.slice(0, 14);
    if (!(await checkBarcodeExists(authtoken, candidate))) return candidate;
  }
  throw new Error("Unable to generate a unique barcode");
}

function generatePassword(length = 8): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let output = "";
  for (let i = 0; i < length; i++) {
    output += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return output;
}

export async function POST(req: NextRequest) {
  try {
    const { authtoken, actor } = await requirePermissions(["UPDATE_USER"]);
    const { ip, userAgent, requestId } = getRequestMeta(req);
    const patronSchema = z
      .object({
        family_name: z.string().max(200).optional(),
        first_given_name: z.string().max(200).optional(),
        second_given_name: z.string().max(200).optional(),
        dob: z.string().max(20).optional(),
        ident_value: z.string().max(100).optional(),
        ident_value2: z.string().max(100).optional(),
        email: z.string().max(300).optional(),
        day_phone: z.string().max(50).optional(),
        evening_phone: z.string().max(50).optional(),
        other_phone: z.string().max(50).optional(),
        home_ou: z.number().int().optional(),
        profile: z.number().int().optional(),
        expire_date: z.string().max(30).optional(),
        barred: z.union([z.boolean(), z.literal("t"), z.literal("f")]).optional(),
        active: z.union([z.boolean(), z.literal("t"), z.literal("f")]).optional(),
        juvenile: z.union([z.boolean(), z.literal("t"), z.literal("f")]).optional(),
        usrname: z.string().max(200).optional(),
        passwd: z.string().max(200).optional(),
        net_access_level: z.number().int().optional(),
      })
      .passthrough();
    const body = await parseJsonBodyWithSchema(req, patronSchema);
    if (body instanceof NextResponse) return body;

    const missing = requireFields(body, ["firstName", "lastName"]);
    if (missing) return missing;

    const firstName = String(body.firstName || body.first_given_name || "").trim();
    const lastName = String(body.lastName || body.family_name || "").trim();
    if (!firstName || !lastName) {
      return errorResponse("First and last name are required", 400);
    }

    const homeOuCandidate = body.homeLibrary ?? body.home_ou ?? body.homeOu;
    const homeOu = await resolveHomeOu(
      typeof homeOuCandidate === "string" || typeof homeOuCandidate === "number"
        ? homeOuCandidate
        : undefined
    );

    const profileRaw = body.profile ?? body.profile_id ?? body.profileId;
    const profileId = Number.isFinite(parseInt(String(profileRaw ?? ""), 10))
      ? parseInt(String(profileRaw), 10)
      : await getDefaultProfileId(authtoken);

    const settings = await getDefaultPatronSettings(authtoken, homeOu);
    const identTypeRaw = body.identType ?? body.ident_type;
    const identType = Number.isFinite(parseInt(String(identTypeRaw ?? ""), 10))
      ? parseInt(String(identTypeRaw), 10)
      : settings.identType;

    const addressInput =
      typeof body.address === "object" && body.address !== null
        ? (body.address as Record<string, unknown>)
        : ({} as Record<string, unknown>);
    const street1 = String(addressInput["street1"] || body.street1 || "").trim();
    const street2 = String(addressInput["street2"] || body.street2 || "").trim();
    const city = String(addressInput["city"] || body.city || "").trim();
    const state = String(addressInput["state"] || body.state || "").trim();
    const postCode = String(
      addressInput["post_code"] || addressInput["zip"] || body.post_code || body.zip || ""
    ).trim();
    const country = String(
      addressInput["country"] || body.country || settings.country || "US"
    ).trim();

    if (!street1 || !city || !postCode || !country) {
      return errorResponse("Address street, city, postal code, and country are required", 400);
    }

    const email = String(body.email || "").trim();
    const phone = String(body.phone || body.day_phone || "").trim();

    let barcode = String(body.barcode || "").trim();
    let username = String(body.username || body.usrname || "").trim();
    let password = String(body.password || body.passwd || body.pin || "").trim();

    const generated: Record<string, string> = {};

    if (barcode) {
      if (await checkBarcodeExists(authtoken, barcode)) {
        return errorResponse("Barcode already exists", 409);
      }
    } else {
      const mode = String(process.env.STACKSOS_PATRON_BARCODE_MODE || "generate")
        .trim()
        .toLowerCase();

      // For SaaS / real libraries: many will require staff to use the barcode printed
      // on the physical card. Default remains "generate" for sandbox convenience.
      if (mode === "require" || mode === "required") {
        return errorResponse(
          "Barcode is required by this tenant configuration. Enter the patron's card barcode.",
          400
        );
      }

      const prefix = String(process.env.STACKSOS_PATRON_BARCODE_PREFIX || "29").trim() || "29";
      barcode = await generateUniqueBarcode(authtoken, prefix);
      generated.barcode = barcode;
    }

    if (username) {
      if (await checkUsernameExists(authtoken, username)) {
        return errorResponse("Username already exists", 409);
      }
    } else {
      username = await generateUniqueUsername(authtoken, `${firstName}.${lastName}`);
      generated.username = username;
    }

    if (!password) {
      password = generatePassword();
      generated.password = password;
    }

    const expireDate =
      body.expireDate ||
      body.expire_date ||
      formatDate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));

    const cardTempId = -1;
    const addressTempId = -2;

    const card = encodeFieldmapper("ac", {
      id: cardTempId,
      barcode,
      active: true,
      isnew: 1,
    });

    const address = encodeFieldmapper("aua", {
      id: addressTempId,
      address_type: addressInput.address_type || "MAILING",
      street1,
      street2: street2 || null,
      city,
      state: state || null,
      post_code: postCode,
      country,
      valid: addressInput.valid ?? true,
      within_city_limits: addressInput.within_city_limits ?? true,
      pending: addressInput.pending ?? false,
      isnew: 1,
    });

    const patron = encodeFieldmapper("au", {
      isnew: 1,
      usrname: username,
      passwd: password,
      first_given_name: firstName,
      family_name: lastName,
      email: email || null,
      day_phone: phone || null,
      home_ou: homeOu,
      profile: profileId,
      ident_type: identType,
      ident_value: body.identValue || body.ident_value || barcode,
      expire_date: expireDate,
      active: true,
      barred: false,
      card: cardTempId,
      cards: [card],
      addresses: [address],
      mailing_address: addressTempId,
      billing_address: addressTempId,
    });

    const response = await callOpenSRF("open-ils.actor", "open-ils.actor.patron.update", [
      authtoken,
      patron,
    ]);

    const result = payloadFirst(response);
    if (!result || isOpenSRFEvent(result) || result.ilsevent) {
      return errorResponse(getErrorMessage(result, "Patron creation failed"), 400, result);
    }

    const normalized = normalizePatron(result, barcode);

    await logAuditEvent({
      action: "patron.create",
      entity: "patron",
      entityId: normalized.id as number | undefined,
      status: "success",
      actor,
      orgId: homeOu,
      ip,
      userAgent,
      requestId,
      details: { barcode, generated },
    });

    // SECURITY: Generated passwords are never returned in the response body.
    // Instead, a one-time credential token is issued that the client must
    // redeem via POST /api/evergreen/patrons/credentials to retrieve the
    // password exactly once.
    const hasCredentials = Object.keys(generated).length > 0;
    const safeGenerated: Record<string, string | boolean> = {};
    if (generated.barcode) safeGenerated.barcode = generated.barcode;
    if (generated.username) safeGenerated.username = generated.username;
    if (generated.password) {
      safeGenerated.credentialToken = storeCredential(generated.password);
      safeGenerated.hasGeneratedPassword = true;
    }

    const resp = successResponse({
      patron: normalized,
      ...(hasCredentials ? { generated: safeGenerated } : {}),
    });
    if (hasCredentials) {
      resp.headers.set("x-credential-warning", "true");
    }
    return resp;
  } catch (error: unknown) {
    return serverErrorResponse(error, "Patrons POST", req);
  }
}

// PUT - Update existing patron
export async function PUT(req: NextRequest) {
  try {
    const { authtoken, actor } = await requirePermissions(["UPDATE_USER"]);
    const { ip, userAgent, requestId } = getRequestMeta(req);
    const patronSchema = z
      .object({
        family_name: z.string().max(200).optional(),
        first_given_name: z.string().max(200).optional(),
        second_given_name: z.string().max(200).optional(),
        dob: z.string().max(20).optional(),
        ident_value: z.string().max(100).optional(),
        ident_value2: z.string().max(100).optional(),
        email: z.string().max(300).optional(),
        day_phone: z.string().max(50).optional(),
        evening_phone: z.string().max(50).optional(),
        other_phone: z.string().max(50).optional(),
        home_ou: z.number().int().optional(),
        profile: z.number().int().optional(),
        expire_date: z.string().max(30).optional(),
        barred: z.union([z.boolean(), z.literal("t"), z.literal("f")]).optional(),
        active: z.union([z.boolean(), z.literal("t"), z.literal("f")]).optional(),
        juvenile: z.union([z.boolean(), z.literal("t"), z.literal("f")]).optional(),
        usrname: z.string().max(200).optional(),
        passwd: z.string().max(200).optional(),
        net_access_level: z.number().int().optional(),
      })
      .passthrough();
    const body = await parseJsonBodyWithSchema(req, patronSchema);
    if (body instanceof NextResponse) return body;

    const patronId = parseInt(String(body.id || body.patronId || ""), 10);
    if (!Number.isFinite(patronId)) {
      return errorResponse("Patron ID is required", 400);
    }

    // Fetch current patron data
    const currentPatron = await getPatronFleshed(authtoken, patronId);
    if (!currentPatron || currentPatron.ilsevent) {
      return notFoundResponse("Patron not found");
    }

    const toLinkId = (value: unknown): number | null => {
      if (!value || typeof value !== "object") return null;
      const raw = (value as Record<string, unknown>).id;
      if (typeof raw === "number" && Number.isFinite(raw)) return raw;
      const parsed = parseInt(String(raw ?? ""), 10);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const toFieldmapperObject = (value: unknown): Record<string, unknown> | null => {
      if (!value || typeof value !== "object") return null;
      const classId = (value as Record<string, unknown>).__class;
      if (typeof classId !== "string" || !classId.trim()) return null;
      return encodeFieldmapper(classId, value as Record<string, unknown>);
    };

    // Evergreen expects a full-enough patron object for updates (notably:
    // `last_xact_id` for collision checking and required group/home fields).
    // Start from the current patron record and apply only the requested changes.
    const updates: Record<string, unknown> = { id: patronId, ischanged: 1 };
    const requestedUpdates: string[] = [];

    for (const [key, value] of Object.entries(currentPatron)) {
      if (key === "__class" || key === "id") continue;
      if (Array.isArray(value)) continue;
      if (value && typeof value === "object") {
        const linkId = toLinkId(value);
        if (linkId !== null) updates[key] = linkId;
        continue;
      }
      updates[key] = value;
    }

    // Evergreen's `open-ils.actor.patron.update` expects cards/addresses to be present
    // (at least for many installs). If we send `[]`, Evergreen can accept the call but
    // silently drop unrelated field updates (email/profile/etc). Preserve the existing
    // collections and only mutate them when explicitly requested.
    updates.cards = Array.isArray((currentPatron as Record<string, unknown>).cards)
      ? ((currentPatron as Record<string, unknown>).cards as Record<string, unknown>[])
          .map((c: unknown) => toFieldmapperObject(c))
          .filter(Boolean)
      : [];
    updates.addresses = Array.isArray((currentPatron as Record<string, unknown>).addresses)
      ? ((currentPatron as Record<string, unknown>).addresses as Record<string, unknown>[])
          .map((a: unknown) => toFieldmapperObject(a))
          .filter(Boolean)
      : [];

    // These are optional collections, but Evergreen expects arrayrefs (not null).
    updates.waiver_entries = Array.isArray(
      (currentPatron as Record<string, unknown>).waiver_entries
    )
      ? (currentPatron as Record<string, unknown>).waiver_entries
      : [];
    updates.survey_responses = Array.isArray(
      (currentPatron as Record<string, unknown>).survey_responses
    )
      ? (currentPatron as Record<string, unknown>).survey_responses
      : [];
    updates.stat_cat_entries = Array.isArray(
      (currentPatron as Record<string, unknown>).stat_cat_entries
    )
      ? (currentPatron as Record<string, unknown>).stat_cat_entries
      : [];

    // Basic fields
    if (body.firstName !== undefined || body.first_given_name !== undefined) {
      updates.first_given_name = String(body.firstName || body.first_given_name || "").trim();
      requestedUpdates.push("first_given_name");
    }
    if (body.lastName !== undefined || body.family_name !== undefined) {
      updates.family_name = String(body.lastName || body.family_name || "").trim();
      requestedUpdates.push("family_name");
    }
    if (body.email !== undefined) {
      updates.email = body.email ? String(body.email).trim() : null;
      requestedUpdates.push("email");
    }
    if (body.phone !== undefined || body.day_phone !== undefined) {
      updates.day_phone =
        body.phone || body.day_phone ? String(body.phone || body.day_phone).trim() : null;
      requestedUpdates.push("day_phone");
    }
    if (body.homeLibrary !== undefined || body.home_ou !== undefined) {
      updates.home_ou = parseInt(String(body.homeLibrary || body.home_ou), 10);
      requestedUpdates.push("home_ou");
    }
    if (body.profile !== undefined) {
      updates.profile = parseInt(String(body.profile), 10);
      requestedUpdates.push("profile");
    }
    if (body.expireDate !== undefined || body.expire_date !== undefined) {
      updates.expire_date = body.expireDate || body.expire_date;
      requestedUpdates.push("expire_date");
    }
    if (body.active !== undefined) {
      updates.active = body.active === true || body.active === "t";
      requestedUpdates.push("active");
    }
    if (body.barred !== undefined) {
      updates.barred = body.barred === true || body.barred === "t";
      requestedUpdates.push("barred");
    }

    // Password/PIN reset (staff-side).
    //
    // Evergreen's `open-ils.actor.patron.update` supports setting `passwd` for
    // existing users and will handle hashing/storage internally.
    const rawPassword = body.password ?? body.passwd ?? body.pin;
    if (rawPassword !== undefined) {
      const password = String(rawPassword || "").trim();
      if (!password) {
        return errorResponse("Password cannot be empty", 400);
      }
      if (password.length < 4) {
        return errorResponse("Password must be at least 4 characters", 400);
      }
      updates.passwd = password;
      requestedUpdates.push("passwd");
    }

    const patron = encodeFieldmapper("au", updates);

    const response = await callOpenSRF("open-ils.actor", "open-ils.actor.patron.update", [
      authtoken,
      patron,
    ]);

    const result = payloadFirst(response);
    const lastEvent = (result as Record<string, unknown>)?.last_event;
    if (!result || isOpenSRFEvent(result) || result.ilsevent || isOpenSRFEvent(lastEvent)) {
      return errorResponse(getErrorMessage(result, "Patron update failed"), 400, result);
    }

    const normalized = normalizePatron(result);
    const mismatch = requestedUpdates.find((k) => {
      if (k === "passwd") return false;
      if (k === "first_given_name") return normalized.first_given_name !== updates.first_given_name;
      if (k === "family_name") return normalized.family_name !== updates.family_name;
      if (k === "email") return (normalized.email || null) !== (updates.email || null);
      if (k === "day_phone") return (normalized.day_phone || null) !== (updates.day_phone || null);
      if (k === "home_ou") return Number(normalized.home_ou) !== Number(updates.home_ou);
      if (k === "profile") return Number(normalized.profile) !== Number(updates.profile);
      if (k === "expire_date")
        return String(normalized.expire_date || "") !== String(updates.expire_date || "");
      if (k === "active")
        return (
          Boolean(normalized.active) !== Boolean(updates.active === "t" || updates.active === true)
        );
      if (k === "barred")
        return (
          Boolean(normalized.barred) !== Boolean(updates.barred === "t" || updates.barred === true)
        );
      return false;
    });
    if (mismatch) {
      logger.warn(
        { requestId, route: "api.evergreen.patrons", patronId, mismatch },
        "Evergreen accepted patron.update but did not persist requested changes"
      );
      return errorResponse(
        "Patron update did not persist (Evergreen rejected one or more field updates)",
        502,
        {
          mismatch,
        }
      );
    }

    await logAuditEvent({
      action: "patron.update",
      entity: "patron",
      entityId: patronId,
      status: "success",
      actor,
      ip,
      userAgent,
      requestId,
      details: {
        updates: requestedUpdates.map((k) => (k === "passwd" ? "password" : k)),
      },
    });

    return successResponse({ patron: normalized });
  } catch (error: unknown) {
    return serverErrorResponse(error, "Patrons PUT", req);
  }
}

// PATCH - Manage patron blocks (standing penalties) and notes
export async function PATCH(req: NextRequest) {
  try {
    const { authtoken, actor } = await requirePermissions(["UPDATE_USER"]);
    const { ip, userAgent, requestId } = getRequestMeta(req);
    const patronSchema = z
      .object({
        family_name: z.string().max(200).optional(),
        first_given_name: z.string().max(200).optional(),
        second_given_name: z.string().max(200).optional(),
        dob: z.string().max(20).optional(),
        ident_value: z.string().max(100).optional(),
        ident_value2: z.string().max(100).optional(),
        email: z.string().max(300).optional(),
        day_phone: z.string().max(50).optional(),
        evening_phone: z.string().max(50).optional(),
        other_phone: z.string().max(50).optional(),
        home_ou: z.number().int().optional(),
        profile: z.number().int().optional(),
        expire_date: z.string().max(30).optional(),
        barred: z.union([z.boolean(), z.literal("t"), z.literal("f")]).optional(),
        active: z.union([z.boolean(), z.literal("t"), z.literal("f")]).optional(),
        juvenile: z.union([z.boolean(), z.literal("t"), z.literal("f")]).optional(),
        usrname: z.string().max(200).optional(),
        passwd: z.string().max(200).optional(),
        net_access_level: z.number().int().optional(),
      })
      .passthrough();
    const body = await parseJsonBodyWithSchema(req, patronSchema);
    if (body instanceof NextResponse) return body;

    const action = body.action;
    const patronId = parseInt(String(body.patronId || body.patron_id || ""), 10);

    if (!Number.isFinite(patronId)) {
      return errorResponse("Patron ID is required", 400);
    }

    // Handle standing penalties (blocks)
    if (action === "addBlock" || action === "add_penalty") {
      const penaltyType = parseInt(String(body.penaltyType || body.standing_penalty || ""), 10);
      const note = String(body.note || "").trim();
      const orgUnit = parseInt(String(body.orgUnit || body.org_unit || actor?.ws_ou || 1), 10);

      if (!Number.isFinite(penaltyType)) {
        return errorResponse("Penalty type is required", 400);
      }

      const penalty = encodeFieldmapper("ausp", {
        usr: patronId,
        standing_penalty: penaltyType,
        org_unit: orgUnit,
        note: note || null,
        staff: actor?.id,
        set_date: "now",
        isnew: 1,
      });

      const response = await callOpenSRF("open-ils.actor", "open-ils.actor.user.penalty.apply", [
        authtoken,
        penalty,
      ]);

      const result = payloadFirst(response);
      if (isOpenSRFEvent(result) || result?.ilsevent) {
        return errorResponse(getErrorMessage(result, "Failed to add block"), 400, result);
      }

      await logAuditEvent({
        action: "patron.block.add",
        entity: "patron",
        entityId: patronId,
        status: "success",
        actor,
        ip,
        userAgent,
        requestId,
        details: { penaltyType, note },
      });

      return successResponse({ penaltyId: result, message: "Block added" });
    }

    if (action === "removeBlock" || action === "remove_penalty") {
      const penaltyId = parseInt(String(body.penaltyId || body.penalty_id || ""), 10);

      if (!Number.isFinite(penaltyId)) {
        return errorResponse("Penalty ID is required", 400);
      }

      const response = await callOpenSRF("open-ils.actor", "open-ils.actor.user.penalty.remove", [
        authtoken,
        penaltyId,
      ]);

      const result = payloadFirst(response);
      if (isOpenSRFEvent(result) || result?.ilsevent) {
        return errorResponse(getErrorMessage(result, "Failed to remove block"), 400, result);
      }

      await logAuditEvent({
        action: "patron.block.remove",
        entity: "patron",
        entityId: patronId,
        status: "success",
        actor,
        ip,
        userAgent,
        requestId,
        details: { penaltyId },
      });

      return successResponse({ message: "Block removed" });
    }

    // Handle patron notes
    if (action === "addNote") {
      const title = String(body.title || "Note").trim();
      const value = String(body.value || body.note || "").trim();
      const isPublic = body.public === true || body.pub === true || body.pub === "t";

      if (!value) {
        return errorResponse("Note content is required", 400);
      }

      const note = encodeFieldmapper("aun", {
        usr: patronId,
        creator: actor?.id,
        title,
        value,
        pub: isPublic,
        create_date: "now",
        isnew: 1,
      });

      const response = await callOpenSRF("open-ils.actor", "open-ils.actor.note.create", [
        authtoken,
        note,
      ]);

      const result = payloadFirst(response);
      if (isOpenSRFEvent(result) || result?.ilsevent) {
        return errorResponse(getErrorMessage(result, "Failed to add note"), 400, result);
      }

      await logAuditEvent({
        action: "patron.note.add",
        entity: "patron",
        entityId: patronId,
        status: "success",
        actor,
        ip,
        userAgent,
        requestId,
        details: { title, public: isPublic },
      });

      return successResponse({ noteId: result, message: "Note added" });
    }

    if (action === "deleteNote") {
      const noteId = parseInt(String(body.noteId || body.note_id || ""), 10);

      if (!Number.isFinite(noteId)) {
        return errorResponse("Note ID is required", 400);
      }

      const response = await callOpenSRF("open-ils.actor", "open-ils.actor.note.delete", [
        authtoken,
        noteId,
      ]);

      const result = payloadFirst(response);
      if (isOpenSRFEvent(result) || result?.ilsevent) {
        return errorResponse(getErrorMessage(result, "Failed to delete note"), 400, result);
      }

      await logAuditEvent({
        action: "patron.note.delete",
        entity: "patron",
        entityId: patronId,
        status: "success",
        actor,
        ip,
        userAgent,
        requestId,
        details: { noteId },
      });

      return successResponse({ message: "Note deleted" });
    }

    if (action === "getNotes") {
      const response = await callOpenSRF("open-ils.actor", "open-ils.actor.note.retrieve.all", [
        authtoken,
        { usr: patronId },
      ]);

      const notes = payloadFirst(response) || [];
      const formattedNotes = (Array.isArray(notes) ? notes : []).map(
        (n: Record<string, unknown>) => {
          const np = n.__p as unknown[] | undefined;
          return {
            id: n.id || np?.[0],
            title: n.title || np?.[1] || "Note",
            value: n.value || np?.[2] || "",
            public: n.pub === "t" || n.pub === true || np?.[3] === "t",
            createDate: n.create_date || np?.[4],
            creator: n.creator || np?.[5],
          };
        }
      );

      return successResponse({ notes: formattedNotes });
    }

    if (action === "getPenaltyTypes") {
      const response = await callOpenSRF(
        "open-ils.actor",
        "open-ils.actor.standing_penalty.types.retrieve"
      );

      const types = payloadFirst(response) || [];
      const formattedTypes = (Array.isArray(types) ? types : []).map(
        (t: Record<string, unknown>) => {
          const tp = t.__p as unknown[] | undefined;
          return {
            id: t.id || tp?.[CSP_FIELDS.id],
            name: t.name || tp?.[CSP_FIELDS.name] || "Unknown",
            label: t.label || tp?.[CSP_FIELDS.label] || t.name || "Unknown",
            blockList: t.block_list || tp?.[CSP_FIELDS.block_list] || "",
            org: t.org_unit || tp?.[CSP_FIELDS.staff_alert], // csp has no org_unit; index 4 = staff_alert (legacy fallback)
          };
        }
      );

      return successResponse({ penaltyTypes: formattedTypes });
    }

    return errorResponse("Invalid action", 400);
  } catch (error: unknown) {
    return serverErrorResponse(error, "Patrons PATCH", req);
  }
}

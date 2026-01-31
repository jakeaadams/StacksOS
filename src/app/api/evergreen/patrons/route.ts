import { NextRequest, NextResponse } from "next/server";
import {

  callOpenSRF,
  successResponse,
  errorResponse,
  notFoundResponse,
  serverErrorResponse,
  parseJsonBody,
  requireFields,
  encodeFieldmapper,
  getErrorMessage,
  getOrgTree,
  isOpenSRFEvent,
  getPatronFleshed,
  getRequestMeta,
} from "@/lib/api";
import { logAuditEvent } from "@/lib/audit";
import { requirePermissions } from "@/lib/permissions";
import { logger } from "@/lib/logger";



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

      const patron = patronResponse?.payload?.[0];
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

    logger.debug({ requestId: getRequestMeta(req).requestId, route: "api.evergreen.patrons", query, searchType }, "Patrons search");

    const fleshFields = ["card", "home_ou", "profile"];
    const searchOu = Number((actor as any)?.ws_ou ?? (actor as any)?.home_ou ?? 1) || 1;
    const offset = parseInt(searchParams.get("offset") || "0");

    if (searchType === "barcode") {
      const searchResponse = await callOpenSRF(
        "open-ils.actor",
        "open-ils.actor.user.fleshed.retrieve_by_barcode",
        [authtoken, query, fleshFields]
      );

      const patron = searchResponse?.payload?.[0];
      if (patron && !patron.ilsevent) {
        return successResponse({
          count: 1,
          patrons: [formatPatron(patron)],
        });
      }
    } else {
      // Some Evergreen installs build invalid SQL when sort strings contain spaces
      // (e.g. "family_name ASC" arriving as "family_name+ASC"). Passing an empty
      // sort list delegates ordering to Evergreen defaults and avoids that bug.
      const sort: string[] = [];

      const includeInactive = searchParams.get("inactive") === "true";

      let search: Record<string, any>;
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
        .filter((p: any) => p && !p.ilsevent)
        .map(formatPatron);

      return successResponse({ count: patrons.length, patrons });
    }

    return successResponse({ count: 0, patrons: [] });
  } catch (error) {
    return serverErrorResponse(error, "Patrons GET", req);
  }
}

function formatPatron(patron: any) {
  const card = patron.card?.__p || patron.card || {};
  const profile = patron.profile?.__p || patron.profile || {};

  return {
    id: patron.id || patron.__p?.[0],
    barcode: Array.isArray(card) ? card[1] : card.barcode || "Unknown",
    firstName: patron.first_given_name || patron.__p?.[4] || "",
    lastName: patron.family_name || patron.__p?.[5] || "",
    email: patron.email || patron.__p?.[11] || "",
    phone: patron.day_phone || patron.__p?.[12] || "",
    homeLibrary: patron.home_ou || patron.__p?.[6] || 1,
    patronType: profile.name || "Patron",
    isActive: patron.active === "t" || patron.__p?.[2] === "t",
    cardExpiry: patron.expire_date || patron.__p?.[10] || "",
  };
}

function extractCard(patron: any) {
  const cards = patron.card || patron.cards || patron.__p?.[1];
  const card = Array.isArray(cards) ? cards[0] : cards;
  if (!card) return null;

  if (Array.isArray(card.__p)) {
    return {
      active: card.__p[0],
      barcode: card.__p[1],
      id: card.__p[2],
      usr: card.__p[3],
    };
  }

  return {
    active: card.active,
    barcode: card.barcode,
    id: card.id,
    usr: card.usr,
  };
}

function normalizePatron(patron: any, fallbackBarcode?: string) {
  const card = extractCard(patron);
  const rawId = patron.id ?? patron.__p?.[0];
  const parsedId = typeof rawId === "number" ? rawId : parseInt(String(rawId || ""), 10);
  const patronId = Number.isFinite(parsedId) ? parsedId : (card?.usr ?? card?.id);
  const firstGiven = patron.first_given_name || patron.firstName || patron.__p?.[26] || "";
  const familyName = patron.family_name || patron.lastName || patron.__p?.[25] || "";
  const activeVal = patron.active ?? patron.__p?.[12];
  const barredVal = patron.barred ?? patron.__p?.[13];

  return {
    id: patronId,
    barcode: card?.barcode || patron.barcode || fallbackBarcode || "",
    first_given_name: firstGiven,
    family_name: familyName,
    email: patron.email,
    day_phone: patron.day_phone,
    home_ou: patron.home_ou || patron.__p?.[27] || patron.__p?.[10],
    profile: patron.profile || patron.__p?.[41] || patron.__p?.[28],
    active: activeVal === "t" || activeVal === true,
    barred: barredVal === "t" || barredVal === true,
    expire_date: patron.expire_date || patron.__p?.[24],
    standing_penalties: patron.standing_penalties || patron.__p?.[0] || [],
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
  const rootId = typeof tree?.id === "number" ? tree.id : tree?.__p?.[0] || 1;
  return typeof rootId === "number" ? rootId : 1;
}

async function getDefaultProfileId(_authtoken: string): Promise<number> {
  const groupsResponse = await callOpenSRF(
    "open-ils.actor",
    "open-ils.actor.groups.tree.retrieve"
  );
  const tree = groupsResponse?.payload?.[0];
  let found: number | null = null;

  const walk = (node: any) => {
    if (!node || found) return;
    const name = node.name ?? node[2];
    const id = node.id ?? node[0];
    if (typeof name === "string" && name.toLowerCase().includes("patron")) {
      found = typeof id === "number" ? id : parseInt(String(id || ""), 10);
      return;
    }
    const children = node.children || node[3] || [];
    if (Array.isArray(children)) children.forEach(walk);
  };

  if (Array.isArray(tree)) {
    tree.forEach(walk);
  } else if (tree) {
    walk(tree);
  }

  return found || 2;
}

async function getDefaultPatronSettings(authtoken: string, homeOu: number) {
  const settingsResponse = await callOpenSRF(
    "open-ils.actor",
    "open-ils.actor.ou_setting.ancestor_default.batch",
    [homeOu, ["ui.patron.default_ident_type", "ui.patron.default_country"], authtoken]
  );
  const settings = settingsResponse?.payload?.[0] || {};

  const identTypeRaw = settings["ui.patron.default_ident_type"];
  const identType = Number.isFinite(parseInt(identTypeRaw, 10))
    ? parseInt(identTypeRaw, 10)
    : 1;

  const country = settings["ui.patron.default_country"] || "US";
  return { identType, country };
}

async function checkUsernameExists(authtoken: string, username: string): Promise<boolean> {
  const response = await callOpenSRF(
    "open-ils.actor",
    "open-ils.actor.username.exists",
    [authtoken, username]
  );
  const result = response?.payload?.[0];
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
  const response = await callOpenSRF(
    "open-ils.actor",
    "open-ils.actor.barcode.exists",
    [authtoken, barcode]
  );
  const result = response?.payload?.[0];
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
    const { ip, userAgent } = getRequestMeta(req);
    const body = await parseJsonBody<Record<string, any>>(req);
    if (body instanceof NextResponse) return body;

    const missing = requireFields(body, ["firstName", "lastName"]);
    if (missing) return missing;

    const firstName = String(body.firstName || body.first_given_name || "").trim();
    const lastName = String(body.lastName || body.family_name || "").trim();
    if (!firstName || !lastName) {
      return errorResponse("First and last name are required", 400);
    }

    const homeOu = await resolveHomeOu(body.homeLibrary || body.home_ou || body.homeOu);
    const profileId = Number.isFinite(parseInt(body.profile, 10))
      ? parseInt(body.profile, 10)
      : await getDefaultProfileId(authtoken);

    const settings = await getDefaultPatronSettings(authtoken, homeOu);
    const identType = Number.isFinite(parseInt(body.identType || body.ident_type, 10))
      ? parseInt(body.identType || body.ident_type, 10)
      : settings.identType;

    const addressInput = body.address || {};
    const street1 = String(addressInput.street1 || body.street1 || "").trim();
    const street2 = String(addressInput.street2 || body.street2 || "").trim();
    const city = String(addressInput.city || body.city || "").trim();
    const state = String(addressInput.state || body.state || "").trim();
    const postCode = String(
      addressInput.post_code || addressInput.zip || body.post_code || body.zip || ""
    ).trim();
    const country = String(addressInput.country || body.country || settings.country || "US").trim();

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
      barcode = await generateUniqueBarcode(authtoken);
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

    const expireDate = body.expireDate || body.expire_date || formatDate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));

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

    const response = await callOpenSRF(
      "open-ils.actor",
      "open-ils.actor.patron.update",
      [authtoken, patron]
    );

    const result = response?.payload?.[0];
    if (!result || isOpenSRFEvent(result) || result.ilsevent) {
      return errorResponse(
        getErrorMessage(result, "Patron creation failed"),
        400,
        result
      );
    }

    const normalized = normalizePatron(result, barcode);

    await logAuditEvent({
      action: "patron.create",
      entity: "patron",
      entityId: normalized.id,
      status: "success",
      actor,
      orgId: homeOu,
      ip,
      userAgent,
      details: { barcode, generated },
    });

    return successResponse({
      patron: normalized,
      ...(Object.keys(generated).length > 0 ? { generated } : {}),
    });
  } catch (error) {
    return serverErrorResponse(error, "Patrons POST", req);
  }
}

// PUT - Update existing patron
export async function PUT(req: NextRequest) {
  try {
    const { authtoken, actor } = await requirePermissions(["UPDATE_USER"]);
    const { ip, userAgent } = getRequestMeta(req);
    const body = await parseJsonBody<Record<string, any>>(req);
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

    // Build update object with only changed fields
    const updates: Record<string, any> = {
      id: patronId,
      ischanged: 1,
    };

    // Basic fields
    if (body.firstName !== undefined || body.first_given_name !== undefined) {
      updates.first_given_name = String(body.firstName || body.first_given_name || "").trim();
    }
    if (body.lastName !== undefined || body.family_name !== undefined) {
      updates.family_name = String(body.lastName || body.family_name || "").trim();
    }
    if (body.email !== undefined) {
      updates.email = body.email ? String(body.email).trim() : null;
    }
    if (body.phone !== undefined || body.day_phone !== undefined) {
      updates.day_phone = (body.phone || body.day_phone) ? String(body.phone || body.day_phone).trim() : null;
    }
    if (body.homeLibrary !== undefined || body.home_ou !== undefined) {
      updates.home_ou = parseInt(String(body.homeLibrary || body.home_ou), 10);
    }
    if (body.profile !== undefined) {
      updates.profile = parseInt(String(body.profile), 10);
    }
    if (body.expireDate !== undefined || body.expire_date !== undefined) {
      updates.expire_date = body.expireDate || body.expire_date;
    }
    if (body.active !== undefined) {
      updates.active = body.active === true || body.active === "t";
    }
    if (body.barred !== undefined) {
      updates.barred = body.barred === true || body.barred === "t";
    }

    const patron = encodeFieldmapper("au", updates);

    const response = await callOpenSRF(
      "open-ils.actor",
      "open-ils.actor.patron.update",
      [authtoken, patron]
    );

    const result = response?.payload?.[0];
    if (!result || isOpenSRFEvent(result) || result.ilsevent) {
      return errorResponse(
        getErrorMessage(result, "Patron update failed"),
        400,
        result
      );
    }

    const normalized = normalizePatron(result);

    await logAuditEvent({
      action: "patron.update",
      entity: "patron",
      entityId: patronId,
      status: "success",
      actor,
      ip,
      userAgent,
      details: { updates: Object.keys(updates).filter(k => k !== "id" && k !== "ischanged") },
    });

    return successResponse({ patron: normalized });
  } catch (error) {
    return serverErrorResponse(error, "Patrons PUT", req);
  }
}

// PATCH - Manage patron blocks (standing penalties) and notes
export async function PATCH(req: NextRequest) {
  try {
    const { authtoken, actor } = await requirePermissions(["UPDATE_USER"]);
    const { ip, userAgent } = getRequestMeta(req);
    const body = await parseJsonBody<Record<string, any>>(req);
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

      const response = await callOpenSRF(
        "open-ils.actor",
        "open-ils.actor.user.penalty.apply",
        [authtoken, penalty]
      );

      const result = response?.payload?.[0];
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
        details: { penaltyType, note },
      });

      return successResponse({ penaltyId: result, message: "Block added" });
    }

    if (action === "removeBlock" || action === "remove_penalty") {
      const penaltyId = parseInt(String(body.penaltyId || body.penalty_id || ""), 10);

      if (!Number.isFinite(penaltyId)) {
        return errorResponse("Penalty ID is required", 400);
      }

      const response = await callOpenSRF(
        "open-ils.actor",
        "open-ils.actor.user.penalty.remove",
        [authtoken, penaltyId]
      );

      const result = response?.payload?.[0];
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

      const response = await callOpenSRF(
        "open-ils.actor",
        "open-ils.actor.note.create",
        [authtoken, note]
      );

      const result = response?.payload?.[0];
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
        details: { title, public: isPublic },
      });

      return successResponse({ noteId: result, message: "Note added" });
    }

    if (action === "deleteNote") {
      const noteId = parseInt(String(body.noteId || body.note_id || ""), 10);

      if (!Number.isFinite(noteId)) {
        return errorResponse("Note ID is required", 400);
      }

      const response = await callOpenSRF(
        "open-ils.actor",
        "open-ils.actor.note.delete",
        [authtoken, noteId]
      );

      const result = response?.payload?.[0];
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
        details: { noteId },
      });

      return successResponse({ message: "Note deleted" });
    }

    if (action === "getNotes") {
      const response = await callOpenSRF(
        "open-ils.actor",
        "open-ils.actor.note.retrieve.all",
        [authtoken, { usr: patronId }]
      );

      const notes = response?.payload?.[0] || [];
      const formattedNotes = (Array.isArray(notes) ? notes : []).map((n: any) => ({
        id: n.id || n.__p?.[0],
        title: n.title || n.__p?.[1] || "Note",
        value: n.value || n.__p?.[2] || "",
        public: n.pub === "t" || n.pub === true || n.__p?.[3] === "t",
        createDate: n.create_date || n.__p?.[4],
        creator: n.creator || n.__p?.[5],
      }));

      return successResponse({ notes: formattedNotes });
    }

    if (action === "getPenaltyTypes") {
      const response = await callOpenSRF(
        "open-ils.actor",
        "open-ils.actor.standing_penalty.types.retrieve"
      );

      const types = response?.payload?.[0] || [];
      const formattedTypes = (Array.isArray(types) ? types : []).map((t: any) => ({
        id: t.id || t.__p?.[0],
        name: t.name || t.__p?.[1] || "Unknown",
        label: t.label || t.__p?.[2] || t.name || "Unknown",
        blockList: t.block_list || t.__p?.[3] || "",
        org: t.org_unit || t.__p?.[4],
      }));

      return successResponse({ penaltyTypes: formattedTypes });
    }

    return errorResponse("Invalid action", 400);
  } catch (error) {
    return serverErrorResponse(error, "Patrons PATCH", req);
  }
}

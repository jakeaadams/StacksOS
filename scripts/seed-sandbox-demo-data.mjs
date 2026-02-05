import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1);
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadEnv() {
  const root = path.join(__dirname, "..");
  const env = {
    ...readEnvFile(path.join(root, ".env")),
    ...readEnvFile(path.join(root, ".env.local")),
  };
  for (const [k, v] of Object.entries(env)) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }
  setFromSetCookie(setCookieValue) {
    if (!setCookieValue || typeof setCookieValue !== "string") return;
    const first = setCookieValue.split(";")[0];
    const eq = first.indexOf("=");
    if (eq <= 0) return;
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    if (!name) return;
    this.cookies.set(name, value);
  }
  applyResponseCookies(res) {
    const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : null;
    if (Array.isArray(sc)) {
      for (const v of sc) this.setFromSetCookie(v);
      return;
    }
    const single = res.headers.get("set-cookie");
    if (single) this.setFromSetCookie(single);
  }
  header() {
    if (this.cookies.size === 0) return "";
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, { method = "GET", headers = {}, json, jar, csrfToken, retries = 5 } = {}) {
  const finalHeaders = { ...headers };
  if (jar) {
    const cookie = jar.header();
    if (cookie) finalHeaders.cookie = cookie;
  }
  if (method !== "GET" && csrfToken) {
    finalHeaders["x-csrf-token"] = csrfToken;
  }
  if (json !== undefined) {
    finalHeaders["content-type"] = "application/json";
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(url, {
      method,
      headers: finalHeaders,
      body: json !== undefined ? JSON.stringify(json) : undefined,
    });
    if (jar) jar.applyResponseCookies(res);

    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(`Non-JSON response for ${method} ${url}: ${text.slice(0, 200)}`);
    }

    if (res.status === 429 && attempt < retries) {
      const retryAfter = res.headers.get("retry-after");
      const waitMsRaw = retryAfter ? Number(retryAfter) * 1000 : 250 * 2 ** (attempt - 1);
      const maxWaitMs = 15 * 60 * 1000; // match staff-auth window; safe for all seed calls
      const waitMs = Number.isFinite(waitMsRaw) ? Math.min(maxWaitMs, Math.max(250, waitMsRaw)) : 1000;
      console.warn(`[seed] 429 from ${method} ${url}; retrying in ${waitMs}ms (attempt ${attempt}/${retries})`);
      await sleep(waitMs);
      continue;
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${method} ${url}: ${JSON.stringify(data).slice(0, 300)}`);
    }

    return data;
  }

  throw new Error(`Exceeded retry limit for ${method} ${url}`);
}

function isoNow() {
  return new Date().toISOString();
}

function padDigits(value, width) {
  const s = String(value);
  if (s.length >= width) return s;
  return "0".repeat(width - s.length) + s;
}

function defaultHours() {
  const closed = { open: null, close: null, note: null };
  const open = { open: "09:00", close: "17:00", note: null };
  return {
    dow0: closed,
    dow1: open,
    dow2: open,
    dow3: open,
    dow4: open,
    dow5: open,
    dow6: closed,
  };
}

async function ensureWorkstation({ baseUrl, jar, csrfToken, orgId, workstation }) {
  try {
    const wsList = await fetchJson(`${baseUrl}/api/evergreen/workstations?org_id=${orgId}`, { jar });
    const existing = Array.isArray(wsList?.workstations)
      ? wsList.workstations.find((w) => String(w.name || "").toLowerCase() === workstation.toLowerCase())
      : null;
    if (existing) return;

    await fetchJson(`${baseUrl}/api/evergreen/workstations`, {
      method: "POST",
      jar,
      csrfToken,
      json: { name: workstation, org_id: String(orgId) },
    });
    console.log(`[seed] registered workstation ${workstation}`);
  } catch (e) {
    // If the list endpoint is broken (or perms differ), just treat this as best-effort.
    console.warn(`[seed] workstation ensure skipped: ${String(e).slice(0, 160)}`);
  }
}

async function ensurePatron({ baseUrl, jar, csrfToken, orgId, barcode, username, firstName, lastName, pin }) {
  try {
    const existing = await fetchJson(`${baseUrl}/api/evergreen/patrons?barcode=${encodeURIComponent(barcode)}`, { jar });
    const patronId = existing?.patron?.id ?? null;
    if (pin && patronId) {
      // Ensure the demo patron PIN/password is deterministic for OPAC E2E runs.
      await fetchJson(`${baseUrl}/api/evergreen/patrons`, {
        method: "PUT",
        jar,
        csrfToken,
        json: { id: patronId, password: pin },
      });
    }
    return { created: false, id: patronId };
  } catch {
    const created = await fetchJson(`${baseUrl}/api/evergreen/patrons`, {
      method: "POST",
      jar,
      csrfToken,
      json: {
        firstName,
        lastName,
        barcode,
        username,
        password: pin || "DEMO1234",
        email: `${username}@example.org`,
        homeLibrary: orgId,
        address: {
          street1: "1 Demo Street",
          city: "Sandbox",
          state: "CA",
          post_code: "94105",
          country: "US",
        },
      },
    });
    void created;
    return { created: true, id: created?.patron?.id ?? null };
  }
}

async function ensureCatalogSeed({ baseUrl, jar, csrfToken, orgId, forceRecreate }) {
  const root = path.join(__dirname, "..");
  const demoDataPath = path.join(root, "audit", "demo_data.json");
  const previousDemoItemBarcode = (() => {
    try {
      if (!fs.existsSync(demoDataPath)) return null;
      const parsed = JSON.parse(fs.readFileSync(demoDataPath, "utf8"));
      return typeof parsed?.demoItemBarcode === "string" ? parsed.demoItemBarcode : null;
    } catch {
      return null;
    }
  })();

  if (!forceRecreate && previousDemoItemBarcode) {
    try {
      await fetchJson(`${baseUrl}/api/evergreen/items?barcode=${encodeURIComponent(previousDemoItemBarcode)}`, { jar });
      console.log(`[seed] found existing demo item ${previousDemoItemBarcode}; skipping bib/copy creation`);
      return { createdBibIds: [], copiesCreated: 0, firstCopyBarcode: previousDemoItemBarcode };
    } catch {
      // proceed to create
    }
  }

  const bibCount = Number(process.env.DEMO_BIB_COUNT || 100);
  const copiesPerBib = Number(process.env.DEMO_COPIES_PER_BIB || 2);

  const createdBibIds = [];
  let copiesCreated = 0;
  const baseBarcode = 39000001000000n;
  let copyCounter = 0n;
  let firstCopyBarcode = null;

  for (let i = 1; i <= bibCount; i++) {
    const title = `StacksOS Demo Book ${padDigits(i, 3)}`;
    const isbn = `978${padDigits(i, 10)}`.slice(0, 13);

    const created = await fetchJson(`${baseUrl}/api/evergreen/catalog`, {
      method: "POST",
      jar,
      csrfToken,
      json: {
        action: "create",
        simplified: {
          title,
          author: "StacksOS, Demo",
          isbn,
          publisher: "StacksOS Press",
          pubYear: String(2000 + (i % 25)),
          subjects: ["StacksOS Demo"],
          format: "book",
        },
      },
    });

    const bibId = created?.id;
    if (!bibId) throw new Error(`Failed to create demo bib for ${title}`);
    createdBibIds.push(bibId);

    for (let c = 0; c < copiesPerBib; c++) {
      const barcode = String(baseBarcode + copyCounter);
      copyCounter += 1n;
      try {
        const res = await fetchJson(`${baseUrl}/api/evergreen/items`, {
          method: "POST",
          jar,
          csrfToken,
          json: {
            bibId,
            barcode,
            callNumber: `DEMO-${padDigits(i, 3)}`,
            circLib: orgId,
            owningLib: orgId,
            locationId: 1,
            status: 0,
            circulate: true,
            holdable: true,
            opacVisible: true,
            price: 0,
          },
        });
        void res;
        copiesCreated += 1;
        if (!firstCopyBarcode) firstCopyBarcode = barcode;
      } catch (e) {
        console.warn(`[seed] item create failed (barcode=${barcode}): ${String(e).slice(0, 160)}`);
      }
    }

    if (i % 10 === 0) console.log(`[seed] created ${i}/${bibCount} bibs...`);
  }

  return { createdBibIds, copiesCreated, firstCopyBarcode };
}

async function ensureCalendarVersion({ baseUrl, jar, csrfToken, orgId }) {
  try {
    const cal = await fetchJson(`${baseUrl}/api/evergreen/calendars?org_id=${orgId}`, { jar });
    const versions = Array.isArray(cal?.versions) ? cal.versions : [];
    if (versions.length > 0) return { seeded: false, versionId: versions[0]?.id ?? null };

    const snapshot = cal?.snapshot || {};
    const hours = snapshot?.hours || defaultHours();
    const closedDates = Array.isArray(snapshot?.closed) ? snapshot.closed : [];

    const updated = await fetchJson(`${baseUrl}/api/evergreen/calendars`, {
      method: "POST",
      jar,
      csrfToken,
      json: {
        action: "update",
        orgId,
        note: "Seeded by StacksOS sandbox demo data",
        hours,
        closedDates,
      },
    });
    const id = updated?.versionId ?? null;
    console.log("[seed] created calendar version");
    return { seeded: true, versionId: id };
  } catch (e) {
    console.warn(`[seed] calendar version seed skipped: ${String(e).slice(0, 160)}`);
    return { seeded: false, versionId: null };
  }
}

async function ensureOrgSetting({ baseUrl, jar, csrfToken, orgId }) {
  try {
    const settings = await fetchJson(
      `${baseUrl}/api/evergreen/admin-settings?type=org_settings&org_id=${orgId}&limit=25`,
      { jar }
    );
    const rows = Array.isArray(settings?.settings) ? settings.settings : [];
    const settingName = "acq.copy_creator_uses_receiver";
    if (rows.some((s) => s?.name === settingName)) return { seeded: false };

    await fetchJson(`${baseUrl}/api/evergreen/admin-settings`, {
      method: "POST",
      jar,
      csrfToken,
      json: { action: "update", type: "org_setting", orgId, data: { name: settingName, value: true } },
    });
    console.log("[seed] set org unit setting");
    return { seeded: true };
  } catch (e) {
    console.warn(`[seed] org setting seed skipped: ${String(e).slice(0, 160)}`);
    return { seeded: false };
  }
}

async function ensureCircModifier({ baseUrl, jar, csrfToken }) {
  const code = "STACKSOS_DEMO";
  try {
    const list = await fetchJson(`${baseUrl}/api/evergreen/circ-modifiers`, { jar });
    const modifiers = Array.isArray(list?.modifiers) ? list.modifiers : [];
    if (modifiers.some((m) => String(m.code) === code)) return { code, seeded: false };

    await fetchJson(`${baseUrl}/api/evergreen/circ-modifiers`, {
      method: "POST",
      jar,
      csrfToken,
      json: {
        code,
        name: "StacksOS Demo",
        description: "Seeded circ modifier for StacksOS sandbox",
        sip2MediaType: "book",
        magneticMedia: false,
      },
    });
    console.log("[seed] created circ modifier");
    return { code, seeded: true };
  } catch (e) {
    console.warn(`[seed] circ modifier seed skipped: ${String(e).slice(0, 160)}`);
    return { code: null, seeded: false };
  }
}

async function ensureCopyTemplate({ baseUrl, jar, csrfToken, orgId, circModifierCode }) {
  try {
    const res = await fetchJson(`${baseUrl}/api/evergreen/templates?type=copy&org_id=${orgId}&limit=10`, { jar });
    const templates = Array.isArray(res?.templates) ? res.templates : [];
    if (templates.length > 0) return { seeded: false, id: templates[0]?.id ?? null };

    const statuses = Array.isArray(res?.statuses) ? res.statuses : [];
    const locations = Array.isArray(res?.locations) ? res.locations : [];
    const statusId = statuses[0]?.id ?? null;
    const locationId = locations[0]?.id ?? null;

    const created = await fetchJson(`${baseUrl}/api/evergreen/templates`, {
      method: "POST",
      jar,
      csrfToken,
      json: {
        action: "create",
        type: "copy",
        data: {
          name: "StacksOS Demo Copy Template",
          owningLib: orgId,
          circLib: orgId,
          status: statusId,
          location: locationId,
          circModifier: circModifierCode || null,
          circulate: true,
          holdable: true,
          opacVisible: true,
          ref: false,
          price: 0,
        },
      },
    });

    const id = created?.id ?? null;
    console.log("[seed] created copy template");
    return { seeded: true, id };
  } catch (e) {
    console.warn(`[seed] copy template seed skipped: ${String(e).slice(0, 160)}`);
    return { seeded: false, id: null };
  }
}

async function ensureBucket({ baseUrl, jar, csrfToken, recordId }) {
  try {
    const buckets = await fetchJson(`${baseUrl}/api/evergreen/buckets`, { jar });
    if (Array.isArray(buckets?.buckets) && buckets.buckets.length > 0) return { seeded: false };

    const created = await fetchJson(`${baseUrl}/api/evergreen/buckets`, {
      method: "POST",
      jar,
      csrfToken,
      json: { action: "create", name: "StacksOS Demo Bucket", description: "Seeded by StacksOS demo data", pub: false },
    });

    const bucketId = created?.bucket?.id ?? null;
    if (bucketId && recordId) {
      await fetchJson(`${baseUrl}/api/evergreen/buckets`, {
        method: "POST",
        jar,
        csrfToken,
        json: { action: "add_record", bucketId, recordId },
      });
    }

    console.log("[seed] created record bucket");
    return { seeded: true, bucketId };
  } catch (e) {
    console.warn(`[seed] buckets seed skipped: ${String(e).slice(0, 160)}`);
    return { seeded: false, bucketId: null };
  }
}

async function ensureCopyTags({ baseUrl, jar, csrfToken, orgId }) {
  try {
    const typeCode = "STACKSOS_DEMO";
    const types = await fetchJson(`${baseUrl}/api/evergreen/copy-tags/types`, { jar });
    const tagTypes = Array.isArray(types?.tagTypes) ? types.tagTypes : [];
    if (!tagTypes.some((t) => String(t.code) === typeCode)) {
      await fetchJson(`${baseUrl}/api/evergreen/copy-tags/types`, {
        method: "POST",
        jar,
        csrfToken,
        json: { code: typeCode, label: "StacksOS Demo", ownerId: orgId },
      });
      console.log("[seed] created copy tag type");
    }

    const tagsRes = await fetchJson(`${baseUrl}/api/evergreen/copy-tags`, { jar });
    const tags = Array.isArray(tagsRes?.tags) ? tagsRes.tags : [];
    if (!tags.some((t) => String(t.tagType) === typeCode && String(t.label).toLowerCase() === "demo tag")) {
      await fetchJson(`${baseUrl}/api/evergreen/copy-tags`, {
        method: "POST",
        jar,
        csrfToken,
        json: {
          tagType: typeCode,
          label: "Demo Tag",
          value: "StacksOS",
          staffNote: "Seeded by StacksOS demo data",
          pub: false,
          ownerId: orgId,
        },
      });
      console.log("[seed] created copy tag");
    }

    return { seeded: true };
  } catch (e) {
    console.warn(`[seed] copy tags seed skipped: ${String(e).slice(0, 160)}`);
    return { seeded: false };
  }
}

async function ensureStatCategories({ baseUrl, jar, csrfToken, orgId }) {
  let demoCopyStatCatId = null;
  let demoPatronStatCatId = null;
  try {
    const cats = await fetchJson(`${baseUrl}/api/evergreen/stat-categories`, { jar });
    const copyCats = Array.isArray(cats?.copyCategories) ? cats.copyCategories : [];
    const patronCats = Array.isArray(cats?.patronCategories) ? cats.patronCategories : [];

    if (copyCats.length === 0) {
      const created = await fetchJson(`${baseUrl}/api/evergreen/stat-categories`, {
        method: "POST",
        jar,
        csrfToken,
        json: { kind: "copy", name: "StacksOS Demo (Copy)", ownerId: orgId, opacVisible: false, required: false },
      });
      demoCopyStatCatId = created?.id ?? null;
      console.log("[seed] created copy stat category");
    } else {
      demoCopyStatCatId = copyCats[0]?.id ?? null;
    }

    if (patronCats.length === 0) {
      const created = await fetchJson(`${baseUrl}/api/evergreen/stat-categories`, {
        method: "POST",
        jar,
        csrfToken,
        json: { kind: "patron", name: "StacksOS Demo (Patron)", ownerId: orgId, opacVisible: false, required: false },
      });
      demoPatronStatCatId = created?.id ?? null;
      console.log("[seed] created patron stat category");
    } else {
      demoPatronStatCatId = patronCats[0]?.id ?? null;
    }

    if (demoCopyStatCatId) {
      const entries = await fetchJson(
        `${baseUrl}/api/evergreen/stat-categories/entries?kind=copy&statCatId=${demoCopyStatCatId}`,
        { jar }
      );
      if (Array.isArray(entries?.entries) && entries.entries.length === 0) {
        await fetchJson(`${baseUrl}/api/evergreen/stat-categories/entries`, {
          method: "POST",
          jar,
          csrfToken,
          json: { kind: "copy", statCatId: demoCopyStatCatId, value: "StacksOS Demo", ownerId: orgId },
        });
        console.log("[seed] created copy stat category entry");
      }
    }

    if (demoPatronStatCatId) {
      const entries = await fetchJson(
        `${baseUrl}/api/evergreen/stat-categories/entries?kind=patron&statCatId=${demoPatronStatCatId}`,
        { jar }
      );
      if (Array.isArray(entries?.entries) && entries.entries.length === 0) {
        await fetchJson(`${baseUrl}/api/evergreen/stat-categories/entries`, {
          method: "POST",
          jar,
          csrfToken,
          json: { kind: "patron", statCatId: demoPatronStatCatId, value: "StacksOS Demo", ownerId: orgId },
        });
        console.log("[seed] created patron stat category entry");
      }
    }

    return { demoCopyStatCatId, demoPatronStatCatId };
  } catch (e) {
    console.warn(`[seed] stat categories seed skipped: ${String(e).slice(0, 160)}`);
    return { demoCopyStatCatId, demoPatronStatCatId };
  }
}

async function ensureCourseReserves({ baseUrl, jar, csrfToken, orgId }) {
  let demoCourseId = null;
  let demoTermId = null;
  try {
    const cr = await fetchJson(`${baseUrl}/api/evergreen/course-reserves`, { jar });
    const courses = Array.isArray(cr?.courses) ? cr.courses : [];
    const terms = Array.isArray(cr?.terms) ? cr.terms : [];

    if (terms.length === 0) {
      const created = await fetchJson(`${baseUrl}/api/evergreen/course-reserves`, {
        method: "POST",
        jar,
        csrfToken,
        json: {
          entity: "term",
          name: "StacksOS Demo Term",
          owningLibId: orgId,
          startDate: "2026-01-01",
          endDate: "2026-12-31",
        },
      });
      demoTermId = created?.id ?? null;
      console.log("[seed] created course reserves term");
    } else {
      demoTermId = terms[0]?.id ?? null;
    }

    if (courses.length === 0) {
      const created = await fetchJson(`${baseUrl}/api/evergreen/course-reserves`, {
        method: "POST",
        jar,
        csrfToken,
        json: {
          entity: "course",
          name: "StacksOS Demo Course",
          courseNumber: "STACKSOS-101",
          owningLibId: orgId,
          isArchived: false,
        },
      });
      demoCourseId = created?.id ?? null;
      console.log("[seed] created course reserves course");
    } else {
      demoCourseId = courses[0]?.id ?? null;
    }

    return { demoCourseId, demoTermId };
  } catch (e) {
    console.warn(`[seed] course reserves seed skipped: ${String(e).slice(0, 160)}`);
    return { demoCourseId, demoTermId };
  }
}

async function ensureScheduledReports({ baseUrl, jar, csrfToken, orgId }) {
  const recipient = process.env.DEMO_SCHEDULED_REPORT_EMAIL || "stacksos.demo.reports@example.org";
  try {
    const schedules = await fetchJson(`${baseUrl}/api/reports/scheduled`, { jar });
    const list = Array.isArray(schedules?.schedules) ? schedules.schedules : [];
    if (list.length > 0) return { demoScheduleId: list[0]?.id ?? null };

    const created = await fetchJson(`${baseUrl}/api/reports/scheduled`, {
      method: "POST",
      jar,
      csrfToken,
      json: {
        name: "Daily KPIs",
        reportKey: "dashboard_kpis",
        orgId,
        cadence: "daily",
        timeOfDay: "08:00",
        recipients: [recipient],
        enabled: true,
      },
    });
    const demoScheduleId = created?.id ?? null;
    console.log("[seed] created scheduled report schedule");
    return { demoScheduleId };
  } catch (e) {
    console.warn(`[seed] scheduled reports seed skipped: ${String(e).slice(0, 160)}`);
    return { demoScheduleId: null };
  }
}

async function ensureAcqInvoice({ baseUrl, jar, csrfToken, orgId }) {
  try {
    const invoices = await fetchJson(`${baseUrl}/api/evergreen/acquisitions?action=invoices`, { jar });
    const list = Array.isArray(invoices?.invoices) ? invoices.invoices : [];
    if (list.length > 0) return { demoInvoiceId: list[0]?.id ?? null };

    const providers = await fetchJson(`${baseUrl}/api/evergreen/acquisitions?action=providers`, { jar });
    const vendors = Array.isArray(providers?.vendors) ? providers.vendors : [];
    const providerId = vendors[0]?.id ?? null;
    if (!providerId) return { demoInvoiceId: null };

    const methods = await fetchJson(`${baseUrl}/api/evergreen/acquisitions?action=invoice_methods`, { jar });
    const recvMethod = Array.isArray(methods?.methods) && methods.methods[0]?.code ? String(methods.methods[0].code) : "";
    if (!recvMethod) return { demoInvoiceId: null };

    const created = await fetchJson(`${baseUrl}/api/evergreen/acquisitions`, {
      method: "POST",
      jar,
      csrfToken,
      json: {
        action: "create_invoice",
        providerId,
        receiver: orgId,
        recvMethod,
        invIdent: `STACKSOS-DEMO-${Date.now()}`,
        note: "Seeded by StacksOS demo data",
      },
    });

    const demoInvoiceId = created?.invoiceId ?? null;
    console.log("[seed] created acquisitions invoice");
    return { demoInvoiceId };
  } catch (e) {
    console.warn(`[seed] acquisitions invoice seed skipped: ${String(e).slice(0, 160)}`);
    return { demoInvoiceId: null };
  }
}

async function ensureBooking({ baseUrl, jar, csrfToken, orgId, demoPatronBarcode, demoItemBarcode }) {
  try {
    const seeded = await fetchJson(`${baseUrl}/api/evergreen/booking`, {
      method: "POST",
      jar,
      csrfToken,
      json: { action: "seed_demo_resource", ownerId: orgId, copyBarcode: demoItemBarcode || null },
    });

    const resourceId = seeded?.resourceId ?? null;
    const now = Date.now();
    const start = new Date(now + 60 * 60 * 1000);
    const end = new Date(now + 2 * 60 * 60 * 1000);

    if (resourceId) {
      try {
        await fetchJson(`${baseUrl}/api/evergreen/booking`, {
          method: "POST",
          jar,
          csrfToken,
          json: {
            action: "create",
            patron_barcode: demoPatronBarcode,
            resource_id: resourceId,
            start_time: start.toISOString(),
            end_time: end.toISOString(),
            pickup_lib: orgId,
          },
        });
      } catch (e) {
        console.warn(`[seed] booking reservation skipped: ${String(e).slice(0, 160)}`);
      }
    }

    return {
      bookingResourceTypeId: seeded?.resourceTypeId ?? null,
      bookingResourceId: resourceId,
    };
  } catch (e) {
    console.warn(`[seed] booking seed skipped: ${String(e).slice(0, 160)}`);
    return { bookingResourceTypeId: null, bookingResourceId: null };
  }
}

async function ensureAuthority({ baseUrl, jar, csrfToken }) {
  try {
    const existing = await fetchJson(`${baseUrl}/api/evergreen/authority?q=smith&limit=1`, { jar });
    if (Array.isArray(existing?.authorities) && existing.authorities.length > 0) {
      return { seeded: false };
    }

    const seeded = await fetchJson(`${baseUrl}/api/evergreen/authority`, {
      method: "POST",
      jar,
      csrfToken,
      json: { action: "seed", headings: ["Smith"] },
    });
    void seeded;
    console.log("[seed] created authority record(s)");
    return { seeded: true };
  } catch (e) {
    console.warn(`[seed] authority seed skipped: ${String(e).slice(0, 160)}`);
    return { seeded: false };
  }
}

async function main() {
  loadEnv();

  const baseUrl = (process.env.STACKSOS_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
  const staffUsername =
    process.env.SEED_STAFF_USERNAME ||
    process.env.STACKSOS_AUDIT_STAFF_USERNAME ||
    process.env.E2E_STAFF_USER ||
    "";
  const staffPassword =
    process.env.SEED_STAFF_PASSWORD ||
    process.env.STACKSOS_AUDIT_STAFF_PASSWORD ||
    process.env.E2E_STAFF_PASS ||
    "";
  const workstation = process.env.SEED_WORKSTATION || "STACKSOS-SEED";
  const forceRecreate = process.env.SEED_FORCE_RECREATE === "1";

  if (!staffUsername || !staffPassword) {
    throw new Error(
      "Missing staff credentials. Set SEED_STAFF_USERNAME/SEED_STAFF_PASSWORD (or STACKSOS_AUDIT_STAFF_* / E2E_STAFF_*)."
    );
  }

  const jar = new CookieJar();
  const csrf = await fetchJson(`${baseUrl}/api/csrf-token`, { jar });
  const csrfToken = csrf?.token;
  if (!csrfToken) throw new Error("Failed to fetch CSRF token");

  await fetchJson(`${baseUrl}/api/evergreen/auth`, {
    method: "POST",
    jar,
    csrfToken,
    json: { username: staffUsername, password: staffPassword, workstation },
  });

  const session = await fetchJson(`${baseUrl}/api/evergreen/auth`, { jar });
  if (!session?.authenticated) throw new Error("Failed to authenticate (session not authenticated)");

  const actor = session.user || {};
  const actorId = typeof actor.id === "number" ? actor.id : 2;
  const orgId = Number(actor.ws_ou ?? actor.home_ou ?? 1) || 1;

  console.log(`[seed] baseUrl=${baseUrl}`);
  console.log(`[seed] actor=${actorId} orgId=${orgId}`);

  await ensureWorkstation({ baseUrl, jar, csrfToken, orgId, workstation });

  const demoPatronPin = process.env.DEMO_PATRON_PIN || "DEMO1234";
  const demoPatronBarcode = process.env.DEMO_PATRON_BARCODE || "29000000001234";
  await ensurePatron({
    baseUrl,
    jar,
    csrfToken,
    orgId,
    barcode: demoPatronBarcode,
    username: "stacksos.demo.patron",
    firstName: "StacksOS",
    lastName: "DemoPatron",
    pin: demoPatronPin,
  });

  const patronCount = Number(process.env.DEMO_PATRON_COUNT || 10);
  for (let i = 1; i <= patronCount; i++) {
    const barcode = String(29000000010000 + i).padStart(14, "0");
    await ensurePatron({
      baseUrl,
      jar,
      csrfToken,
      orgId,
      barcode,
      username: `stacksos.demo.patron${i}`,
      firstName: "Demo",
      lastName: `Patron${i}`,
      pin: demoPatronPin,
    });
  }

  const catalog = await ensureCatalogSeed({ baseUrl, jar, csrfToken, orgId, forceRecreate });

  await ensureCalendarVersion({ baseUrl, jar, csrfToken, orgId });
  await ensureOrgSetting({ baseUrl, jar, csrfToken, orgId });

  const circMod = await ensureCircModifier({ baseUrl, jar, csrfToken });
  const template = await ensureCopyTemplate({ baseUrl, jar, csrfToken, orgId, circModifierCode: circMod.code });

  await ensureBucket({
    baseUrl,
    jar,
    csrfToken,
    recordId: catalog.createdBibIds[0] ?? null,
  });

  const statCats = await ensureStatCategories({ baseUrl, jar, csrfToken, orgId });
  const courseReserves = await ensureCourseReserves({ baseUrl, jar, csrfToken, orgId });
  const scheduled = await ensureScheduledReports({ baseUrl, jar, csrfToken, orgId });
  const invoice = await ensureAcqInvoice({ baseUrl, jar, csrfToken, orgId });
  const booking = await ensureBooking({ baseUrl, jar, csrfToken, orgId, demoPatronBarcode, demoItemBarcode: catalog.firstCopyBarcode });
  await ensureCopyTags({ baseUrl, jar, csrfToken, orgId });
  await ensureAuthority({ baseUrl, jar, csrfToken });

  const out = {
    generatedAt: isoNow(),
    baseUrl,
    orgId,
    actorId,
    demoPatronBarcode,
    demoPatronPin,
    demoItemBarcode: catalog.firstCopyBarcode,
    workstation,
    bibsCreated: catalog.createdBibIds.length,
    copiesCreated: catalog.copiesCreated,
    circModifierCode: circMod.code,
    copyTemplateId: template.id ?? null,
    demoCopyStatCatId: statCats.demoCopyStatCatId,
    demoPatronStatCatId: statCats.demoPatronStatCatId,
    demoCourseId: courseReserves.demoCourseId,
    demoTermId: courseReserves.demoTermId,
    demoScheduleId: scheduled.demoScheduleId,
    demoInvoiceId: invoice.demoInvoiceId,
    bookingResourceTypeId: booking.bookingResourceTypeId,
    bookingResourceId: booking.bookingResourceId,
  };

  const outPath = path.join(__dirname, "..", "audit", "demo_data.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`[seed] wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

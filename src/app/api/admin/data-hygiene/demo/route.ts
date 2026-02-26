import { NextRequest } from "next/server";
import {
  callOpenSRF,
  encodeFieldmapper,
  getErrorMessage,
  getRequestMeta,
  isOpenSRFEvent,
  parseJsonBodyWithSchema,
  serverErrorResponse,
  successResponse,
} from "@/lib/api";
import { logAuditEvent } from "@/lib/audit";
import { requirePermissions } from "@/lib/permissions";
import { z } from "zod";

const purgeSchema = z
  .object({
    confirm: z.literal("DELETE_DEMO_DATA"),
    dryRun: z.boolean().optional(),
  })
  .strict();

type DemoSnapshot = {
  bibIds: number[];
  authorityIds: number[];
  patronIds: number[];
  bookingTypeIds: number[];
  bookingResourceIds: number[];
  bookingReservationIds: number[];
  bucketIds: number[];
  statCategoryCopyIds: number[];
  statCategoryPatronIds: number[];
  statEntryCopyIds: number[];
  statEntryPatronIds: number[];
  copyTagTypeCodes: string[];
  copyTagIds: number[];
  courseIds: number[];
  termIds: number[];
};

function uniqueNumbers(input: unknown[]): number[] {
  const out = new Set<number>();
  for (const value of input) {
    const parsed = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
    if (Number.isFinite(parsed) && parsed > 0) out.add(parsed);
  }
  return Array.from(out.values()).sort((a, b) => a - b);
}

function uniqueStrings(input: unknown[]): string[] {
  const out = new Set<string>();
  for (const value of input) {
    const v = String(value ?? "").trim();
    if (v) out.add(v);
  }
  return Array.from(out.values()).sort((a, b) => a.localeCompare(b));
}

async function collectDemoSnapshot(authtoken: string): Promise<DemoSnapshot> {
  const [
    bibSearch,
    authoritySearch,
    patronSearch,
    bookingTypeSearch,
    bookingResourceSearch,
    bucketSearch,
    copyStatSearch,
    patronStatSearch,
    copyStatEntrySearch,
    patronStatEntrySearch,
    copyTagTypeSearch,
    copyTagSearch,
    courseSearch,
    termSearch,
  ] = await Promise.all([
    callOpenSRF("open-ils.search", "open-ils.search.biblio.multiclass.query", [
      { limit: 500, offset: 0 },
      "StacksOS Demo",
      1,
    ]),
    callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.are.atomic", [
      authtoken,
      {
        deleted: "f",
        "-or": [
          { heading: { "~*": "StacksOS Demo|STACKSOS-DEMO" } },
          { simple_heading: { "~*": "StacksOS Demo|STACKSOS-DEMO" } },
        ],
      },
      { limit: 500 },
    ]),
    callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.au.atomic", [
      authtoken,
      {
        deleted: "f",
        "-or": [
          { usrname: { "~*": "^stacksos\\.demo\\.patron" } },
          { family_name: { "~*": "DemoPatron" } },
        ],
      },
      { limit: 500 },
    ]),
    callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.brt.atomic", [
      authtoken,
      { name: { "~*": "^StacksOS Demo" } },
      { limit: 200 },
    ]),
    callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.brsrc.atomic", [
      authtoken,
      { barcode: { "~*": "^STACKSOS-(ROOM|DEMO)" } },
      { limit: 500 },
    ]),
    callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.cbreb.atomic", [
      authtoken,
      { name: { "~*": "StacksOS Demo" } },
      { limit: 200 },
    ]),
    callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.asc.atomic", [
      authtoken,
      { name: { "~*": "StacksOS Demo" } },
      { limit: 200 },
    ]),
    callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.actsc.atomic", [
      authtoken,
      { name: { "~*": "StacksOS Demo" } },
      { limit: 200 },
    ]),
    callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.asce.atomic", [
      authtoken,
      { value: { "~*": "StacksOS Demo" } },
      { limit: 200 },
    ]),
    callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.actsce.atomic", [
      authtoken,
      { value: { "~*": "StacksOS Demo" } },
      { limit: 200 },
    ]),
    callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.cctt.atomic", [
      authtoken,
      { "-or": [{ code: "STACKSOS_DEMO" }, { label: { "~*": "StacksOS Demo" } }] },
      { limit: 50 },
    ]),
    callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.acpt.atomic", [
      authtoken,
      {
        "-or": [
          { tag_type: "STACKSOS_DEMO" },
          { label: { "~*": "Demo Tag|StacksOS Demo" } },
          { value: { "~*": "StacksOS Demo" } },
          { staff_note: { "~*": "Seeded by StacksOS demo data" } },
        ],
      },
      { limit: 500 },
    ]),
    callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.acmc.atomic", [
      authtoken,
      { name: { "~*": "StacksOS Demo Course" } },
      { limit: 200 },
    ]),
    callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.acmt.atomic", [
      authtoken,
      { name: { "~*": "StacksOS Demo Term" } },
      { limit: 200 },
    ]),
  ]);

  const rawBibIds = Array.isArray(bibSearch?.payload?.[0]?.ids) ? bibSearch.payload[0].ids : [];
  const bibIds = uniqueNumbers(
    rawBibIds.map((entry: unknown) => (Array.isArray(entry) ? entry[0] : entry))
  );

  const bookingResourceIds = uniqueNumbers(
    (Array.isArray(bookingResourceSearch?.payload?.[0])
      ? bookingResourceSearch.payload[0]
      : []
    ).map((row: Record<string, any>) => row.id)
  );

  let bookingReservationIds: number[] = [];
  if (bookingResourceIds.length > 0) {
    try {
      const reservationSearch = await callOpenSRF(
        "open-ils.pcrud",
        "open-ils.pcrud.search.bresv.atomic",
        [authtoken, { target_resource: bookingResourceIds }, { limit: 2000 }]
      );
      bookingReservationIds = uniqueNumbers(
        (Array.isArray(reservationSearch?.payload?.[0]) ? reservationSearch.payload[0] : []).map(
          (row: Record<string, any>) => row.id
        )
      );
    } catch {
      bookingReservationIds = [];
    }
  }

  return {
    bibIds,
    authorityIds: uniqueNumbers(
      (Array.isArray(authoritySearch?.payload?.[0]) ? authoritySearch.payload[0] : []).map(
        (row: Record<string, any>) => row.id
      )
    ),
    patronIds: uniqueNumbers(
      (Array.isArray(patronSearch?.payload?.[0]) ? patronSearch.payload[0] : []).map(
        (row: Record<string, any>) => row.id
      )
    ),
    bookingTypeIds: uniqueNumbers(
      (Array.isArray(bookingTypeSearch?.payload?.[0]) ? bookingTypeSearch.payload[0] : []).map(
        (row: Record<string, any>) => row.id
      )
    ),
    bookingResourceIds,
    bookingReservationIds,
    bucketIds: uniqueNumbers(
      (Array.isArray(bucketSearch?.payload?.[0]) ? bucketSearch.payload[0] : []).map(
        (row: Record<string, any>) => row.id
      )
    ),
    statCategoryCopyIds: uniqueNumbers(
      (Array.isArray(copyStatSearch?.payload?.[0]) ? copyStatSearch.payload[0] : []).map(
        (row: Record<string, any>) => row.id
      )
    ),
    statCategoryPatronIds: uniqueNumbers(
      (Array.isArray(patronStatSearch?.payload?.[0]) ? patronStatSearch.payload[0] : []).map(
        (row: Record<string, any>) => row.id
      )
    ),
    statEntryCopyIds: uniqueNumbers(
      (Array.isArray(copyStatEntrySearch?.payload?.[0]) ? copyStatEntrySearch.payload[0] : []).map(
        (row: Record<string, any>) => row.id
      )
    ),
    statEntryPatronIds: uniqueNumbers(
      (Array.isArray(patronStatEntrySearch?.payload?.[0])
        ? patronStatEntrySearch.payload[0]
        : []
      ).map((row: Record<string, any>) => row.id)
    ),
    copyTagTypeCodes: uniqueStrings(
      (Array.isArray(copyTagTypeSearch?.payload?.[0]) ? copyTagTypeSearch.payload[0] : []).map(
        (row: Record<string, any>) => row.code
      )
    ),
    copyTagIds: uniqueNumbers(
      (Array.isArray(copyTagSearch?.payload?.[0]) ? copyTagSearch.payload[0] : []).map(
        (row: Record<string, any>) => row.id
      )
    ),
    courseIds: uniqueNumbers(
      (Array.isArray(courseSearch?.payload?.[0]) ? courseSearch.payload[0] : []).map(
        (row: Record<string, any>) => row.id
      )
    ),
    termIds: uniqueNumbers(
      (Array.isArray(termSearch?.payload?.[0]) ? termSearch.payload[0] : []).map(
        (row: Record<string, any>) => row.id
      )
    ),
  };
}

async function pcrudDeleteById(
  authtoken: string,
  classId: string,
  id: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const response = await callOpenSRF("open-ils.pcrud", `open-ils.pcrud.delete.${classId}`, [
      authtoken,
      id,
    ]);
    const payload = response?.payload?.[0];
    if (!payload || isOpenSRFEvent(payload) || (payload as Record<string, any>)?.ilsevent) {
      return { ok: false, error: getErrorMessage(payload, `Failed to delete ${classId}:${id}`) };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function deleteDemoPatron(
  authtoken: string,
  patronId: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const response = await callOpenSRF("open-ils.actor", "open-ils.actor.user.delete", [
      authtoken,
      patronId,
    ]);
    const payload = response?.payload?.[0];
    if (payload && !isOpenSRFEvent(payload) && !(payload as Record<string, any>)?.ilsevent) {
      return { ok: true };
    }
  } catch {
    // Fall through to soft-delete update.
  }

  try {
    const existingRes = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.retrieve.au", [
      authtoken,
      patronId,
    ]);
    const existing = existingRes?.payload?.[0];
    if (!existing || isOpenSRFEvent(existing) || (existing as Record<string, any>)?.ilsevent) {
      return { ok: false, error: getErrorMessage(existing, `Failed to load patron ${patronId}`) };
    }
    const updatePayload = encodeFieldmapper("au", {
      ...(existing as Record<string, any>),
      id: patronId,
      deleted: "t",
      active: "f",
      ischanged: 1,
    });
    const updateRes = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.update.au", [
      authtoken,
      updatePayload,
    ]);
    const updated = updateRes?.payload?.[0];
    if (!updated || isOpenSRFEvent(updated) || (updated as Record<string, any>)?.ilsevent) {
      return {
        ok: false,
        error: getErrorMessage(updated, `Failed to soft-delete patron ${patronId}`),
      };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function deleteDemoBibRecord(
  authtoken: string,
  bibId: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const markDeleted = async (classId: "acp" | "acn", id: number) => {
    const existingRes = await callOpenSRF("open-ils.pcrud", `open-ils.pcrud.retrieve.${classId}`, [
      authtoken,
      id,
    ]);
    const existing = existingRes?.payload?.[0];
    if (!existing || isOpenSRFEvent(existing) || (existing as Record<string, any>)?.ilsevent) {
      throw new Error(getErrorMessage(existing, `Failed to load ${classId}:${id}`));
    }
    const payload = encodeFieldmapper(classId, {
      ...(existing as Record<string, any>),
      id,
      deleted: "t",
      ischanged: 1,
    });
    const updateRes = await callOpenSRF("open-ils.pcrud", `open-ils.pcrud.update.${classId}`, [
      authtoken,
      payload,
    ]);
    const updated = updateRes?.payload?.[0];
    if (!updated || isOpenSRFEvent(updated) || (updated as Record<string, any>)?.ilsevent) {
      throw new Error(getErrorMessage(updated, `Failed to mark ${classId}:${id} deleted`));
    }
  };

  try {
    const treeResponse = await callOpenSRF(
      "open-ils.cat",
      "open-ils.cat.asset.copy_tree.global.retrieve",
      [authtoken, bibId]
    );
    const tree = Array.isArray(treeResponse?.payload?.[0])
      ? (treeResponse.payload[0] as Record<string, any>[])
      : [];

    const volumeIds: number[] = [];
    const copyIds: number[] = [];

    for (const volume of tree) {
      const volId =
        typeof volume?.id === "number" ? volume.id : parseInt(String(volume?.id ?? ""), 10);
      if (Number.isFinite(volId) && volId > 0) volumeIds.push(volId);
      const copies = Array.isArray(volume?.copies) ? volume.copies : [];
      for (const copy of copies) {
        const copyId =
          typeof copy?.id === "number" ? copy.id : parseInt(String(copy?.id ?? ""), 10);
        if (Number.isFinite(copyId) && copyId > 0) copyIds.push(copyId);
      }
    }

    for (const copyId of uniqueNumbers(copyIds)) {
      await markDeleted("acp", copyId);
    }
    for (const volumeId of uniqueNumbers(volumeIds)) {
      await markDeleted("acn", volumeId);
    }

    const response = await callOpenSRF("open-ils.cat", "open-ils.cat.biblio.record_entry.delete", [
      authtoken,
      bibId,
    ]);
    const payload = response?.payload?.[0];
    if (payload && !isOpenSRFEvent(payload) && !(payload as Record<string, any>)?.ilsevent) {
      return { ok: true };
    }
    return { ok: false, error: getErrorMessage(payload, `Failed to delete bib ${bibId}`) };
  } catch (error) {
    // Fall through to pcrud delete attempt.
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function snapshotCounts(snapshot: DemoSnapshot): Record<string, number> {
  return {
    bibRecords: snapshot.bibIds.length,
    authorities: snapshot.authorityIds.length,
    patrons: snapshot.patronIds.length,
    bookingTypes: snapshot.bookingTypeIds.length,
    bookingResources: snapshot.bookingResourceIds.length,
    bookingReservations: snapshot.bookingReservationIds.length,
    buckets: snapshot.bucketIds.length,
    copyStatCategories: snapshot.statCategoryCopyIds.length,
    patronStatCategories: snapshot.statCategoryPatronIds.length,
    copyStatEntries: snapshot.statEntryCopyIds.length,
    patronStatEntries: snapshot.statEntryPatronIds.length,
    copyTagTypes: snapshot.copyTagTypeCodes.length,
    copyTags: snapshot.copyTagIds.length,
    courseReservesCourses: snapshot.courseIds.length,
    courseReservesTerms: snapshot.termIds.length,
  };
}

export async function GET(req: NextRequest) {
  try {
    const { authtoken } = await requirePermissions(["ADMIN_CONFIG"]);
    const snapshot = await collectDemoSnapshot(authtoken);
    return successResponse({
      counts: snapshotCounts(snapshot),
      ids: snapshot,
    });
  } catch (error) {
    return serverErrorResponse(error, "Admin demo hygiene GET", req);
  }
}

export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  try {
    const { authtoken, actor } = await requirePermissions(["ADMIN_CONFIG"]);
    const body = await parseJsonBodyWithSchema(req, purgeSchema);
    if (body instanceof Response) return body;

    const snapshot = await collectDemoSnapshot(authtoken);
    if (body.dryRun) {
      return successResponse({
        dryRun: true,
        counts: snapshotCounts(snapshot),
        ids: snapshot,
      });
    }

    const deleted = {
      bookingReservations: 0,
      bookingResources: 0,
      bookingTypes: 0,
      copyStatEntries: 0,
      patronStatEntries: 0,
      copyStatCategories: 0,
      patronStatCategories: 0,
      copyTags: 0,
      copyTagTypes: 0,
      courseReservesCourses: 0,
      courseReservesTerms: 0,
      buckets: 0,
      authorities: 0,
      patrons: 0,
      bibRecords: 0,
    };
    const errors: string[] = [];

    const tryDelete = async (classId: string, ids: number[], bucket: keyof typeof deleted) => {
      for (const id of ids) {
        const res = await pcrudDeleteById(authtoken, classId, id);
        if (res.ok) deleted[bucket] += 1;
        else errors.push(`${classId}:${id} -> ${res.error}`);
      }
    };

    await tryDelete("bresv", snapshot.bookingReservationIds, "bookingReservations");
    await tryDelete("brsrc", snapshot.bookingResourceIds, "bookingResources");
    await tryDelete("brt", snapshot.bookingTypeIds, "bookingTypes");
    await tryDelete("asce", snapshot.statEntryCopyIds, "copyStatEntries");
    await tryDelete("actsce", snapshot.statEntryPatronIds, "patronStatEntries");
    await tryDelete("asc", snapshot.statCategoryCopyIds, "copyStatCategories");
    await tryDelete("actsc", snapshot.statCategoryPatronIds, "patronStatCategories");
    await tryDelete("acpt", snapshot.copyTagIds, "copyTags");

    for (const code of snapshot.copyTagTypeCodes) {
      try {
        const response = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.delete.cctt", [
          authtoken,
          code,
        ]);
        const payload = response?.payload?.[0];
        if (!payload || isOpenSRFEvent(payload) || (payload as Record<string, any>)?.ilsevent) {
          errors.push(
            `cctt:${code} -> ${getErrorMessage(payload, `Failed to delete cctt:${code}`)}`
          );
        } else {
          deleted.copyTagTypes += 1;
        }
      } catch (error) {
        errors.push(`cctt:${code} -> ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    await tryDelete("acmc", snapshot.courseIds, "courseReservesCourses");
    await tryDelete("acmt", snapshot.termIds, "courseReservesTerms");

    for (const bucketId of snapshot.bucketIds) {
      try {
        const response = await callOpenSRF("open-ils.actor", "open-ils.actor.container.delete", [
          authtoken,
          "biblio",
          bucketId,
        ]);
        const payload = response?.payload?.[0];
        if (payload?.ilsevent) {
          const fallback = await pcrudDeleteById(authtoken, "cbreb", bucketId);
          if (fallback.ok) {
            deleted.buckets += 1;
          } else {
            errors.push(
              `cbreb:${bucketId} -> ${getErrorMessage(payload, "Failed to delete bucket")}; fallback=${fallback.error}`
            );
          }
        } else {
          deleted.buckets += 1;
        }
      } catch (error) {
        const fallback = await pcrudDeleteById(authtoken, "cbreb", bucketId);
        if (fallback.ok) {
          deleted.buckets += 1;
        } else {
          errors.push(
            `cbreb:${bucketId} -> ${error instanceof Error ? error.message : String(error)}; fallback=${fallback.error}`
          );
        }
      }
    }

    await tryDelete("are", snapshot.authorityIds, "authorities");

    for (const patronId of snapshot.patronIds) {
      const res = await deleteDemoPatron(authtoken, patronId);
      if (res.ok) deleted.patrons += 1;
      else errors.push(`au:${patronId} -> ${res.error}`);
    }

    for (const bibId of snapshot.bibIds) {
      const res = await deleteDemoBibRecord(authtoken, bibId);
      if (res.ok) deleted.bibRecords += 1;
      else errors.push(`bre:${bibId} -> ${res.error}`);
    }

    await logAuditEvent({
      action: "data_hygiene.demo.purge",
      entity: "demo_data",
      status: "success",
      actor: actor as import("@/lib/audit").AuditActor | null,
      ip,
      userAgent,
      requestId,
      details: {
        bibRecords: deleted.bibRecords,
        authorities: deleted.authorities,
        patrons: deleted.patrons,
        before: snapshotCounts(snapshot),
        deleted,
        errorCount: errors.length,
      },
    });

    return successResponse({
      dryRun: false,
      before: snapshotCounts(snapshot),
      deleted,
      errors,
    });
  } catch (error) {
    return serverErrorResponse(error, "Admin demo hygiene POST", req);
  }
}

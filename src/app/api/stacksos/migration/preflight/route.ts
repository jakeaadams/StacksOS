import { NextRequest } from "next/server";
import { applyBarcodeProfile } from "@/lib/barcode";
import { getProfile } from "@/config/barcode-profiles";
import { errorResponse, parseJsonBody, successResponse } from "@/lib/api/responses";

interface PreflightRecord {
  barcode: string;
  profileId: string;
  entity?: string;
  sourceId?: string;
}

export async function POST(req: NextRequest) {
  const body = await parseJsonBody(req);
  if (!body || !Array.isArray(body.records)) {
    return errorResponse("records array is required", 400);
  }

  const records = body.records as PreflightRecord[];
  if (records.length === 0) {
    return errorResponse("records array is empty", 400);
  }

  const results: any[] = [];
  const duplicateMap = new Map<string, number[]>();

  records.forEach((record, index) => {
    const profile = record.profileId ? getProfile(record.profileId) : undefined;
    if (!profile) {
      results.push({
        index,
        sourceId: record.sourceId,
        barcode: record.barcode,
        profileId: record.profileId,
        entity: record.entity,
        valid: false,
        completed: record.barcode,
        errors: ["Unknown barcode profile"],
      });
      return;
    }

    const result = applyBarcodeProfile(record.barcode, profile);
    const entity = record.entity || profile.entity;
    const key = `${entity}|${result.completed}`;

    if (!duplicateMap.has(key)) {
      duplicateMap.set(key, []);
    }
    duplicateMap.get(key)?.push(index);

    results.push({
      index,
      sourceId: record.sourceId,
      barcode: record.barcode,
      profileId: record.profileId,
      entity,
      valid: result.valid,
      normalized: result.normalized,
      completed: result.completed,
      errors: result.errors,
    });
  });

  let duplicateCount = 0;
  for (const indices of duplicateMap.values()) {
    if (indices.length > 1) {
      duplicateCount += indices.length;
      indices.forEach((idx) => {
        results[idx].duplicate = true;
        results[idx].duplicateGroupSize = indices.length;
      });
    }
  }

  const invalidCount = results.filter((r) => !r.valid).length;

  return successResponse({
    summary: {
      total: results.length,
      valid: results.length - invalidCount,
      invalid: invalidCount,
      duplicates: duplicateCount,
    },
    results,
  });
}

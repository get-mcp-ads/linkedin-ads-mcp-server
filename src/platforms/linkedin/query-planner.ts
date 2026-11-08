import { LINKEDIN_PIVOTS, findDimension } from "./catalog/dimensions.js";
import { LINKEDIN_API_METRICS, findMetric } from "./catalog/metrics.js";
import { dependenciesOf, isCalculated } from "./calculated-metrics.js";
import { checkCompatibility, type CompatibilityIssue } from "./compatibility-rules.js";
import { LinkedInMcpError } from "../../core/errors.js";
import type { LinkedInDate, LinkedInDateRange } from "./types.js";

/** LinkedIn accepts at most 20 entries in `fields`. */
const MAX_FIELDS = 20;

/** Always requested: without them a row does not say what it describes. */
const STRUCTURAL_FIELDS = ["dateRange", "pivotValues"];

export type PlannedQuery = {
  pivots: string[];
  /** The fields sent to LinkedIn, structural fields included. */
  fields: string[];
  /** The calculated metrics added afterwards. */
  calculated: string[];
  dateRange: LinkedInDateRange;
  timeGranularity: string;
  dayCount: number;
  issues: CompatibilityIssue[];
};

export function parseDate(value: string): LinkedInDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    throw new LinkedInMcpError(`Expected a date as YYYY-MM-DD, received "${value}".`, 400);
  }
  const [, year, month, day] = match;
  const date = { year: Number(year), month: Number(month), day: Number(day) };
  if (date.month < 1 || date.month > 12 || date.day < 1 || date.day > 31) {
    throw new LinkedInMcpError(`"${value}" is not a valid calendar date.`, 400);
  }
  return date;
}

function toEpoch(date: LinkedInDate): number {
  return Date.UTC(date.year, date.month - 1, date.day);
}

export function dayCountOf(range: LinkedInDateRange): number {
  const end = range.end ? toEpoch(range.end) : Date.now();
  return Math.max(1, Math.round((end - toEpoch(range.start)) / 86_400_000) + 1);
}

/** The name LinkedIn expects for a pivot, whatever the case received. */
export function resolvePivot(value: string): string {
  const upper = value.trim().toUpperCase();
  if (LINKEDIN_PIVOTS.includes(upper)) return upper;
  const dimension = findDimension(value);
  if (dimension && dimension.category !== "time") return dimension.apiField;
  throw new LinkedInMcpError(
    `${value} is not a LinkedIn pivot. Valid pivots: ${LINKEDIN_PIVOTS.join(", ")}.`,
    400,
  );
}

/**
 * Turns a request into a query LinkedIn accepts.
 *
 * Three things happen here and nowhere else: metric aliases become API fields,
 * calculated metrics are replaced by the raw fields they depend on, and the
 * twenty field ceiling is applied before the call instead of being discovered
 * in a 400 error.
 */
export function planQuery(input: {
  pivots: string[];
  metrics: string[];
  startDate: string;
  endDate?: string;
  timeGranularity?: string;
}): PlannedQuery {
  const pivots = input.pivots.map(resolvePivot);
  const dateRange: LinkedInDateRange = {
    start: parseDate(input.startDate),
    ...(input.endDate ? { end: parseDate(input.endDate) } : {}),
  };
  if (dateRange.end && toEpoch(dateRange.end) < toEpoch(dateRange.start)) {
    throw new LinkedInMcpError("The end date is before the start date.", 400);
  }

  const timeGranularity = (input.timeGranularity ?? "ALL").toUpperCase();
  if (!["ALL", "DAILY", "MONTHLY", "YEARLY"].includes(timeGranularity)) {
    throw new LinkedInMcpError(
      `timeGranularity must be ALL, DAILY, MONTHLY or YEARLY, received "${input.timeGranularity}".`,
      400,
    );
  }

  const calculated: string[] = [];
  const apiFields = new Set<string>();
  for (const raw of input.metrics) {
    const definition = findMetric(raw);
    if (!definition) {
      throw new LinkedInMcpError(
        `${raw} is not a LinkedIn Ads metric. Read linkedin://metrics for the catalogue, or call linkedin_validate_query.`,
        400,
      );
    }
    if (definition.type === "calculated") {
      calculated.push(definition.key);
      for (const dependency of dependenciesOf([definition.key])) apiFields.add(dependency);
      continue;
    }
    if (definition.apiField.includes(".")) {
      throw new LinkedInMcpError(
        `${definition.key} only exists on the revenue attribution finder. Call linkedin_get_revenue_attribution instead.`,
        400,
      );
    }
    apiFields.add(definition.apiField);
  }

  if (apiFields.size === 0) {
    apiFields.add("impressions");
    apiFields.add("clicks");
  }

  const fields = [...STRUCTURAL_FIELDS, ...apiFields];
  if (fields.length > MAX_FIELDS) {
    const overflow = fields.length - MAX_FIELDS;
    throw new LinkedInMcpError(
      `LinkedIn accepts at most ${MAX_FIELDS} fields per report, including dateRange and pivotValues. ` +
        `This request needs ${fields.length}, so drop ${overflow} metric${overflow > 1 ? "s" : ""} or split the report. ` +
        `Calculated metrics count as their inputs: ${calculated.join(", ") || "none requested"}.`,
      400,
    );
  }

  const dayCount = dayCountOf(dateRange);
  const issues = checkCompatibility(pivots, [...apiFields, ...calculated], {
    timeGranularity,
    dayCount,
  });
  const blocking = issues.filter((i) => i.severity === "error");
  if (blocking.length > 0) {
    throw new LinkedInMcpError(
      `This report would return empty or misleading columns: ${blocking
        .map((i) => `${i.field}: ${i.reason}`)
        .join(" ")}`,
      400,
    );
  }

  return { pivots, fields, calculated, dateRange, timeGranularity, dayCount, issues };
}

/** What a requested field missing from the response means, in plain words. */
export function missingFieldNote(fields: string[], rows: Record<string, unknown>[]): string | undefined {
  if (rows.length === 0) return undefined;
  const present = new Set(rows.flatMap((row) => Object.keys(row)));
  const missing = fields.filter(
    (f) => !STRUCTURAL_FIELDS.includes(f) && LINKEDIN_API_METRICS.has(f) && !present.has(f),
  );
  if (missing.length === 0) return undefined;
  return (
    `LinkedIn returned no value at all for ${missing.join(", ")}. ` +
    "The API drops a field it cannot serve rather than refusing the call, so these are absent, not zero."
  );
}

export { isCalculated };

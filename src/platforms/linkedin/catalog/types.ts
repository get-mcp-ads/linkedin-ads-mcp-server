// Types of the LinkedIn Ads catalogs: key, name, description, category,
// API field and the origin of the value.

export type LinkedInMetricCategory =
  | "core"
  | "spend"
  | "engagement"
  | "video"
  | "document"
  | "event"
  | "conversion"
  | "lead"
  | "job"
  | "reach"
  | "viral"
  | "messaging"
  | "revenue"
  | "calculated";

export type LinkedInMetricFormat =
  | "number"
  | "currency"
  | "percentage"
  | "ratio"
  | "duration";

export interface LinkedInMetricDefinition {
  key: string;
  name: string;
  description: string;
  category: LinkedInMetricCategory;
  format: LinkedInMetricFormat;
  /** The exact name expected in the `fields` parameter. Empty when computed here. */
  apiField: string;
  type: "api" | "calculated";
  formula?: string;
  dependencies?: string[];
  /** Pivots with which LinkedIn does not return this metric. */
  incompatibleWith?: string[];
}

export type LinkedInDimensionCategory =
  | "entity"
  | "time"
  | "demographic"
  | "delivery"
  | "creative";

export interface LinkedInDimensionDefinition {
  key: string;
  name: string;
  description: string;
  category: LinkedInDimensionCategory;
  /** The exact value of the `pivot` parameter, or of `timeGranularity`. */
  apiField: string;
  /** The entity level this pivot needs to return anything. */
  requiredLevel?: string;
  incompatibleWith?: string[];
}

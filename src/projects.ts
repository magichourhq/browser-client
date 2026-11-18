export type ProjectKind = "image" | "video";
export type Project = {
  id: string;
  status: "draft" | "queued" | "rendering" | "complete" | "error" | "canceled";
  credits_charged: number;
  downloads: { url: string; expires_at: string }[];
  error?: { message: string; code: string } | null;
};

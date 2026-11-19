import type { ImageProjectsGetResponse, VideoProjectsGetResponse } from "@magichourhq/api-types";

export type ProjectKind = "image" | "video";
type ProjectsByKind = {
  image: ImageProjectsGetResponse;
  video: VideoProjectsGetResponse;
};
export type Project<Kind extends ProjectKind = ProjectKind> = ProjectsByKind[Kind];

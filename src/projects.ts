import type {
  AudioProjectsGetResponse,
  ImageProjectsGetResponse,
  VideoProjectsGetResponse,
} from "@magichourhq/api-types";

export type ProjectKind = "audio" | "image" | "video";
type ProjectsByKind = {
  audio: AudioProjectsGetResponse;
  image: ImageProjectsGetResponse;
  video: VideoProjectsGetResponse;
};
export type Project<Kind extends ProjectKind = ProjectKind> = ProjectsByKind[Kind];

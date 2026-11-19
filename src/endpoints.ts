import type {
  AiClothesChangerCreateBody,
  AiFaceEditorCreateBody,
  AiGifGeneratorCreateBody,
  AiHeadshotGeneratorCreateBody,
  AiImageEditorCreateBody,
  AiImageGeneratorCreateBody,
  AiImageUpscalerCreateBody,
  AiMemeGeneratorCreateBody,
  AiQrCodeGeneratorCreateBody,
  AiTalkingPhotoCreateBody,
  AiUgcAdCreateBody,
  AiVideoEditorCreateBody,
  AiVideoTranslatorCreateBody,
  AiVideoUpscalerCreateBody,
  AnimationCreateBody,
  AudioToVideoCreateBody,
  AutoSubtitleGeneratorCreateBody,
  BodySwapCreateBody,
  CharacterReplaceCreateBody,
  FaceSwapCreateBody,
  FaceSwapPhotoCreateBody,
  HeadSwapCreateBody,
  ImageBackgroundRemoverCreateBody,
  ImageToVideoCreateBody,
  LipSyncCreateBody,
  PhotoColorizerCreateBody,
  TextToVideoCreateBody,
  VideoToVideoCreateBody,
} from "@magichourhq/api-types";
import type { ProjectKind } from "./projects.js";

type CreateBodies = {
  "ai-clothes-changer": AiClothesChangerCreateBody;
  "ai-face-editor": AiFaceEditorCreateBody;
  "ai-gif-generator": AiGifGeneratorCreateBody;
  "ai-headshot-generator": AiHeadshotGeneratorCreateBody;
  "ai-image-editor": AiImageEditorCreateBody;
  "ai-image-generator": AiImageGeneratorCreateBody;
  "ai-image-upscaler": AiImageUpscalerCreateBody;
  "ai-meme-generator": AiMemeGeneratorCreateBody;
  "ai-qr-code-generator": AiQrCodeGeneratorCreateBody;
  "ai-talking-photo": AiTalkingPhotoCreateBody;
  "ai-ugc-ad": AiUgcAdCreateBody;
  "ai-video-editor": AiVideoEditorCreateBody;
  "ai-video-translator": AiVideoTranslatorCreateBody;
  "ai-video-upscaler": AiVideoUpscalerCreateBody;
  animation: AnimationCreateBody;
  "audio-to-video": AudioToVideoCreateBody;
  "auto-subtitle-generator": AutoSubtitleGeneratorCreateBody;
  "body-swap": BodySwapCreateBody;
  "character-replace": CharacterReplaceCreateBody;
  "face-swap-photo": FaceSwapPhotoCreateBody;
  "face-swap": FaceSwapCreateBody;
  "head-swap": HeadSwapCreateBody;
  "image-background-remover": ImageBackgroundRemoverCreateBody;
  "image-to-video": ImageToVideoCreateBody;
  "lip-sync": LipSyncCreateBody;
  "photo-colorizer": PhotoColorizerCreateBody;
  "text-to-video": TextToVideoCreateBody;
  "video-to-video": VideoToVideoCreateBody;
};

/** The project kind each create endpoint makes. */
export const createKinds = {
  "ai-clothes-changer": "image",
  "ai-face-editor": "image",
  "ai-gif-generator": "image",
  "ai-headshot-generator": "image",
  "ai-image-editor": "image",
  "ai-image-generator": "image",
  "ai-image-upscaler": "image",
  "ai-meme-generator": "image",
  "ai-qr-code-generator": "image",
  "ai-talking-photo": "video",
  "ai-ugc-ad": "video",
  "ai-video-editor": "video",
  "ai-video-translator": "video",
  "ai-video-upscaler": "video",
  animation: "video",
  "audio-to-video": "video",
  "auto-subtitle-generator": "video",
  "body-swap": "image",
  "character-replace": "video",
  "face-swap-photo": "image",
  "face-swap": "video",
  "head-swap": "image",
  "image-background-remover": "image",
  "image-to-video": "video",
  "lip-sync": "video",
  "photo-colorizer": "image",
  "text-to-video": "video",
  "video-to-video": "video",
} as const satisfies Record<keyof CreateBodies, ProjectKind>;

export type CreateEndpoints = {
  [Endpoint in keyof CreateBodies]: {
    kind: (typeof createKinds)[Endpoint];
    body: CreateBodies[Endpoint];
  };
};
export type CreateEndpoint = keyof CreateEndpoints;
export type CreateBody<Endpoint extends CreateEndpoint> = CreateEndpoints[Endpoint]["body"];
export type CreateKind<Endpoint extends CreateEndpoint> = CreateEndpoints[Endpoint]["kind"];
/** Keeps each endpoint paired with its request body. */
export type CreateArguments = {
  [Endpoint in CreateEndpoint]: [
    endpoint: Endpoint,
    body: CreateBody<Endpoint>,
    signal?: AbortSignal,
    headers?: Record<string, string | undefined>,
  ];
}[CreateEndpoint];

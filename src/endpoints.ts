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

export type CreateEndpoints = {
  "ai-clothes-changer": { kind: "image"; body: AiClothesChangerCreateBody };
  "ai-face-editor": { kind: "image"; body: AiFaceEditorCreateBody };
  "ai-gif-generator": { kind: "image"; body: AiGifGeneratorCreateBody };
  "ai-headshot-generator": { kind: "image"; body: AiHeadshotGeneratorCreateBody };
  "ai-image-editor": { kind: "image"; body: AiImageEditorCreateBody };
  "ai-image-generator": { kind: "image"; body: AiImageGeneratorCreateBody };
  "ai-image-upscaler": { kind: "image"; body: AiImageUpscalerCreateBody };
  "ai-meme-generator": { kind: "image"; body: AiMemeGeneratorCreateBody };
  "ai-qr-code-generator": { kind: "image"; body: AiQrCodeGeneratorCreateBody };
  "ai-talking-photo": { kind: "video"; body: AiTalkingPhotoCreateBody };
  "ai-ugc-ad": { kind: "video"; body: AiUgcAdCreateBody };
  "ai-video-editor": { kind: "video"; body: AiVideoEditorCreateBody };
  "ai-video-translator": { kind: "video"; body: AiVideoTranslatorCreateBody };
  "ai-video-upscaler": { kind: "video"; body: AiVideoUpscalerCreateBody };
  "animation": { kind: "video"; body: AnimationCreateBody };
  "audio-to-video": { kind: "video"; body: AudioToVideoCreateBody };
  "auto-subtitle-generator": { kind: "video"; body: AutoSubtitleGeneratorCreateBody };
  "body-swap": { kind: "image"; body: BodySwapCreateBody };
  "character-replace": { kind: "video"; body: CharacterReplaceCreateBody };
  "face-swap": { kind: "video"; body: FaceSwapCreateBody };
  "face-swap-photo": { kind: "image"; body: FaceSwapPhotoCreateBody };
  "head-swap": { kind: "image"; body: HeadSwapCreateBody };
  "image-background-remover": { kind: "image"; body: ImageBackgroundRemoverCreateBody };
  "image-to-video": { kind: "video"; body: ImageToVideoCreateBody };
  "lip-sync": { kind: "video"; body: LipSyncCreateBody };
  "photo-colorizer": { kind: "image"; body: PhotoColorizerCreateBody };
  "text-to-video": { kind: "video"; body: TextToVideoCreateBody };
  "video-to-video": { kind: "video"; body: VideoToVideoCreateBody };
};
export type CreateEndpoint = keyof CreateEndpoints;
export type CreateBody<Endpoint extends CreateEndpoint> = CreateEndpoints[Endpoint]["body"];
export type CreateKind<Endpoint extends CreateEndpoint> = CreateEndpoints[Endpoint]["kind"];

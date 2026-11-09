import { facebookPublisher, instagramPublisher } from "./meta-publishers";
import { tiktokPublisher } from "./tiktok-publisher";
import type { PublishPlatform, Publisher } from "./types";
import { youtubePublisher } from "./youtube-publisher";

export const PUBLISHERS: Record<PublishPlatform, Publisher> = {
  youtube: youtubePublisher,
  instagram: instagramPublisher,
  facebook: facebookPublisher,
  tiktok: tiktokPublisher,
};

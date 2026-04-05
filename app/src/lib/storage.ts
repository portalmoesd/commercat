import { createAdminClient } from "./supabase-server";

const BUCKET = "images";

/** Detect image type from base64 data */
function detectMediaType(base64Data: string): { contentType: string; ext: string } {
  if (base64Data.startsWith("iVBOR")) return { contentType: "image/png", ext: "png" };
  if (base64Data.startsWith("R0lGO")) return { contentType: "image/gif", ext: "gif" };
  if (base64Data.startsWith("UklGR")) return { contentType: "image/webp", ext: "webp" };
  return { contentType: "image/jpeg", ext: "jpg" };
}

/**
 * Upload a base64 image to Supabase Storage and return a public URL.
 * Uses the admin client to bypass RLS on storage.
 */
export async function uploadImage(
  base64Data: string,
  userId: string
): Promise<string> {
  const supabase = createAdminClient();

  const { contentType, ext } = detectMediaType(base64Data);

  // Decode base64 to buffer
  const buffer = Buffer.from(base64Data, "base64");

  // Generate unique filename
  const filename = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  // Upload to Supabase Storage
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filename, buffer, {
      contentType,
      upsert: false,
    });

  if (error) {
    throw new Error(`Image upload failed: ${error.message}`);
  }

  // Get public URL
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);

  return data.publicUrl;
}

import { createAdminClient } from "./supabase-server";

const BUCKET = "images";

/**
 * Upload a base64 image to Supabase Storage and return a public URL.
 * Uses the admin client to bypass RLS on storage.
 */
export async function uploadImage(
  base64Data: string,
  userId: string
): Promise<string> {
  const supabase = createAdminClient();

  // Decode base64 to buffer
  const buffer = Buffer.from(base64Data, "base64");

  // Generate unique filename
  const filename = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;

  // Upload to Supabase Storage
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filename, buffer, {
      contentType: "image/jpeg",
      upsert: false,
    });

  if (error) {
    throw new Error(`Image upload failed: ${error.message}`);
  }

  // Get public URL
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);

  return data.publicUrl;
}

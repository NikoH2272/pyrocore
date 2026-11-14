// PYROCORE — subida de imágenes del admin (logos de sponsors y póster principal).
// Recibe multipart/form-data { token, folder, file }, valida la sesión del staff
// con prc_staff_me() y guarda el archivo en el bucket público "pyrocore".
// Devuelve { url } — en la base de datos solo se guarda ese enlace (nada de base64).
//
// Desplegar sin verificación JWT (la seguridad es el token del staff):
//   supabase functions deploy pyrocore-upload --no-verify-jwt
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const BUCKET = "pyrocore";
const FOLDERS = new Set(["sponsors", "hero"]);
const TYPES: Record<string, string> = {
  "image/webp": "webp",
  "image/png": "png",
  "image/jpeg": "jpg",
};
const MAX_BYTES = 2 * 1024 * 1024;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  try {
    const form = await req.formData();
    const token = String(form.get("token") ?? "");
    const folder = String(form.get("folder") ?? "sponsors");
    const file = form.get("file");

    if (!token) return json({ error: "Sesión vencida. Inicia sesión de nuevo." }, 401);
    if (!FOLDERS.has(folder)) return json({ error: "Carpeta no válida" }, 400);
    if (!(file instanceof File)) return json({ error: "Falta la imagen" }, 400);
    const ext = TYPES[file.type];
    if (!ext) return json({ error: "Formato no permitido (usa PNG, JPG o WebP)" }, 400);
    if (file.size > MAX_BYTES) return json({ error: "La imagen pesa más de 2 MB" }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });

    const { error: authError } = await sb.rpc("prc_staff_me", { p_token: token });
    if (authError) return json({ error: "Sesión vencida. Inicia sesión de nuevo." }, 401);

    const path = `${folder}/${crypto.randomUUID()}.${ext}`;
    const { error: upError } = await sb.storage.from(BUCKET).upload(path, file, {
      contentType: file.type,
      cacheControl: "31536000",
      upsert: false,
    });
    if (upError) return json({ error: upError.message }, 500);

    const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
    return json({ url: data.publicUrl });
  } catch (err) {
    return json({ error: (err as Error).message || "Error inesperado" }, 500);
  }
});

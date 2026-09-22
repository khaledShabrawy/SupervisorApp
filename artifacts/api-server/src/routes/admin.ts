import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

type JsonRecord = Record<string, unknown>;

interface AdminRequest extends Request {
  adminUserId?: string;
}

interface SupervisorCreateBody {
  email?: string;
  password?: string;
  full_name?: string;
  phone?: string;
  branch?: string;
  region?: string;
}

interface SupervisorPatchBody {
  full_name?: string;
  phone?: string;
  branch?: string;
  region?: string;
  role?: "admin" | "supervisor";
  is_active?: boolean;
}

interface CustomerPatchBody {
  is_active?: boolean;
}

function getSupabaseConfig() {
  const url = process.env["EXPO_PUBLIC_SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase server configuration is missing");
  }
  return { url, serviceRoleKey };
}

async function supabaseFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!response.ok) {
    const detail =
      typeof payload === "object" && payload !== null && "message" in payload
        ? String((payload as JsonRecord).message)
        : typeof payload === "string"
          ? payload
          : `Supabase request failed (${response.status})`;
    throw new Error(detail);
  }
  return payload as T;
}

async function authenticateAdmin(req: AdminRequest, res: Response) {
  const bearer = req.headers.authorization;
  const accessToken = bearer?.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) {
    res.status(401).json({ error: "تسجيل الدخول مطلوب" });
    return false;
  }

  try {
    const { url, serviceRoleKey } = getSupabaseConfig();
    const userResponse = await fetch(`${url}/auth/v1/user`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!userResponse.ok) {
      res.status(401).json({ error: "جلسة الدخول غير صالحة" });
      return false;
    }

    const user = (await userResponse.json()) as { id?: string };
    if (!user.id) {
      res.status(401).json({ error: "تعذر التحقق من المستخدم" });
      return false;
    }

    const profiles = await supabaseFetch<Array<{ id: string; role?: string; is_active?: boolean }>>(
      `/rest/v1/supervisors?id=eq.${encodeURIComponent(user.id)}&select=id,role,is_active&limit=1`,
    );
    const profile = profiles[0];
    if (!profile || profile.is_active === false || profile.role !== "admin") {
      res.status(403).json({ error: "ليس لديك صلاحية الوصول إلى لوحة الإدارة" });
      return false;
    }

    req.adminUserId = user.id;
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر التحقق من صلاحيات المدير";
    res.status(500).json({ error: message });
    return false;
  }
}

router.use(async (req: AdminRequest, res, next) => {
  if (await authenticateAdmin(req, res)) next();
});

router.get("/overview", async (_req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [supervisors, customers, visits] = await Promise.all([
      supabaseFetch<Array<JsonRecord>>(
        "/rest/v1/supervisors?select=id,full_name,email,phone,branch,region,role,is_active,created_at&order=created_at.desc",
      ),
      supabaseFetch<Array<JsonRecord>>(
        "/rest/v1/customers?select=id,name,type,address,owner_name,owner_phone,is_active,created_at&order=created_at.desc",
      ),
      supabaseFetch<Array<JsonRecord>>(
        `/rest/v1/visits?select=id,status,visit_date,customer_id&visit_date=gte.${today}T00:00:00&order=visit_date.desc`,
      ),
    ]);

    res.json({
      metrics: {
        supervisors: supervisors.length,
        activeSupervisors: supervisors.filter((item) => item.is_active !== false).length,
        customers: customers.length,
        visitsToday: visits.length,
      },
      supervisors,
      customers,
      visits,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر تحميل بيانات الإدارة";
    res.status(500).json({ error: message });
  }
});

router.post(
  "/supervisors",
  async (req: Request<object, object, SupervisorCreateBody>, res: Response) => {
    const { email, password, full_name, phone, branch, region } = req.body;
    if (!email || !password || !full_name || password.length < 8) {
      res.status(400).json({ error: "الاسم والبريد وكلمة مرور من 8 أحرف على الأقل مطلوبة" });
      return;
    }

    let authUserId: string | undefined;
    try {
      const authUser = await supabaseFetch<{ id?: string }>("/auth/v1/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          email_confirm: true,
          user_metadata: { full_name: full_name.trim() },
        }),
      });
      authUserId = authUser.id;
      if (!authUserId) throw new Error("تعذر إنشاء مستخدم Auth");

      const created = await supabaseFetch<Array<JsonRecord>>(
        "/rest/v1/supervisors?select=id,full_name,email,phone,branch,region,role,is_active,created_at",
        {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({
            id: authUserId,
            auth_user_id: authUserId,
            full_name: full_name.trim(),
            email: email.trim().toLowerCase(),
            phone: phone?.trim() || null,
            branch: branch?.trim() || null,
            region: region?.trim() || null,
            role: "supervisor",
            is_active: true,
          }),
        },
      );
      res.status(201).json({ supervisor: created[0] });
    } catch (error) {
      if (authUserId) {
        try {
          await supabaseFetch(`/auth/v1/admin/users/${authUserId}`, { method: "DELETE" });
        } catch {
          // Keep the original creation error; cleanup can be retried from Supabase.
        }
      }
      const message = error instanceof Error ? error.message : "تعذر إنشاء المشرف";
      res.status(400).json({ error: message });
    }
  },
);

router.patch(
  "/supervisors/:id",
  async (req: AdminRequest & Request<{ id: string }, object, SupervisorPatchBody>, res: Response) => {
    const { id } = req.params;
    if (id === req.adminUserId && req.body.is_active === false) {
      res.status(400).json({ error: "لا يمكنك تعطيل حسابك الحالي" });
      return;
    }
    if (id === req.adminUserId && req.body.role === "supervisor") {
      res.status(400).json({ error: "لا يمكنك خفض صلاحية حسابك الحالي" });
      return;
    }

    const allowed: SupervisorPatchBody = {};
    for (const key of ["full_name", "phone", "branch", "region", "role", "is_active"] as const) {
      if (req.body[key] !== undefined) allowed[key] = req.body[key];
    }
    if (Object.keys(allowed).length === 0) {
      res.status(400).json({ error: "لا توجد تغييرات" });
      return;
    }

    try {
      const updated = await supabaseFetch<Array<JsonRecord>>(
        `/rest/v1/supervisors?id=eq.${encodeURIComponent(id)}&select=id,full_name,email,phone,branch,region,role,is_active,created_at`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(allowed),
        },
      );
      res.json({ supervisor: updated[0] });
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر تحديث المشرف";
      res.status(400).json({ error: message });
    }
  },
);

router.patch(
  "/customers/:id",
  async (req: Request<{ id: string }, object, CustomerPatchBody>, res: Response) => {
    if (typeof req.body.is_active !== "boolean") {
      res.status(400).json({ error: "حالة العميل غير صالحة" });
      return;
    }
    try {
      const updated = await supabaseFetch<Array<JsonRecord>>(
        `/rest/v1/customers?id=eq.${encodeURIComponent(req.params.id)}&select=id,name,type,address,owner_name,owner_phone,is_active,created_at`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ is_active: req.body.is_active }),
        },
      );
      res.json({ customer: updated[0] });
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر تحديث العميل";
      res.status(400).json({ error: message });
    }
  },
);

export default router;
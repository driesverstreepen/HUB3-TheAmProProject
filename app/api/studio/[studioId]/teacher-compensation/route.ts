import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkStudioAccess, checkStudioPermission } from "@/lib/supabaseHelpers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
});

async function getUserFromBearer(request: NextRequest) {
    const authHeader = request.headers.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
        return { user: null as any, error: "Unauthorized" };
    }

    const token = authHeader.substring("Bearer ".length);
    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const {
        data: { user },
        error,
    } = await supabaseUser.auth.getUser();
    if (error || !user) return { user: null as any, error: "Unauthorized" };
    return { user, error: null };
}

function isNonNegativeNumber(value: any) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function normalizeIban(value: string) {
    return value.replace(/\s+/g, "").toUpperCase();
}

function isValidIban(value: string) {
    // Basic IBAN validation: 2-letter country code + 13-32 alphanumerics.
    // This does not implement checksum validation; it catches most bad input.
    return /^[A-Z]{2}[0-9A-Z]{13,32}$/.test(value);
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ studioId: string }> },
) {
    try {
        const { studioId } = await params;

        const { user, error } = await getUserFromBearer(request);
        if (error) return NextResponse.json({ error }, { status: 401 });

        const access = await checkStudioAccess(supabaseAdmin, studioId, user.id);
        if (!access.hasAccess) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const perm = await checkStudioPermission(
            supabaseAdmin,
            studioId,
            user.id,
            "studio.finance",
        );
        if (!perm.allowed) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const teacherId = request.nextUrl.searchParams.get("teacher_id") || "";
        if (!teacherId) {
            return NextResponse.json({ error: "teacher_id is required" }, {
                status: 400,
            });
        }

        const { data, error: selectError } = await supabaseAdmin
            .from("teacher_compensation")
            .select("*")
            .eq("studio_id", studioId)
            .eq("teacher_id", teacherId)
            .maybeSingle();

        if (selectError) {
            console.error("Error selecting teacher_compensation:", selectError);
            return NextResponse.json({ error: "Failed to load compensation" }, {
                status: 500,
            });
        }

        return NextResponse.json({ compensation: data || null });
    } catch (err) {
        console.error("Error in teacher-compensation GET:", err);
        return NextResponse.json({ error: "Internal server error" }, {
            status: 500,
        });
    }
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ studioId: string }> },
) {
    try {
        const { studioId } = await params;

        const { user, error } = await getUserFromBearer(request);
        if (error) return NextResponse.json({ error }, { status: 401 });

        const access = await checkStudioAccess(supabaseAdmin, studioId, user.id);
        if (!access.hasAccess) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const perm = await checkStudioPermission(
            supabaseAdmin,
            studioId,
            user.id,
            "studio.finance",
            { requireWrite: true },
        );
        if (!perm.allowed) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = await request.json();

        const teacher_id = String((body as any)?.teacher_id || "");
        const lesson_fee = Number((body as any)?.lesson_fee);
        const transport_fee = Number((body as any)?.transport_fee);
        const payment_method = (body as any)?.payment_method;
        const active = (body as any)?.active;
        const notes = (body as any)?.notes;
        const ibanRaw = (body as any)?.iban;

        if (!teacher_id) {
            return NextResponse.json({ error: "teacher_id is required" }, {
                status: 400,
            });
        }

        if (
            !isNonNegativeNumber(lesson_fee) ||
            !isNonNegativeNumber(transport_fee)
        ) {
            return NextResponse.json({ error: "Invalid fee values" }, {
                status: 400,
            });
        }

        const allowedPaymentMethods = [
            "factuur",
            "vrijwilligersvergoeding",
            "verenigingswerk",
            "akv",
        ];
        if (!allowedPaymentMethods.includes(String(payment_method))) {
            return NextResponse.json({ error: "Invalid payment_method" }, {
                status: 400,
            });
        }

        if (typeof active !== "boolean") {
            return NextResponse.json({ error: "Invalid active value" }, {
                status: 400,
            });
        }

        if (
            notes !== null && notes !== undefined && typeof notes !== "string"
        ) {
            return NextResponse.json({ error: "Invalid notes value" }, {
                status: 400,
            });
        }

        let iban: string | null = null;
        if (ibanRaw !== null && ibanRaw !== undefined) {
            if (typeof ibanRaw !== "string") {
                return NextResponse.json({ error: "Invalid iban value" }, {
                    status: 400,
                });
            }
            const trimmed = ibanRaw.trim();
            if (trimmed.length > 0) {
                const normalized = normalizeIban(trimmed);
                if (!isValidIban(normalized)) {
                    return NextResponse.json({ error: "Invalid IBAN" }, {
                        status: 400,
                    });
                }
                iban = normalized;
            }
        }

        const payload: any = {
            studio_id: studioId,
            teacher_id,
            lesson_fee,
            transport_fee,
            payment_method: String(payment_method),
            active,
            notes: notes ?? null,
            iban,
            updated_at: new Date().toISOString(),
        };

        const { data, error: upsertError } = await supabaseAdmin
            .from("teacher_compensation")
            .upsert(payload, { onConflict: "studio_id,teacher_id" })
            .select()
            .maybeSingle();

        if (upsertError) {
            console.error("Error upserting teacher_compensation:", upsertError);
            return NextResponse.json({ error: "Failed to save compensation" }, {
                status: 500,
            });
        }

        return NextResponse.json({ compensation: data || null });
    } catch (err) {
        console.error("Error in teacher-compensation PUT:", err);
        return NextResponse.json({ error: "Internal server error" }, {
            status: 500,
        });
    }
}

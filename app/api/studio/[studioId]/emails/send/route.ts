import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { Resend } from "resend";
import { checkStudioAccess, checkStudioPermission } from "@/lib/supabaseHelpers";

export async function POST(
    req: Request,
    { params }: { params: Promise<{ studioId: string }> },
) {
    try {
        const { studioId } = await params;
        const { subject, body, recipient_groups, recipients } = await req
            .json();

        if (!studioId || !subject || !body) {
            return NextResponse.json({ error: "Missing fields" }, {
                status: 400,
            });
        }

        const cookieStore: any = await cookies() as any;
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll();
                    },
                    setAll(cookiesToSet: any[]) {
                        cookiesToSet.forEach((c: any) =>
                            cookieStore.set(c.name, c.value, c.options)
                        );
                    },
                },
            },
        );

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, {
                status: 401,
            });
        }

        const access = await checkStudioAccess(
            supabase as any,
            studioId,
            user.id,
        );
        if (!access.hasAccess) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const perm = await checkStudioPermission(
            supabase as any,
            studioId,
            user.id,
            "studio.emails",
            { requireWrite: true },
        );
        if (!perm.allowed) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const toSet = new Set<string>((recipients?.to) || []);
        const ccSet = new Set<string>((recipients?.cc) || []);
        const bccSet = new Set<string>((recipients?.bcc) || []);

        if (
            Array.isArray(recipient_groups) &&
            recipient_groups.includes("admins")
        ) {
            const { data: admins } = await supabase
                .from("studio_members").select("user_id, role")
                .eq("studio_id", studioId);
            const adminIds = (admins || [])
                .filter((r: any) => r && (r.role === 'owner' || r.role === 'admin'))
                .map((r: any) => r.user_id);
            if (adminIds.length) {
                const { data: profiles } = await supabase
                    .from("user_profiles").select("email")
                    .in("user_id", adminIds);
                (profiles || []).forEach((p: any) =>
                    p.email && toSet.add(p.email)
                );
            }
        }

        if (
            Array.isArray(recipient_groups) &&
            recipient_groups.includes("teachers")
        ) {
            const { data: rows } = await supabase
                .from("teacher_programs").select("teacher_id")
                .eq("studio_id", studioId);
            const teacherIds = Array.from(
                new Set((rows || []).map((r: any) => r.teacher_id)),
            );
            if (teacherIds.length) {
                const { data: profiles } = await supabase
                    .from("user_profiles").select("email")
                    .in("user_id", teacherIds);
                (profiles || []).forEach((p: any) =>
                    p.email && toSet.add(p.email)
                );
            }
        }

        if (
            Array.isArray(recipient_groups) &&
            recipient_groups.includes("users")
        ) {
            const { data: programs } = await supabase
                .from("programs").select("id")
                .eq("studio_id", studioId);
            const programIds = (programs || []).map((p: any) => p.id);
            if (programIds.length) {
                const { data: enrollments } = await supabase
                    .from("inschrijvingen").select("user_id")
                    .in("program_id", programIds);
                const userIds = Array.from(
                    new Set((enrollments || []).map((e: any) => e.user_id)),
                );
                if (userIds.length) {
                    const { data: profiles } = await supabase
                        .from("user_profiles").select("email")
                        .in("user_id", userIds);
                    (profiles || []).forEach((p: any) =>
                        p.email && toSet.add(p.email)
                    );
                }
            }
        }

        const finalTo = Array.from(toSet);
        const finalCc = Array.from(ccSet);
        const finalBcc = Array.from(bccSet);
        const combined = Array.from(
            new Set([...finalTo, ...finalCc, ...finalBcc]),
        );
        if (combined.length === 0) {
            return NextResponse.json({ error: "No recipients found" }, {
                status: 400,
            });
        }

        if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM) {
            return NextResponse.json({ error: "Resend not configured" }, {
                status: 500,
            });
        }

        const resend = new Resend(process.env.RESEND_API_KEY);
        const from = process.env.RESEND_FROM as string;
        const sendResults: Array<{ id?: string; error?: any }> = [];

        try {
            const args: any = { from, subject, html: body };
            if (finalTo.length === 1) args.to = finalTo[0];
            else if (finalTo.length > 1) args.to = finalTo;
            if (finalCc.length > 0) args.cc = finalCc;
            if (finalBcc.length > 0) args.bcc = finalBcc;

            const { data } = await resend.emails.send(args as any);
            sendResults.push({ id: data?.id });
        } catch (err: any) {
            return NextResponse.json({
                error: "Send failed",
                detail: String(err?.message || err),
            }, { status: 500 });
        }

        await supabase.from("studio_emails").insert({
            studio_id: studioId,
            created_by: user.id,
            subject,
            body,
            status: "sent",
            recipient_groups,
            recipient_emails: combined,
            sent_at: new Date().toISOString(),
        });

        return NextResponse.json({
            ok: true,
            sent: sendResults.length,
            results: sendResults,
        });
    } catch (err: any) {
        console.error("Send email error:", err);
        return NextResponse.json({
            error: "Internal error",
            detail: String(err?.message || err),
        }, { status: 500 });
    }
}

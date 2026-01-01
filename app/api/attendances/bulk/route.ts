import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type AttendanceStatus = "present" | "absent" | "excused" | "late";

type AttendanceInput = {
	lesson_id: string;
	user_id: string;
	enrollment_id?: string | null;
	status: AttendanceStatus;
};

function parseToken(request: NextRequest): string | null {
	const authHeader = request.headers.get("authorization") || "";
	let token = authHeader.startsWith("Bearer ")
		? authHeader.slice("Bearer ".length).trim()
		: null;

	if (token) return token;

	// Fallback: try common Supabase cookie shapes used in some environments.
	try {
		const sbToken = request.cookies.get("sb:token")?.value ||
			request.cookies.get("sb:session")?.value ||
			request.cookies.get("supabase-auth-token")?.value;
		if (!sbToken) return null;

		try {
			const parsed = JSON.parse(sbToken);
			token = parsed?.access_token || parsed?.accessToken || null;
			return token;
		} catch {
			return sbToken;
		}
	} catch {
		return null;
	}
}

function dateOnlyLocal(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseIsoDateOnlyLocal(dateStr: string): Date | null {
	const s = String(dateStr || "").slice(0, 10);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
	const d = new Date(`${s}T00:00:00`);
	return isNaN(d.getTime()) ? null : d;
}

export async function POST(request: NextRequest) {
	try {
		if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
			return NextResponse.json({ error: "Supabase not configured" }, {
				status: 500,
			});
		}

		const token = parseToken(request);
		if (!token) {
			return NextResponse.json({ error: "Missing auth token" }, {
				status: 401,
			});
		}

		let body: any = null;
		try {
			body = await request.json();
		} catch {
			body = null;
		}

		const attendances: AttendanceInput[] = Array.isArray(body?.attendances)
			? body.attendances
			: [];
		if (attendances.length === 0) {
			return NextResponse.json({ error: "No attendances provided" }, {
				status: 400,
			});
		}

		const invalid = attendances.find((a) =>
			!a?.lesson_id || !a?.user_id || !a?.status
		);
		if (invalid) {
			return NextResponse.json({ error: "Invalid attendance payload" }, {
				status: 400,
			});
		}

		const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
			global: { headers: { Authorization: `Bearer ${token}` } },
		});
		const { data: { user } } = await userClient.auth.getUser();
		if (!user) {
			return NextResponse.json({ error: "Not authenticated" }, {
				status: 401,
			});
		}

		const adminClient = createClient(
			SUPABASE_URL,
			SUPABASE_SERVICE_ROLE_KEY,
		);

		const lessonIds = Array.from(
			new Set(attendances.map((a) => String(a.lesson_id))),
		);
		const { data: lessons, error: lessonsErr } = await adminClient
			.from("lessons")
			.select("id, program_id, date, teacher_id, school_year_id")
			.in("id", lessonIds);

		if (lessonsErr) throw lessonsErr;
		const lessonsArr = lessons || [];
		const lessonMap = new Map<string, any>(
			lessonsArr.map((l: any) => [String(l.id), l]),
		);

		// Resolve studio_id per program_id
		const programIds = Array.from(
			new Set(
				lessonsArr.map((l: any) => String(l.program_id)).filter(
					Boolean,
				),
			),
		);
		const { data: programs, error: programsErr } = await adminClient
			.from("programs")
			.select("id, studio_id")
			.in("id", programIds);
		if (programsErr) throw programsErr;
		const programStudio = new Map<string, string>(
			(programs || []).map((
				p: any,
			) => [String(p.id), String(p.studio_id)]),
		);

		const studioIds = Array.from(
			new Set(
				(programs || []).map((p: any) => String(p.studio_id)).filter(
					Boolean,
				),
			),
		);

		// Admin studios (new + legacy)
		const [studioMembersRes, legacyRolesRes] = await Promise.all([
			adminClient
				.from("studio_members")
				.select("studio_id, role")
				.eq("user_id", user.id)
				.in("studio_id", studioIds)
				.in("role", ["owner", "admin"]),
			adminClient
				.from("user_roles")
				.select("studio_id, role")
				.eq("user_id", user.id)
				.in("studio_id", studioIds)
				.in("role", ["studio_admin", "admin"]),
		]);

		const adminStudios = new Set<string>([
			...((studioMembersRes.data || []).map((r: any) =>
				String(r.studio_id)
			)),
			...((legacyRolesRes.data || []).map((r: any) =>
				String(r.studio_id)
			)),
		]);

		// Teacher programs (support both tables)
		let teacherProgramIds = new Set<string>();
		try {
			const [programTeachersRes, teacherProgramsRes] = await Promise.all([
				adminClient
					.from("program_teachers")
					.select("program_id")
					.eq("user_id", user.id)
					.in("program_id", programIds),
				adminClient
					.from("teacher_programs")
					.select("program_id")
					.eq("teacher_id", user.id)
					.in("program_id", programIds),
			]);

			teacherProgramIds = new Set<string>([
				...((programTeachersRes.data || []).map((r: any) =>
					String(r.program_id)
				)),
				...((teacherProgramsRes.data || []).map((r: any) =>
					String(r.program_id)
				)),
			]);
		} catch {
			// If one of the tables doesn't exist, just continue with the other checks.
			teacherProgramIds = new Set<string>();
		}

		const nowDate = dateOnlyLocal(new Date());

		// Validate permissions + time window; build upsert rows
		const rows: any[] = [];

		for (const a of attendances) {
			const lesson = lessonMap.get(String(a.lesson_id));
			if (!lesson) {
				return NextResponse.json({
					error: `Lesson not found: ${a.lesson_id}`,
				}, { status: 404 });
			}

			const programId = String(lesson.program_id || "");
			const studioId = programStudio.get(programId);
			if (!programId || !studioId) {
				return NextResponse.json({
					error: "Lesson missing program/studio linkage",
				}, { status: 400 });
			}

			const isAdmin = adminStudios.has(String(studioId));
			const isTeacher = teacherProgramIds.has(programId) ||
				String(lesson.teacher_id || "") === String(user.id);

			if (!isAdmin && !isTeacher) {
				return NextResponse.json({
					error: "Not allowed to save attendance for this lesson",
				}, { status: 403 });
			}

			// Teachers (non-admin) can save attendance until 14 days after lesson date (inclusive).
			if (!isAdmin) {
				const ld = parseIsoDateOnlyLocal(String(lesson.date || ""));
				if (!ld) {
					return NextResponse.json({ error: "Invalid lesson date" }, {
						status: 400,
					});
				}

				const diffDays = Math.floor(
					(nowDate.getTime() - ld.getTime()) / 86400000,
				);
				if (diffDays < 0 || diffDays > 14) {
					return NextResponse.json(
						{
							error:
								"Attendance can only be saved from the lesson date up to 14 days after.",
						},
						{ status: 403 },
					);
				}
			}

			const row = {
				lesson_id: String(a.lesson_id),
				user_id: String(a.user_id),
				enrollment_id: a.enrollment_id ? String(a.enrollment_id) : null,
				program_id: programId,
				school_year_id: (lesson as any)?.school_year_id || null,
				status: a.status,
				marked_by: user.id,
				marked_at: new Date().toISOString(),
			};

			rows.push(row);
		}

		// Attendance must be tracked per enrollment/subprofile. Prefer `enrollment_id` as
		// the conflict target, and best-effort resolve missing enrollment_id for legacy callers.
		const missingEnrollment = rows.filter((r) => !r.enrollment_id);
		if (missingEnrollment.length > 0) {
			const programUserPairs = new Set(
				missingEnrollment.map((r) =>
					`${String(r.program_id)}:${String(r.user_id)}`
				),
			);
			const missingProgramIds = Array.from(
				new Set(missingEnrollment.map((r) => String(r.program_id))),
			);
			const missingUserIds = Array.from(
				new Set(missingEnrollment.map((r) => String(r.user_id))),
			);

			const { data: enrolls, error: enrollErr } = await adminClient
				.from("inschrijvingen")
				.select("id, program_id, user_id, sub_profile_id")
				.in("program_id", missingProgramIds)
				.in("user_id", missingUserIds);
			if (enrollErr) throw enrollErr;

			const enrollmentsByProgramUser = new Map<string, any[]>();
			for (const e of enrolls || []) {
				const key = `${String((e as any).program_id)}:${
					String((e as any).user_id)
				}`;
				if (!programUserPairs.has(key)) continue;
				const list = enrollmentsByProgramUser.get(key) || [];
				list.push(e);
				enrollmentsByProgramUser.set(key, list);
			}

			for (const r of missingEnrollment) {
				const key = `${String(r.program_id)}:${String(r.user_id)}`;
				const candidates = enrollmentsByProgramUser.get(key) || [];
				if (candidates.length === 1) {
					r.enrollment_id = String((candidates[0] as any).id);
					continue;
				}
				if (candidates.length > 1) {
					const main = candidates.find((c: any) =>
						!c?.sub_profile_id
					) || null;
					if (main) {
						r.enrollment_id = String((main as any).id);
						continue;
					}
				}

				return NextResponse.json(
					{ error: "Missing enrollment_id for attendance row" },
					{ status: 400 },
				);
			}
		}

		// Dedupe within this request: Postgres will throw
		// "ON CONFLICT DO UPDATE command cannot affect row a second time"
		// if the same conflict target appears twice.
		const dedupedMap = new Map<string, any>();
		for (const r of rows) {
			const key = `${String(r.lesson_id)}:${String(r.enrollment_id)}`;
			const existing = dedupedMap.get(key);
			if (!existing) {
				dedupedMap.set(key, r);
			} else {
				dedupedMap.set(key, { ...existing, ...r });
			}
		}
		const dedupedRows = Array.from(dedupedMap.values());

		const tryUpsert = async (rowsToUpsert: any[]) => {
			return await adminClient
				.from("lesson_attendances")
				.upsert(rowsToUpsert, { onConflict: "lesson_id,enrollment_id" });
		}

		let { error } = await tryUpsert(dedupedRows);
		if (error) {
			const msg = String((error as any)?.message || "");
			// Back-compat: older DBs won't have lesson_attendances.school_year_id yet.
			if (msg.toLowerCase().includes("school_year_id")) {
				const stripped = dedupedRows.map((r) => {
					const { school_year_id: _omit, ...rest } = r;
					return rest;
				});
				;({ error } = await tryUpsert(stripped));
			}
		}
		if (error) {
			const msg = String((error as any)?.message || "");
			const code = String((error as any)?.code || "");
			// Back-compat: older DBs still have UNIQUE(lesson_id,user_id).
			// In that case, inserting per-enrollment rows can conflict with an existing legacy row.
			// Retry by overwriting the legacy row.
			if (
				(code === "23505" &&
					msg.includes("lesson_attendances_lesson_id_user_id_key")) ||
				msg.includes("lesson_attendances_lesson_id_user_id_key")
			) {
				const byUser = new Map<string, any>();
				for (const r of dedupedRows) {
					const k = `${String(r.lesson_id)}:${String(r.user_id)}`;
					byUser.set(k, { ...byUser.get(k), ...r });
				}
				const fallbackRows = Array.from(byUser.values());
				const { error: err2 } = await adminClient
					.from("lesson_attendances")
					.upsert(fallbackRows, { onConflict: "lesson_id,user_id" });
				if (err2) throw err2;
			} else {
				throw error;
			}
		}

		return NextResponse.json({ ok: true });
	} catch (e: any) {
		console.error("Bulk attendance save failed", e);
		return NextResponse.json({
			error: e?.message || "Failed saving attendance",
		}, { status: 500 });
	}
}

export async function GET() {
	return NextResponse.json({ ok: true });
}

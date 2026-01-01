import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Debug endpoint to check teacher access with service role (bypasses RLS)
export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const userId = searchParams.get("userId");

	if (!userId) {
		return NextResponse.json({ error: "userId parameter required" }, {
			status: 400,
		});
	}

	const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
	const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

	if (!supabaseUrl || !serviceRoleKey) {
		return NextResponse.json({ error: "Missing Supabase configuration" }, {
			status: 500,
		});
	}

	// Create admin client (bypasses RLS)
	const adminClient = createClient(supabaseUrl, serviceRoleKey);

	try {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const todayISO = today.toISOString().split("T")[0];

		// Check user roles
		const { data: userRole } = await adminClient
			.from("user_roles")
			.select("role")
			.eq("user_id", userId)
			.single();

		// Count all lessons for this teacher (no date filter)
		const { data: allLessons, error: allLessonsError } = await adminClient
			.from("lessons")
			.select("id, date, time, duration_minutes, teacher_id, program_id")
			.eq("teacher_id", userId);

		// Count upcoming lessons for this teacher
		const { data: upcomingLessons, error: upcomingError } =
			await adminClient
				.from("lessons")
				.select(
					"id, date, time, duration_minutes, teacher_id, program_id",
				)
				.eq("teacher_id", userId)
				.gte("date", todayISO);

		// Get teacher_programs entries
		const { data: teacherPrograms, error: tpError } = await adminClient
			.from("teacher_programs")
			.select("program_id, teacher_id")
			.eq("teacher_id", userId);

		// Get upcoming lessons for programs this teacher is assigned to
		let programLessons = null;
		if (teacherPrograms && teacherPrograms.length > 0) {
			const programIds = teacherPrograms.map((tp) => tp.program_id);
			const { data: pLessons } = await adminClient
				.from("lessons")
				.select(
					"id, date, time, duration_minutes, teacher_id, program_id",
				)
				.in("program_id", programIds)
				.gte("date", todayISO);
			programLessons = pLessons;
		}

		return NextResponse.json({
			debug: "Service role query (bypasses RLS)",
			userId,
			todayISO,
			userRole: userRole?.role || "none",
			allLessonsCount: allLessons?.length || 0,
			upcomingLessonsCount: upcomingLessons?.length || 0,
			teacherProgramsCount: teacherPrograms?.length || 0,
			upcomingProgramLessonsCount: programLessons?.length || 0,
			allLessonsError: allLessonsError?.message,
			upcomingError: upcomingError?.message,
			tpError: tpError?.message,
			sampleAllLessons: allLessons?.slice(0, 3),
			sampleUpcomingLessons: upcomingLessons?.slice(0, 3),
			teacherPrograms: teacherPrograms?.slice(0, 5),
			sampleProgramLessons: programLessons?.slice(0, 3),
		});
	} catch (error: any) {
		return NextResponse.json({
			error: "Failed to query",
			message: error.message,
			stack: error.stack,
		}, { status: 500 });
	}
}

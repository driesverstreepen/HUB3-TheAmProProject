// Subscription types for studio pricing tiers
// Note: Regular users always have free access to browse and enroll

export type SubscriptionTier = "basic" | "plus" | "pro";
export type SubscriptionStatus =
    | "trial"
    | "active"
    | "past_due"
    | "canceled"
    | "expired";
export type SubscriptionPeriod = "monthly" | "yearly";

export interface StudioSubscription {
    subscription_tier: SubscriptionTier;
    subscription_status: SubscriptionStatus;
    subscription_period: SubscriptionPeriod;
    subscription_start_date: string | null;
    subscription_end_date: string | null;
    trial_end_date: string | null;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
}

export interface StudioSubscriptionInfo extends StudioSubscription {
    id: string;
    naam: string;
    is_trial_active: boolean;
    trial_days_remaining: number;
    current_price: number;
}

// Feature keys mapped to subscription tiers
export type FeatureKey =
    // Basic features (all tiers)
    | "basic_profile"
    | "publish_programs"
    // Plus features
    | "member_management"
    | "online_payments"
    | "enrollment_forms"
    | "waitlists"
    // Pro features
    | "teacher_management"
    | "attendance_tracking"
    | "attendance_allow_late"
    | "class_passes"
    | "notifications"
    | "api_access"
    | "multi_location";

// Pricing configuration
export const PRICING = {
    basic: {
        name: "HUB3 Basic",
        monthly: 5,
        yearly: 50,
        features: [
            "Studio profiel aanmaken en beheren",
            "Publieke studio pagina",
            "Workshops en programma's publiceren",
            "Basis programma informatie toevoegen",
            "Website URL toevoegen",
            "Toegang tot HUB3",
        ],
    },
    plus: {
        name: "HUB3 Plus",
        monthly: 10,
        yearly: 100,
        features: [
            "Alles van Basic",
            "Volledige ledenbeheer",
            "Inschrijvingen ontvangen",
            "Gepersonaliseerde inschrijvingsformulieren",
            "Stripe integratie",
            "Wachtlijsten",
            "Basis analytics",
        ],
    },
    pro: {
        name: "HUB3 Pro",
        monthly: 15,
        yearly: 120,
        features: [
            "Alles van Plus",
            "Teacher accounts en toegang",
            "Programma's toewijzen aan teachers",
            "Digitale aanwezigheidslijsten",
            "Afwezigheden laten melden",
            "Class pass systeem",
            "Premium analytics",
        ],
    },
} as const;

// Feature tier mapping
export const FEATURE_TIERS: Record<FeatureKey, SubscriptionTier[]> = {
    // Basic features
    basic_profile: ["basic", "plus", "pro"],
    publish_programs: ["basic", "plus", "pro"],

    // Plus features
    member_management: ["plus", "pro"],
    online_payments: ["plus", "pro"],
    enrollment_forms: ["plus", "pro"],
    waitlists: ["plus", "pro"],

    // Pro features
    teacher_management: ["pro"],
    attendance_tracking: ["pro"],
    attendance_allow_late: ["pro"],
    class_passes: ["pro"],
    notifications: ["pro"],
    api_access: ["pro"],
    multi_location: ["pro"],
};

// Helper function to check if a tier has access to a feature
export function hasFeatureAccess(
    tier: SubscriptionTier,
    feature: FeatureKey,
    status?: SubscriptionStatus,
    trialEndDate?: string | null,
): boolean {
    // During trial, allow pro features
    if (status === "trial" && trialEndDate) {
        const trialEnd = new Date(trialEndDate);
        if (trialEnd > new Date()) {
            tier = "pro";
        }
    }

    // Expired/canceled subscriptions fall back to basic
    if (status && !["active", "trial"].includes(status)) {
        tier = "basic";
    }

    return FEATURE_TIERS[feature].includes(tier);
}

// Get readable tier name
export function getTierName(tier: SubscriptionTier): string {
    return PRICING[tier].name;
}

// Get price for tier and period
export function getTierPrice(
    tier: SubscriptionTier,
    period: SubscriptionPeriod,
): number {
    return PRICING[tier][period];
}

// Calculate savings for yearly vs monthly
export function getYearlySavings(tier: SubscriptionTier): number {
    const monthlyTotal = PRICING[tier].monthly * 12;
    const yearlyPrice = PRICING[tier].yearly;
    return monthlyTotal - yearlyPrice;
}

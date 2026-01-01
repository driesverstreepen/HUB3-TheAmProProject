"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
    type FeatureKey,
    hasFeatureAccess,
    type StudioSubscriptionInfo,
} from "@/types/subscription";

interface UseStudioFeaturesReturn {
    hasFeature: (feature: FeatureKey) => boolean;
    subscription: StudioSubscriptionInfo | null;
    loading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
}

/**
 * Hook to check if a studio has access to specific features based on subscription tier
 *
 * @param studioId - The studio ID to check features for
 * @returns Object with hasFeature function and subscription info
 *
 * @example
 * const { hasFeature, subscription } = useStudioFeatures(studioId)
 * if (hasFeature('teacher_management')) {
 *   // Show teacher management UI
 * }
 */
export function useStudioFeatures(
    studioId: string | undefined,
): UseStudioFeaturesReturn {
    const [subscription, setSubscription] = useState<
        StudioSubscriptionInfo | null
    >(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchSubscription = async () => {
        if (!studioId) {
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            setError(null);

            const { data, error: fetchError } = await supabase
                .from("studio_subscription_info")
                .select("*")
                .eq("id", studioId)
                .single();

            if (fetchError) throw fetchError;

            setSubscription(data);
        } catch (err) {
            setError(err as Error);
            console.error("Error fetching studio subscription:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSubscription();
    }, [studioId]);

    const hasFeature = (feature: FeatureKey): boolean => {
        if (!subscription) return false;

        return hasFeatureAccess(
            subscription.subscription_tier,
            feature,
            subscription.subscription_status,
            subscription.trial_end_date,
        );
    };

    return {
        hasFeature,
        subscription,
        loading,
        error,
        refetch: fetchSubscription,
    };
}

/**
 * Hook to check if current user is a studio admin/owner
 * Useful for showing/hiding subscription-related UI
 */
export function useIsStudioAdmin(studioId: string | undefined) {
    const [isAdmin, setIsAdmin] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!studioId) {
            setLoading(false);
            return;
        }

        const checkAdmin = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                    setIsAdmin(false);
                    return;
                }

                // Check if user is owner or admin
                const { data: studio } = await supabase
                    .from("studios")
                    .select("eigenaar_id")
                    .eq("id", studioId)
                    .single();

                if (studio?.eigenaar_id === user.id) {
                    setIsAdmin(true);
                    return;
                }

                const { data: role } = await supabase
                    .from("user_roles")
                    .select("role")
                    .eq("studio_id", studioId)
                    .eq("user_id", user.id)
                    .eq("role", "studio_admin")
                    .maybeSingle();

                setIsAdmin(!!role);
            } catch (err) {
                console.error("Error checking studio admin:", err);
                setIsAdmin(false);
            } finally {
                setLoading(false);
            }
        };

        checkAdmin();
    }, [studioId]);

    return { isAdmin, loading };
}

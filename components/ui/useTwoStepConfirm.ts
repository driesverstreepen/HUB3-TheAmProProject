import { useCallback, useEffect, useRef, useState } from "react";

export function useTwoStepConfirm<T>(timeoutMs = 4500) {
    const [armedKey, setArmedKey] = useState<T | null>(null);
    const timerRef = useRef<number | null>(null);

    useEffect(() => {
        if (timerRef.current) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }

        if (armedKey === null) return;

        timerRef.current = window.setTimeout(() => {
            setArmedKey(null);
        }, timeoutMs);

        return () => {
            if (timerRef.current) {
                window.clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [armedKey, timeoutMs]);

    const disarm = useCallback(() => setArmedKey(null), []);

    const isArmed = useCallback((key: T) => armedKey === key, [armedKey]);

    const arm = useCallback((key: T) => setArmedKey(key), []);

    const confirmOrArm = useCallback(
        (key: T, onConfirm: () => void | Promise<void>) => {
            if (armedKey !== key) {
                setArmedKey(key);
                return false;
            }

            setArmedKey(null);
            void onConfirm();
            return true;
        },
        [armedKey],
    );

    return { armedKey, isArmed, arm, disarm, confirmOrArm };
}

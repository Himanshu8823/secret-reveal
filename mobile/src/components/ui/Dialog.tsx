import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Text } from './Text';
import { Button } from './Button';
import { colors, elevation, radius, spacing } from '@/theme';

/**
 * Modal dialog. Design system replacement for `Alert.alert()` from
 * react-native — gives us full control over styling, action layouts,
 * and the variants our product needs.
 *
 * Use through `useDialog()` (imperative) rather than directly so call
 * sites stay terse:
 *
 *   const dialog = useDialog();
 *   dialog.show({ variant: 'danger', title: 'Network error', message: '…' });
 *
 * For multi-action flows, the hook also returns `showConfirm(...)` and
 * `showDestructive(...)` helpers.
 */

export type DialogVariant = 'info' | 'success' | 'warning' | 'danger';

export interface DialogAction {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  /** Auto-close the dialog when this action is pressed. Defaults to true. */
  dismissOnPress?: boolean;
}

export interface DialogOptions {
  title: string;
  message?: string;
  variant?: DialogVariant;
  actions?: DialogAction[];
  /** Cancel button label. If provided, shows a cancel action as secondary. */
  cancelLabel?: string;
  onCancel?: () => void;
  /** Backdrop press dismisses (default true). */
  dismissOnBackdrop?: boolean;
  /**
   * Optional live countdown. While set, the dialog ticks this value
   * down by 1 every second and re-renders `message` using
   * `countdownMessage(remaining)`. When remaining hits 0 the dialog
   * auto-closes (unless `keepOpenOnExpire` is true).
   */
  countdown?: {
    from: number;
    /** Builds the message for the current remaining seconds. */
    format: (remaining: number) => string;
    /** Auto-dismiss when remaining hits 0. Defaults to true. */
    autoDismiss?: boolean;
  };
}

interface DialogProps {
  visible: boolean;
  options: DialogOptions | null;
  onDismiss: () => void;
}

const variantTone: Record<DialogVariant, 'info' | 'success' | 'warning' | 'danger'> = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
};

export function Dialog({ visible, options, onDismiss }: DialogProps) {
  // The countdown value we currently display. The interval writes to
  // this every second; the message text is derived from it on each
  // render. We initialise from `options.countdown.from` on first
  // render of a new options object, then let `setInterval` decrement
  // it. Using a single state variable — no `lastInit` / double-effect
  // dance — keeps the rendering path obvious and debuggable.
  const [remaining, setRemaining] = useState<number | null>(() => {
    const f = options?.countdown?.from;
    return typeof f === 'number' && f > 0 ? f : null;
  });

  // When the caller passes a NEW countdown (new options object with a
  // different `from`), reset. We use the whole `options?.countdown`
  // object as a signal so any caller that re-shows the dialog with a
  // new timer value triggers a fresh start. (The object identity
  // changes on every `dialog.show(...)` call because callers build a
  // new options literal each time.)
  const countdownRef = options?.countdown;
  useEffect(() => {
    const f = countdownRef?.from;
    if (typeof f !== 'number' || f <= 0) {
      setRemaining(null);
      return;
    }
    setRemaining(f);
    // We intentionally do NOT include `remaining` in deps — this effect
    // only runs when the caller's options object changes. The
    // setInterval below handles the per-second decrement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdownRef]);

  // Tick once a second while we have a positive remaining. We use a
  // ref for the interval handle so a re-render doesn't accidentally
  // cancel an in-flight tick, and a ref to mirror `remaining` so the
  // interval callback always sees the freshest value.
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const remainingRef = useRef<number | null>(remaining);
  remainingRef.current = remaining;

  useEffect(() => {
    if (remaining === null || remaining <= 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    intervalRef.current = setInterval(() => {
      const cur = remainingRef.current;
      if (cur === null || cur <= 0) return;
      const next = cur - 1;
      remainingRef.current = next;
      setRemaining(next);
      if (next <= 0 && countdownRef?.autoDismiss !== false) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        setTimeout(() => onDismiss(), 600);
      }
    }, 1000);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [remaining, onDismiss, countdownRef?.autoDismiss]);

  if (!options) return null;

  const variant = options.variant ?? 'info';
  const dismissOnBackdrop = options.dismissOnBackdrop ?? true;
  const actions = options.actions ?? [];
  const hasCancel = !!options.cancelLabel;
  const cancelAction: DialogAction = {
    label: options.cancelLabel!,
    onPress: options.onCancel,
    variant: 'ghost',
  };

  // If a countdown is active, the formatter wins over the static
  // message so the user sees a real "Try again in 21s" → "20s" → …
  const message =
    options.countdown && remaining !== null
      ? options.countdown.format(remaining)
      : options.message;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <Pressable
        onPress={() => dismissOnBackdrop && onDismiss()}
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: colors.surface.overlay }}
      >
        {/* Inner Pressable swallows taps so they don't reach the backdrop. */}
        <Pressable onPress={() => {}}>
          <View
            className="bg-surface mx-6 p-6"
            style={{
              borderRadius: radius.lg,
              width: 320,
              maxWidth: '100%',
              ...elevation[2],
            }}
          >
            <Text
              key={`title-${options.title}`}
              variant="h3"
              tone={variantTone[variant]}
            >
              {options.title}
            </Text>

            {message ? (
              // The `key` prop forces React to unmount and remount this
              // <Text> on every remaining-second change. React Native's
              // <Modal> portals its children out of the React tree, so
              // re-renders driven by a state change inside the modal
              // do not always propagate to child components the way
              // they do in a normal subtree. The `key` change guarantees
              // a fresh mount, which always reads the latest prop.
              <Text
                key={`countdown-${remaining ?? 'static'}`}
                variant="body"
                tone="secondary"
                className="mt-2"
              >
                {message}
              </Text>
            ) : null}

            <View
              className="flex-row justify-end mt-6"
              style={{ gap: spacing[2] }}
            >
              {hasCancel ? (
                <Button
                  label={cancelAction.label}
                  variant={cancelAction.variant}
                  size="lg"
                  fullWidth={false}
                  onPress={() => {
                    cancelAction.onPress?.();
                    onDismiss();
                  }}
                />
              ) : null}

              {actions.map((a, i) => (
                <Button
                  key={i}
                  label={a.label}
                  variant={a.variant ?? 'primary'}
                  size="lg"
                  fullWidth={false}
                  onPress={() => {
                    a.onPress?.();
                    if (a.dismissOnPress !== false) onDismiss();
                  }}
                />
              ))}
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

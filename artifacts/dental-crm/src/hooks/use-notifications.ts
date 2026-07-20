import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useListNotifications,
  useGetUnreadNotificationsCount,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  getListNotificationsQueryKey,
  getGetUnreadNotificationsCountQueryKey,
} from "@workspace/api-client-react";

export function useNotifications(options?: { paused?: boolean }) {
  return useListNotifications({
    query: {
      queryKey: getListNotificationsQueryKey(),
      // Pause polling while the caller is busy (e.g. dragging kanban cards)
      // so background refetches don't interrupt the interaction.
      refetchInterval: options?.paused ? false : 15000,
    },
  });
}

export function useUnreadCount(options?: { enabled?: boolean }) {
  return useGetUnreadNotificationsCount({
    query: {
      queryKey: getGetUnreadNotificationsCountQueryKey(),
      refetchInterval: 10000,
      enabled: options?.enabled,
    },
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMarkNotificationRead({
    mutation: {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
        void qc.invalidateQueries({
          queryKey: getGetUnreadNotificationsCountQueryKey(),
        });
      },
    },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMarkAllNotificationsRead({
    mutation: {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
        void qc.invalidateQueries({
          queryKey: getGetUnreadNotificationsCountQueryKey(),
        });
      },
    },
  });
}

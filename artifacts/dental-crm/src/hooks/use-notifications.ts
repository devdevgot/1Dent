import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useListNotifications,
  useGetUnreadNotificationsCount,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  getListNotificationsQueryKey,
  getGetUnreadNotificationsCountQueryKey,
} from "@workspace/api-client-react";

export function useNotifications() {
  return useListNotifications({
    query: {
      queryKey: getListNotificationsQueryKey(),
      refetchInterval: 15000, // poll every 15s
    },
  });
}

export function useUnreadCount() {
  return useGetUnreadNotificationsCount({
    query: {
      queryKey: getGetUnreadNotificationsCountQueryKey(),
      refetchInterval: 10000,
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

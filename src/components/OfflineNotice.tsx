import { useEffect, useState } from "react";

interface OfflineNoticeProps {
  networkError?: boolean;
}

const ONLINE_STATUS_CHECK_INTERVAL_MS = 2_000;

export function OfflineNotice({ networkError = false }: OfflineNoticeProps) {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(navigator.onLine);

    updateOnlineStatus();
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    const interval = window.setInterval(updateOnlineStatus, ONLINE_STATUS_CHECK_INTERVAL_MS);

    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
      window.clearInterval(interval);
    };
  }, []);

  if (isOnline && !networkError) return null;

  return (
    <div className="offline-notice" role="alert">
      인터넷에 연결되어 있지 않습니다. 연결 상태를 확인해 주세요.
    </div>
  );
}

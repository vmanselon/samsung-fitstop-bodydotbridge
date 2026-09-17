import { useEffect, useState } from "react";

export function OfflineNotice() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const markOnline = () => setIsOnline(true);
    const markOffline = () => setIsOnline(false);

    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);

    return () => {
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="offline-notice" role="alert">
      인터넷에 연결되어 있지 않습니다. 연결 상태를 확인해 주세요.
    </div>
  );
}

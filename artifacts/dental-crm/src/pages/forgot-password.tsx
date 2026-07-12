import { useEffect } from "react";
import { useLocation } from "wouter";

export default function ForgotPassword() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/login?mode=whatsapp");
  }, [setLocation]);

  return null;
}

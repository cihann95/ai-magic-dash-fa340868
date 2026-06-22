import { useApp } from "@/contexts/AppContext";

export const useIsAdmin = () => {
  const { isAdmin } = useApp();
  return isAdmin;
};

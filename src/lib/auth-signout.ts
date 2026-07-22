import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

let manualSignOut = false;

export function isManualSignOut() {
  return manualSignOut;
}

export function consumeManualSignOut() {
  const v = manualSignOut;
  manualSignOut = false;
  return v;
}

export async function performSignOut(queryClient?: QueryClient) {
  manualSignOut = true;
  try {
    if (queryClient) {
      await queryClient.cancelQueries();
      queryClient.clear();
    }
    await supabase.auth.signOut();
  } catch (err) {
    manualSignOut = false;
    throw err;
  }
}

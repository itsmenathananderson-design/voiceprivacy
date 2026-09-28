"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();
  return (
    <button className="secondary" onClick={async () => {
      await createClient().auth.signOut();
      router.replace("/login");
    }}>Log out</button>
  );
}

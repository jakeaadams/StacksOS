import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export default async function Home() {
  const cookieStore = await cookies();
  redirect(cookieStore.has("authtoken") ? "/staff/catalog" : "/login");
}

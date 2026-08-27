import type { Metadata } from "next";
import { ManagmentLanding } from "@/components/managment/ManagmentLanding";

export const metadata: Metadata = {
  title: "MoodyFilm Management",
  description:
    "نرم‌افزار مدیریت آرشیو شخصی فیلم و سریال — کتابخانهٔ محلی، پوستر، جزئیات و پخش از هارد خودتان.",
};

export default function ManagmentPage() {
  return <ManagmentLanding />;
}

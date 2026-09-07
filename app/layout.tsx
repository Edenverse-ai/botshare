import ClientOnly from "@/components/ClientOnly";
import Footer from "@/components/Footer";
import ToastContainerBar from "@/components/ToastContainerBar";
import LoginModal from "@/components/models/LoginModal";
import ForgotPasswordModal from "@/components/models/ForgotPasswordModal";
import RegisterModal from "@/components/models/RegisterModal";
import RentModal from "@/components/models/RentModal";
import SearchModal from "@/components/models/SearchModal";
import Navbar from "@/components/navbar/Navbar";
import { canManageServices, isAdminEmail } from "@/lib/adminAuth";
import { Nunito, Anton } from "next/font/google";
import "../styles/globals.css";
import getCurrentUser from "./actions/getCurrentUser";

export const metadata = {
  title: "Hifivebot — Robot Service Rentals",
  description: "Book professional robot services for performances, events, restaurants, and warehouses.",
};

const font = Nunito({
  subsets: ["latin"],
});

const anton = Anton({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-anton",
});

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const currentUser = await getCurrentUser();
  const isAdmin = canManageServices(currentUser);

  return (
    <html lang="en">
      <body className={`${font.className} ${anton.variable}`}>
        <ClientOnly>
          <ToastContainerBar />
          <SearchModal />
          <RegisterModal />
          <LoginModal />
          <ForgotPasswordModal />
          {isAdmin && <RentModal />}
          {currentUser && <RentModal mode="individual" />}
          <Navbar currentUser={currentUser} isAdmin={isAdmin} canManageRegistry={isAdminEmail(currentUser?.email)} />
        </ClientOnly>
        <div className="pb-20 pt-28">{children}</div>
        <Footer />
      </body>
    </html>
  );
}

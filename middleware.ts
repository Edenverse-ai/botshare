export { default } from "next-auth/middleware";

export const config = {
  matcher: ["/trips", "/reservations", "/my-listings", "/favorites", "/admin/orders", "/orders/:path*", "/profile"],
};

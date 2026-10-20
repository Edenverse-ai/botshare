import prisma from "@/lib/prismadb";
import { findUserByEmail, normalizeEmail } from "@/lib/emailAddress";
import { AUTH_RATE_LIMITS, clientIp, consumeRateLimit } from "@/lib/rateLimit";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import bcrypt from "bcryptjs";
import NextAuth, { AuthOptions, DefaultSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
// import FacebookProvider from "next-auth/providers/facebook";
// import GoogleProvider from "next-auth/providers/google";

declare module "next-auth" {
  interface Session {
    user: { userType?: string } & DefaultSession["user"];
  }
}

export const authOptions: AuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    // GoogleProvider({
    //   clientId: process.env.GOOGLE_CLIENT_ID as string,
    //   clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    // }),
    // FacebookProvider({
    //   clientId: process.env.FACEBOOK_ID as string,
    //   clientSecret: process.env.FACEBOOK_SECRET as string,
    // }),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "email", type: "text" },
        password: { label: "password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Invalid credentials");
        }

        // Throttle per caller, and per caller+address so one attacker cannot
        // lock a victim out of their own account from elsewhere.
        const email = normalizeEmail(credentials.email);
        const ip = clientIp(req?.headers ?? {});
        const budgets = [
          { key: `login:ip:${ip}`, rule: AUTH_RATE_LIMITS.loginPerIp },
          { key: `login:identity:${ip}:${email}`, rule: AUTH_RATE_LIMITS.loginPerIdentity },
        ];
        for (const { key, rule } of budgets) {
          if (!consumeRateLimit(key, rule).allowed) {
            throw new Error("TooManyAttempts");
          }
        }

        // Case-insensitive so a mailbox signs in however it is capitalised.
        const user = await findUserByEmail(email);

        if (!user || !user?.hashedPassword) {
          throw new Error("Invalid credentials");
        }

        const isCorrectPassword = await bcrypt.compare(
          credentials.password,
          user.hashedPassword
        );
        if (!isCorrectPassword) {
          throw new Error("Invalid credentials");
        }
        return user;
      },
    }),
  ],
  pages: {
    signIn: "/",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.userType = (user as any).userType;
      return token;
    },
    async session({ session, token }) {
      if (session.user) session.user.userType = token.userType as string | undefined;
      return session;
    },
  },
  debug: process.env.NEXTAUTH_DEBUG === "true",
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export default NextAuth(authOptions);

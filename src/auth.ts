import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Kata Sandi", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) return null;

        // Same generic "wrong email/password" outcome as an actual bad
        // password (see login page) — deliberately not a distinct error,
        // so this never leaks account existence/status to whoever's typing.
        // Already-issued sessions are caught separately, per-request, by
        // requireUser()'s own DB check (see api-auth.ts) — this only stops
        // a NEW login.
        if (user.status === "SUSPENDED") return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          creditBalance: user.creditBalance,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role as "USER" | "ADMIN";
        token.creditBalance = user.creditBalance as number;
      }
      if (trigger === "update" && session?.creditBalance !== undefined) {
        token.creditBalance = session.creditBalance as number;
      }
      if (trigger === "update" && session?.name !== undefined) {
        token.name = session.name as string;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as "USER" | "ADMIN";
      session.user.creditBalance = token.creditBalance as number;
      if (token.name) session.user.name = token.name;
      return session;
    },
  },
});

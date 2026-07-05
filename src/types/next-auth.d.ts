import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role: "USER" | "ADMIN";
    creditBalance: number;
  }

  interface Session {
    user: {
      id: string;
      role: "USER" | "ADMIN";
      creditBalance: number;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "USER" | "ADMIN";
    creditBalance: number;
  }
}

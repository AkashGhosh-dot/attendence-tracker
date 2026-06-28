import { NextAuthOptions, User as NextAuthUser } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 28800,
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        })

        if (!user) return null

        const isValid = await bcrypt.compare(credentials.password, user.passwordHash)
        if (!isValid) return null

        // Allow any status through — middleware redirects non-APPROVED to /pending
        return {
          id: user.id,
          email: user.email,
          name: user.fullName,
          role: user.role,
          status: user.status,
          fullName: user.fullName,
          statusReason: user.statusReason,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as NextAuthUser
        token.id = u.id
        token.role = u.role
        token.status = u.status
        token.fullName = u.fullName
        token.statusReason = u.statusReason
      }
      return token
    },
    async session({ session, token }) {
      session.user = {
        id: token.id as string,
        email: token.email as string,
        role: token.role as "EMPLOYEE" | "HR",
        status: token.status as "PENDING" | "APPROVED" | "REJECTED" | "DEACTIVATED",
        fullName: token.fullName as string,
        statusReason: (token.statusReason as string | null) ?? null,
      }
      return session
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`
      if (new URL(url).origin === baseUrl) return url
      return baseUrl
    },
  },
}

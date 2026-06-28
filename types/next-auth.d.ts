import "next-auth"
import "next-auth/jwt"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      email: string
      fullName: string
      role: "EMPLOYEE" | "HR" | "OWNER"
      status: "PENDING" | "APPROVED" | "REJECTED" | "DEACTIVATED"
    }
  }

  interface User {
    id: string
    role: "EMPLOYEE" | "HR" | "OWNER"
    status: "PENDING" | "APPROVED" | "REJECTED" | "DEACTIVATED"
    fullName: string
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    role: "EMPLOYEE" | "HR" | "OWNER"
    status: "PENDING" | "APPROVED" | "REJECTED" | "DEACTIVATED"
    fullName: string
  }
}

export interface User {
  id: number
  username: string
  created_at: string
}

export interface Invitation {
  token: string
  link: string
  expires_at: string
  used_at: string | null
  created_at: string
}

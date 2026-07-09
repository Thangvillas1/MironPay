export const USERNAME_BLACKLIST = new Set([
  'admin', 'administrator', 'support', 'help', 'root', 'system',
  'mironpay', 'miron', 'null', 'undefined', 'api', 'auth',
  'dashboard', 'login', 'logout', 'signup', 'register',
  'account', 'settings', 'profile', 'user', 'users',
  'mod', 'moderator', 'staff', 'official', 'owner', 'bot',
  'contact', 'info', 'pay', 'payment', 'wallet',
])

export function validateUsernameFormat(username: string): string | null {
  if (username.length < 3) return 'At least 3 characters required'
  if (username.length > 20) return 'Maximum 20 characters'
  if (!/^[a-z0-9_]+$/.test(username)) return 'Only lowercase letters, numbers, and underscores'
  if (USERNAME_BLACKLIST.has(username)) return 'This username is reserved'
  return null
}

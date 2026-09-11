import { db } from '../../db/index.js'
import { users } from '../../db/schema.js'

export const getAllUsers = async () => {
  return db.select().from(users)
}

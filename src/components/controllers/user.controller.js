import { getAllUsers } from '../services/user.service.js'

export const listUsers = async (req, res) => {
  const users = await getAllUsers()
  res.json(users)
}

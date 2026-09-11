import express from 'express'
import cors from 'cors'
import 'dotenv/config'
import routes from './components/routes/index.js'

const app = express()

app.use(cors())
app.use(express.json())
app.use('/api', routes)

export default app

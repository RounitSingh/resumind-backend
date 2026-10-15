import multer from 'multer'
import { AppError } from '../lib/errors.js'
import { MAX_UPLOAD_MB } from '../shared/constants.js'
import { ErrorCode } from '../types/enums.js'

export const uploadResume = multer({
  storage: multer.memoryStorage(), // never touches disk
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (/\.(pdf|docx)$/i.test(file.originalname)) return cb(null, true)
    cb(new AppError(415, ErrorCode.InvalidFileType, 'Only PDF and DOCX files are supported.'))
  },
}).single('file')

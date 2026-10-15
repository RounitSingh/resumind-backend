// Job lifecycle: queued -> analyzing -> review (waits for the user) -> tailoring -> scoring -> completed | failed
export enum CustomizationStatus {
  Queued = 'queued',
  Analyzing = 'analyzing',
  Review = 'review',
  Tailoring = 'tailoring',
  Scoring = 'scoring',
  Completed = 'completed',
  Failed = 'failed',
}

export enum SectionKey {
  Summary = 'summary',
  Skills = 'skills',
  Experience = 'experience',
  Projects = 'projects',
  Education = 'education',
  Certifications = 'certifications',
  Additional = 'additional',
}

export enum Tone {
  Professional = 'professional',
  Confident = 'confident',
  Concise = 'concise',
}

export enum ExportFormat {
  Pdf = 'pdf',
  Docx = 'docx',
  Txt = 'txt',
}

export enum LlmTask {
  Structure = 'structure',
  AnalyzeJd = 'analyze_jd',
  Review = 'review',
  Tailor = 'tailor',
  CoverLetter = 'cover_letter',
}

export enum Seniority {
  Intern = 'intern',
  Junior = 'junior',
  Mid = 'mid',
  Senior = 'senior',
  Lead = 'lead',
  Principal = 'principal',
  Unspecified = 'unspecified',
}

export enum ErrorCode {
  NotFound = 'NOT_FOUND',
  NotReady = 'NOT_READY',
  ValidationError = 'VALIDATION_ERROR',
  MissingClientId = 'MISSING_CLIENT_ID',
  Unauthorized = 'UNAUTHORIZED',
  Forbidden = 'FORBIDDEN',
  InvalidCredentials = 'INVALID_CREDENTIALS',
  EmailTaken = 'EMAIL_TAKEN',
  LimitReached = 'LIMIT_REACHED',
  InvalidFileType = 'INVALID_FILE_TYPE',
  FileTooLarge = 'FILE_TOO_LARGE',
  UnreadableFile = 'UNREADABLE_FILE',
  EmptyResume = 'EMPTY_RESUME',
  RateLimited = 'RATE_LIMITED',
  LlmUnavailable = 'LLM_UNAVAILABLE',
  LlmBusy = 'LLM_BUSY',
  LlmBadOutput = 'LLM_BAD_OUTPUT',
  Internal = 'INTERNAL',
}

export enum UserRole {
  User = 'user',
  Admin = 'admin',
}

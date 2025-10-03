// Express type augmentation

declare global {
  namespace Express {
    interface Request {
      rawBody?: string;
    }
  }
}

export {};

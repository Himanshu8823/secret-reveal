/**
 * Minimal multer type shim.
 *
 * `@types/multer` isn't installed in this project. Adding the package
 * to package.json is owned by the project root, so we use a small local
 * declaration to keep strict mode honest and to give the upload
 * middleware the small surface it actually uses.
 *
 * Replace with `@types/multer` from npm when package.json is next
 * touched (`pnpm add -D @types/multer`).
 */

declare module 'multer' {
  namespace multer {
    interface File {
      fieldname: string;
      originalname: string;
      encoding: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
      destination?: string;
      filename?: string;
      path?: string;
    }

    type FileFilterCallback = (error: Error | null, acceptFile?: boolean) => void;
    type FileFilter = (req: unknown, file: File, cb: FileFilterCallback) => void;

    interface Options {
      storage?: unknown;
      fileFilter?: FileFilter;
      limits?: {
        fieldSize?: number;
        fileSize?: number;
        files?: number;
      };
      preservePath?: boolean;
      defCharset?: string;
    }

    interface MulterInstance {
      single: (
        fieldName: string,
      ) => (req: unknown, res: unknown, cb: (err?: unknown) => void) => void;
      array: (fieldName: string, maxCount?: number) => unknown;
      fields: (fields: Array<{ name: string; maxCount?: number }>) => unknown;
      none: () => unknown;
      any: () => unknown;
    }
  }

  function multer(opts?: multer.Options): multer.MulterInstance;
  namespace multer {
    const memoryStorage: () => unknown;
    const diskStorage: (opts: unknown) => unknown;
    class MulterError extends Error {
      constructor(code: string, field?: string) {
        super(code);
        this.code = code;
        this.field = field;
        this.name = 'MulterError';
      }
      code: string;
      field?: string;
    }
  }
  export = multer;
}
